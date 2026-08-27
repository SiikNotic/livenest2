import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n, type Lang } from "../lib/i18n";
import { Radio, Lock, Mail, User, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export function AuthView() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && !USERNAME_RE.test(username.trim())) {
      setError(t("auth_username_error"));
      return;
    }

    setLoading(true);
    const { error } =
      mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, username.trim());
    if (error) {
      setError(error);
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    // On success the browser navigates away to Google, so this line only
    // runs when something went wrong (or the redirect was blocked).
    if (error) {
      setGoogleError(error);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      {/* Esta pantalla es ahora el único punto de entrada para quien no
       * inició sesión (ver el gate en App.tsx) — sin loguearse no hay forma
       * de llegar al selector de idioma que vive en el menú, así que hace
       * falta uno acá también. */}
      <div className="w-full max-w-sm flex justify-end mb-4">
        <div className="inline-flex rounded-xl border border-border bg-bg-soft p-1 gap-1">
          {(["es", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                lang === l ? "bg-primary/15 text-primary" : "text-muted hover:text-text"
              }`}
            >
              {l === "es" ? "🇪🇸 ES" : "🇬🇧 EN"}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center glow-primary mb-4">
            <Radio className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Live<span className="text-gradient">Nest</span>
          </h1>
          <p className="text-sm text-muted mt-1">
            {mode === "signin" ? t("auth_signin_subtitle") : t("auth_signup_subtitle")}
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full py-3 rounded-xl bg-bg-soft border border-border text-sm font-semibold text-text hover:bg-bg-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2.5 card-press"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <GoogleIcon className="w-4 h-4" />
              {t("auth_continue_google")}
            </>
          )}
        </button>

        {googleError && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs mt-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{googleError}</span>
          </div>
        )}

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted">{t("auth_or_email")}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-xs font-semibold text-muted mb-1.5 block">{t("auth_username_label")}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("auth_username_placeholder")}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted mt-1 px-1">{t("auth_username_hint")}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">{t("auth_email_label")}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth_email_placeholder")}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">{t("auth_password_label")}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
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
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
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
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 card-press"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === "signin" ? (
              t("auth_signin_button")
            ) : (
              t("auth_signup_button")
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="text-xs text-muted hover:text-primary transition-colors"
          >
            {mode === "signin" ? t("auth_toggle_to_signup") : t("auth_toggle_to_signin")}
          </button>
        </div>
      </div>
    </div>
  );
}
