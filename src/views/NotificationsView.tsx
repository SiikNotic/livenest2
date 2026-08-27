import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { soundManager, isCustomSoundUrl, type SoundType } from "../lib/soundManager";
import { uploadAlertSound } from "../lib/supabase";
import {
  Bell, Volume2, Gift, Heart, UserPlus, Share2, Crown,
  Play, Mic, ChevronRight, Upload, Loader2, RotateCcw, Lock,
} from "lucide-react";
import { useRef, useState } from "react";

const SOUND_VALUES: SoundType[] = [
  "chime", "pop", "bell", "coin", "ding", "whoosh", "sparkle", "buzzer",
  "success", "error", "notify", "heartbeat", "laser", "bubble", "click", "fanfare",
  "airhorn", "clap", "cash", "explosion", "levelup", "rimshot", "alarm", "tada",
  "drumroll", "boing", "zap", "rainbow", "powerup", "gameover", "siren", "whistle", "none",
];

const SOUND_ICONS: Record<SoundType, string> = {
  chime: "🔔", pop: "🫧", bell: "🛎️", coin: "🪙", ding: "✨", whoosh: "💨",
  sparkle: "⭐", buzzer: "🚨", success: "✅", error: "❌", notify: "📢",
  heartbeat: "❤️", laser: "🔫", bubble: "🔵", click: "🖱️", fanfare: "🎺",
  airhorn: "📯", clap: "👏", cash: "💰", explosion: "💥", levelup: "🆙",
  rimshot: "🥁", alarm: "⏰", tada: "🎉", drumroll: "🥁", boing: "🌀",
  zap: "⚡", rainbow: "🌈", powerup: "🎮", gameover: "👾", siren: "🚓",
  whistle: "📢", none: "🔇",
};

const SOUND_LABEL_KEYS: Record<SoundType, import("../lib/i18n").TranslationKey> = {
  chime: "snd_chime", pop: "snd_pop", bell: "snd_bell", coin: "snd_coin",
  ding: "snd_ding", whoosh: "snd_whoosh", sparkle: "snd_sparkle", buzzer: "snd_buzzer",
  success: "snd_success", error: "snd_error", notify: "snd_notify", heartbeat: "snd_heartbeat",
  laser: "snd_laser", bubble: "snd_bubble", click: "snd_click", fanfare: "snd_fanfare",
  airhorn: "snd_airhorn", clap: "snd_clap", cash: "snd_cash", explosion: "snd_explosion",
  levelup: "snd_levelup", rimshot: "snd_rimshot", alarm: "snd_alarm", tada: "snd_tada",
  drumroll: "snd_drumroll", boing: "snd_boing", zap: "snd_zap", rainbow: "snd_rainbow",
  powerup: "snd_powerup", gameover: "snd_gameover", siren: "snd_siren", whistle: "snd_whistle",
  none: "snd_none",
};

const EVENTS = [
  { key: "notif_gift_sound", icon: Gift, color: "text-amber-400", bg: "bg-amber-500/10", labelKey: "notif_gifts" as const },
  { key: "notif_follow_sound", icon: UserPlus, color: "text-primary", bg: "bg-primary/10", labelKey: "notif_followers" as const },
  { key: "notif_like_sound", icon: Heart, color: "text-pink-400", bg: "bg-pink-500/10", labelKey: "notif_likes" as const },
  { key: "notif_share_sound", icon: Share2, color: "text-sky-400", bg: "bg-sky-500/10", labelKey: "notif_shares" as const },
  { key: "notif_sub_sound", icon: Crown, color: "text-accent", bg: "bg-accent/10", labelKey: "notif_subs" as const },
] as const;

const VOICE_EVENTS = [
  { key: "notif_voice_gift", icon: Gift, color: "text-amber-400", labelKey: "notif_gifts" as const },
  { key: "notif_voice_follow", icon: UserPlus, color: "text-primary", labelKey: "notif_followers" as const },
  { key: "notif_voice_sub", icon: Crown, color: "text-accent", labelKey: "notif_subs" as const },
] as const;

