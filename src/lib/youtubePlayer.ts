// Singleton global del reproductor de YouTube.
// Sobrevive a cambios de pestaña porque el contenedor vive en App.tsx (siempre montado),
// no dentro de MusicView (que se desmonta al cambiar de pestaña).
//
// ARQUITECTURA
// ------------
// El reproductor distingue dos modos:
//   - "queue" → hay una canción de la cola sonando (loadQueueVideo).
//   - "idle"  → nada sonando.
//
// Antes existía un tercer modo "background" que, al vaciarse la cola,
// retomaba lo último que hubiera estado cargado ANTES de que empezara esa
// cola — pensado para evitar que la última canción quedara "pegada"
// reproduciéndose sola (ver más abajo). Se saca: no tenía ningún indicador
// en la UI ni ajuste que lo controlara, así que cuando de verdad capturaba
// algo, el resultado era una sorpresa igual de rara — "termina la última
// canción y arranca sola otra música" — solo que ahora sin ningún aviso de
// por qué. endQueue() ahora simplemente detiene todo, sin resucitar nada.
//
// Lo que sí sigue evitando el bug original de "la última canción se repite
// sola" son las dos cosas de abajo, que no dependían del modo "background":
//   - performLoad() no reinicia un vídeo que ya está vivo (reproduciendo,
//     en pausa o cargando) con el mismo ID — solo lo retoma.
//   - Un "playToken" monotónico invalida cualquier callback (onEnded,
//     respuestas de red tardías) que pertenezca a una reproducción ya
//     superada, así no vuelve a tocar el reproductor por error.

import { useI18n } from "./i18n";

export type PlayerMode = "idle" | "queue";

export type PlayerState = {
  isPlaying: boolean;
  progress: number;
  duration: number;
  videoId: string | null;
  error: string | null;
  mode: PlayerMode;
};

type Listener = (state: PlayerState) => void;

class YouTubePlayerManager {
  private player: any = null;
  private container: HTMLDivElement | null = null;
  private playerEl: HTMLDivElement | null = null;
  private apiReady = false;
  private apiLoading = false;
  private pendingVideoId: string | null = null;
  private currentVideoId: string | null = null;
  private listeners = new Set<Listener>();
  private state: PlayerState = {
    isPlaying: false,
    progress: 0,
    duration: 0,
    videoId: null,
    error: null,
    mode: "idle",
  };
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private volume = 0.5;
  private onEndedCallback: (() => void) | null = null;

  private mode: PlayerMode = "idle";
  private playToken = 0;
  // true justo después de pedir loadVideoById() nosotros mismos, hasta que
  // se consume una vez (ver performLoad/onStateChange e.data===5). Evita
  // que un evento "cued" (5) DISPARADO POR YOUTUBE SOLO — algo que pasa a
  // veces justo después de llamar stopVideo(), un quirk conocido de la
  // IFrame API — dispare nuestro playVideo() y reinicie desde 0 el mismo
  // video que se acababa de parar. Antes reaccionábamos a CUALQUIER
  // "cued", viniera de donde viniera; ese era el bug real de "la última
  // canción vuelve a sonar sola" (ver performStop más abajo).
  private awaitingAutoplay = false;

  /** Llama esto desde App.tsx con un div que SIEMPRE esté montado. */
  attachContainer(div: HTMLDivElement) {
    // If the same container is already attached and the player exists, do nothing
    if (this.container === div && this.player) return;
    this.container = div;
    // Clear any previous children (orphaned iframes from previous attaches)
    while (div.firstChild) div.removeChild(div.firstChild);
    // Create a child element for YT.Player to replace.
    this.playerEl = document.createElement("div");
    div.appendChild(this.playerEl);
    // If we already had a player, destroy it so initPlayer creates a fresh one.
    if (this.player) {
      try { this.player.destroy(); } catch {}
      this.player = null;
      this.currentVideoId = null;
    }
    this.loadApi();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    try { this.player?.setVolume(this.volume * 100); } catch {}
  }

  getVolume(): number { return this.volume; }

  setOnEnded(cb: (() => void) | null) {
    this.onEndedCallback = cb;
  }

