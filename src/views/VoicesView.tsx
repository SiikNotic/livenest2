import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { voiceManager, type VoiceInfo, type VoiceProvider } from "../lib/voiceManager";
import {
  Volume2, VolumeX, Mic, Check, AlertCircle, User, UserRound,
  Headphones, Settings2, ChevronDown, ChevronUp, Shuffle,
  Globe, Sparkles, Crown, Lock,
} from "lucide-react";

type GenderFilter = "all" | "male" | "female";

const PROVIDERS: { id: VoiceProvider; labelKey: import("../lib/i18n").TranslationKey; descKey: import("../lib/i18n").TranslationKey; icon: typeof Globe; memberOnly?: boolean }[] = [
  { id: "browser", labelKey: "voices_browser", descKey: "voices_browser_desc", icon: Globe },
  { id: "edge", labelKey: "voices_edge", descKey: "voices_edge_desc", icon: Sparkles, memberOnly: true },
  { id: "elevenlabs", labelKey: "voices_elevenlabs", descKey: "voices_elevenlabs_desc", icon: Crown, memberOnly: true },
];

const LANG_FILTERS = [
  { code: "es", labelKey: "tab_chat" as const, flag: "🇪🇸" },
  { code: "en", labelKey: "tab_chat" as const, flag: "🇺🇸" },
] as const;

function matchLang(v: VoiceInfo, code: string): boolean {
  // ElevenLabs voices work with any language via the multilingual model —
  // their account "language" label is just where the voice was recorded,
  // not a limitation. So show them under every language filter.
  if (v.source === "elevenlabs") return true;
  const vl = v.lang.toLowerCase();
  if (vl === "multi") return true;
  if (code === "es") return vl.startsWith("es");
  if (code === "en") return vl.startsWith("en");
  return true;
}

