import { Radio, MessageCircle, Sparkles, Music, Bell, Mic, Filter, LayoutTemplate, Settings, Crown, Shield, Bookmark, LogOut } from "lucide-react";
import type { TabId } from "../App";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";

// Mismos items que el menú móvil (Header.tsx) — una sola fuente de verdad
// de qué pestañas existen realmente en la app, para no inventar secciones
// que no tienen una vista detrás.
const NAV_ITEMS: { id: TabId; labelKey: import("../lib/i18n").TranslationKey; icon: typeof MessageCircle }[] = [
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

type Props = {
  active: TabId;
  onChange: (id: TabId) => void;
};

/** Sidebar fijo para pantallas de escritorio (lg+). En pantallas más
 *  chicas no se renderiza — Header.tsx sigue manejando la navegación por
 *  menú deslizable, sin duplicar lógica de rutas. */
export function Sidebar({ active, onChange }: Props) {
  const { isAdmin, profile, user, signOut } = useAuth();
  const status = useStore((s) => s.status);
  const { t } = useI18n();

  if (!user) return null;

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 flex-col bg-bg-card border-r border-border z-20">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center glow-primary">
            <Radio className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          {status === "connected" && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success-400 ring-2 ring-bg-card" />
          )}
        </div>
        <h1 className="text-base font-extrabold tracking-tight">
          Live<span className="text-gradient">Nest</span>
        </h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-text-soft hover:bg-bg-hover hover:text-text"
              }`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="text-sm font-semibold truncate">{t(item.labelKey)}</span>
            </button>
          );
        })}

        {isAdmin && (
          <button
            onClick={() => onChange("admin")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 mt-2 ${
              active === "admin"
                ? "bg-error-400/15 text-error-400"
                : "text-text-soft hover:bg-bg-hover hover:text-error-400"
            }`}
          >
            <Shield className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active === "admin" ? 2.5 : 1.8} />
            <span className="text-sm font-semibold">Admin</span>
          </button>
        )}
      </nav>

      {/* Account footer */}
      <div className="p-3 border-t border-border">
        <button
          onClick={() => onChange("account")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-colors ${
            active === "account" ? "bg-primary/10" : "hover:bg-bg-hover"
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            {isAdmin ? <Shield className="w-4 h-4 text-error-400" /> : <Crown className="w-4 h-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-bold truncate">{profile?.email ?? user.email}</p>
            <p className="text-[10px] text-muted">
              {isAdmin ? "Administrador" : profile?.rank && profile.rank !== "none" ? profile.rank : "Cuenta"}
            </p>
          </div>
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 mt-1 rounded-xl text-muted hover:text-error-400 hover:bg-error-400/5 transition-colors text-xs font-semibold"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t("logout")}
        </button>
      </div>
    </aside>
  );
}