  /** Reproduce una canción de la COLA. */
  loadQueueVideo(videoId: string) {
    const myToken = ++this.playToken;
    this.mode = "queue";
    this.updateState({ mode: "queue" });
    this.performLoad(videoId, myToken);
  }

  /** Se llama cuando la cola queda vacía de verdad (no cuando avanza a la
   *  siguiente canción — para eso se usa loadQueueVideo otra vez). Detiene
   *  todo, sin volver a reproducir nada por su cuenta. */
  endQueue() {
    // Invalida cualquier callback pendiente de la canción de cola que acaba
    // de terminar — si updateSongStatus tarda en responder y por error
    // intentara tocar el reproductor después de esto, el token ya no
    // coincide y se ignora.
    const myToken = ++this.playToken;
    this.mode = "idle";
    this.updateState({ mode: "idle" });
    this.performStop(myToken);
  }

  /** Detiene todo por completo (usado también al desconectar el canal, por ejemplo). */
  stop() {
    this.playToken++;
    this.mode = "idle";
    this.updateState({ mode: "idle" });
    this.performStop(this.playToken);
  }

  play() {
    try { this.player?.playVideo(); } catch {}
  }

  pause() {
    try { this.player?.pauseVideo(); } catch {}
  }

  seekTo(seconds: number) {
    try { this.player?.seekTo(seconds, true); } catch {}
    this.updateState({ progress: seconds });
  }

  togglePlay() {
    if (!this.player) {
      console.warn("[ytPlayer] togglePlay: player not initialized");
      return;
    }
    try {
      const state = this.player.getPlayerState?.();
      // 1 = playing → pause; anything else (paused, cued, unstarted, ended) → play
      if (state === 1) {
        this.pause();
      } else {
        this.play();
      }
    } catch (e) {
      console.error("[ytPlayer] togglePlay error:", e);
    }
  }

  get currentVideoIdGet(): string | null { return this.currentVideoId; }
  get currentMode(): PlayerMode { return this.mode; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): PlayerState { return this.state; }

  // --- internals ---

  private performLoad(videoId: string, token: number) {
    // No recargar si ya está reproduciendo el mismo vídeo — pero solo si
    // sigue realmente cargado (reproduciendo, en pausa o cargando). Si ya
    // terminó (estado "ended") o nunca llegó a arrancar, player.playVideo()
    // sobre ÉL MISMO no lo "reanuda": la API de YouTube lo REINICIA desde
    // el segundo 0. Eso es lo que hacía que, tras terminar la última
    // canción, si algo volvía a pedir el mismo videoId (una recarga de la
    // cola, una carrera con el guardado en la base), la canción "volviera
    // y se repitiera" en vez de quedarse detenida. Cuando el player no
    // está realmente activo, se cae al camino de abajo y se recarga de
    // verdad con loadVideoById.
    if (this.currentVideoId === videoId && this.player) {
      let liveState = -1;
      try { liveState = this.player.getPlayerState(); } catch {}
      // 1 playing, 2 paused, 3 buffering — el vídeo sigue vivo, solo hace
      // falta retomarlo.
      if (liveState === 1 || liveState === 2 || liveState === 3) {
        try { this.player.playVideo(); } catch {}
        return;
      }
    }
    if (!this.apiReady || !this.player) {
      this.pendingVideoId = videoId;
      return;
    }
    try {
      this.awaitingAutoplay = true;
      this.player.loadVideoById(videoId);
      this.player.setVolume(this.volume * 100);
      this.currentVideoId = videoId;
      if (token !== this.playToken) return; // superado mientras cargaba
      this.updateState({ videoId, error: null, isPlaying: false, progress: 0, duration: 0 });
    } catch (e) {
      console.error("[ytPlayer] loadVideo error:", e);
    }
  }

  private performStop(token: number) {
    // Se limpia ANTES de llamar stopVideo(): si ese stopVideo() dispara un
    // "cued" espontáneo (ver comentario de awaitingAutoplay), el handler ya
    // lo va a encontrar en false y no va a reaccionar.
    this.awaitingAutoplay = false;
    try { this.player?.stopVideo(); } catch {}
    this.currentVideoId = null;
    if (token !== this.playToken) return;
    this.updateState({ videoId: null, isPlaying: false, progress: 0, duration: 0 });
  }

