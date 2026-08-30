import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Radio, User, AlertCircle, Loader2 } from "lucide-react";

/** Gate bloqueante: se muestra en vez del dashboard cuando hay sesión pero
 *  el perfil todavía no tiene username (típicamente cuentas nuevas de
 *  Google, que nunca pasan por el formulario de registro donde se pide).
 *  No hay forma de saltarla — App.tsx no renderiza nada más hasta que
 *  profile.username exista. */
export function UsernameRequiredView() {
  const { setUsername, signOut } = useAuth();
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await setUsername(value);
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center glow-primary mb-4">
            <Radio className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-center">{t("account_username_required_title")}</h1>
          <p className="text-sm text-muted mt-1 text-center">{t("account_username_required_desc")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">{t("auth_username_label")}</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                required
                minLength={3}
                maxLength={24}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("auth_username_placeholder")}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <p className="text-[11px] text-muted mt-1 px-1">{t("auth_username_hint")}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 card-press"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("account_username_required_button")}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={() => signOut()} className="text-xs text-muted hover:text-primary transition-colors">
            {t("logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
