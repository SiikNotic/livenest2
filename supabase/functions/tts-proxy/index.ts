import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { WebSocket as WS } from "npm:ws@8.18.2";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c] || c));
}

// Microsoft Edge TTS — free, no API key required.
const EDGE_TTS_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;

async function generateSecMsGec(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  let ticks = nowSec + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks = ticks * 1e7;
  const strToHash = `${Math.round(ticks)}${EDGE_TTS_TOKEN}`;
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(strToHash));
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function generateMuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function mkssml(voice: string, text: string, rate: string, pitch: string): string {
  return (
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>"
    + `<voice name='${voice}'>`
    + `<prosody pitch='${pitch}' rate='${rate}' volume='+0%'>`
    + escapeXml(text)
    + "</prosody></voice></speak>"
  );
}

function ssmlHeadersPlusData(requestId: string, timestamp: string, ssml: string): string {
  return (
    `X-RequestId:${requestId}\r\n`
    + "Content-Type:application/ssml+xml\r\n"
    + `X-Timestamp:${timestamp}Z\r\n`
    + "Path:ssml\r\n\r\n"
    + ssml
  );
}

async function edgeTTS(text: string, voiceId: string, rate: number, pitch: number): Promise<ArrayBuffer> {
  const rateStr = `${rate > 1 ? "+" : ""}${Math.round((rate - 1) * 100)}%`;
  const pitchStr = `${pitch > 1 ? "+" : ""}${Math.round((pitch - 1) * 50)}Hz`;
  const ssml = mkssml(voiceId, text, rateStr, pitchStr);

  const secMsGec = await generateSecMsGec();
  const muid = generateMuid();
  const connectionId = crypto.randomUUID().replace(/-/g, "");
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TTS_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`;

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const audioChunks: Uint8Array[] = [];
    let resolved = false;

    const ws = new WS(wsUrl, {
      headers: {
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": `muid=${muid};`,
      },
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error("Edge TTS: timeout (20s)"));
      }
    }, 20000);

    ws.on("open", () => {
      const ts = new Date().toISOString();
      const configMsg =
        `X-Timestamp:${ts}\r\n`
        + "Content-Type:application/json; charset=utf-8\r\n"
        + "Path:speech.config\r\n\r\n"
        + '{"context":{"synthesis":{"audio":{"metadataOptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},'
        + '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"'
        + "}}}}\r\n";
      ws.send(configMsg);

      const ssmlMsg = ssmlHeadersPlusData(crypto.randomUUID(), ts, ssml);
      ws.send(ssmlMsg);
    });

    ws.on("message", (data: unknown, isBinary: boolean) => {
      if (resolved) return;

      if (!isBinary) {
        let str: string;
        if (typeof data === "string") {
          str = data;
        } else if (data instanceof Uint8Array) {
          str = new TextDecoder().decode(data);
        } else {
          str = String(data);
        }
        if (str.includes("Path:turn.end")) {
          resolved = true;
          clearTimeout(timeout);
          ws.close();
          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let off = 0;
          for (const c of audioChunks) { merged.set(c, off); off += c.length; }
          resolve(merged.buffer);
        }
        return;
      }

      const buf = data as Uint8Array;
      if (buf.length < 2) return;

      const headerLen = (buf[0] << 8) | buf[1];
      if (headerLen > buf.length) return;

      const headerBytes = buf.subarray(2, headerLen);
      const headerStr = new TextDecoder().decode(headerBytes);
      if (!headerStr.includes("Path:audio")) return;

      const audioData = buf.subarray(headerLen);
      if (audioData.length > 0) {
        audioChunks.push(new Uint8Array(audioData));
      }
    });

    ws.on("error", (err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Edge TTS: ${err.message}`));
      }
    });

    ws.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let off = 0;
          for (const c of audioChunks) { merged.set(c, off); off += c.length; }
          resolve(merged.buffer);
        } else {
          reject(new Error("Edge TTS: conexión cerrada sin audio"));
        }
      }
    });
  });
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

    // Edge TTS and ElevenLabs cost real money/quota per request and are
    // member-only features. Verify the caller (via their own session JWT,
    // sent in Authorization) actually has an active license before doing
    // any work — this can't be bypassed by calling the function directly,
    // since it no longer trusts a bare "provider" field from the client.
    if (provider === "edge" || provider === "elevenlabs") {
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

    if (provider === "edge") {
      audio = await edgeTTS(text, voiceId, rate ?? 1, pitch ?? 1);
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
      return new Response(JSON.stringify({ error: "Proveedor no soportado. Usa 'edge' o 'elevenlabs'" }), {
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