  private updateState(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private loadApi() {
    if (this.apiReady || this.apiLoading) {
      if (this.apiReady) this.initPlayer();
      return;
    }
    this.apiLoading = true;

    const init = () => {
      const YT = (window as any).YT;
      if (YT?.Player) {
        this.apiReady = true;
        this.initPlayer();
      } else {
        setTimeout(init, 200);
      }
    };

    if ((window as any).YT?.Player) {
      this.apiReady = true;
      this.initPlayer();
    } else if (!(window as any).YT) {
      (window as any).onYouTubeIframeAPIReady = init;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.body.appendChild(tag);
    } else {
      init();
    }
  }

  private initPlayer() {
    if (this.player || !this.container || !this.apiReady) {
      return;
    }
    const YT = (window as any).YT;
    if (!YT?.Player) return;
    // Use the child element, not the React-managed container, so React
    // doesn't destroy the iframe on re-render.
    const target = this.playerEl ?? this.container;
    try {
      this.player = new YT.Player(target, {
        height: "100%",
        width: "100%",
        videoId: "",
        playerVars: {
          autoplay: 1,
          controls: 1,
          disablekb: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          fs: 0,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            try { this.player.setVolume(this.volume * 100); } catch {}
            if (this.pendingVideoId) {
              const vid = this.pendingVideoId;
              this.pendingVideoId = null;
              this.performLoad(vid, this.playToken);
            }
          },
          onStateChange: (e: any) => {
            // YT states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            if (e.data === 1) {
              // Ya arrancó (por loadVideoById solo, o por el playVideo() de
              // más abajo) — se cierra la ventana de "esperando autoplay".
              this.awaitingAutoplay = false;
              this.updateState({ isPlaying: true, error: null });
            }
            if (e.data === 2) this.updateState({ isPlaying: false });
            if (e.data === 3) this.updateState({ isPlaying: false });
            if (e.data === 5) {
              // Solo arrancar si ESTE "cued" corresponde a un loadVideoById
              // que pedimos nosotros (ver awaitingAutoplay). Un "cued"
              // espontáneo — como el que a veces sigue a un stopVideo() —
              // se ignora, así no revive un video que se acaba de parar.
              if (this.awaitingAutoplay) {
                this.awaitingAutoplay = false;
                try { this.player.playVideo(); } catch {}
              }
            }
            if (e.data === 0) {
              this.updateState({ isPlaying: false });
              // Solo una canción de la COLA que termina le pide a App.tsx
              // que decida el siguiente paso (siguiente canción o fin de
              // cola) — si por algún motivo terminara un vídeo fuera de ese
              // modo, no hay "siguiente" que decidir automáticamente.
              if (this.mode === "queue") {
                this.onEndedCallback?.();
              }
            }
          },
          onError: (e: any) => {
            const code = e?.data;
            const tYt = useI18n.getState().t;
            let msg = tYt("yt_err_generic");
            if (code === 2) msg = tYt("yt_err_invalid_id");
            else if (code === 100) msg = tYt("yt_err_not_found");
            else if (code === 101 || code === 150) msg = tYt("yt_err_not_allowed");
            this.updateState({ error: msg, isPlaying: false });
            if (this.mode === "queue") this.onEndedCallback?.();
          },
        },
      });
      this.startPolling();
    } catch (e) {
      console.error("[ytPlayer] initPlayer error:", e);
    }
  }

  private startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (!this.player || typeof this.player.getPlayerState !== "function") return;
      try {
        const state = this.player.getPlayerState();
        const isPlaying = state === 1;
        if (state === 1 || state === 2) {
          const progress = this.player.getCurrentTime() ?? 0;
          const duration = this.player.getDuration() ?? 0;
          this.updateState({ isPlaying, progress, duration });
        } else {
          this.updateState({ isPlaying });
        }
      } catch {}
    }, 500);
  }
}

export const ytPlayer = new YouTubePlayerManager();
