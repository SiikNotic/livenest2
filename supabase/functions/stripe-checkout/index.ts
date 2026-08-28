import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRICE_MAP: Record<string, { label: string; days: number | null }> = {
  "7": { label: "7", days: 7 },
  "30": { label: "30", days: 30 },
  "365": { label: "365", days: 365 },
  lifetime: { label: "lifetime", days: null },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe no está configurado. El administrador debe configurar STRIPE_SECRET_KEY en los secrets de Supabase." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // El userId SIEMPRE se toma del JWT del que llama, nunca del body — antes
    // se confiaba en el userId que mandaba el cliente, así que cualquiera
    // (autenticado o no) podía crear una sesión de pago con metadata.user_id
    // apuntando a la cuenta de otra persona.
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
    const userId = userData.user.id;

    const { priceId, duration, returnBase } = await req.json();

    if (!priceId || !duration) {
      return new Response(
        JSON.stringify({ error: "Faltan parámetros: priceId, duration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = PRICE_MAP[duration];
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Duración no válida. Usa: 7, 30, 365, o lifetime" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const Stripe = (await import("npm:stripe@17.3.1")).default;
    const stripe = new Stripe(stripeSecretKey);

    // El header "origin" (o el fallback) solo da el dominio, sin ningún
    // subpath — funciona para un dominio propio o Bolt, pero GitHub Pages
    // sirve la app bajo /<repo>/ (ej. https://siiknotic.github.io/livenest2/).
    // El cliente manda ese subpath ya armado en returnBase; si no viene (una
    // llamada vieja, o directa a la API), se cae al comportamiento anterior.
    const origin =
      typeof returnBase === "string" && returnBase.startsWith("https://")
        ? returnBase.replace(/\/+$/, "")
        : req.headers.get("origin") || "https://wlkzpvfkczkrvuueblfq.supabase.co";

    const session = await stripe.checkout.sessions.create({
      mode: duration === "lifetime" ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: {
        user_id: userId,
        duration_label: config.label,
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
