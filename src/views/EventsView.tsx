import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { Gift, Heart, UserPlus, Share2, Crown, Users, Trash2, Sparkles } from "lucide-react";
import type { LiveEvent, LiveEventType } from "../lib/supabase";
import { shortenDefaultUsername } from "../lib/voiceManager";

export function EventsView() {
  const events = useStore((s) => s.events);
  const clearEvents = useStore((s) => s.clearEvents);
  const status = useStore((s) => s.status);
  const { t } = useI18n();

  const EVENT_CONFIG: Record<LiveEventType, { icon: typeof Gift; labelKey: import("../lib/i18n").TranslationKey; color: string; bg: string }> = {
    gift: { icon: Gift, labelKey: "event_gift", color: "text-amber-400", bg: "bg-amber-500/10" },
    like: { icon: Heart, labelKey: "event_like", color: "text-pink-400", bg: "bg-pink-500/10" },
    follow: { icon: UserPlus, labelKey: "event_follow", color: "text-primary", bg: "bg-primary/10" },
    share: { icon: Share2, labelKey: "event_share", color: "text-sky-400", bg: "bg-sky-500/10" },
    sub: { icon: Crown, labelKey: "event_sub", color: "text-accent", bg: "bg-accent/10" },
    viewer: { icon: Users, labelKey: "event_viewer", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  };

  const counts = events.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<LiveEventType, number>
  );

  const eventTypes: LiveEventType[] = ["gift", "follow", "like", "share", "sub"];
  const totalEvents = events.length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-text-soft">{t("events_title")}</h2>
        </div>
        {totalEvents > 0 && (
          <button
            onClick={clearEvents}
            className="text-xs text-muted hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> {t("events_clear")}
          </button>
        )}
      </div>

      {totalEvents > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {eventTypes.map((type) => {
            const cfg = EVENT_CONFIG[type];
            const Icon = cfg.icon;
            const count = counts[type] ?? 0;
            return (
              <div key={type} className="card flex flex-col items-center gap-1.5 py-3">
                <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <span className="text-lg font-bold tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {status !== "connected" && totalEvents === 0 ? (
        <div className="card text-center py-14 animate-slide-up">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-bg-hover flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-muted" />
          </div>
          <h3 className="text-base font-bold mb-1">{t("events_no_events_title")}</h3>
          <p className="text-sm text-muted max-w-xs mx-auto">
            {t("events_no_events_desc")}
          </p>
        </div>
      ) : totalEvents === 0 ? (
        <div className="card text-center py-12">
          <div className="w-11 h-11 mx-auto rounded-2xl bg-bg-hover flex items-center justify-center mb-3">
            <Gift className="w-5 h-5 text-muted" />
          </div>
          <p className="text-sm text-muted">{t("events_waiting")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => (
            <EventRow key={evt.id} event={evt} />
          ))}
        </div>
      )}
    </div>
  );

  function EventRow({ event }: { event: LiveEvent }) {
    const cfg = EVENT_CONFIG[event.type];
    const Icon = cfg.icon;
    const time = new Date(event.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    let detail = t(cfg.labelKey);
    if (event.type === "gift" && event.detail) {
      detail = `${event.detail}${event.count > 1 ? ` x${event.count}` : ""}`;
    } else if (event.type === "like" && event.count > 1) {
      detail = `${t("event_like")} x${event.count}`;
    } else if (event.type === "sub" && event.detail) {
      detail = `${t("event_sub")} ${event.detail}`;
    }

    return (
      <div className="card card-hover flex items-center gap-3 animate-slide-up">
        <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">@{shortenDefaultUsername(event.username)}</span>
            <span className="text-[10px] text-muted-soft ml-auto tabular-nums">{time}</span>
          </div>
          <p className={`text-sm ${cfg.color} font-medium`}>{detail}</p>
        </div>
      </div>
    );
  }
}
