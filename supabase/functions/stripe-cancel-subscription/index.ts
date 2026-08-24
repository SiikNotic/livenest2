import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
Cancela la suscripción de Stripe del USUARIO QUE HACE LA LLAMADA — nunca
recibe un subscriptionId del cliente, siempre busca la licencia activa
ligada a su propio user_id (verificado por el JWT), para que nadie pueda
cancelar la suscripción de otra persona pasando un ID ajeno.

La cancelación es "al final del período" (cancel_at_period_end), no
inmediata: el usuario conserva el acceso Premium hasta la fecha que ya
pagó, y simplemente no se le vuelve a cobrar. Esto es lo esperado por la
mayoría de los usuarios y evita reclamos de "pagué y me cortaron al toque".
El webhook (`customer.subscription.updated` / `.deleted`) ya refleja esto
en `user_licenses` cuando Stripe confirma el cambio.
*/

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe no está configurado." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const { data: license, error: licenseError } = await callerClient
      .from("user_licenses")
      .select("id, stripe_subscription_id, status, source")
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (licenseError || !license) {
      return new Response(JSON.stringify({ error: "No tienes una membresía activa." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (license.source !== "stripe" || !license.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: "Tu membresía no fue pagada por suscripción de Stripe, así que no se puede cancelar aquí (probablemente sea una clave de licencia)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const Stripe = (await import("npm:stripe@17.3.1")).default;
    const stripe = new Stripe(stripeSecretKey);

    const updated = await stripe.subscriptions.update(license.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return new Response(
      JSON.stringify({
        cancelled: true,
        access_until: new Date((updated as any).current_period_end * 1000).toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
