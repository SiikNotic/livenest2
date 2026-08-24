import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
# Foto de perfil de un canal de TikTok

Endpoint: GET/POST /tiktok-profile-photo?username=<user>

TikTok no expone una API pública para esto y el navegador no puede leer la
página del canal (CORS), así que esta función la pide desde el servidor y saca
la URL de la foto del `<meta property="og:image">`.

Responde siempre 200 con `{ avatar_url }`; `avatar_url: null` significa que ese
canal no tiene foto o no se pudo resolver — el cliente muestra las iniciales.
*/

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

    let username = "";
    if (req.method === "GET") {
      username = new URL(req.url).searchParams.get("username") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      username = typeof body?.username === "string" ? body.username : "";
    }
    username = username.trim().replace(/^@/, "");

    if (!username) {
      return new Response(JSON.stringify({ error: "Falta el parámetro 'username'." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "No se pudo encontrar ese canal de TikTok.", avatar_url: null }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await resp.text();
    const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const avatarUrl = match ? match[1].replace(/&amp;/g, "&") : null;

    return new Response(JSON.stringify({ avatar_url: avatarUrl, username }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, avatar_url: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