export function VoicesView() {
  const { hasActiveLicense } = useAuth();
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const { t } = useI18n();
  const [browserVoices, setBrowserVoices] = useState<VoiceInfo[]>([]);
  const [filterLang, setFilterLang] = useState<string>("es");
  const [filterGender, setFilterGender] = useState<GenderFilter>("all");
  const [speaking, setSpeaking] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [, forceUpdate] = useState(0);
  const provider = settings?.voice_provider ?? "browser";

  useEffect(() => {
    const update = () => {
      setBrowserVoices(voiceManager.getBrowserVoices());
      forceUpdate((n) => n + 1);
    };
    update();
    return voiceManager.subscribe(update);
  }, []);

  useEffect(() => {
    if (provider === "elevenlabs" && hasActiveLicense) {
      voiceManager.refreshElevenLabsVoices();
    }
  }, [provider, hasActiveLicense]);

  if (!settings) return <div className="card animate-pulse h-48" />;

  // A saved provider that requires membership but the user no longer has one
  // (e.g. license just expired) — behave as "browser" until it's re-saved.
  const isProviderLocked = (p: VoiceProvider) => (p === "edge" || p === "elevenlabs") && !hasActiveLicense;
  const effectiveProvider: VoiceProvider = isProviderLocked(provider) ? "browser" : provider;

  const allVoices =
    effectiveProvider === "browser" ? browserVoices
    : effectiveProvider === "edge" ? voiceManager.getEdgeVoices()
    : voiceManager.getElevenLabsVoices();

  const byLang = allVoices.filter((v) => matchLang(v, filterLang));
  const filteredVoices = filterGender === "all" ? byLang : byLang.filter((v) => v.gender === filterGender);

  const preview = async () => {
    setSpeaking(true);
    setPreviewError(null);
    const sample = filterLang === "en" ? t("voices_test_text_en") : t("voices_test_text_es");
    try {
      const voiceId = settings.voice_random
        ? voiceManager.getRandomVoiceId(effectiveProvider, filterLang) ?? settings.voice_id
        : settings.voice_id;
      await voiceManager.speak(sample, {
        voiceId,
        rate: settings.rate,
        pitch: settings.pitch,
        volume: settings.volume,
        provider: effectiveProvider,
      });
    } catch (err: any) {
      setPreviewError(err?.message ?? t("voices_preview_error"));
    }
    setSpeaking(false);
  };

  const stop = () => {
    voiceManager.stop();
    setSpeaking(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
        <div className="relative p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center glow-primary">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold">{t("voices_title")}</h2>
              <p className="text-xs text-muted">{t("voices_subtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <label className="label">{t("voices_engine")}</label>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p) => {
            const Icon = p.icon;
            const isActive = provider === p.id;
            const locked = p.memberOnly && !hasActiveLicense;
            return (
              <button
                key={p.id}
                onClick={() => !locked && saveSettings({ voice_provider: p.id })}
                disabled={locked}
                title={locked ? "Solo para miembros" : undefined}
                className={`relative flex flex-col items-center gap-1 px-2 py-3 rounded-xl transition-all duration-200 card-press ${
                  locked
                    ? "bg-bg-soft text-muted opacity-50 cursor-not-allowed border border-border"
                    : isActive
                    ? "bg-primary text-bg"
                    : "bg-bg-soft text-muted hover:text-text border border-border"
                }`}
              >
                {locked && (
                  <span className="absolute top-1.5 right-1.5">
                    <Lock className="w-3 h-3" />
                  </span>
                )}
                <Icon className="w-5 h-5" />
                <span className="text-xs font-bold">{t(p.labelKey)}</span>
                <span className={`text-[10px] leading-tight text-center ${isActive ? "opacity-80" : "opacity-60"}`}>
                  {locked ? "Solo miembros" : t(p.descKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Shuffle className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-bold">{t("voices_random")}</h3>
            <p className="text-xs text-muted">{t("voices_random_desc")}</p>
          </div>
        </div>
        <Switch
          checked={settings.voice_random}
          onChange={() => saveSettings({ voice_random: !settings.voice_random })}
        />
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Headphones className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">{t("voices_language")}</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LANG_FILTERS.map((l) => {
            const isActive = filterLang === l.code;
            return (
              <button
                key={l.code}
                onClick={() => setFilterLang(l.code)}
                className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl transition-all duration-200 card-press ${
                  isActive
                    ? "bg-primary text-bg"
                    : "bg-bg-soft text-muted hover:text-text border border-border"
                }`}
              >
                <span className="text-2xl leading-none">{l.flag}</span>
                <span className="text-[11px] font-semibold">{l.code === "es" ? "Español" : "English"}</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mt-3">
          <GenderChip active={filterGender === "all"} onClick={() => setFilterGender("all")}>{t("voices_all")}</GenderChip>
          <GenderChip active={filterGender === "female"} onClick={() => setFilterGender("female")} icon={<UserRound className="w-3.5 h-3.5" />}>{t("voices_female")}</GenderChip>
          <GenderChip active={filterGender === "male"} onClick={() => setFilterGender("male")} icon={<User className="w-3.5 h-3.5" />}>{t("voices_male")}</GenderChip>
        </div>
      </div>

      {isProviderLocked(provider) && (
        <div className="card border-primary/30 bg-primary/5">
          <div className="flex items-start gap-2">
            <Crown className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-text-soft">
              {t(PROVIDERS.find((p) => p.id === provider)!.labelKey)} es solo para miembros. Mostrando las voces del navegador mientras tanto.
            </p>
          </div>
        </div>
      )}

      {effectiveProvider === "elevenlabs" && voiceManager.elevenlabsVoicesError && (
        <div className="card border-error/40 bg-error/10">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-error-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-error-400">
              No se pudo cargar tu lista de voces de ElevenLabs: {voiceManager.elevenlabsVoicesError}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <label className="label">
          {effectiveProvider === "elevenlabs" && voiceManager.elevenlabsVoicesLoading
            ? "Cargando voces de tu cuenta..."
            : t("voices_count", { n: filteredVoices.length })}
        </label>
        <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin -mr-2 pr-2">
          {filteredVoices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted">{t("voices_no_voices")}</p>
              {effectiveProvider === "browser" && (
                <p className="text-xs text-muted-soft mt-1">{t("voices_browser_hint")}</p>
              )}
            </div>
          ) : (
            filteredVoices.map((v) => {
              const isSelected = settings.voice_id === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => saveSettings({ voice_id: v.id })}
                  className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all duration-150 flex items-center justify-between ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-bg-soft hover:bg-bg-hover"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{v.name}</p>
                      {v.gender === "female" && <span className="badge-pink text-[10px] flex-shrink-0">M</span>}
                      {v.gender === "male" && <span className="badge-blue text-[10px] flex-shrink-0">H</span>}
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">{v.lang}</p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0 ml-2" strokeWidth={2.5} />}
                </button>
              );
            })
          )}
        </div>
      </div>

      <button
        onClick={() => setShowSettings(!showSettings)}
        className="card w-full flex items-center justify-between card-hover"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted" />
          <span className="text-sm font-bold text-text-soft">{t("voices_audio_settings")}</span>
        </div>
        {showSettings ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>

      {showSettings && (
        <div className="card space-y-4 animate-slide-down">
          <Slider label={t("voices_rate")} value={settings.rate} min={0.5} max={2} step={0.1} display={`${settings.rate.toFixed(1)}x`} onChange={(v) => saveSettings({ rate: v })} />
          <Slider label={t("voices_pitch")} value={settings.pitch} min={0} max={2} step={0.1} display={settings.pitch.toFixed(1)} onChange={(v) => saveSettings({ pitch: v })} />
          <Slider label={t("voices_volume")} value={settings.volume} min={0} max={1} step={0.1} display={`${Math.round(settings.volume * 100)}%`} onChange={(v) => saveSettings({ volume: v })} />
        </div>
      )}

      <div className="card flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">{t("voices_test")}</h3>
          <p className="text-xs text-muted mt-0.5">{t("voices_test_desc")}</p>
        </div>
        {speaking ? (
          <button onClick={stop} className="btn-ghost text-error-400">
            <VolumeX className="w-4 h-4" /> {t("voices_stop")}
          </button>
        ) : (
          <button onClick={preview} className="btn-primary">
            <Volume2 className="w-4 h-4" /> {t("voices_play")}
          </button>
        )}
      </div>

      {previewError && (
        <div className="card border-error/40 bg-error/10 animate-slide-down">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-error-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-error-400">{previewError}</p>
          </div>
        </div>
      )}

      {!voiceManager.available && effectiveProvider === "browser" && (
        <div className="card text-center py-12 animate-slide-up">
          <AlertCircle className="w-10 h-10 text-warning-400 mx-auto mb-3" />
          <h3 className="text-base font-bold mb-1">{t("voices_unavailable_title")}</h3>
          <p className="text-sm text-muted">{t("voices_unavailable_desc")}</p>
        </div>
      )}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={`switch-track ${checked ? "switch-on" : ""}`}
    >
      <span className={`switch-thumb ${checked ? "switch-thumb-on" : ""}`} />
    </button>
  );
}

function GenderChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 card-press ${
        active ? "bg-primary text-bg" : "bg-bg-soft text-muted hover:text-text border border-border"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-soft">{label}</span>
        <span className="text-sm font-bold text-primary tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none bg-bg-soft cursor-pointer accent-primary"
      />
    </div>
  );
}
