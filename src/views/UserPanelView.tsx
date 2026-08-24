import { useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { MEMBERSHIP_PRICE_ID, MEMBERSHIP_PRICE_LABEL, MEMBERSHIP_DURATION } from "../lib/stripeConfig";
import { KeyRound, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Crown, Calendar, Sparkles, LogOut, CreditCard } from "lucide-react";

export function UserPanelView() {
  const { user, profile, license, refreshLicense, signOut } = useAuth();
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelInfo, setCancelInfo] = useState<string | null>(null);

  const callEdgeFunction = useCallback(async (fnName: string, body: Record<string, unknown> = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (!user) return;
    setError(null);
    setCheckoutLoading(true);
    const { ok, data } = await callEdgeFunction("stripe-checkout", {
      priceId: MEMBERSHIP_PRICE_ID,
      userId: user.id,
      duration: MEMBERSHIP_DURATION,
    });
    if (!ok || !data.url) {
      setError(data.error ?? "No se pudo iniciar el pago. Intenta de nuevo.");
      setCheckoutLoading(false);
      return;
    }
    window.location.href = data.url;
  }, [user, callEdgeFunction]);

  // Cancela la suscripción REAL en Stripe (no solo la fila local) — llama a
  // la Edge Function stripe-cancel-subscription, que a su vez le pide a
  // Stripe que no vuelva a cobrar (cancel_at_period_end). El acceso Premium
  // se mantiene hasta el final del período ya pagado.
  const handleCancel = useCallback(async () => {
    if (!license || !user) return;
    setCancelLoading(true);
    setError(null);
    const { ok, data } = await callEdgeFunction("stripe-cancel-subscription");
    if (!ok) {
      setError(data.error ?? "No se pudo cancelar la suscripción. Intenta de nuevo.");
      setCancelLoading(false);
      setConfirmingCancel(false);
      return;
    }
    setCancelInfo(
      data.access_until
        ? `Tu membresía no se renovará. Conservas el acceso Premium hasta el ${fmtDate(data.access_until)}.`
        : "Tu suscripción fue cancelada — no se te volverá a cobrar."
    );
    await refreshLicense();
    setCancelLoading(false);
    setConfirmingCancel(false);
  }, [license, user, callEdgeFunction, refreshLicense]);

  const handleRedeem = useCallback(async () => {
    if (!keyInput.trim() || !user) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { error: rpcError } = await supabase.rpc("redeem_license_key", {
        p_key: keyInput.trim(),
      });

      if (rpcError) {
        const msg = rpcError.message || "";
        if (msg.includes("already_has_active_license")) {
          setError("Ya tienes una licencia activa.");
        } else if (msg.includes("invalid_or_used_key")) {
          setError("La clave no es válida o ya fue utilizada.");
        } else if (msg.includes("not_authenticated")) {
          setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        } else {
          setError(msg || "Error al activar la licencia.");
        }
        setLoading(false);
        return;
      }

      setSuccess("Licencia activada correctamente.");
      setKeyInput("");
      await refreshLicense();
    } catch {
      setError("Error al activar la licencia.");
    }
    setLoading(false);
  }, [keyInput, user, refreshLicense]);

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-5 border border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Crown className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{profile?.email || user?.email}</p>
            <p className="text-xs text-muted">
              {profile?.role === "admin" ? "Administrador" : "Usuario"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-soft border border-border text-xs font-semibold text-muted hover:text-error-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Salir
          </button>
        </div>
      </div>

      {/* License status */}
      {license ? (
        <div className="glass rounded-2xl p-5 border border-border space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success-400" />
            <h2 className="text-base font-bold">Licencia activa</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-bg-soft p-3 border border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-muted">Origen</span>
              </div>
              <p className="text-sm font-bold capitalize">
                {license.source === "stripe" ? "Suscripción" : "Clave"}
              </p>
            </div>
            <div className="rounded-xl bg-bg-soft p-3 border border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-muted">Expira</span>
              </div>
              <p className="text-sm font-bold">
                {license.expires_at ? fmtDate(license.expires_at) : "De por vida"}
              </p>
            </div>
          </div>

          {license.source === "stripe" && (
            <div className="pt-2 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  {license.auto_renew ? `Se renueva automáticamente · ${MEMBERSHIP_PRICE_LABEL}` : "No se renovará — acceso vigente hasta que expire"}
                </span>
              </div>

              {cancelInfo && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-warning-400/10 border border-warning-400/20 text-warning-400 text-xs">
                  <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{cancelInfo}</span>
                </div>
              )}

              {license.auto_renew && !cancelInfo && (
                confirmingCancel ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCancel}
                      disabled={cancelLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-error-400 text-white text-xs font-bold hover:bg-error-500 transition-colors disabled:opacity-50"
                    >
                      {cancelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Sí, cancelar
                    </button>
                    <button
                      onClick={() => setConfirmingCancel(false)}
                      disabled={cancelLoading}
                      className="px-4 py-2.5 rounded-xl bg-bg-soft border border-border text-xs font-bold text-muted"
                    >
                      Volver
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingCancel(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs font-bold hover:bg-error-400/20 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancelar membresía
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="glass rounded-2xl p-5 border border-border space-y-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-muted" />
              <h2 className="text-base font-bold">Sin licencia activa</h2>
            </div>
            <p className="text-xs text-muted">
              Suscríbete o activa una clave de licencia para acceder a todas las funciones de LiveNest.
            </p>
          </div>

          {/* Subscribe — single $7.99/mo plan via Stripe */}
          <div className="glass rounded-2xl p-5 border border-primary/30 bg-primary/5 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold">Hazte miembro</h2>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold">$7.99</span>
              <span className="text-sm text-muted">/ mes</span>
            </div>
            <p className="text-xs text-muted">
              Voces premium, canales ilimitados, todos los temas y funciones exclusivas. Cancela cuando quieras.
            </p>
            <button
              onClick={handleSubscribe}
              disabled={checkoutLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Suscribirme
            </button>
          </div>
        </>
      )}

      {/* Redeem key */}
      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold">Activar clave de licencia</h2>
        </div>
        <p className="text-xs text-muted">
          ¿Tienes una clave (7 días, 30 días, 1 año o de por vida)? Actívala aquí.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="flex-1 px-4 py-2.5 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors font-mono"
          />
          <button
            onClick={handleRedeem}
            disabled={loading || !keyInput.trim()}
            className="px-4 py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activar"}
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-success-400/10 border border-success-400/20 text-success-400 text-xs">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}
