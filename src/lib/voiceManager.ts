import { supabase } from "./supabase";

export type VoiceProvider = "browser" | "edge" | "elevenlabs";

export type SpeakOptions = {
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  provider?: VoiceProvider;
};

export type VoiceInfo = {
  id: string;
  name: string;
  lang: string;
  gender?: "male" | "female" | "neutral";
  source: "browser" | "edge" | "elevenlabs";
};

// Edge TTS (Microsoft) voice catalog — free, no API key, natural neural voices.
// Routed through the tts-proxy Supabase Edge Function to avoid CORS issues.
// Full voice list: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
const EDGE_VOICE_CATALOG: VoiceInfo[] = [
  // Spanish (Spain)
  { id: "es-ES-ElviraNeural", name: "Elvira (España)", lang: "es-ES", gender: "female", source: "edge" },
  { id: "es-ES-AlvaroNeural", name: "Álvaro (España)", lang: "es-ES", gender: "male", source: "edge" },
  { id: "es-ES-ManuelEsCUNeural", name: "Manuel (España CU)", lang: "es-ES", gender: "male", source: "edge" },
  // Spanish (Latin America)
  { id: "es-US-PalomaNeural", name: "Paloma (US Latin)", lang: "es-US", gender: "female", source: "edge" },
  { id: "es-US-AlonsoNeural", name: "Alonso (US Latin)", lang: "es-US", gender: "male", source: "edge" },
  { id: "es-MX-DaliaNeural", name: "Dalia (México)", lang: "es-MX", gender: "female", source: "edge" },
  { id: "es-MX-JorgeNeural", name: "Jorge (México)", lang: "es-MX", gender: "male", source: "edge" },
  { id: "es-AR-ElenaNeural", name: "Elena (Argentina)", lang: "es-AR", gender: "female", source: "edge" },
  { id: "es-AR-TomasNeural", name: "Tomás (Argentina)", lang: "es-AR", gender: "male", source: "edge" },
  { id: "es-CO-SalomeNeural", name: "Salomé (Colombia)", lang: "es-CO", gender: "female", source: "edge" },
  { id: "es-CO-GonzaloNeural", name: "Gonzalo (Colombia)", lang: "es-CO", gender: "male", source: "edge" },
  { id: "es-CL-ConstanzaNeural", name: "Constanza (Chile)", lang: "es-CL", gender: "female", source: "edge" },
  { id: "es-CL-EmilioNeural", name: "Emilio (Chile)", lang: "es-CL", gender: "male", source: "edge" },
  { id: "es-PE-CamilaNeural", name: "Camila (Perú)", lang: "es-PE", gender: "female", source: "edge" },
  { id: "es-PE-AlexNeural", name: "Alex (Perú)", lang: "es-PE", gender: "male", source: "edge" },
  { id: "es-VE-PaolaNeural", name: "Paola (Venezuela)", lang: "es-VE", gender: "female", source: "edge" },
  { id: "es-VE-SebastianNeural", name: "Sebastián (Venezuela)", lang: "es-VE", gender: "male", source: "edge" },
  // English
  { id: "en-US-AriaNeural", name: "Aria (US)", lang: "en-US", gender: "female", source: "edge" },
  { id: "en-US-JennyNeural", name: "Jenny (US)", lang: "en-US", gender: "female", source: "edge" },
  { id: "en-US-MichelleNeural", name: "Michelle (US)", lang: "en-US", gender: "female", source: "edge" },
  { id: "en-US-ChristopherNeural", name: "Christopher (US)", lang: "en-US", gender: "male", source: "edge" },
  { id: "en-US-EricNeural", name: "Eric (US)", lang: "en-US", gender: "male", source: "edge" },
  { id: "en-US-GuyNeural", name: "Guy (US)", lang: "en-US", gender: "male", source: "edge" },
  { id: "en-US-RogerNeural", name: "Roger (US)", lang: "en-US", gender: "male", source: "edge" },
  { id: "en-GB-SoniaNeural", name: "Sonia (UK)", lang: "en-GB", gender: "female", source: "edge" },
  { id: "en-GB-LibbyNeural", name: "Libby (UK)", lang: "en-GB", gender: "female", source: "edge" },
  { id: "en-GB-RyanNeural", name: "Ryan (UK)", lang: "en-GB", gender: "male", source: "edge" },
  { id: "en-GB-ThomasNeural", name: "Thomas (UK)", lang: "en-GB", gender: "male", source: "edge" },
  { id: "en-AU-NatashaNeural", name: "Natasha (AU)", lang: "en-AU", gender: "female", source: "edge" },
  { id: "en-AU-WilliamNeural", name: "William (AU)", lang: "en-AU", gender: "male", source: "edge" },
  // Other popular
  { id: "fr-FR-DeniseNeural", name: "Denise (FR)", lang: "fr-FR", gender: "female", source: "edge" },
  { id: "fr-FR-HenriNeural", name: "Henri (FR)", lang: "fr-FR", gender: "male", source: "edge" },
  { id: "de-DE-KatjaNeural", name: "Katja (DE)", lang: "de-DE", gender: "female", source: "edge" },
  { id: "de-DE-ConradNeural", name: "Conrad (DE)", lang: "de-DE", gender: "male", source: "edge" },
  { id: "it-IT-ElsaNeural", name: "Elsa (IT)", lang: "it-IT", gender: "female", source: "edge" },
  { id: "it-IT-DiegoNeural", name: "Diego (IT)", lang: "it-IT", gender: "male", source: "edge" },
  { id: "pt-BR-FranciscaNeural", name: "Francisca (BR)", lang: "pt-BR", gender: "female", source: "edge" },
  { id: "pt-BR-AntonioNeural", name: "Antonio (BR)", lang: "pt-BR", gender: "male", source: "edge" },
  { id: "ja-JP-NanamiNeural", name: "Nanami (JP)", lang: "ja-JP", gender: "female", source: "edge" },
  { id: "ja-JP-KeitaNeural", name: "Keita (JP)", lang: "ja-JP", gender: "male", source: "edge" },
  { id: "ko-KR-SunHiNeural", name: "Sun-Hi (KR)", lang: "ko-KR", gender: "female", source: "edge" },
  { id: "ko-KR-InJoonNeural", name: "InJoon (KR)", lang: "ko-KR", gender: "male", source: "edge" },
];

