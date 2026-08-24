import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecretKey || !webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Stripe no está configurado. Configura STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET en los secrets de Supabase." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Estos dos los inyecta la plataforma automáticamente en toda Edge
    // Function — si por lo que sea faltan, createClient() explota con un
    // error críptico ("supabaseUrl is required") que antes caía directo
    // al catch general de abajo como un 500 sin pista de la causa real.
    // Se valida explícito para que, si es esto, el mensaje lo diga claro.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("stripe-webhook: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno de la función.");
      return new Response(
        JSON.stringify({ error: "Configuración del servidor incompleta (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Falta la firma de Stripe" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature using Stripe SDK
    let Stripe: typeof import("npm:stripe@17.3.1").default;
    try {
      Stripe = (await import("npm:stripe@17.3.1")).default;
    } catch (err) {
      console.error("stripe-webhook: no se pudo cargar el paquete 'stripe':", err);
      return new Response(
        JSON.stringify({ error: `No se pudo cargar el SDK de Stripe: ${err instanceof Error ? err.message : String(err)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const stripe = new Stripe(stripeSecretKey);

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      // Firma inválida (secreto equivocado, cuerpo modificado, etc.) — no es
      // un error del servidor, es que el evento no se puede confiar, así que
      // se responde 400 (no reintentable como si fuera un fallo nuestro) en
      // vez de 500.
      return new Response(
        JSON.stringify({ error: `Firma inválida: ${err.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const durationLabel = session.metadata?.duration_label ?? "30";
        const daysMap: Record<string, number | null> = { "7": 7, "30": 30, "365": 365, lifetime: null };
        const days = daysMap[durationLabel] ?? 30;
        const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;

        if (userId) {
          // Cancel any existing active license
          const { error: cancelError } = await supabase
            .from("user_licenses")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("status", "active");
          if (cancelError) console.error("stripe-webhook: error cancelando licencia previa:", cancelError);

          // Create new license
          const { error: insertError } = await supabase.from("user_licenses").insert({
            user_id: userId,
            license_key_id: null,
            source: "stripe",
            stripe_subscription_id: session.subscription as string ?? null,
            stripe_customer_id: session.customer as string ?? null,
            expires_at: expiresAt,
            status: "active",
            auto_renew: true,
          });
          // Esto NO lanzaba excepción (supabase-js no tira error de la
          // base como throw), así que si fallaba (constraint, RLS, lo que
          // sea) la función igual respondía 200 "received" a Stripe — el
          // pago quedaba registrado pero el usuario nunca recibía la
          // membresía, en silencio. Ahora al menos queda en los logs.
          if (insertError) console.error("stripe-webhook: error creando licencia:", insertError);
        } else {
          console.error("stripe-webhook: checkout.session.completed sin metadata.user_id — no se puede otorgar membresía.");
        }
        break;
      }

      case "customer.subscription.deleted":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find the license by stripe customer id
        const { data: existing } = await supabase
          .from("user_licenses")
          .select("*")
          .eq("stripe_customer_id", customerId)
          .eq("status", "active")
          .maybeSingle();

        if (existing) {
          if (event.type === "customer.subscription.deleted") {
            const { error } = await supabase
              .from("user_licenses")
              .update({ status: "cancelled", auto_renew: false, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
            if (error) console.error("stripe-webhook: error cancelando suscripción:", error);
          } else {
            // Update auto_renew based on subscription status
            const autoRenew = subscription.status === "active";
            const { error } = await supabase
              .from("user_licenses")
              .update({ auto_renew, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
            if (error) console.error("stripe-webhook: error actualizando auto_renew:", error);
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Extend the license expiration
        const { data: existing } = await supabase
          .from("user_licenses")
          .select("*")
          .eq("stripe_customer_id", customerId)
          .eq("status", "active")
          .maybeSingle();

        if (existing && existing.expires_at) {
          // Extend from current expiration or now, whichever is later
          const currentExpiry = new Date(existing.expires_at).getTime();
          const base = Math.max(currentExpiry, Date.now());
          // Default 30-day extension
          const newExpiry = new Date(base + 30 * 86400000).toISOString();
          const { error } = await supabase
            .from("user_licenses")
            .update({ expires_at: newExpiry, status: "active", updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (error) console.error("stripe-webhook: error extendiendo licencia:", error);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Log server-side (visible en Supabase → Edge Functions → stripe-webhook
    // → Logs) además de en la respuesta que ve Stripe — antes solo se veía
    // en el panel de Stripe (pestaña "Response" del evento fallido), lo
    // cual es fácil de pasar por alto si no se sabe buscar ahí.
    console.error("stripe-webhook: error no controlado:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
