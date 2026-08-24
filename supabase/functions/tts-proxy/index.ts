import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Google Translate TTS — free, no API key, plain HTTPS (no WebSocket).
//
// Reemplaza a Edge TTS (Microsoft), que dejó de funcionar: usaba un
// protocolo no oficial (WebSocket + un "TrustedClientToken" fijo y una
// firma Sec-MS-GEC calculada a mano imitando el navegador Edge real) que
// Microsoft puede invalidar sin aviso — y lo hizo. Este endpoint de Google
// también es no oficial, pero es un simple GET sin token ni firma que
// vencer, así que es mucho menos frágil.
//
// Limitación real: una sola voz por idioma (sin elegir género/nombre como
// con Edge), sin control de tono, y Google trunca el texto a ~200
// caracteres por petición — por eso se divide en trozos y se pegan los
// audios resultantes.
const GOOGLE_TTS_MAX_CHARS = 200;

function splitForGoogleTTS(text: string): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 0) {
    if (rest.length <= GOOGLE_TTS_MAX_CHARS) {
      chunks.push(rest);
      break;
    }
    // Cortar en el último punto/coma/espacio dentro del límite, para no
    // partir una palabra a la mitad.
    let cut = rest.slice(0, GOOGLE_TTS_MAX_CHARS);
    const lastBreak = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    if (lastBreak > 20) cut = rest.slice(0, lastBreak + 1);
    chunks.push(cut.trim());
    rest = rest.slice(cut.length).trim();
  }
  return chunks;
}

async function googleTranslateTTS(text: string, lang: string): Promise<ArrayBuffer> {
  const chunks = splitForGoogleTTS(text).filter(Boolean);
  if (chunks.length === 0) throw new Error("Google TTS: texto vacío tras dividirlo.");

  const buffers: Uint8Array[] = [];
  for (const chunk of chunks) {
    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("tl", lang || "es");
    url.searchParams.set("q", chunk);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!resp.ok) {
      throw new Error(`Google TTS respondió HTTP ${resp.status}`);
    }
    buffers.push(new Uint8Array(await resp.arrayBuffer()));
  }

  // Los trozos son streams MP3 crudos (sin cabecera ID3), así que pegarlos
  // uno tras otro basta para que se reproduzcan seguidos como un solo audio.
  const totalLen = buffers.reduce((s, b) => s + b.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of buffers) { merged.set(b, offset); offset += b.length; }
  return merged.buffer;
}

// ElevenLabs — list all voices available on the account (premade + cloned +
// voices added from the Voice Library), across every language. ElevenLabs
// voices are not locked to one language: with the multilingual model any
// voice can speak Spanish, English, etc.
async function elevenlabsListVoices(): Promise<unknown> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    throw new Error("ElevenLabs API key no configurada");
  }

  const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: { "xi-api-key": apiKey },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ElevenLabs API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const voices = Array.isArray(data?.voices) ? data.voices : [];

  return voices.map((v: any) => ({
    id: v.voice_id,
    name: v.name,
    gender: v.labels?.gender ?? null,
    accent: v.labels?.accent ?? null,
    language: v.labels?.language ?? null,
    description: v.labels?.description ?? null,
    category: v.category ?? null,
    previewUrl: v.preview_url ?? null,
  }));
}

// ElevenLabs — account usage/quota (Owner-only "usage card" on the admin
// dashboard). Never expose ELEVENLABS_API_KEY to the client: this function
// reads it from the Edge Function's own environment and only returns the
// derived numbers the UI needs.
async function elevenlabsUsage(): Promise<{
  total_credits: number;
  used_credits: number;
  percent_used: number;
  resets_at: string | null;
  tier: string | null;
}> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    throw new Error("ElevenLabs API key no configurada");
  }

  const resp = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    method: "GET",
    headers: { "xi-api-key": apiKey },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ElevenLabs API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const total = Number(data?.character_limit ?? 0);
  const used = Number(data?.character_count ?? 0);

  return {
    total_credits: total,
    used_credits: used,
    percent_used: total > 0 ? Math.min(100, Math.round((used / total) * 1000) / 10) : 0,
    resets_at: data?.next_character_count_reset_unix
      ? new Date(data.next_character_count_reset_unix * 1000).toISOString()
      : null,
    tier: data?.tier ?? null,
  };
}

