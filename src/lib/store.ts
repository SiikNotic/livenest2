import { create } from "zustand";
import { supabase, type ChatMessage, type FilterRule, type Settings, type Template, type LiveEvent, type SongRequest } from "./supabase";
import { voiceManager, cleanNameForSpeech } from "./voiceManager";
import { soundManager, isCustomSoundUrl } from "./soundManager";
import { applyFilters, applyTemplate } from "./eventProcessor";
import { TikTokConnection, type TikTokEvent, type ConnectionStatus } from "./tiktokConnection";
import { ytPlayer } from "./youtubePlayer";
import { useI18n } from "./i18n";

const MAX_MESSAGES = 100;
const MAX_EVENTS = 200;
// Tope de la cola de lectura por voz. Sin esto, un directo con audiencia
// enorme puede generar mensajes leíbles más rápido de lo que la voz puede
// leerlos, y la app queda leyendo mensajes de hace varios minutos.
const MAX_SPEAK_QUEUE = 40;

type State = {
  status: ConnectionStatus;
  username: string;
  viewerCount: number;
  messages: ChatMessage[];
  events: LiveEvent[];
  songQueue: SongRequest[];
  currentSong: SongRequest | null;
  settings: Settings | null;
  filters: FilterRule[];
  templates: Template[];
  unreadCount: number;
  error: string | null;
  isSpeaking: boolean;
  speakQueue: { text: string; voiceId?: string; epoch: number }[];
  processingQueue: boolean;
  notLiveUser: string | null;
  reconnecting: boolean;
  sessionStartedAt: number | null;
  // Se incrementa en cada connect()/disconnect(). Cada mensaje encolado para
  // lectura queda "sellado" con el epoch vigente al momento de encolarse —
  // así, si el usuario desconecta o cambia de canal mientras hay mensajes
  // pendientes de leer, esos mensajes quedan ligados a un epoch viejo y
  // processQueue() los descarta en vez de leerlos.
  ttsEpoch: number;

  connect: (username: string) => Promise<void>;
  disconnect: () => void;
  resetSession: () => void;
  pushMessage: (username: string, message: string, nickname?: string | null, avatar?: string | null) => Promise<void>;
  speakMessage: (msg: ChatMessage) => Promise<void>;
  stopSpeaking: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
  loadFilters: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  loadEvents: () => Promise<void>;
  loadSongQueue: () => Promise<void>;
  clearMessages: () => void;
  clearEvents: () => void;
  enqueueSpeech: (text: string, voiceId?: string) => void;
  processQueue: () => Promise<void>;
  addEvent: (type: LiveEvent["type"], username: string, detail?: string, count?: number, nickname?: string) => void;
  handleSongCommand: (username: string, query: string) => Promise<void>;
  addSongByUrl: (videoId: string, username: string) => Promise<void>;
  addPlaylistByUrl: (playlistId: string, username: string) => Promise<{ added: number; total: number }>;
  updateSongStatus: (id: string, status: SongRequest["status"], extra?: Partial<SongRequest>) => Promise<void>;
  skipSong: () => Promise<void>;
  stopMusic: () => Promise<void>;
};

let connection: TikTokConnection | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Partial<Settings> | null = null;

// Borra en la base los eventos/canciones que quedaron de la conexión que
// se está cerrando. Antes esto vivía solo dentro de disconnect() (el botón
// "Desconectar" de la UI) — pero cerrar sesión mientras se seguía conectado
// (resetSession, ej. al hacer logout o al banear a alguien) nunca pasaba
// por ahí, así que esas filas quedaban huérfanas en live_events/song_requests
// y volvían a aparecer como "actividad vieja" la próxima vez que esa cuenta
// entraba, aunque no estuviera conectada a ningún canal. Se extrae a una
// función compartida para que ningún camino de "dejar de estar conectado"
// se la salte, y se le agrega .catch para no perder el error en silencio
// si la petición falla.
function clearLiveActivity() {
  supabase.from("live_events").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    .then(({ error }) => { if (error) console.error("No se pudo limpiar live_events:", error); });
  supabase.from("song_requests").delete().in("status", ["queued", "playing"])
    .then(({ error }) => { if (error) console.error("No se pudo limpiar song_requests:", error); });
}

