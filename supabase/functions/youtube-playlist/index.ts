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
a addSongByUrl() por cada uno (que ya resuelve título/canal vía oEmbed,
sin necesitar API key tampoco acá). Misma idea que youtube-search: se
scrapea la página pública en vez de usar la API oficial de YouTube
(evita necesitar una API key y su cuota), evitando el bloqueo CORS del
navegador.

Función pública (sin login) a propósito, igual que youtube-search — la
gate real de "esto es para miembros" ya está en la base de datos (el
trigger enforce_song_requests_license bloquea el INSERT en song_requests
si la cuenta no tiene licencia activa), así que no hace falta duplicar
esa validación acá. Rate limit por IP como mitigación mínima contra abuso
del scraping.
*/

const requestsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
// Más bajo que youtube-search (20/min): traer una playlist entera pesa
// bastante más que una búsqueda de una canción.
const RATE_LIMIT_MAX = 6;
const MAX_TRACKED_IPS = 5000;
// Tope duro de canciones por playlist — evita que alguien pegue una
// playlist de 500 videos y sature la cola/la base de una sentada. La cola
// igual tiene su propio límite (max_song_queue) que corta antes si hace
// falta, esto es solo para no scrapear/parsear de más.
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

    const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    const res = await fetch(playlistUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        // Sin esto, a veces YouTube responde con la pantalla de "antes de
        // continuar" (confirmación de cookies/consentimiento) en vez de la
        // página de la playlist — sobre todo pidiendo desde una IP de
        // datacenter. Esa pantalla no tiene ningún video adentro, así que
        // el scrape encontraba 0 resultados y la playlist parecía "privada"
        // sin serlo. Este valor es el truco estándar para saltearla.
        Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+888",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `YouTube devolvió HTTP ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await res.text();

    // Diagnóstico temporal — se saca apenas se confirme la causa real de
    // por qué el scrape no encuentra videos en ciertas playlists públicas.
    // Va a function_logs, no afecta la respuesta al cliente.
    console.log(
      "[youtube-playlist] diag",
      JSON.stringify({
        playlistId,
        status: res.status,
        finalUrl: res.url,
        htmlLen: html.length,
        hasInitialData: html.includes("ytInitialData"),
        markerCount: (html.match(/"playlistVideoRenderer"/g) ?? []).length,
        panelMarkerCount: (html.match(/"playlistPanelVideoRenderer"/g) ?? []).length,
        videoIdCount: (html.match(/"videoId":"/g) ?? []).length,
        hasConsentPage: html.includes("consent.youtube.com") || html.includes("Before you continue"),
        titleSnippet: (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? null,
      })
    );

    // Cada video de la playlist aparece en el JSON incrustado de la página
    // dentro de un bloque "playlistVideoRenderer":{...,"videoId":"XXX",...}.
    // OJO: no asumir que "videoId" es la primera clave pegada justo después
    // de la llave — el orden de las claves en ese JSON no está garantizado
    // (varió para algunas playlists e hizo que el regex viejo, anclado a
    // esa adyacencia exacta, no encontrara nada y la playlist pareciera
    // vacía/privada sin estarlo). En vez de eso: ubicar cada aparición del
    // marcador del renderer y buscar el primer "videoId" dentro de una
    // ventana razonable después de él — sigue sin traer videos
    // recomendados/relacionados (que quedan fuera de esos bloques), pero
    // no depende del orden interno de sus claves.
    const RENDERER_MARKER = '"playlistVideoRenderer":{';
    const RENDERER_WINDOW = 2000;
    const videoIdInWindow = /"videoId":"([a-zA-Z0-9_-]{11})"/;
    const seen = new Set<string>();
    const videoIds: string[] = [];
    let searchFrom = 0;
    while (videoIds.length < MAX_ITEMS) {
      const idx = html.indexOf(RENDERER_MARKER, searchFrom);
      if (idx === -1) break;
      const windowStart = idx + RENDERER_MARKER.length;
      const chunk = html.slice(windowStart, windowStart + RENDERER_WINDOW);
      const m = chunk.match(videoIdInWindow);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        videoIds.push(m[1]);
      }
      searchFrom = windowStart;
    }

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
      JSON.stringify({ error: err?.message ?? "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