// ElevenLabs TTS — requires ELEVENLABS_API_KEY secret
async function elevenlabsTTS(
  text: string,
  voiceId: string,
  rate: number,
  pitch: number,
  modelId: string,
  stability: number,
  similarityBoost: number,
): Promise<ArrayBuffer> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    throw new Error("ElevenLabs API key no configurada");
  }

  // speed: 0.25–4.0, default 1.0 — maps from rate
  const speed = Math.max(0.25, Math.min(4.0, rate));

  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
    voice_settings: {
      stability,
      similarity_boost: similarityBoost,
      style: 0,
      use_speaker_boost: true,
      speed,
    },
  };

  // Note: ElevenLabs' voice_settings does not accept a "pitch" field — the
  // API rejects unknown fields, which was silently causing failures. Pitch
  // is not adjustable via this endpoint, so `pitch` is intentionally unused
  // here (rate/speed still works via `speed` above).
  void pitch;

  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(body),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ElevenLabs API error ${resp.status}: ${errText}`);
  }

  return await resp.arrayBuffer();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const {
      action,
      provider,
      text,
      voiceId,
      rate,
      pitch,
      modelId,
      stability,
      similarityBoost,
    } = await req.json();

    // Google TTS and ElevenLabs cost compute/quota per request and are
    // member-only features. Verify the caller (via their own session JWT,
    // sent in Authorization) actually has an active license before doing
    // any work — this can't be bypassed by calling the function directly,
    // since it no longer trusts a bare "provider" field from the client.
    if (provider === "google" || provider === "elevenlabs") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: userData, error: userError } = await callerClient.auth.getUser();
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Debes iniciar sesión para usar esta voz." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: hasLicense, error: licenseError } = await callerClient.rpc("has_active_license", {
        p_user_id: userData.user.id,
      });
      if (licenseError || !hasLicense) {
        return new Response(
          JSON.stringify({ error: "Esta voz es solo para miembros. Hazte miembro para desbloquearla." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ElevenLabs account usage — Owner-only. Checked here, server-side,
    // against the caller's own JWT-derived session; never trust a role
    // claimed by the client.
    if (action === "usage" && provider === "elevenlabs") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: userData, error: userError } = await callerClient.auth.getUser();
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Debes iniciar sesión." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: callerProfile } = await callerClient
        .from("profiles")
        .select("rank")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (callerProfile?.rank !== "owner") {
        return new Response(JSON.stringify({ error: "Solo el Owner puede ver el uso de ElevenLabs." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const usage = await elevenlabsUsage();
      return new Response(JSON.stringify(usage), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List all ElevenLabs voices available on the account (no text needed).
    if (action === "list-voices" && provider === "elevenlabs") {
      const voices = await elevenlabsListVoices();
      return new Response(JSON.stringify({ voices }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!text || !voiceId) {
      return new Response(JSON.stringify({ error: "Faltan parámetros: text, voiceId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let audio: ArrayBuffer;

    if (provider === "google") {
      // Aquí voiceId es un código de idioma ("es", "en", ...), no el nombre
      // de una voz — Google Translate TTS no deja elegir voz, solo idioma.
      audio = await googleTranslateTTS(text, voiceId);
    } else if (provider === "elevenlabs") {
      audio = await elevenlabsTTS(
        text,
        voiceId,
        rate ?? 1,
        pitch ?? 1,
        modelId ?? "eleven_multilingual_v2",
        stability ?? 0.5,
        similarityBoost ?? 0.75,
      );
    } else {
      return new Response(JSON.stringify({ error: "Proveedor no soportado. Usa 'google' o 'elevenlabs'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(audio, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
