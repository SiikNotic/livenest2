import { useState, useEffect } from "react";
import { useStore } from "../lib/store";
import { useI18n, type Lang } from "../lib/i18n";
import { Radio, Volume2, VolumeX, Users, Menu, X, MessageCircle, Sparkles, Music, Bell, Mic, Filter, LayoutTemplate, Settings, Globe, Crown, Shield, Bookmark, ChevronRight } from "lucide-react";
import type { TabId } from "../App";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { listSavedChannels } from "../lib/savedChannels";

// TikTok bloquea la carga directa de sus imágenes desde otros sitios
// (hotlink) — este proxy público las trae desde el servidor, evitando ese
// bloqueo. Mismo patrón que ya usan los avatares del chat.
function proxiedAvatar(url: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=96&h=96&fit=cover&default=1`;
}

// El perfil de cuenta ahora vive fijo abajo del menú (ver referencia de
// Figma "Dual mode side navigation menu"), así que ya no es un ítem más
// de esta lista con scroll.
const MENU_ITEMS: { id: TabId; labelKey: import("../lib/i18n").TranslationKey; icon: typeof MessageCircle }[] = [
  { id: "chat", labelKey: "tab_chat", icon: MessageCircle },
  { id: "channels", labelKey: "tab_channels", icon: Bookmark },
  { id: "events", labelKey: "tab_events", icon: Sparkles },
  { id: "music", labelKey: "tab_music", icon: Music },
  { id: "notifications", labelKey: "tab_notifications", icon: Bell },
  { id: "voices", labelKey: "tab_voices", icon: Mic },
  { id: "filters", labelKey: "tab_filters", icon: Filter },
  { id: "templates", labelKey: "tab_templates", icon: LayoutTemplate },
  { id: "general", labelKey: "tab_general", icon: Settings },
];

/** Cronómetro "01:24:35" desde que se conectó — aislado en su propio
 *  componente para que solo él vuelva a renderizar cada segundo, no todo
 *  el Header. */
function LiveTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return <span className="tabular-nums">{h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}</span>;
}

type Props = {
  active: TabId;
  onChange: (id: TabId) => void;
};

export function Header({ active, onChange }: Props) {
  const status = useStore((s) => s.status);
  const username = useStore((s) => s.username);
  const viewerCount = useStore((s) => s.viewerCount);
  const isSpeaking = useStore((s) => s.isSpeaking);
  const stopSpeaking = useStore((s) => s.stopSpeaking);
  const sessionStartedAt = useStore((s) => s.sessionStartedAt);
  const { lang, setLang, t } = useI18n();
  const { isAdmin, profile, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [channelAvatar, setChannelAvatar] = useState<string | null>(null);

  // Trae la foto del canal de TikTok más reciente (con el que se transmite),
  // no algo ligado al correo — la cuenta de LiveNest y el canal de TikTok
  // son cosas distintas. Se pide una sola vez al iniciar sesión.
  useEffect(() => {
    if (!user) {
      setChannelAvatar(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const channels = await listSavedChannels();
        const target = channels[0]?.username;
        if (!target) return;
        const { data: sessionData } = await supabase.auth.getSession();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const res = await fetch(`${supabaseUrl}/functions/v1/tiktok-profile-photo?username=${encodeURIComponent(target)}`, {
          headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
        });
        const data = await res.json();
        if (!cancelled && data?.avatar_url) setChannelAvatar(data.avatar_url as string);
      } catch {
        // Silencioso — si falla, simplemente se queda con las iniciales.
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Cerrar el menú con Escape — antes solo se podía cerrar con clic/touch,
  // dejando a quien navega por teclado sin forma de salir.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const statusConfig = {
    disconnected: { text: t("status_disconnected"), dot: "bg-muted-soft", color: "text-muted" },
    connecting: { text: t("status_connecting"), dot: "bg-warning-400 animate-pulse-soft", color: "text-warning-400" },
    connected: { text: t("status_connected"), dot: "bg-success-400 animate-pulse-soft", color: "text-success-400" },
    error: { text: t("status_error"), dot: "bg-error-400", color: "text-error-400" },
  }[status];

  const handleSelect = (id: TabId) => {
    onChange(id);
    setMenuOpen(false);
  };

  return (
    <>
      <header className="glass sticky top-0 z-30 px-4 pt-3.5 pb-3 safe-top lg:pl-6 lg:pr-6">
        <div className="flex items-center justify-between gap-2">
          {/* Left: menu button (tablet only — phone uses bottom nav's "Más", desktop uses the sidebar) + logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex lg:hidden items-center justify-center w-10 h-10 rounded-2xl bg-bg-soft border border-border text-text-soft hover:text-text hover:bg-bg-hover transition-all duration-200 card-press shrink-0"
              aria-label={t("menu")}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="relative shrink-0 lg:hidden">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center glow-primary">
                <Radio className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              {status === "connected" && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-success-400 ring-2 ring-bg-card" />
              )}
            </div>
            <div className="flex-1 flex flex-col min-w-0 lg:hidden">
              <h1 className="text-base font-extrabold leading-tight tracking-tight">
                Live<span className="text-gradient">Nest</span>
              </h1>
              {status === "connected" && username ? (
                <div className="flex items-center gap-1.5 mt-0.5 px-2.5 h-[26px] rounded-[15px] bg-black w-fit max-w-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#fa3532] animate-pulse-soft flex-shrink-0" />
                  <span className="text-[10px] font-extrabold tracking-wide text-white flex-shrink-0">LIVE</span>
                  {sessionStartedAt && (
                    <span className="text-[10px] text-white/60 tabular-nums flex-shrink-0">
                      <LiveTimer startedAt={sessionStartedAt} />
                    </span>
                  )}
                  <span className="text-[10px] text-white/50 truncate">@{username}</span>
                </div>
              ) : (
                <p className="text-[11px] text-muted leading-tight truncate flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} flex-shrink-0`} />
                  {statusConfig.text}
                </p>
              )}
            </div>

            {/* Desktop: LIVE status lives here instead of the logo (sidebar already shows the logo) */}
            <div className="hidden lg:flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-soft border border-border">
                <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
                <span className={`text-xs font-bold ${statusConfig.color}`}>{statusConfig.text}</span>
              </div>
              {status === "connected" && username && (
                <span className="text-xs text-muted">@{username}</span>
              )}
            </div>
          </div>

          {/* Right: status + account */}
          <div className="flex items-center gap-2 shrink-0">
            {isSpeaking && (
              <button
                onClick={stopSpeaking}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/15 text-primary text-xs font-semibold animate-slide-down card-press"
              >
                <Volume2 className="w-3.5 h-3.5 animate-pulse-soft" />
                <span className="hidden sm:inline">{t("reading")}</span>
                <VolumeX className="w-3.5 h-3.5" />
              </button>
            )}
            {status === "connected" && viewerCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-soft border border-border">
                <Users className="w-3.5 h-3.5 text-accent" />
                <span className="text-[11px] font-semibold tabular-nums">{viewerCount}</span>
              </div>
            )}
            <div className="hidden md:flex lg:hidden items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-soft border border-border">
              <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
              <span className={`text-[11px] font-semibold ${statusConfig.color}`}>{statusConfig.text}</span>
            </div>
            {user ? (
              <button
                onClick={() => onChange("account")}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-soft border border-border text-xs font-semibold hover:bg-bg-hover transition-colors card-press"
              >
                {isAdmin ? <Shield className="w-3.5 h-3.5 text-error-400" /> : <Crown className="w-3.5 h-3.5 text-primary" />}
                <span>{isAdmin ? "Admin" : t("nav_account")}</span>
              </button>
            ) : null}
            <button
              onClick={() => onChange("account")}
              className={`flex lg:hidden items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors card-press ${
                user
                  ? "bg-bg-soft border border-border hover:bg-bg-hover"
                  : "bg-primary/15 border border-primary/30 text-primary font-bold hover:bg-primary/25"
              }`}
            >
              {user ? (
                <>
                  {isAdmin ? <Shield className="w-3.5 h-3.5 text-error-400" /> : <Crown className="w-3.5 h-3.5 text-primary" />}
                  <span className="hidden sm:inline">{isAdmin ? "Admin" : t("nav_account")}</span>
                </>
              ) : (
                <>
                  <Crown className="w-3.5 h-3.5" />
                  <span>{t("nav_signin")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
          {/* Menú rediseñado a partir de la referencia de Figma "Dual mode
             side navigation menu": ítem activo como píldora sólida, y el
             perfil de cuenta fijo abajo con avatar circular en vez de ser
             un ítem más de la lista. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("menu")}
            className="fixed top-0 left-0 z-50 h-full w-72 max-w-[80vw] bg-bg-card border-r border-border shadow-2xl animate-slide-in-left flex flex-col safe-top safe-bottom lg:hidden"
          >
            {/* Header fijo */}
            <div className="p-4 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center">
                    <Radio className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-sm font-extrabold">
                    Live<span className="text-gradient">Nest</span>
                  </span>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-8 h-8 rounded-xl bg-bg-soft border border-border flex items-center justify-center text-muted hover:text-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
                <span className={`text-[11px] font-semibold ${statusConfig.color}`}>{statusConfig.text}</span>
              </div>
            </div>

            {/* Lista con scroll */}
            <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-0.5">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-full transition-all duration-150 card-press ${
                      isActive
                        ? "bg-primary text-white shadow-md shadow-primary/25"
                        : "text-text-soft hover:bg-bg-hover hover:text-text"
                    }`}
                  >
                    <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
                    <span className="text-sm font-semibold">{t(item.labelKey)}</span>
                  </button>
                );
              })}
              {isAdmin && (
                <button
                  onClick={() => handleSelect("admin")}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-full transition-all duration-150 card-press ${
                    active === "admin"
                      ? "bg-error-400 text-white shadow-md shadow-error-400/25"
                      : "text-text-soft hover:bg-bg-hover hover:text-error-400"
                  }`}
                >
                  <Shield className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active === "admin" ? 2.5 : 1.8} />
                  <span className="text-sm font-semibold">Admin</span>
                </button>
              )}
            </nav>

            {/* Idioma + cuenta, fijos abajo */}
            <div className="flex-shrink-0 border-t border-border p-3 space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <Globe className="w-3.5 h-3.5 text-muted" />
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">{t("language")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["es", "en"] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 card-press ${
                        lang === l
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "bg-bg-soft text-muted border border-border hover:text-text"
                      }`}
                    >
                      {l === "es" ? "🇪🇸 Español" : "🇬🇧 English"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleSelect("account")}
                className={`w-full flex items-center gap-2.5 p-2.5 rounded-2xl transition-colors card-press ${
                  active === "account" ? "bg-primary/10" : "hover:bg-bg-hover"
                }`}
              >
                {user ? (
                  channelAvatar ? (
                    <img
                      src={proxiedAvatar(channelAvatar)}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-border"
                      onError={() => setChannelAvatar(null)}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {(profile?.username ?? profile?.email ?? user.email ?? "?").slice(0, 2).toUpperCase()}
                    </div>
                  )
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                    <Crown className="w-4 h-4" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  {user ? (
                    <>
                      <p className="text-xs font-bold truncate">
                        {isAdmin ? t("role_admin") : profile?.username ? `@${profile.username}` : t("tab_account")}
                      </p>
                      <p className="text-[11px] text-muted truncate">{profile?.email ?? user.email}</p>
                    </>
                  ) : (
                    <p className="text-xs font-bold">{t("nav_signin")}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
