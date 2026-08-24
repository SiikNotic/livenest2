import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
# TikTok Live — chequeo rápido de estado (REST, sin WebSocket)

Antes, la única forma de saber si un canal estaba en vivo era abrir el WebSocket
completo contra Euler Stream y esperar a que cerrara con el código 4404 (NOT_LIVE)
si no lo estaba. Eso es lento y, si el canal está offline, sigue reintentando la
conexión completa una y otra vez.

Este endpoint usa la ruta REST liviana de Euler Stream
`GET /webcast/anchors/{unique_id}/room_id`, que responde en milisegundos con
`is_live` sin necesidad de abrir ningún socket. Lo usamos para:
1. Decidir en el cliente, ANTES de conectar, si vale la pena abrir el WebSocket.
2. Hacer polling ligero mientras el canal está offline, para detectar solo
   cuando vuelve a estar en vivo (en vez de reintentar la conexión completa).
3. Distinguir un canal que EXISTE pero está offline (404 en la respuesta de
   Euler = el @usuario no existe en absoluto en TikTok) de uno que no existe.

La API key de Euler Stream nunca sale del servidor — se lee de `api_secrets`
con la service role key, igual que en `tiktok-connect`.

Pública (sin login) a propósito, igual que `tiktok-connect` — límite simple
por IP como mitigación mínima contra abuso de la cuota de Euler Stream.
*/

const requestsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

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
  return timestamps.length > RATE_LIMIT_MAX;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (isRateLimited(clientIp(req))) {
    return new Response(JSON.stringify({ error: "Demasiadas verificaciones seguidas. Espera un momento." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let username = "";
  try {
    if (req.method === "GET") {
      username = new URL(req.url).searchParams.get("username") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      username = typeof body?.username === "string" ? body.username : "";
    }
  } catch {
    // ignore, handled by the empty-username check below
  }
  username = username.trim().replace(/^@/, "");

  if (!username) {
    return new Response(JSON.stringify({ error: "Falta el parámetro 'username'." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuración del servidor incompleta." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: secretRow, error: secretErr } = await supabase
    .from("api_secrets")
    .select("secret_value")
    .eq("provider", "eulerstream")
    .eq("key_name", "api_key")
    .maybeSingle();

  if (secretErr || !secretRow) {
    return new Response(JSON.stringify({ error: "No se encontró la API key de Euler Stream." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = secretRow.secret_value;

  try {
    const checkUrl = new URL(`https://api.eulerstream.com/webcast/anchors/${encodeURIComponent(username)}/room_id`);
    checkUrl.searchParams.set("apiKey", apiKey);

    // Corto de tiempo: esto debe ser rápido — si tarda demasiado, mejor dejar
    // que el cliente intente el WebSocket directamente en vez de bloquear.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(checkUrl.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      // 404 en el endpoint de "anchors" significa que ese @usuario no existe
      // en TikTok en absoluto — es un caso distinto a "existe pero no está
      // en vivo", y no tiene sentido reintentar ni vigilarlo en segundo plano.
      if (resp.status === 404) {
        return new Response(
          JSON.stringify({ invalid: true, isLive: false, username }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Euler Stream respondió ${resp.status}`, detail: text.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    return new Response(
      JSON.stringify({
        isLive: !!data?.is_live,
        invalid: false,
        roomId: data?.room_id ?? null,
        username,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "No se pudo verificar el estado del canal." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