export const useStore = create<State>((set, get) => ({
  status: "disconnected",
  username: "",
  viewerCount: 0,
  messages: [],
  events: [],
  songQueue: [],
  currentSong: null,
  settings: null,
  filters: [],
  templates: [],
  unreadCount: 0,
  error: null,
  isSpeaking: false,
  speakQueue: [],
  processingQueue: false,
  notLiveUser: null,
  reconnecting: false,
  sessionStartedAt: null,
  ttsEpoch: 0,

  connect: async (username: string) => {
    const clean = username.trim().replace(/^@/, "");
    if (!clean) {
      set({ error: useI18n.getState().t("err_invalid_user") });
      return;
    }

    // Arranque en limpio del sistema de lectura por voz, sin importar cómo
    // se llegó hasta aquí (canal guardado o nombre escrito a mano). Libera
    // cualquier lectura que hubiera quedado a medias de la conexión
    // anterior, y el nuevo ttsEpoch invalida cualquier mensaje que aún
    // estuviera en la cola vieja.
    voiceManager.stop();
    set((s) => ({
      status: "connecting",
      username: clean,
      error: null,
      notLiveUser: null,
      sessionStartedAt: Date.now(),
      speakQueue: [],
      processingQueue: false,
      isSpeaking: false,
      ttsEpoch: s.ttsEpoch + 1,
    }));

    connection = new TikTokConnection({
      onStatus: (status) => {
        if (status === "connected") set({ reconnecting: false });
        set({ status });
      },
      onError: (message) => {
        // Solo mostrar errores reales, no mensajes de reintento
        if (!message.includes("Reintentando") && !message.includes("reintentando")) {
          set({ error: message });
          setTimeout(() => set((s) => (s.error === message ? { error: null } : {})), 6000);
        }
      },
      onReconnecting: () => set({ reconnecting: true }),
      onNotLive: (user) => {
        set({ notLiveUser: user, status: "disconnected", reconnecting: false });
        setTimeout(() => set((s) => (s.notLiveUser === user ? { notLiveUser: null } : {})), 6000);
      },
      onEvent: (event: TikTokEvent) => {
        const store = get();
        if (event.type === "viewer") {
          set({ viewerCount: event.count });
          return;
        }
        // Filtrar mensajes anteriores al inicio de sesión (evita leer historial)
        if (event.type === "chat" && typeof event.timestamp === "number") {
          if (event.timestamp < (store.sessionStartedAt ?? Date.now())) return;
        }
        if (event.type === "chat") {
          store.pushMessage(event.username, event.message, event.nickname, event.avatar);
        } else if (event.type === "gift") {
          store.addEvent("gift", event.username, event.giftName, event.count, event.nickname);
          playNotifSound(store, "notif_gift_sound");
        } else if (event.type === "like") {
          store.addEvent("like", event.username, undefined, event.count, event.nickname);
          playNotifSound(store, "notif_like_sound");
        } else if (event.type === "follow") {
          store.addEvent("follow", event.username, undefined, undefined, event.nickname);
          playNotifSound(store, "notif_follow_sound");
        } else if (event.type === "share") {
          store.addEvent("share", event.username, undefined, undefined, event.nickname);
          playNotifSound(store, "notif_share_sound");
        } else if (event.type === "sub") {
          store.addEvent("sub", event.username, event.detail, undefined, event.nickname);
          playNotifSound(store, "notif_sub_sound");
        }
      },
    });

    await connection.connect(clean);
  },

  disconnect: () => {
    if (connection) {
      connection.disconnect();
      connection = null;
    }
    // Cortar la voz que esté sonando y vaciar la cola de lectura. El
    // ttsEpoch nuevo invalida cualquier mensaje que ya estuviera en la
    // cola o a medio procesar en processQueue().
    voiceManager.stop();
    set((s) => ({ speakQueue: [], processingQueue: false, ttsEpoch: s.ttsEpoch + 1 }));
    // Limpiar eventos, canción actual y cola al desconectar
    clearLiveActivity();
    set({
      status: "disconnected",
      isSpeaking: false,
      viewerCount: 0,
      reconnecting: false,
      error: null,
      sessionStartedAt: null,
      // Los mensajes de chat no se guardan en la base (a diferencia de
      // eventos/canciones) — viven solo en este estado local, así que sin
      // esto quedaban pegados al desconectar: si después te conectabas a
      // OTRO canal, sus mensajes viejos seguían mezclados con los nuevos.
      messages: [],
      unreadCount: 0,
      events: [],
      currentSong: null,
      songQueue: [],
    });
  },

  /** Se llama al cerrar sesión. Sin esto, los ajustes/filtros/plantillas de
   *  la cuenta anterior seguían en memoria (el store es un singleton que no
   *  se reinicia solo) — si alguien más entraba en la misma pestaña, o la
   *  misma persona volvía a entrar, la app mostraba por un momento (o hasta
   *  la próxima recarga) configuraciones que ya no correspondían a nadie
   *  logueado, o a la cuenta equivocada. */
  resetSession: () => {
    if (connection) {
      connection.disconnect();
      connection = null;
      // Si se cierra sesión (o se banea a la cuenta) mientras seguía
      // conectada a un canal, hay que limpiar igual que en disconnect() —
      // si no, esos eventos/canciones quedan huérfanos en la base y
      // reaparecen como "actividad vieja" la próxima vez que esta cuenta
      // entre, aunque ya no esté conectada a nada.
      clearLiveActivity();
    }
    voiceManager.stop();
    ytPlayer.stop();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    pendingSave = null;
    set((s) => ({
      status: "disconnected",
      username: "",
      viewerCount: 0,
      messages: [],
      events: [],
      songQueue: [],
      currentSong: null,
      settings: null,
      filters: [],
      templates: [],
      unreadCount: 0,
      error: null,
      isSpeaking: false,
      speakQueue: [],
      processingQueue: false,
      notLiveUser: null,
      reconnecting: false,
      sessionStartedAt: null,
      ttsEpoch: s.ttsEpoch + 1,
    }));
  },


  pushMessage: async (username: string, message: string, nickname?: string | null, avatar?: string | null) => {
    const state = get();
    if (!state.settings) return;

    const result = applyFilters(
      message,
      username,
      state.filters,
      state.settings.min_message_length,
      state.settings.max_message_length
    );

    const newMsg: ChatMessage = {
      id: crypto.randomUUID(),
      username,
      nickname: nickname ?? null,
      avatar: avatar ?? null,
      message,
      read_at: result.shouldRead && state.settings.auto_read ? new Date().toISOString() : null,
      skipped: !result.shouldRead,
      created_at: new Date().toISOString(),
    };

    set((s) => ({
      messages: [newMsg, ...s.messages].slice(0, MAX_MESSAGES),
      unreadCount: s.unreadCount + 1,
    }));

    // Verificar si es un comando de canción
    if (state.settings.music_enabled && result.shouldRead) {
      const cmd = state.settings.music_command.toLowerCase();
      const trimmedMsg = message.trim();
      if (trimmedMsg.toLowerCase().startsWith(cmd + " ")) {
        const query = trimmedMsg.slice(cmd.length + 1).trim();
        if (query) {
          get().handleSongCommand(username, query);
          return;
        }
      }
    }

    if (result.shouldRead && state.settings.auto_read) {
      const displayName = cleanNameForSpeech(nickname || username);
      const text = applyTemplate(result.finalText, displayName, state.templates);
      const voiceId = state.settings.voice_random
        ? voiceManager.getRandomVoiceId(state.settings.voice_provider) ?? state.settings.voice_id
        : state.settings.voice_id;
      get().enqueueSpeech(text, voiceId);
    }
  },

  speakMessage: async (msg: ChatMessage) => {
    const state = get();
    if (!state.settings) return;
    const text = applyTemplate(msg.message, msg.username, state.templates);
    voiceManager.stop();
    set({ speakQueue: [], processingQueue: false });
    set({ isSpeaking: true });
    await voiceManager.speak(text, {
      voiceId: state.settings.voice_id,
      rate: state.settings.rate,
      pitch: state.settings.pitch,
      volume: state.settings.volume,
      provider: state.settings.voice_provider,
    });
    set({ isSpeaking: false });
  },

  stopSpeaking: () => {
    voiceManager.stop();
    set({ isSpeaking: false });
  },

  loadSettings: async () => {
    const { data, error } = await supabase.rpc("ensure_settings");
    if (error) {
      set({ error: useI18n.getState().t("store_err_load_settings") });
      return;
    }
    set({ settings: data as Settings });
  },

  saveSettings: async (partial: Partial<Settings>) => {
    const state = get();
    if (!state.settings) return;
    const settingsId = state.settings.id;
    const updated = { ...state.settings, ...partial, updated_at: new Date().toISOString() };
    set({ settings: updated });
    pendingSave = { ...pendingSave, ...partial };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      // Se saca una copia y se limpia pendingSave ANTES de esperar la
      // respuesta del servidor — si no, un cambio nuevo que llega mientras
      // esta petición todavía está en vuelo se acumula en pendingSave, y
      // cuando ESTA petición termina y pone pendingSave = null, borra ese
      // cambio nuevo sin haberlo guardado nunca (se perdía en silencio:
      // la UI lo mostraba aplicado, pero nunca llegaba a la base y
      // desaparecía al recargar).
      const toSave = pendingSave;
      pendingSave = null;
      if (!toSave) return;
      const { error } = await supabase.from("settings").update(toSave).eq("id", settingsId);
      if (error) {
        // Antes un fallo acá (red, RLS, lo que sea) quedaba en silencio —
        // el usuario creía que su ajuste había quedado guardado.
        const saveErrorMsg = useI18n.getState().t("store_err_save_setting");
        set({ error: saveErrorMsg });
        setTimeout(() => set((s) => (s.error === saveErrorMsg ? { error: null } : {})), 6000);
      }
    }, 600);
  },

  loadFilters: async () => {
    const { data, error } = await supabase
      .from("filters")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      set({ error: useI18n.getState().t("store_err_load_filters") });
      return;
    }
    set({ filters: (data as FilterRule[]) ?? [] });
  },

  loadTemplates: async () => {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      set({ error: useI18n.getState().t("store_err_load_templates") });
      return;
    }
    set({ templates: (data as Template[]) ?? [] });
  },

  loadEvents: async () => {
    const { data, error } = await supabase
      .from("live_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);
    if (error) return;
    set({ events: (data as LiveEvent[]) ?? [] });
  },

  loadSongQueue: async () => {
    const { data, error } = await supabase
      .from("song_requests")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) return;
    const songs = (data as SongRequest[]) ?? [];
    const current = songs.find((s) => s.status === "playing") ?? null;
    const queued = songs.filter((s) => s.status === "queued");
    set({ songQueue: queued, currentSong: current });
  },

  clearMessages: () => set({ messages: [], unreadCount: 0 }),

  clearEvents: async () => {
    await supabase.from("live_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    set({ events: [] });
  },

  enqueueSpeech: (text: string, voiceId?: string) => {
    set((s) => {
      const next = [...s.speakQueue, { text, voiceId, epoch: s.ttsEpoch }];
      return { speakQueue: next.length > MAX_SPEAK_QUEUE ? next.slice(next.length - MAX_SPEAK_QUEUE) : next };
    });
    get().processQueue();
  },

  processQueue: async () => {
    const state = get();
    if (state.processingQueue || state.speakQueue.length === 0) return;
    const item = state.speakQueue[0];

    // Este mensaje pertenece a una conexión que ya no está activa (el
    // usuario desconectó o cambió de canal mientras esperaba en la cola).
    // Nunca debe leerse — lo descartamos y seguimos con el siguiente.
    if (item.epoch !== state.ttsEpoch) {
      set((s) => ({ speakQueue: s.speakQueue.slice(1) }));
      get().processQueue();
      return;
    }

    set({ processingQueue: true, isSpeaking: true });
    set((s) => ({ speakQueue: s.speakQueue.slice(1) }));
    if (state.settings) {
      await voiceManager.speak(item.text, {
        voiceId: item.voiceId ?? state.settings.voice_id,
        rate: state.settings.rate,
        pitch: state.settings.pitch,
        volume: state.settings.volume,
        provider: state.settings.voice_provider,
      });
    }
    const after = get();
    if (after.ttsEpoch !== item.epoch) return;
    set({ processingQueue: false });
    if (after.speakQueue.length > 0) {
      get().processQueue();
    } else {
      set({ isSpeaking: false });
    }
  },

  addEvent: (type, username, detail, count = 1, nickname) => {
    const newEvent: LiveEvent = {
      id: crypto.randomUUID(),
      type,
      username,
      detail: detail ?? null,
      count,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ events: [newEvent, ...s.events].slice(0, MAX_EVENTS) }));
    // Persistir en background
    supabase.from("live_events").insert({
      type,
      username,
      detail: detail ?? null,
      count,
    }).then();

    // Leer notificación por voz si está activado
    const state = get();
    if (state.settings?.notif_voice_enabled) {
      const voiceKey = `notif_voice_${type}` as keyof typeof state.settings;
      const shouldSpeak = state.settings[voiceKey] as boolean | undefined;
      if (shouldSpeak) {
        // Usar el nombre del canal (nickname) si está disponible; si no, el username
        const safeName = cleanNameForSpeech(nickname || username);
        const tVoice = useI18n.getState().t;
        let text = "";
        if (type === "gift") {
          const giftName = detail ?? tVoice("voice_alert_gift_default");
          text = count > 1
            ? tVoice("voice_alert_gift_multi", { name: safeName, gift: giftName, count })
            : tVoice("voice_alert_gift_single", { name: safeName, gift: giftName });
        } else if (type === "follow") {
          text = tVoice("voice_alert_follow", { name: safeName });
        } else if (type === "like") {
          text = count > 1
            ? tVoice("voice_alert_like_multi", { name: safeName, count })
            : tVoice("voice_alert_like_single", { name: safeName });
        } else if (type === "share") {
          text = tVoice("voice_alert_share", { name: safeName });
        } else if (type === "sub") {
          text = tVoice("voice_alert_sub", { name: safeName });
        }
        if (text) {
          const voiceId = state.settings.voice_random
            ? voiceManager.getRandomVoiceId(state.settings.voice_provider) ?? state.settings.voice_id
            : state.settings.voice_id;
          get().enqueueSpeech(text, voiceId);
        }
      }
    }
  },

  handleSongCommand: async (username: string, query: string) => {
    const state = get();
    if (!state.settings?.music_enabled) return;

    const maxQueue = state.settings.max_song_queue;
    if (state.songQueue.length >= maxQueue) {
      return;
    }

    try {
      const searchUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-search`;
      const res = await fetch(searchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) return;
      const result = await res.json();

      if (result.not_found || !result.videoId) {
        await supabase.from("song_requests").insert({
          username,
          query,
          status: "not_found",
        });
        return;
      }

      // Filtro de canciones/videos troll: comprobar título y consulta contra palabras bloqueadas
      const blockedKeywords = (state.settings.music_blocked_keywords ?? "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const titleLower = (result.title ?? "").toLowerCase();
      const queryLower = query.toLowerCase();
      const isBlocked = blockedKeywords.some(
        (kw) => titleLower.includes(kw) || queryLower.includes(kw)
      );
      if (isBlocked) {
        await supabase.from("song_requests").insert({
          username,
          query,
          video_id: result.videoId,
          video_title: result.title ?? query,
          video_channel: result.channel ?? "",
          status: "blocked",
        });
        return;
      }

      const { data } = await supabase.from("song_requests").insert({
        username,
        query,
        video_id: result.videoId,
        video_title: result.title ?? query,
        video_channel: result.channel ?? "",
        status: "queued",
      }).select("*").single();

      if (data) {
        const newSong = data as SongRequest;
        const state = get();
        // Auto-reproducir si no hay canción actual y el autoplay está activado
        if (!state.currentSong && state.settings?.music_autoplay) {
          await supabase.from("song_requests").update({ status: "playing" }).eq("id", newSong.id);
          set({ currentSong: { ...newSong, status: "playing" } });
        } else {
          set((s) => ({ songQueue: [...s.songQueue, newSong] }));
        }
      }
    } catch {
      // Error silencioso
    }
  },

  updateSongStatus: async (id, status, extra) => {
    const { error } = await supabase.from("song_requests").update({ status, ...extra }).eq("id", id);
    // Si el guardado falla (red, RLS, lo que sea), NO seguir como si hubiera
    // funcionado: antes se seguía de largo igual, y si esta fila seguía
    // marcada "playing" en la base, la siguiente recarga de la cola la
    // volvía a traer como canción actual — la canción "terminaba" en la UI
    // pero la base seguía pensando que sonaba, y volvía a aparecer.
    if (error) {
      set({ error: useI18n.getState().t("store_err_update_song") });
      return;
    }

    // Auto-avance: cuando la canción ACTUAL termina o se salta, marcar la
    // siguiente en la cola como "playing" antes de recargar para que el
    // reproductor pase directamente a la siguiente. Esto NUNCA debe pasar
    // al quitar una canción que solo está en cola (aún no suena) — antes
    // se aplicaba igual y quitar cualquier canción de la lista de espera
    // secuestraba la que sí estaba sonando, reemplazándola por el
    // siguiente turno de la cola sin que nadie lo pidiera.
    const state = get();
    const isCurrent = state.currentSong?.id === id;

    if ((status === "played" || status === "skipped") && isCurrent) {
      if (state.songQueue.length > 0) {
        const next = state.songQueue[0];
        const { error: nextError } = await supabase
          .from("song_requests")
          .update({ status: "playing" })
          .eq("id", next.id);
        if (nextError) {
          set({ error: useI18n.getState().t("store_err_next_song") });
          await get().loadSongQueue();
          return;
        }
        // Actualizar estado local inmediatamente para evitar un hueco
        // donde currentSong sea null y el reproductor se detenga
        set({
          currentSong: { ...next, status: "playing" },
          songQueue: state.songQueue.slice(1),
        });
        return;
      }
      // No hay más canciones en la cola — parar de verdad, ya (no solo
      // esperar a que la recarga de abajo lo confirme).
      ytPlayer.stop();
      set({ currentSong: null });
    }

    await get().loadSongQueue();
  },

  skipSong: async () => {
    const state = get();
    if (state.currentSong) {
      await get().updateSongStatus(state.currentSong.id, "skipped");
    }
  },

  /** Detiene la música YA, sin esperar a la base de datos — el botón de
   *  Stop no debe poder quedarse "pensando": corta el reproductor de
   *  inmediato y limpia el estado local, y el guardado en la base va
   *  detrás en segundo plano. */
  stopMusic: async () => {
    const state = get();
    ytPlayer.stop();
    const current = state.currentSong;
    set({ currentSong: null });
    if (current) {
      await supabase.from("song_requests").update({ status: "skipped" }).eq("id", current.id);
    }
    await get().loadSongQueue();
  },

  addSongByUrl: async (videoId: string, username: string) => {
    const state = get();
    const maxQueue = state.settings?.max_song_queue ?? 20;
    if (state.songQueue.length >= maxQueue) return;

    // Obtener título y canal del video usando oEmbed (sin API key)
    let title: string | null = null;
    let channel: string | null = null;
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        title = data.title ?? null;
        channel = data.author_name ?? null;
      }
    } catch {}

    const { data } = await supabase.from("song_requests").insert({
      username,
      query: title ?? `https://youtu.be/${videoId}`,
      video_id: videoId,
      video_title: title,
      video_channel: channel,
      status: "queued",
    }).select("*").single();

    if (data) {
      const newSong = data as SongRequest;
      const state = get();
      // Auto-reproducir si no hay canción actual y el autoplay está activado
      if (!state.currentSong && state.settings?.music_autoplay) {
        await supabase.from("song_requests").update({ status: "playing" }).eq("id", newSong.id);
        set({ currentSong: { ...newSong, status: "playing" } });
      } else {
        set((s) => ({ songQueue: [...s.songQueue, newSong] }));
      }
    }
  },

  addPlaylistByUrl: async (playlistId: string, username: string) => {
    const searchUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-playlist`;
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ playlistId }),
    });
    if (!res.ok) return { added: 0, total: 0 };
    const result = await res.json().catch(() => ({}));
    const videoIds: string[] = Array.isArray(result?.videoIds) ? result.videoIds : [];
    if (videoIds.length === 0) return { added: 0, total: 0 };

    // Uno por uno (no en paralelo) — cada addSongByUrl ya revisa el límite
    // de la cola antes de insertar, así que apenas se llena se corta solo
    // sin desperdiciar más consultas a oEmbed/inserts de más.
    let added = 0;
    for (const videoId of videoIds) {
      const maxQueue = get().settings?.max_song_queue ?? 20;
      if (get().songQueue.length >= maxQueue) break;
      await get().addSongByUrl(videoId, username);
      added++;
    }
    return { added, total: videoIds.length };
  },
}));

function playNotifSound(state: { settings?: { notif_sound_enabled?: boolean; notif_volume?: number; notif_gift_sound?: string; notif_follow_sound?: string; notif_like_sound?: string; notif_share_sound?: string; notif_sub_sound?: string } | null }, key: string) {
  if (!state.settings?.notif_sound_enabled) return;
  soundManager.setVolume(state.settings.notif_volume ?? 0.5);
  const sound = (state.settings as any)?.[key] as string;
  if (!sound || sound === "none") return;
  if (isCustomSoundUrl(sound)) {
    soundManager.playUrl(sound);
  } else {
    soundManager.play(sound as any);
  }
}
