import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// La duración de la licencia se deriva ÚNICA Y EXCLUSIVAMENTE del priceId
// real conocido acá abajo — NUNCA del "duration" que mande el cliente.
// Antes se aceptaba cualquier combinación priceId+duration del body: el
// mismo precio real de $7.99/mes (público, va compilado en el bundle del
// frontend) podía mandarse junto con duration:"365" o duration:"lifetime",
// y el webhook (que solo lee metadata.duration_label, sin verificar contra
// lo que Stripe realmente cobró) le otorgaba esa duración igual — pagar un
// mes y quedar con la licencia marcada como vitalicia. Con este mapa fijo,
// un priceId que no está acá se rechaza directo, y el mode/duration real
// salen de esta tabla, no de lo que diga el body de la petición.
const PRICE_CONFIG: Record<string, { label: string; days: number | null; mode: "subscription" | "payment" }> = {
  "price_1U5rhIFARVVAQecmdoBfi5PQ": { label: "30", days: 30, mode: "subscription" },
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

    const { priceId, returnBase } = await req.json();

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: "Falta el parámetro: priceId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = PRICE_CONFIG[priceId];
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Ese priceId no corresponde a ningún plan de LiveNest." }),
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
      mode: config.mode,
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
