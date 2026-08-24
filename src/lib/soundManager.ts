// Gestor de sonidos de notificación usando Web Audio API.
// Genera tonos sintéticos sin archivos externos.

export type SoundType =
  | "chime" | "pop" | "bell" | "coin" | "none"
  | "ding" | "whoosh" | "sparkle" | "buzzer"
  | "success" | "error" | "notify" | "heartbeat"
  | "laser" | "bubble" | "click" | "fanfare"
  | "airhorn" | "clap" | "cash" | "explosion"
  | "levelup" | "rimshot" | "alarm" | "tada"
  | "drumroll" | "boing" | "zap" | "rainbow"
  | "powerup" | "gameover" | "siren" | "whistle";

class SoundManager {
  private ctx: AudioContext | null = null;
  private volume = 0.5;
  private audioCache = new Map<string, HTMLAudioElement>();

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /**
   * Reproduce un archivo de audio personalizado (mp3/wav/ogg) a partir de una URL,
   * por ejemplo un archivo subido a Supabase Storage. Usa un elemento <audio> en
   * caché por URL, y clona el nodo para permitir reproducciones superpuestas
   * (ej. muchos likes seguidos) sin cortar el sonido anterior.
   */
  playUrl(url: string, volume?: number) {
    const vol = volume ?? this.volume;
    if (vol <= 0) return;
    try {
      let base = this.audioCache.get(url);
      if (!base) {
        base = new Audio(url);
        base.preload = "auto";
        this.audioCache.set(url, base);
      }
      const node = base.cloneNode(true) as HTMLAudioElement;
      node.volume = Math.max(0, Math.min(1, vol));
      // Reproduce y libera el nodo clonado cuando termina.
      node.play().catch(() => {
        // Reproducción bloqueada (ej. sin interacción previa del usuario).
      });
    } catch {
      // Audio no disponible o URL inválida.
    }
  }

  /** Precarga un sonido personalizado para que la primera reproducción no tenga retraso. */
  preloadUrl(url: string) {
    if (!url || this.audioCache.has(url)) return;
    try {
      const audio = new Audio(url);
      audio.preload = "auto";
      this.audioCache.set(url, audio);
    } catch {
      // ignorar
    }
  }

  play(type: SoundType, volume?: number) {
    if (type === "none") return;
    const vol = volume ?? this.volume;
    if (vol <= 0) return;

    try {
      const ctx = this.ensureCtx();
      switch (type) {
        case "chime": this.playChime(ctx, vol); break;
        case "pop": this.playPop(ctx, vol); break;
        case "bell": this.playBell(ctx, vol); break;
        case "coin": this.playCoin(ctx, vol); break;
        case "ding": this.playDing(ctx, vol); break;
        case "whoosh": this.playWhoosh(ctx, vol); break;
        case "sparkle": this.playSparkle(ctx, vol); break;
        case "buzzer": this.playBuzzer(ctx, vol); break;
        case "success": this.playSuccess(ctx, vol); break;
        case "error": this.playError(ctx, vol); break;
        case "notify": this.playNotify(ctx, vol); break;
        case "heartbeat": this.playHeartbeat(ctx, vol); break;
        case "laser": this.playLaser(ctx, vol); break;
        case "bubble": this.playBubble(ctx, vol); break;
        case "click": this.playClick(ctx, vol); break;
        case "fanfare": this.playFanfare(ctx, vol); break;
        case "airhorn": this.playAirhorn(ctx, vol); break;
        case "clap": this.playClap(ctx, vol); break;
        case "cash": this.playCash(ctx, vol); break;
        case "explosion": this.playExplosion(ctx, vol); break;
        case "levelup": this.playLevelUp(ctx, vol); break;
        case "rimshot": this.playRimshot(ctx, vol); break;
        case "alarm": this.playAlarm(ctx, vol); break;
        case "tada": this.playTada(ctx, vol); break;
        case "drumroll": this.playDrumroll(ctx, vol); break;
        case "boing": this.playBoing(ctx, vol); break;
        case "zap": this.playZap(ctx, vol); break;
        case "rainbow": this.playRainbow(ctx, vol); break;
        case "powerup": this.playPowerUp(ctx, vol); break;
        case "gameover": this.playGameOver(ctx, vol); break;
        case "siren": this.playSiren(ctx, vol); break;
        case "whistle": this.playWhistle(ctx, vol); break;
      }
    } catch {
      // AudioContext no disponible
    }
  }

