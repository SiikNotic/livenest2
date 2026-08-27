const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
# YouTube Search Proxy

Endpoint: POST /youtube-search
Body: { "query": "bad bunny tití me preguntó" }

Busca canciones en YouTube desde el servidor para evitar el bloqueo CORS del navegador.
Devuelve { videoId, title, channel } de la primera coincidencia, o { not_found: true }.

Función pública (sin login) a propósito — pedir canciones es parte del chat. Como no
requiere cuenta, cualquiera que conozca esta URL podría machacarla sin límite, gastando
la IP del servidor contra YouTube (riesgo de que YouTube la bloquee) o usándola como
proxy de búsqueda genérico. Límite simple por IP como mitigación mínima.
*/

const requestsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
// Sin esto, cada IP distinta que alguna vez buscó una canción se queda en
// el mapa para siempre (nada la borra cuando deja de pedir) — con
// suficiente tráfico a lo largo de la vida de la función, crece sin techo.
const MAX_TRACKED_IPS = 5000;

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
        JSON.stringify({ error: "Demasiadas búsquedas seguidas. Espera un momento." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Falta el parámetro 'query'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `YouTube devolvió HTTP ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await res.text();

    const videoMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!videoMatch) {
      return new Response(
        JSON.stringify({ not_found: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoId = videoMatch[1];
    const titleMatch = html.match(/"title":{"runs":\[{"text":"([^"]+)"/);
    const channelMatch = html.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : query;
    const channel = channelMatch ? channelMatch[1] : "";

    return new Response(
      JSON.stringify({ videoId, title, channel }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
