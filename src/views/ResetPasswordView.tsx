import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { isPasswordValid } from "../lib/passwordPolicy";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { Radio, Lock, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";

/** Pantalla mostrada cuando App.tsx detecta el evento PASSWORD_RECOVERY —
 *  reemplaza al dashboard normal hasta que el usuario establece una
 *  contraseña nueva, aunque supabase-js ya haya creado una sesión válida a
 *  partir del link del email. */
export function ResetPasswordView() {
  const { updatePassword, clearPasswordRecovery } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid(password)) {
      setError(t("auth_err_password_weak"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth_err_password_mismatch"));
      return;
    }

    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      setSuccess(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center glow-primary mb-4">
            <Radio className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-center">{t("reset_password_title")}</h1>
          <p className="text-sm text-muted mt-1 text-center">{t("reset_password_subtitle")}</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-success-400/10 border border-success-400/20 text-success-400 text-xs">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{t("reset_password_success")}</span>
            </div>
            <button
              onClick={clearPasswordRecovery}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors card-press"
            >
              {t("reset_password_continue")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">{t("reset_password_label")}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? t("auth_hide_password") : t("auth_show_password")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-muted hover:text-text transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted mt-1.5 px-1">{t("auth_password_requirements_title")}</p>
              <PasswordRequirements password={password} />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">{t("reset_password_confirm_label")}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isPasswordValid(password)}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 card-press"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("reset_password_button")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
