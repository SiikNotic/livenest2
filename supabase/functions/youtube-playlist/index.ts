import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
# YouTube Playlist Proxy

Endpoint: POST /youtube-playlist
Body: { "playlistId": "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }

Resuelve una playlist de YouTube a la lista de video IDs que contiene,
para poder agregarlos todos a la cola de una — el cliente después llama
a addSongByUrl() por cada uno (que ya resuelve título/canal vía oEmbed).

Usa la API oficial de YouTube Data v3 (playlistItems.list) en vez de
scrapear la página pública como se hacía antes. El scraping se rompía
cada vez que YouTube cambiaba el formato interno del HTML — pasó dos
veces en la misma semana (una vez porque el orden de las claves del
JSON cambió, otra porque directamente renombraron el bloque que
envolvía cada video) — y cada vez que se rompía, una playlist pública
real terminaba mostrando "¿Es privada?" sin serlo. La API oficial
devuelve datos estructurados y estables: no hay más HTML que adivinar.
Cuesta 1 unidad de cuota por llamada (de 10.000 gratis por día), así
que el límite diario no es un problema real para este uso.

La API key vive en la tabla api_secrets (provider='youtube', igual que
la de Euler Stream/Inworld) — solo la lee el service role acá adentro,
nunca llega al cliente.

Función pública (sin login) a propósito, igual que youtube-search — la
gate real de "esto es para miembros" ya está en la base de datos (el
trigger enforce_song_requests_license bloquea el INSERT en song_requests
si la cuenta no tiene licencia activa), así que no hace falta duplicar
esa validación acá. Rate limit por IP como mitigación mínima contra abuso.
*/

const requestsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const MAX_TRACKED_IPS = 5000;
// Tope de canciones por playlist — la cola tiene su propio límite
// (max_song_queue) que corta antes si hace falta; esto es además para no
// pedir de más. maxResults de la API tiene un tope de 50 por página, así
// que con esto alcanza una sola llamada, sin necesitar paginar.
const MAX_ITEMS = 50;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestsByIp.set(ip, timestamps);
  if (requestsByIp.size > MAX_TRACKED_IPS) {
    const oldest = requestsByIp.keys().next().value;
    if (oldest !== undefined) requestsByIp.delete(oldest);
  }
  return timestamps.length > RATE_LIMIT_MAX;
}

async function youtubeApiKey(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("api_secrets")
    .select("secret_value")
    .eq("provider", "youtube")
    .eq("key_name", "api_key")
    .maybeSingle();

  if (error || !data?.secret_value) {
    throw new Error("No se encontró la API key de YouTube.");
  }
  return data.secret_value as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método no permitido. Usa POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isRateLimited(clientIp(req))) {
      return new Response(
        JSON.stringify({ error: "Demasiadas playlists seguidas. Espera un momento." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const playlistId = String(body?.playlistId ?? "").trim();

    if (!playlistId || !/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
      return new Response(
        JSON.stringify({ error: "Falta o es inválido el parámetro 'playlistId'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = await youtubeApiKey();
    const apiUrl =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=contentDetails&maxResults=${MAX_ITEMS}` +
      `&playlistId=${encodeURIComponent(playlistId)}&key=${apiKey}`;

    const res = await fetch(apiUrl);

    if (!res.ok) {
      // 404 = la playlist no existe o es privada (YouTube no distingue las
      // dos cosas en la respuesta). Cualquier otro código es un error real
      // (API key inválida, cuota agotada, etc.) — no lo disfrazamos de
      // "playlist privada" para no confundir al usuario con el diagnóstico
      // equivocado.
      if (res.status === 404) {
        return new Response(
          JSON.stringify({ not_found: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errBody = await res.text().catch(() => "");
      console.error("[youtube-playlist] YouTube API error", res.status, errBody);
      return new Response(
        JSON.stringify({ error: `YouTube API devolvió HTTP ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const videoIds: string[] = Array.isArray(data?.items)
      ? data.items.map((it: any) => it?.contentDetails?.videoId).filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (videoIds.length === 0) {
      return new Response(
        JSON.stringify({ not_found: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ videoIds }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
