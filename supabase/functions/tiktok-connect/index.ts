import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
# TikTok Live Connection Proxy (Euler Stream)

Endpoint: WSS /tiktok-connect?username=<user>

Flujo (proxy, NO redirección):
1. El navegador abre un WebSocket directamente contra ESTA función (no contra Euler Stream).
2. La función lee la API key de Euler Stream desde la tabla `api_secrets` (solo en el servidor,
   con la service role key).
3. La función abre su propia conexión WebSocket "upstream" hacia Euler Stream usando esa clave,
   y hace de relé (proxy) reenviando mensajes en ambas direcciones entre el navegador y Euler
   Stream.
4. La API key de Euler Stream NUNCA se envía al navegador — solo vive en memoria del servidor
   durante la conexión.

Antes, esta función devolvía la URL final del WebSocket de Euler Stream (con la apiKey como
query param) directamente al cliente en un JSON. Aunque el comentario decía que la clave no se
exponía, en la práctica sí viajaba al navegador dentro de esa URL. Este proxy corrige eso.

Esta función es pública (sin verify_jwt) a propósito: conectarse a un live es la función
principal de la app y no requiere cuenta. Pero eso también significa que cualquiera que
conozca esta URL puede abrir WebSockets aquí sin límite, gastando la cuota/plata de la
API key de Euler Stream. Como mitigación mínima (sin exigir login), se limita cuántas
conexiones simultáneas puede tener una misma IP — no es infalible (una IP compartida
cuenta como una sola), pero corta el abuso más obvio de un script que abre cientos de
conexiones.
*/

// Reinicia en cada cold start de la función — suficiente para frenar abuso desde un mismo
// cliente/script, aunque no es un límite global entre todas las instancias.
const activeConnectionsByIp = new Map<string, number>();
const MAX_CONCURRENT_PER_IP = 4;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get("upgrade") ?? "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({ error: "Esta función solo acepta conexiones WebSocket (header 'Upgrade: websocket')." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);
  const username = (url.searchParams.get("username") ?? "").trim().replace(/^@/, "");

  if (!username) {
    return new Response(
      JSON.stringify({ error: "Falta el parámetro 'username'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Configuración del servidor incompleta." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: secretRow, error: secretErr } = await supabase
    .from("api_secrets")
    .select("secret_value")
    .eq("provider", "eulerstream")
    .eq("key_name", "api_key")
    .maybeSingle();

  if (secretErr || !secretRow) {
    return new Response(
      JSON.stringify({ error: "No se encontró la API key de Euler Stream." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const apiKey = secretRow.secret_value;

  const ip = clientIp(req);
  if ((activeConnectionsByIp.get(ip) ?? 0) >= MAX_CONCURRENT_PER_IP) {
    return new Response(
      JSON.stringify({ error: "Demasiadas conexiones simultáneas desde tu red. Cierra alguna e intenta de nuevo." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const upstreamUrl = new URL("wss://ws.eulerstream.com");
  upstreamUrl.searchParams.set("apiKey", apiKey);
  upstreamUrl.searchParams.set("uniqueId", username);
  upstreamUrl.searchParams.set("schemaVersion", "v2");
  upstreamUrl.searchParams.set("features.bundleEvents", "true");
  upstreamUrl.searchParams.set("features.normalizeUniqueId", "true");
  upstreamUrl.searchParams.set("features.closeInactiveWebSocketAfter", "300");

  let clientSocket: WebSocket;
  let response: Response;
  try {
    ({ socket: clientSocket, response } = Deno.upgradeWebSocket(req));
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "No se pudo iniciar el WebSocket: " + (err instanceof Error ? err.message : String(err)) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let upstreamSocket: WebSocket | null = null;
  let clientClosed = false;
  let upstreamClosed = false;
  const queuedFromClient: (string | ArrayBufferLike | Blob | ArrayBufferView)[] = [];

  // Contado desde la apertura real del WebSocket (no antes), y descontado
  // una sola vez al cerrar — el chequeo de arriba solo lee este contador.
  activeConnectionsByIp.set(ip, (activeConnectionsByIp.get(ip) ?? 0) + 1);
  let releasedSlot = false;
  const releaseSlot = () => {
    if (releasedSlot) return;
    releasedSlot = true;
    const current = activeConnectionsByIp.get(ip) ?? 1;
    if (current <= 1) activeConnectionsByIp.delete(ip);
    else activeConnectionsByIp.set(ip, current - 1);
  };

  const closeBoth = (code = 1000, reason = "") => {
    if (!clientClosed) {
      clientClosed = true;
      try { clientSocket.close(code, reason); } catch { /* ignore */ }
    }
    if (!upstreamClosed && upstreamSocket) {
      upstreamClosed = true;
      try { upstreamSocket.close(code, reason); } catch { /* ignore */ }
    }
  };

  clientSocket.onopen = () => {
    try {
      upstreamSocket = new WebSocket(upstreamUrl.toString());
    } catch {
      closeBoth(1011, "No se pudo conectar con Euler Stream");
      return;
    }

    upstreamSocket.onopen = () => {
      for (const msg of queuedFromClient) {
        try { upstreamSocket!.send(msg as string); } catch { /* ignore */ }
      }
      queuedFromClient.length = 0;
    };

    upstreamSocket.onmessage = (ev) => {
      if (!clientClosed) {
        try { clientSocket.send(ev.data); } catch { /* ignore */ }
      }
    };

    upstreamSocket.onerror = () => { /* el onclose maneja la lógica */ };

    upstreamSocket.onclose = (ev) => {
      upstreamClosed = true;
      if (!clientClosed) {
        clientClosed = true;
        try { clientSocket.close(ev.code, ev.reason); } catch { /* ignore */ }
      }
    };
  };

  clientSocket.onmessage = (ev) => {
    if (upstreamSocket && upstreamSocket.readyState === WebSocket.OPEN) {
      try { upstreamSocket.send(ev.data); } catch { /* ignore */ }
    } else {
      queuedFromClient.push(ev.data);
    }
  };

  clientSocket.onerror = () => { /* el onclose maneja la lógica */ };

  clientSocket.onclose = () => {
    clientClosed = true;
    closeBoth();
    releaseSlot();
  };

  return response;
});
