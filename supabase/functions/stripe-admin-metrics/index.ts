import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/*
Métricas de negocio para el panel de Admin (solo Owner): ingresos del mes,
suscriptores activos, próximas renovaciones y cancelaciones recientes.

Usa la misma STRIPE_SECRET_KEY (real, modo live) que ya vive como secreto
de Edge Function — nunca se expone al cliente. Verificado contra
profiles.rank === 'owner' del usuario autenticado antes de responder, así
que un Staff o un usuario normal nunca puede llamar a esto y ver los
números de facturación, aunque intente invocar la función directamente.
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

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("rank")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (callerProfile?.rank !== "owner") {
      return new Response(JSON.stringify({ error: "Solo el Owner puede ver las métricas de facturación." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const Stripe = (await import("npm:stripe@17.3.1")).default;
    const stripe = new Stripe(stripeSecretKey);

    const now = new Date();
    const startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const in7Days = Math.floor(Date.now() / 1000) + 7 * 86400;

    // Ingresos del mes: suma de cargos exitosos desde el 1° del mes,
    // descontando reembolsos.
    let revenueCents = 0;
    let moreCharges = false;
    {
      const charges = await stripe.charges.list({ created: { gte: startOfMonth }, limit: 100 });
      for (const c of charges.data) {
        if (c.paid && c.status === "succeeded") {
          revenueCents += c.amount - (c.amount_refunded ?? 0);
        }
      }
      moreCharges = charges.has_more;
    }

    // Suscriptores activos + próximas renovaciones (en los próximos 7 días)
    let activeSubscribers = 0;
    let moreSubs = false;
    const upcomingRenewals: { email: string | null; renews_at: string; amount_cents: number | null }[] = [];
    {
      const subs = await stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.customer"] });
      activeSubscribers = subs.data.length;
      moreSubs = subs.has_more;
      for (const s of subs.data) {
        if (s.current_period_end <= in7Days) {
          const customer = s.customer;
          upcomingRenewals.push({
            email: typeof customer === "object" && customer && "email" in customer ? (customer.email as string | null) : null,
            renews_at: new Date(s.current_period_end * 1000).toISOString(),
            amount_cents: s.items.data[0]?.price?.unit_amount ?? null,
          });
        }
      }
      upcomingRenewals.sort((a, b) => a.renews_at.localeCompare(b.renews_at));
    }

    // Cancelaciones recientes (las 5 más nuevas)
    const recentCancellations: { email: string | null; cancelled_at: string }[] = [];
    {
      const canceled = await stripe.subscriptions.list({ status: "canceled", limit: 20, expand: ["data.customer"] });
      const sorted = canceled.data
        .filter((s) => s.canceled_at)
        .sort((a, b) => (b.canceled_at ?? 0) - (a.canceled_at ?? 0))
        .slice(0, 5);
      for (const s of sorted) {
        const customer = s.customer;
        recentCancellations.push({
          email: typeof customer === "object" && customer && "email" in customer ? (customer.email as string | null) : null,
          cancelled_at: new Date((s.canceled_at as number) * 1000).toISOString(),
        });
      }
    }

    return new Response(
      JSON.stringify({
        revenue_this_month_cents: revenueCents,
        revenue_has_more: moreCharges,
        active_subscribers: activeSubscribers,
        active_subscribers_has_more: moreSubs,
        upcoming_renewals: upcomingRenewals.slice(0, 5),
        recent_cancellations: recentCancellations,
        currency: "usd",
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