// Small fallback shown only until the real account voice list loads (or if
// it fails to load). The real, always-up-to-date list is fetched live from
// the user's ElevenLabs account via VoiceManager.refreshElevenLabsVoices().
const ELEVENLABS_VOICE_CATALOG: VoiceInfo[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", lang: "multi", gender: "female", source: "elevenlabs" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", lang: "multi", gender: "male", source: "elevenlabs" },
];

function mapElevenLabsGender(label: string | null | undefined, name: string): "male" | "female" | "neutral" {
  const l = (label ?? "").toLowerCase();
  if (l === "male") return "male";
  if (l === "female") return "female";
  return inferGender(name);
}

// ElevenLabs voices work with any language when used with a multilingual
// model (eleven_multilingual_v2), so we tag them "multi" unless the account
// explicitly labeled a specific language — that lets them show up under both
// the Spanish and English filters in the UI.
function mapElevenLabsLang(language: string | null | undefined): string {
  if (!language) return "multi";
  const l = language.toLowerCase();
  if (l.startsWith("es")) return "es";
  if (l.startsWith("en")) return "en";
  return "multi";
}

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}\u{1F900}-\u{1F9FF}]/gu;

export function cleanMessageForSpeech(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}

export function cleanNameForSpeech(name: string): string {
  return name
    .replace(EMOJI_RE, "")
    .replace(/[_\-\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VOICE_GENDER_CATALOG: Record<string, "male" | "female" | "neutral"> = {
  "Google español": "female",
  "Mónica": "female", "Monica": "female", "Diego": "male", "Jorge": "male",
  "Carlos": "male", "Helena": "female", "Esperanza": "female", "Marisol": "female",
  "Paulina": "female", "Juan": "male", "Mateo": "male", "Sofia": "female",
  "Sofía": "female", "Valentina": "female", "Renata": "female", "Mariana": "female",
  "Luciana": "female", "Pedro": "male", "Sebastian": "male", "Sebastián": "male",
  "Andrés": "male", "Andres": "male", "Rodrigo": "male",
  "Google US English": "female", "Samantha": "female", "Victoria": "female",
  "Karen": "female", "Moira": "female", "Tessa": "female", "Fiona": "female",
  "Veena": "female", "Alex": "male", "Daniel": "male", "Tom": "male", "David": "male",
  "Mark": "male", "Oliver": "male", "Arthur": "male", "Rishi": "male",
  "Google UK English Female": "female", "Google UK English Male": "male",
  "Kate": "female", "Serena": "female", "Stephanie": "female", "Zira": "female",
  "Hazel": "female", "Linda": "female", "Heather": "female", "George": "male",
  "James": "male", "Ryan": "male", "Fred": "male",
  "Google português do Brasil": "female", "Felipe": "male",
  "Google français": "female", "Amelie": "female", "Thomas": "male", "Audrey": "female",
  "Google Deutsch": "female", "Anna": "female", "Markus": "male", "Yannick": "male",
  "Google italiano": "female", "Alice": "female", "Luca": "male",
};

const FEMALE_KEYWORDS = ["female", "mujer", "femenino", "woman", "girl", "f"];
const MALE_KEYWORDS = ["male", "hombre", "masculino", "man", "boy", "m"];

function inferGender(name: string): "male" | "female" | "neutral" {
  const key = name.trim();
  if (VOICE_GENDER_CATALOG[key]) return VOICE_GENDER_CATALOG[key];
  const lower = key.toLowerCase();
  for (const kw of FEMALE_KEYWORDS) if (lower.includes(kw)) return "female";
  for (const kw of MALE_KEYWORDS) if (lower.includes(kw)) return "male";
  return "neutral";
}

class VoiceManager {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private listeners = new Set<() => void>();
  private currentAudio: HTMLAudioElement | null = null;

  /**
   * Edge TTS and ElevenLabs are member-only and gated server-side by the
   * caller's identity — so we must send the user's real session token, not
   * just the public anon key, or the server can't tell who's asking.
   */
  private async authBearer(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  }
  private elevenlabsVoices: VoiceInfo[] = ELEVENLABS_VOICE_CATALOG;
  private elevenlabsLoading = false;
  private elevenlabsError: string | null = null;
  private elevenlabsLoaded = false;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      this.synth.onvoiceschanged = this.loadVoices;
      setTimeout(this.loadVoices, 500);
      setTimeout(this.loadVoices, 1500);
    }
  }

  private loadVoices = () => {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    this.listeners.forEach((l) => l());
  };

  get available(): boolean {
    return this.synth !== null;
  }

  getBrowserVoices(): VoiceInfo[] {
    return this.voices.map((v) => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang,
      gender: inferGender(v.name),
      source: "browser" as const,
    }));
  }

  getEdgeVoices(): VoiceInfo[] {
    return EDGE_VOICE_CATALOG;
  }

  getElevenLabsVoices(): VoiceInfo[] {
    return this.elevenlabsVoices;
  }

  get elevenlabsVoicesLoading(): boolean {
    return this.elevenlabsLoading;
  }

  get elevenlabsVoicesError(): string | null {
    return this.elevenlabsError;
  }

  /**
   * Fetches the real, current list of voices from the user's ElevenLabs
   * account (premade, cloned, and voices added from the Voice Library),
   * replacing the small hardcoded fallback list. Safe to call repeatedly —
   * only re-fetches if not already loaded/loading, unless `force` is set.
   */
  async refreshElevenLabsVoices(force = false): Promise<void> {
    if (this.elevenlabsLoading) return;
    if (this.elevenlabsLoaded && !force) return;

    this.elevenlabsLoading = true;
    this.elevenlabsError = null;
    this.listeners.forEach((l) => l());

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const proxyUrl = `${supabaseUrl}/functions/v1/tts-proxy`;
      const bearer = await this.authBearer();

      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({ action: "list-voices", provider: "elevenlabs" }),
      });

      if (res.status === 403) {
        throw new Error("ElevenLabs es solo para miembros. Hazte miembro para desbloquearlo.");
      }

      if (!res.ok) {
        let errBody: string;
        try {
          const errData = await res.json();
          errBody = errData?.error ?? JSON.stringify(errData);
        } catch {
          errBody = await res.text().catch(() => "(respuesta vacía)");
        }
        throw new Error(`HTTP ${res.status} — ${errBody}`);
      }

      const data = await res.json();
      const rawVoices: any[] = Array.isArray(data?.voices) ? data.voices : [];

      if (rawVoices.length > 0) {
        this.elevenlabsVoices = rawVoices.map((v) => ({
          id: v.id,
          name: v.name,
          lang: mapElevenLabsLang(v.language),
          gender: mapElevenLabsGender(v.gender, v.name),
          source: "elevenlabs" as const,
        }));
      }
      this.elevenlabsLoaded = true;
    } catch (err) {
      this.elevenlabsError = err instanceof Error ? err.message : "No se pudieron cargar las voces de ElevenLabs";
      // Keep whatever list we already had (fallback or previous successful fetch)
    } finally {
      this.elevenlabsLoading = false;
      this.listeners.forEach((l) => l());
    }
  }

  getVoicesForProvider(provider: VoiceProvider): VoiceInfo[] {
    switch (provider) {
      case "browser": return this.getBrowserVoices();
      case "edge": return this.getEdgeVoices();
      case "elevenlabs": return this.getElevenLabsVoices();
    }
  }

  getRandomVoiceId(provider: VoiceProvider = "browser", langPrefix?: string): string | null {
    const pool = this.getVoicesForProvider(provider).filter((v) => {
      if (!langPrefix) return true;
      return v.lang.toLowerCase().startsWith(langPrefix.toLowerCase());
    });
    const finalPool = pool.length > 0 ? pool : this.getVoicesForProvider(provider);
    if (finalPool.length === 0) return null;
    return finalPool[Math.floor(Math.random() * finalPool.length)].id;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    const clean = cleanMessageForSpeech(text);
    if (!clean) return;

    this.stop();

    const provider = opts.provider ?? "browser";

    if (provider === "browser") {
      return this.speakBrowser(clean, opts);
    } else if (provider === "edge") {
      return this.speakEdge(clean, opts);
    } else {
      return this.speakElevenLabs(clean, opts);
    }
  }

  private speakBrowser(text: string, opts: SpeakOptions): Promise<void> {
    if (!this.synth) return Promise.resolve();

    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve();
      };

      const u = new SpeechSynthesisUtterance(text);
      let selectedVoice: SpeechSynthesisVoice | undefined;
      if (opts.voiceId) {
        selectedVoice = this.voices.find((v) => v.voiceURI === opts.voiceId);
        if (selectedVoice) u.voice = selectedVoice;
      }
      if (selectedVoice?.lang) u.lang = selectedVoice.lang;
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      u.onend = finish;
      u.onerror = finish;

      const estimatedMs = Math.max(3000, text.length * 90);
      const timer = setTimeout(() => {
        if (!resolved) {
          try { this.synth!.cancel(); } catch { /* ignore */ }
          finish();
        }
      }, estimatedMs + 2000);

      this.synth!.speak(u);
    });
  }

  /**
   * Edge TTS — Microsoft's free neural TTS, no API key required.
   * Routed through the tts-proxy Supabase Edge Function (Deno) to avoid
   * browser CORS restrictions and WebSocket limitations.
   */
  private async speakEdge(text: string, opts: SpeakOptions): Promise<void> {
    const voiceId = opts.voiceId ?? "es-ES-ElviraNeural";
    const rate = opts.rate ?? 1;
    const pitch = opts.pitch ?? 1;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const proxyUrl = `${supabaseUrl}/functions/v1/tts-proxy`;
    const bearer = await this.authBearer();

    let res: Response;
    try {
      res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({
          provider: "edge",
          text: text.slice(0, 1000),
          voiceId,
          rate,
          pitch,
        }),
      });
    } catch (err) {
      throw new Error(
        `Edge TTS: no se pudo conectar con el servidor. ${err instanceof Error ? err.message : ""}`
      );
    }

    if (res.status === 403) {
      throw new Error("Edge TTS es solo para miembros. Hazte miembro para desbloquearlo.");
    }

    if (!res.ok) {
      let errBody: string;
      try {
        const errData = await res.json();
        errBody = errData?.error ?? JSON.stringify(errData);
      } catch {
        try {
          errBody = await res.text();
        } catch {
          errBody = "(respuesta vacía)";
        }
      }
      const statusText = res.statusText ? ` ${res.statusText}` : "";
      throw new Error(
        `Edge TTS: HTTP ${res.status}${statusText} — ${errBody}`
      );
    }

    const audioBlob = await res.blob();
    if (audioBlob.size === 0) {
      throw new Error("Edge TTS: el servidor devolvió audio vacío");
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.volume = opts.volume ?? 1;
    audio.playbackRate = 1;
    this.currentAudio = audio;

    return new Promise((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(audioUrl); this.currentAudio = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); this.currentAudio = null; resolve(); };
      audio.play().catch(() => { URL.revokeObjectURL(audioUrl); this.currentAudio = null; resolve(); });
    });
  }

  private async speakElevenLabs(text: string, opts: SpeakOptions): Promise<void> {
    const voiceId = opts.voiceId || "21m00Tcm4TlvDq8ikWAM";
    const rate = opts.rate ?? 1;
    const pitch = opts.pitch ?? 1;
    const volume = opts.volume ?? 1;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const proxyUrl = `${supabaseUrl}/functions/v1/tts-proxy`;
    const bearer = await this.authBearer();

    let res: Response;
    try {
      res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({
          provider: "elevenlabs",
          text: text.slice(0, 5000),
          voiceId,
          rate,
          pitch,
          modelId: "eleven_multilingual_v2",
          stability: 0.5,
          similarityBoost: 0.75,
        }),
      });
    } catch (err) {
      throw new Error(
        `ElevenLabs: no se pudo conectar con el servidor. ${err instanceof Error ? err.message : ""}`
      );
    }

    if (res.status === 403) {
      throw new Error("ElevenLabs es solo para miembros. Hazte miembro para desbloquearlo.");
    }

    if (!res.ok) {
      let errBody: string;
      try {
        const errData = await res.json();
        errBody = errData?.error ?? JSON.stringify(errData);
      } catch {
        try {
          errBody = await res.text();
        } catch {
          errBody = "(respuesta vacía)";
        }
      }
      throw new Error(`ElevenLabs: HTTP ${res.status} — ${errBody}`);
    }

    const audioBlob = await res.blob();
    if (audioBlob.size === 0) {
      throw new Error("ElevenLabs: el servidor devolvió audio vacío");
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.volume = Math.max(0, Math.min(1, volume));
    this.currentAudio = audio;

    return new Promise<void>((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(audioUrl); this.currentAudio = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); this.currentAudio = null; resolve(); };
      audio.play().catch(() => { URL.revokeObjectURL(audioUrl); this.currentAudio = null; resolve(); });
    });
  }

  stop() {
    if (this.synth) this.synth.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  get speaking(): boolean {
    return (this.synth?.speaking ?? false) || (this.currentAudio !== null);
  }
}

export const voiceManager = new VoiceManager();
