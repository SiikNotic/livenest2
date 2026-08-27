import { useEffect } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { PremiumBadge, requestUpgrade } from "../components/PremiumLock";
import { Palette, Check, Moon, Contrast, Zap, Apple, Smartphone, Sparkles, Sunset as SunsetIcon, Waves, Gem, Flame, Gift, Trees } from "lucide-react";

export type ThemeId = "midnight" | "mono" | "neon" | "ios" | "android" | "aurora" | "sunset" | "ocean" | "violet" | "ember" | "candy" | "forest";

export function GeneralView() {
  const { hasActiveLicense } = useAuth();
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const { t } = useI18n();

  if (!settings) return <div className="card animate-pulse h-48" />;

  const currentTheme = settings.theme ?? "midnight";

  const THEMES: {
    id: ThemeId;
    labelKey: import("../lib/i18n").TranslationKey;
    descKey: import("../lib/i18n").TranslationKey;
    icon: typeof Moon;
    premium: boolean;
    preview: { bg: string; card: string; primary: string; accent: string; text: string };
  }[] = [
    {
      id: "midnight",
      labelKey: "theme_midnight",
      descKey: "theme_midnight_desc",
      icon: Moon,
      premium: false,
      preview: { bg: "#0a0b0f", card: "#16181d", primary: "#06b6d4", accent: "#10b981", text: "#f3f4f6" },
    },
    {
      id: "mono",
      labelKey: "theme_mono",
      descKey: "theme_mono_desc",
      icon: Contrast,
      premium: false,
      preview: { bg: "#0d0d0d", card: "#1c1c1c", primary: "#e5e5e5", accent: "#ffffff", text: "#fafafa" },
    },
    {
      id: "neon",
      labelKey: "theme_neon",
      descKey: "theme_neon_desc",
      icon: Zap,
      premium: true,
      preview: { bg: "#0a0a14", card: "#16162a", primary: "#d946ef", accent: "#06ffa5", text: "#f0f0ff" },
    },
    {
      id: "ios",
      labelKey: "theme_ios",
      descKey: "theme_ios_desc",
      icon: Apple,
      premium: false,
      preview: { bg: "#f2f2f7", card: "#ffffff", primary: "#007aff", accent: "#34c759", text: "#1c1c1e" },
    },
    {
      id: "android",
      labelKey: "theme_android",
      descKey: "theme_android_desc",
      icon: Smartphone,
      premium: true,
      preview: { bg: "#141118", card: "#211f26", primary: "#d0bcff", accent: "#ffb4a4", text: "#f3eef9" },
    },
    {
      id: "aurora",
      labelKey: "theme_aurora",
      descKey: "theme_aurora_desc",
      icon: Sparkles,
      premium: true,
      preview: { bg: "#0b0a17", card: "#171531", primary: "#a855f7", accent: "#22d3ee", text: "#f4f2ff" },
    },
    {
      id: "sunset",
      labelKey: "theme_sunset",
      descKey: "theme_sunset_desc",
      icon: SunsetIcon,
      premium: true,
      preview: { bg: "#120c0a", card: "#211714", primary: "#fb923c", accent: "#f87171", text: "#fff3ec" },
    },
    {
      id: "ocean",
      labelKey: "theme_ocean",
      descKey: "theme_ocean_desc",
      icon: Waves,
      premium: true,
      preview: { bg: "#060f17", card: "#10212e", primary: "#0ea5e9", accent: "#22d3ee", text: "#eef8fd" },
    },
    {
      id: "violet",
      labelKey: "theme_violet",
      descKey: "theme_violet_desc",
      icon: Gem,
      premium: true,
      preview: { bg: "#0e0a17", card: "#1c1629", primary: "#8b5cf6", accent: "#f472b6", text: "#f6f2ff" },
    },
    {
      id: "ember",
      labelKey: "theme_ember",
      descKey: "theme_ember_desc",
      icon: Flame,
      premium: true,
      preview: { bg: "#0d0705", card: "#1d100b", primary: "#ef4444", accent: "#f97316", text: "#fff0ea" },
    },
    {
      id: "candy",
      labelKey: "theme_candy",
      descKey: "theme_candy_desc",
      icon: Gift,
      premium: true,
      preview: { bg: "#12081a", card: "#241432", primary: "#ec4899", accent: "#22d3ee", text: "#fdf2fb" },
    },
    {
      id: "forest",
      labelKey: "theme_forest",
      descKey: "theme_forest_desc",
      icon: Trees,
      premium: true,
      preview: { bg: "#070f0b", card: "#112018", primary: "#10b981", accent: "#2dd4bf", text: "#eefdf5" },
    },
  ];

  // Safety net: if the saved theme is a paid one but the license is no
  // longer active, fall back to the free "midnight" theme.
  useEffect(() => {
    if (hasActiveLicense) return;
    const active = THEMES.find((th) => th.id === currentTheme);
    if (active?.premium) {
      saveSettings({ theme: "midnight" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveLicense, currentTheme]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
        <div className="relative p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center glow-primary">
              <Palette className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold">{t("appearance_title")}</h2>
              <p className="text-xs text-muted">{t("appearance_subtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((theme) => {
          const Icon = theme.icon;
          const isActive = currentTheme === theme.id;
          const locked = theme.premium && !hasActiveLicense;
          return (
            <button
              key={theme.id}
              onClick={() => (locked ? requestUpgrade() : saveSettings({ theme: theme.id }))}
              className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-200 card-press ${
                isActive ? "border-primary scale-[1.02]" : "border-border hover:border-primary/30"
              } ${locked ? "opacity-70" : ""}`}
            >
              <div
                className="h-20 flex items-end justify-center gap-1.5 p-3"
                style={{ background: theme.preview.bg }}
              >
                <div className="flex-1 h-10 rounded-lg" style={{ background: theme.preview.card }} />
                <div className="w-3 h-10 rounded-full" style={{ background: theme.preview.primary }} />
                <div className="w-3 h-10 rounded-full" style={{ background: theme.preview.accent }} />
                {locked && (
                  <span className="absolute top-2 right-2">
                    <PremiumBadge />
                  </span>
                )}
              </div>
              <div
                className="px-3 py-2.5 flex items-center justify-between"
                style={{ background: theme.preview.card }}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: theme.preview.primary }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: theme.preview.text }}>
                      {t(theme.labelKey)}
                    </p>
                    <p className="text-[10px]" style={{ color: theme.preview.text, opacity: 0.6 }}>
                      {locked ? t("premium_theme_locked_hint") : t(theme.descKey)}
                    </p>
                  </div>
                </div>
                {isActive && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: theme.preview.primary }}
                  >
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
