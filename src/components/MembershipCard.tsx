import { useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { MEMBERSHIP_PRICE_ID, MEMBERSHIP_DURATION } from "../lib/stripeConfig";
import { Crown, CreditCard, Loader2, AlertCircle } from "lucide-react";

/**
 * Tarjeta "Hazte miembro" ($7.99/mes vía Stripe). Antes solo vivía en "Mi
 * cuenta" — se saca a un componente propio para poder mostrarla también en
 * el menú (mobile y desktop), donde quien no es miembro (o a quien se le
 * venció la licencia) la vuelve a ver sin tener que entrar a "Mi cuenta"
 * primero. Cada lugar donde se monta decide cuándo mostrarla (típicamente
 * `!hasActiveLicense`) — el componente en sí no filtra nada, solo dibuja
 * la tarjeta y maneja el checkout.
 */
export function MembershipCard({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = useCallback(async () => {
    if (!user) return;
    setError(null);
    setCheckoutLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          priceId: MEMBERSHIP_PRICE_ID,
          userId: user.id,
          duration: MEMBERSHIP_DURATION,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "No se pudo iniciar el pago. Intenta de nuevo.");
        setCheckoutLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
      setCheckoutLoading(false);
    }
  }, [user]);

  return (
    <div className={`glass rounded-2xl p-4 border border-primary/30 bg-primary/5 space-y-2.5 ${className}`}>
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">Hazte miembro</h2>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold">$7.99</span>
        <span className="text-xs text-muted">/ mes</span>
      </div>
      <p className="text-[11px] text-muted leading-snug">
        Voces premium, canales ilimitados, todos los temas y funciones exclusivas. Cancela cuando quieras.
      </p>
      <button
        onClick={handleSubscribe}
        disabled={checkoutLoading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary-600 transition-colors disabled:opacity-50 card-press"
      >
        {checkoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
        Suscribirme
      </button>
      {error && (
        <p className="flex items-start gap-1.5 text-[10px] text-error-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}