export function NotificationsView() {
  const { hasActiveLicense } = useAuth();
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const { t } = useI18n();

  if (!settings) return <div className="card animate-pulse h-48" />;

  const preview = (value: string) => {
    soundManager.setVolume(settings.notif_volume);
    if (isCustomSoundUrl(value)) {
      soundManager.playUrl(value);
    } else {
      soundManager.play(value as SoundType);
    }
  };

  const handleUpload = async (eventKey: string, file: File | undefined) => {
    if (!file) return;
    if (!hasActiveLicense) {
      setUploadError("Subir sonidos personalizados es solo para miembros.");
      return;
    }
    setUploadError(null);
    setUploadingKey(eventKey);
    try {
      const url = await uploadAlertSound(file, eventKey);
      soundManager.preloadUrl(url);
      await saveSettings({ [eventKey]: url } as any);
      preview(url);
    } catch (err: any) {
      setUploadError(err?.message || "No se pudo subir el sonido.");
    } finally {
      setUploadingKey(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-bold">{t("notif_title")}</h2>
            <p className="text-xs text-muted">{t("notif_subtitle")}</p>
          </div>
        </div>
        <Switch
          checked={settings.notif_sound_enabled}
          onChange={() => saveSettings({ notif_sound_enabled: !settings.notif_sound_enabled })}
        />
      </div>

      {settings.notif_sound_enabled && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">{t("notif_volume")}</span>
              </div>
              <span className="text-sm font-semibold text-primary tabular-nums">
                {Math.round(settings.notif_volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.notif_volume}
              onChange={(e) => saveSettings({ notif_volume: parseFloat(e.target.value) })}
              className="w-full h-2 rounded-full appearance-none bg-bg-soft cursor-pointer accent-primary"
            />
          </div>

          <div>
            <label className="label px-1 mb-2">{t("notif_by_event")}</label>
            <div className="space-y-2">
              {EVENTS.map((evt) => {
                const Icon = evt.icon;
                const rawValue = (settings as any)[evt.key] as string;
                const isCustom = isCustomSoundUrl(rawValue);
                const isExpanded = activeEvent === evt.key;
                const isUploading = uploadingKey === evt.key;

                return (
                  <div key={evt.key} className="card p-0 overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <div className={`w-10 h-10 rounded-xl ${evt.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${evt.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-text-soft">{t(evt.labelKey)}</p>
                        <p className="text-xs text-muted flex items-center gap-1">
                          <span>{isCustom ? "🎵" : SOUND_ICONS[rawValue as SoundType]}</span>
                          <span className="truncate">
                            {isCustom ? t("notif_custom_sound") : t(SOUND_LABEL_KEYS[rawValue as SoundType])}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => preview(rawValue)}
                        className="w-9 h-9 rounded-lg bg-bg-soft border border-border text-muted hover:text-accent flex items-center justify-center transition-colors flex-shrink-0"
                        title={t("notif_test")}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setActiveEvent(isExpanded ? null : evt.key)}
                        className="w-9 h-9 rounded-lg bg-bg-soft border border-border text-muted hover:text-primary flex items-center justify-center transition-colors flex-shrink-0"
                        title={t("notif_change_sound")}
                      >
                        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-3 pb-3 animate-slide-down space-y-3">
                        <input
                          ref={(el) => { fileInputs.current[evt.key] = el; }}
                          type="file"
                          accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                          className="hidden"
                          disabled={!hasActiveLicense}
                          onChange={(e) => handleUpload(evt.key, e.target.files?.[0])}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => hasActiveLicense && fileInputs.current[evt.key]?.click()}
                            disabled={isUploading || !hasActiveLicense}
                            className="btn-ghost flex-1 text-xs disabled:opacity-60"
                            title={!hasActiveLicense ? "Solo para miembros" : undefined}
                          >
                            {isUploading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : !hasActiveLicense ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            {isUploading ? t("notif_uploading") : t("notif_upload_custom")}
                          </button>
                          {isCustom && (
                            <button
                              onClick={() => saveSettings({ [evt.key]: "chime" } as any)}
                              className="btn-ghost text-xs px-3"
                              title={t("notif_use_builtin")}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {!hasActiveLicense && (
                          <p className="text-[10px] text-amber-400 px-1 flex items-center gap-1">
                            <Crown className="w-3 h-3 flex-shrink-0" /> Sonidos personalizados: solo para miembros
                          </p>
                        )}
                        <p className="text-[10px] text-muted px-1">{t("notif_custom_hint")}</p>

                        <div className="grid grid-cols-3 gap-1.5">
                          {SOUND_VALUES.map((val) => {
                            const isActive = !isCustom && rawValue === val;
                            return (
                              <button
                                key={val}
                                onClick={() => {
                                  saveSettings({ [evt.key]: val } as any);
                                  preview(val);
                                }}
                                className={`flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-lg transition-all duration-150 card-press ${
                                  isActive
                                    ? "bg-accent text-bg"
                                    : "bg-bg-soft text-muted hover:text-text border border-border"
                                }`}
                              >
                                <span className="text-base leading-none">{SOUND_ICONS[val]}</span>
                                <span className="text-[9px] font-semibold leading-tight text-center">{t(SOUND_LABEL_KEYS[val])}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {uploadError && (
                <p className="text-xs text-red-400 px-1">{uploadError}</p>
              )}
            </div>
          </div>
        </>
      )}

      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Mic className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-bold">{t("notif_voice_title")}</h2>
            <p className="text-xs text-muted">{t("notif_voice_subtitle")}</p>
          </div>
        </div>
        <Switch
          checked={settings.notif_voice_enabled}
          onChange={() => saveSettings({ notif_voice_enabled: !settings.notif_voice_enabled })}
        />
      </div>

      {settings.notif_voice_enabled && (
        <div className="card space-y-2.5 animate-slide-down">
          <p className="text-xs text-muted mb-1">{t("notif_voice_choose")}</p>
          {VOICE_EVENTS.map((evt) => {
            const Icon = evt.icon;
            const checked = (settings as any)[evt.key] as boolean;
            return (
              <div key={evt.key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${evt.color}`} />
                  <span className="text-sm text-text-soft">{t(evt.labelKey)}</span>
                </div>
                <Switch
                  checked={checked}
                  onChange={() => saveSettings({ [evt.key]: !checked } as any)}
                />
              </div>
            );
          })}
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
