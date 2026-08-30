import { useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { MEMBERSHIP_PRICE_ID } from "../lib/stripeConfig";
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
  const { t } = useI18n();
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
          // window.location.origin solo da el dominio (ej.
          // https://siiknotic.github.io), sin el subpath donde vive la app
          // en GitHub Pages (/livenest2/) — el edge function no tiene forma
          // de saber ese subpath por su cuenta, así que se lo mandamos acá
          // para que Stripe pueda volver a la página correcta después del
          // pago en vez de un 404.
          returnBase: window.location.origin + import.meta.env.BASE_URL,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? t("membership_error_generic"));
        setCheckoutLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t("membership_error_network"));
      setCheckoutLoading(false);
    }
  }, [user, t]);

  return (
    <div className={`glass rounded-2xl p-4 border border-primary/30 bg-primary/5 space-y-2.5 ${className}`}>
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">{t("premium_upgrade_cta")}</h2>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold">$7.99</span>
        <span className="text-xs text-muted">{t("membership_period")}</span>
      </div>
      <p className="text-[11px] text-muted leading-snug">
        {t("membership_desc")}
      </p>
      <button
        onClick={handleSubscribe}
        disabled={checkoutLoading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary-600 transition-colors disabled:opacity-50 card-press"
      >
        {checkoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
        {t("membership_subscribe")}
      </button>
      {error && (
        <p className="flex items-start gap-1.5 text-[10px] text-error-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}
