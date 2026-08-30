import { useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { MEMBERSHIP_PRICE_LABEL } from "../lib/stripeConfig";
import { isPasswordValid } from "../lib/passwordPolicy";
import { PasswordRequirements } from "../components/PasswordRequirements";
import { KeyRound, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Crown, Calendar, Sparkles, LogOut, User as UserIcon, Lock, Mail } from "lucide-react";
import { MembershipCard } from "../components/MembershipCard";

export function UserPanelView() {
  const { user, profile, license, refreshLicense, signOut, setUsername, refreshProfile, updatePassword, updateEmail, reauthenticateWithPassword } =
    useAuth();
  const { t, lang } = useI18n();
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelInfo, setCancelInfo] = useState<string | null>(null);

  // Cuentas que llegaron sin username (registradas antes de que este campo
  // existiera, o entraron con Google) — se les pide una sola vez acá.
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(false);

  const handleSetUsername = useCallback(async () => {
    setUsernameError(null);
    setUsernameLoading(true);
    const { error } = await setUsername(usernameInput);
    if (error) {
      setUsernameError(error);
      setUsernameLoading(false);
      return;
    }
    await refreshProfile();
    setUsernameLoading(false);
  }, [usernameInput, setUsername, refreshProfile]);

  // Solo se pide la contraseña actual si la cuenta ya tiene una (identities
  // trae un 'email' provider) — una cuenta que entró únicamente con Google
  // no tiene contraseña que verificar, así que ahí este flujo directamente
  // le permite establecer una por primera vez.
  const hasPasswordIdentity = !!user?.identities?.some((i) => i.provider === "email");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = useCallback(async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!isPasswordValid(newPassword)) {
      setPasswordError(t("auth_err_password_weak"));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t("auth_err_password_mismatch"));
      return;
    }

    setPasswordLoading(true);
    if (hasPasswordIdentity) {
      const { error: reauthError } = await reauthenticateWithPassword(currentPassword);
      if (reauthError) {
        setPasswordError(t("auth_err_current_password_wrong"));
        setPasswordLoading(false);
        return;
      }
    }
    const { error } = await updatePassword(newPassword);
    setPasswordLoading(false);
    if (error) {
      setPasswordError(error);
      return;
    }
    setPasswordSuccess(t("account_change_password_success"));
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }, [hasPasswordIdentity, currentPassword, newPassword, confirmNewPassword, reauthenticateWithPassword, updatePassword, t]);

  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const handleChangeEmail = useCallback(async () => {
    setEmailError(null);
    setEmailSuccess(null);
    if (!newEmail.trim()) return;

    setEmailLoading(true);
    const { error } = await updateEmail(newEmail.trim());
    setEmailLoading(false);
    if (error) {
      // Supabase devuelve distintos mensajes según versión/proveedor para
      // "ese email ya pertenece a otra cuenta" — buscamos coincidencias
      // conocidas para mostrar un mensaje claro en vez del texto crudo.
      const lower = error.toLowerCase();
      if (lower.includes("already") || lower.includes("registered") || lower.includes("exists")) {
        setEmailError(t("account_change_email_in_use"));
      } else {
        setEmailError(error);
      }
      return;
    }
    setEmailSuccess(t("account_change_email_success"));
    setNewEmail("");
  }, [newEmail, updateEmail, t]);

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
      setError(data.error ?? t("account_cancel_error"));
      setCancelLoading(false);
      setConfirmingCancel(false);
      return;
    }
    setCancelInfo(
      data.access_until
        ? t("account_cancel_success_until", { date: fmtDate(data.access_until, lang) })
        : t("account_cancel_success")
    );
    await refreshLicense();
    setCancelLoading(false);
    setConfirmingCancel(false);
  }, [license, user, callEdgeFunction, refreshLicense, t, lang]);

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
          setError(t("account_redeem_already_active"));
        } else if (msg.includes("invalid_or_used_key")) {
          setError(t("account_redeem_invalid_key"));
        } else if (msg.includes("not_authenticated")) {
          setError(t("account_session_expired"));
        } else {
          setError(msg || t("account_redeem_generic_error"));
        }
        setLoading(false);
        return;
      }

      setSuccess(t("account_redeem_success"));
      setKeyInput("");
      await refreshLicense();
    } catch {
      setError(t("account_redeem_generic_error"));
    }
    setLoading(false);
  }, [keyInput, user, refreshLicense, t]);

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-5 border border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Crown className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{profile?.username ? `@${profile.username}` : profile?.email || user?.email}</p>
            <p className="text-xs text-muted truncate">
              {profile?.username ? (profile?.email || user?.email) : profile?.role === "admin" ? t("role_admin") : t("role_user")}
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-soft border border-border text-xs font-semibold text-muted hover:text-error-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t("logout")}
          </button>
        </div>

        {!profile?.username && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-text-soft flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-primary" /> {t("account_choose_username")}
            </p>
            <p className="text-[11px] text-muted">{t("auth_username_hint")}</p>
            <div className="flex gap-2">
              <input
                type="text"
                minLength={3}
                maxLength={24}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder={t("auth_username_placeholder")}
                className="flex-1 px-3 py-2 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
              />
              <button
                onClick={handleSetUsername}
                disabled={usernameLoading || usernameInput.trim().length < 3}
                className="btn-primary text-xs px-4 disabled:opacity-50"
              >
                {usernameLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("account_save")}
              </button>
            </div>
            {usernameError && (
              <p className="text-[11px] text-error-400">{usernameError}</p>
            )}
          </div>
        )}
      </div>

      {/* License status */}
      {license ? (
        <div className="glass rounded-2xl p-5 border border-border space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success-400" />
            <h2 className="text-base font-bold">{t("account_license_active")}</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-bg-soft p-3 border border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-muted">{t("account_license_source")}</span>
              </div>
              <p className="text-sm font-bold capitalize">
                {license.source === "stripe" ? t("license_source_subscription") : t("license_source_key")}
              </p>
            </div>
            <div className="rounded-xl bg-bg-soft p-3 border border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-muted">{t("account_license_expires")}</span>
              </div>
              <p className="text-sm font-bold">
                {license.expires_at ? fmtDate(license.expires_at, lang) : t("account_license_lifetime")}
              </p>
            </div>
          </div>

          {license.source === "stripe" && (
            <div className="pt-2 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  {license.auto_renew ? t("account_auto_renew", { price: MEMBERSHIP_PRICE_LABEL }) : t("account_no_renew")}
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
                      {t("account_confirm_cancel")}
                    </button>
                    <button
                      onClick={() => setConfirmingCancel(false)}
                      disabled={cancelLoading}
                      className="px-4 py-2.5 rounded-xl bg-bg-soft border border-border text-xs font-bold text-muted"
                    >
                      {t("account_go_back")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingCancel(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs font-bold hover:bg-error-400/20 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {t("account_cancel_membership")}
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
              <h2 className="text-base font-bold">{t("account_no_license")}</h2>
            </div>
            <p className="text-xs text-muted">
              {t("account_no_license_desc")}
            </p>
          </div>

          <MembershipCard />
        </>
      )}

      {/* Redeem key */}
      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold">{t("account_redeem_title")}</h2>
        </div>
        <p className="text-xs text-muted">
          {t("account_redeem_desc")}
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
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("account_activate")}
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

      {/* Change / set password */}
      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold">
            {hasPasswordIdentity ? t("account_change_password_title") : t("account_set_password_title")}
          </h2>
        </div>
        {!hasPasswordIdentity && <p className="text-xs text-muted">{t("account_set_password_desc")}</p>}

        {hasPasswordIdentity && (
          <div>
            <label className="text-xs font-semibold text-muted mb-1.5 block">{t("account_current_password_label")}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-muted mb-1.5 block">{t("account_new_password_label")}</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
          />
          <PasswordRequirements password={newPassword} />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted mb-1.5 block">{t("account_confirm_new_password_label")}</label>
          <input
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {passwordError && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{passwordError}</span>
          </div>
        )}
        {passwordSuccess && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-success-400/10 border border-success-400/20 text-success-400 text-xs">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        <button
          onClick={handleChangePassword}
          disabled={
            passwordLoading ||
            !isPasswordValid(newPassword) ||
            !confirmNewPassword ||
            (hasPasswordIdentity && !currentPassword)
          }
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50"
        >
          {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("account_change_password_button")}
        </button>
      </div>

      {/* Change email */}
      <div className="glass rounded-2xl p-5 border border-border space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold">{t("account_change_email_title")}</h2>
        </div>
        <p className="text-xs text-muted">{t("account_change_email_desc")}</p>

        <div>
          <label className="text-xs font-semibold text-muted mb-1.5 block">{t("account_new_email_label")}</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder={t("auth_email_placeholder")}
            className="w-full px-3 py-2.5 rounded-xl bg-bg-soft border border-border text-sm text-text placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {emailError && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-error-400/10 border border-error-400/20 text-error-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{emailError}</span>
          </div>
        )}
        {emailSuccess && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-success-400/10 border border-success-400/20 text-success-400 text-xs">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{emailSuccess}</span>
          </div>
        )}

        <button
          onClick={handleChangeEmail}
          disabled={emailLoading || !newEmail.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-600 transition-colors disabled:opacity-50"
        >
          {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("account_change_email_button")}
        </button>
      </div>
    </div>
  );
}

function fmtDate(iso: string, lang: "es" | "en") {
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "es-ES", { day: "numeric", month: "long", year: "numeric" });
}