  private playChime(ctx: AudioContext, vol: number) {
    const notes = [880, 1108.73, 1318.51];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.25, i * 0.08, 0.18, "sine"));
  }

  private playPop(ctx: AudioContext, vol: number) {
    this.tone(ctx, 600, vol * 0.3, 0, 0.06, "sine");
    this.tone(ctx, 900, vol * 0.2, 0.04, 0.08, "sine");
  }

  private playBell(ctx: AudioContext, vol: number) {
    this.tone(ctx, 1318.51, vol * 0.3, 0, 0.5, "sine");
    this.tone(ctx, 1975.53, vol * 0.15, 0, 0.5, "sine");
  }

  private playCoin(ctx: AudioContext, vol: number) {
    this.tone(ctx, 988, vol * 0.3, 0, 0.08, "square");
    this.tone(ctx, 1318.51, vol * 0.3, 0.07, 0.12, "square");
  }

  private playDing(ctx: AudioContext, vol: number) {
    this.tone(ctx, 2093, vol * 0.35, 0, 0.3, "sine");
    this.tone(ctx, 2637, vol * 0.15, 0, 0.3, "sine");
  }

  private playWhoosh(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, t0);
    osc.frequency.exponentialRampToValueAtTime(1200, t0 + 0.25);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol * 0.2, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.32);
  }

  private playSparkle(ctx: AudioContext, vol: number) {
    const notes = [1318.51, 1567.98, 1760, 2093, 2637];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.15, i * 0.04, 0.12, "sine"));
  }

  private playBuzzer(ctx: AudioContext, vol: number) {
    this.tone(ctx, 220, vol * 0.3, 0, 0.15, "square");
    this.tone(ctx, 220, vol * 0.3, 0.18, 0.15, "square");
  }

  private playSuccess(ctx: AudioContext, vol: number) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.25, i * 0.06, 0.15, "sine"));
  }

  private playError(ctx: AudioContext, vol: number) {
    this.tone(ctx, 311.13, vol * 0.3, 0, 0.15, "sawtooth");
    this.tone(ctx, 207.65, vol * 0.3, 0.15, 0.2, "sawtooth");
  }

  private playNotify(ctx: AudioContext, vol: number) {
    this.tone(ctx, 880, vol * 0.25, 0, 0.1, "sine");
    this.tone(ctx, 1108.73, vol * 0.25, 0.08, 0.15, "sine");
  }

  private playHeartbeat(ctx: AudioContext, vol: number) {
    this.tone(ctx, 80, vol * 0.4, 0, 0.08, "sine");
    this.tone(ctx, 80, vol * 0.3, 0.15, 0.08, "sine");
  }

  private playLaser(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1200, t0);
    osc.frequency.exponentialRampToValueAtTime(200, t0 + 0.15);
    gain.gain.setValueAtTime(vol * 0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.17);
  }

  private playBubble(ctx: AudioContext, vol: number) {
    this.tone(ctx, 500, vol * 0.2, 0, 0.04, "sine");
    this.tone(ctx, 700, vol * 0.2, 0.03, 0.04, "sine");
    this.tone(ctx, 900, vol * 0.15, 0.06, 0.05, "sine");
  }

  private playClick(ctx: AudioContext, vol: number) {
    this.tone(ctx, 1500, vol * 0.15, 0, 0.02, "square");
  }

  private playFanfare(ctx: AudioContext, vol: number) {
    const notes = [523.25, 523.25, 523.25, 523.25, 659.25, 783.99, 1046.5];
    const delays = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.25, delays[i], 0.2, "triangle"));
  }

  private playAirhorn(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(600, t0 + 0.15);
    osc.frequency.setValueAtTime(600, t0 + 0.15);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol * 0.35, t0 + 0.02);
    gain.gain.setValueAtTime(vol * 0.35, t0 + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.62);
  }

  private playClap(ctx: AudioContext, vol: number) {
    for (let i = 0; i < 4; i++) {
      const noise = this.noiseBurst(ctx, vol * 0.2, i * 0.06, 0.03);
    }
  }

  private playCash(ctx: AudioContext, vol: number) {
    const notes = [1318.51, 1567.98, 2093, 2637];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.2, i * 0.05, 0.1, "triangle"));
  }

  private playExplosion(ctx: AudioContext, vol: number) {
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buffer;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();
  }

  private playLevelUp(ctx: AudioContext, vol: number) {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.2, i * 0.05, 0.1, "square"));
  }

  private playRimshot(ctx: AudioContext, vol: number) {
    this.tone(ctx, 200, vol * 0.3, 0, 0.03, "sine");
    this.tone(ctx, 150, vol * 0.25, 0.02, 0.05, "sine");
  }

  private playAlarm(ctx: AudioContext, vol: number) {
    for (let i = 0; i < 3; i++) {
      this.tone(ctx, 880, vol * 0.25, i * 0.2, 0.08, "square");
      this.tone(ctx, 660, vol * 0.25, i * 0.2 + 0.1, 0.08, "square");
    }
  }

  private playTada(ctx: AudioContext, vol: number) {
    const notes = [523.25, 523.25, 783.99, 783.99, 1046.5];
    const delays = [0, 0.08, 0.16, 0.24, 0.4];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.25, delays[i], 0.2, "triangle"));
  }

  private playDrumroll(ctx: AudioContext, vol: number) {
    for (let i = 0; i < 8; i++) {
      this.tone(ctx, 200, vol * 0.12, i * 0.05, 0.03, "sine");
    }
    this.tone(ctx, 523.25, vol * 0.3, 0.42, 0.2, "sine");
  }

  private playBoing(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t0);
    osc.frequency.exponentialRampToValueAtTime(150, t0 + 0.15);
    osc.frequency.exponentialRampToValueAtTime(400, t0 + 0.3);
    gain.gain.setValueAtTime(vol * 0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.37);
  }

  private playZap(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = "square";
    osc.frequency.setValueAtTime(2000, t0);
    osc.frequency.exponentialRampToValueAtTime(100, t0 + 0.1);
    gain.gain.setValueAtTime(vol * 0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.14);
  }

  private playRainbow(ctx: AudioContext, vol: number) {
    const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.15, i * 0.04, 0.1, "sine"));
  }

  private playPowerUp(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = "square";
    osc.frequency.setValueAtTime(200, t0);
    osc.frequency.exponentialRampToValueAtTime(800, t0 + 0.2);
    gain.gain.setValueAtTime(vol * 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.27);
    this.tone(ctx, 1046.5, vol * 0.2, 0.2, 0.1, "sine");
  }

  private playGameOver(ctx: AudioContext, vol: number) {
    const notes = [392, 370, 349.23, 329.63];
    notes.forEach((freq, i) => this.tone(ctx, freq, vol * 0.25, i * 0.12, 0.15, "square"));
  }

  private playSiren(ctx: AudioContext, vol: number) {
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.3;
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(500, t0);
      osc.frequency.linearRampToValueAtTime(900, t0 + 0.12);
      osc.frequency.linearRampToValueAtTime(500, t0 + 0.25);
      gain.gain.setValueAtTime(vol * 0.2, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.3);
    }
  }

  private playWhistle(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, t0);
    osc.frequency.linearRampToValueAtTime(1800, t0 + 0.15);
    osc.frequency.linearRampToValueAtTime(1200, t0 + 0.3);
    gain.gain.setValueAtTime(vol * 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.37);
  }

  private noiseBurst(ctx: AudioContext, vol: number, delay: number, duration: number) {
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    noise.connect(gain).connect(ctx.destination);
    noise.start(ctx.currentTime + delay);
  }

  private tone(
    ctx: AudioContext,
    freq: number,
    vol: number,
    delay: number,
    duration: number,
    type: OscillatorType
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}

export const soundManager = new SoundManager();

/** Un valor de sonido guardado es "personalizado" si es una URL de archivo subido. */
export function isCustomSoundUrl(value?: string | null): value is string {
  return !!value && (value.startsWith("http://") || value.startsWith("https://"));
}
