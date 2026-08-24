import { useState, memo, useEffect } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { ytPlayer, type PlayerState } from "../lib/youtubePlayer";
import { Play, Square, Trash2, Volume2, AlertCircle, Loader2, Tv, RefreshCw, Music, Pause, SkipForward, X } from "lucide-react";

export function ChatView() {
  const status = useStore((s) => s.status);
  const username = useStore((s) => s.username);
  const messages = useStore((s) => s.messages);
  const connect = useStore((s) => s.connect);
  const disconnect = useStore((s) => s.disconnect);
  const clearMessages = useStore((s) => s.clearMessages);
  const speakMessage = useStore((s) => s.speakMessage);
  const error = useStore((s) => s.error);
  const isSpeaking = useStore((s) => s.isSpeaking);
  const notLiveUser = useStore((s) => s.notLiveUser);
  const reconnecting = useStore((s) => s.reconnecting);
  const { t } = useI18n();

  const [connectInput, setConnectInput] = useState("");
  const [playerState, setPlayerState] = useState<PlayerState>(ytPlayer.getState());
  const currentSong = useStore((s) => s.currentSong);
  const skipSong = useStore((s) => s.skipSong);
  const stopMusic = useStore((s) => s.stopMusic);

  useEffect(() => {
    return ytPlayer.subscribe(setPlayerState);
  }, []);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const showMiniPlayer = !!currentSong && !!currentSong.video_id;

  return (
    <div className="space-y-4 animate-fade-in">
      {showMiniPlayer && (
        <MiniPlayer
          title={currentSong!.video_title ?? currentSong!.query}
          channel={currentSong!.video_channel ?? ""}
          username={currentSong!.username}
          isPlaying={playerState.isPlaying}
          progress={playerState.progress}
          duration={playerState.duration}
          videoId={currentSong!.video_id!}
          onTogglePlay={() => ytPlayer.togglePlay()}
          onSkip={() => skipSong()}
          onRemove={() => stopMusic()}
          onSeek={(s) => ytPlayer.seekTo(s)}
        />
      )}

      {notLiveUser && (
        <div className="card border-amber-500/40 bg-amber-500/10 animate-slide-down">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Tv className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-400">{t("chat_not_live_title")}</h3>
              <p className="text-xs text-muted mt-0.5">
                {t("chat_not_live_desc", { user: notLiveUser })}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <label className="label">{t("chat_tiktok_user")}</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">@</span>
            <input
              type="text"
              value={isConnected ? username : connectInput}
              onChange={(e) => setConnectInput(e.target.value)}
              disabled={isConnected || isConnecting}
              placeholder={t("chat_user_placeholder")}
              className="input pl-8"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isConnected && !isConnecting) connect(connectInput);
              }}
            />
          </div>
          {isConnected ? (
            <button onClick={disconnect} className="btn-ghost text-red-400 hover:bg-red-500/10">
              <Square className="w-4 h-4" /> {t("chat_stop")}
            </button>
          ) : (
            <button
              onClick={() => connect(connectInput)}
              disabled={isConnecting}
              className="btn-primary animate-pulse-glow"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isConnecting ? "" : t("chat_connect")}
            </button>
          )}
        </div>

        {reconnecting && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2.5 animate-fade-in">
            <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
            <span>{t("chat_reconnecting")}</span>
          </div>
        )}

        {error && !reconnecting && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg p-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isConnected && (
          <div className="mt-3 flex items-center justify-end">
            <span className="text-xs text-muted">{t("chat_messages_count", { n: messages.length })}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-soft">{t("chat_live_messages")}</h2>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="text-xs text-muted hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> {t("chat_clear")}
          </button>
        )}
      </div>

      {!isConnected ? (
        <EmptyChat />
      ) : messages.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-bg-hover flex items-center justify-center mb-3">
            <Volume2 className="w-6 h-6 text-muted" />
          </div>
          <p className="text-sm text-muted">{t("chat_waiting")}</p>
          <p className="text-xs text-muted-soft mt-1">{t("chat_waiting_hint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onSpeak={() => speakMessage(m)}
              disabled={isSpeaking}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniPlayer({
  title, channel, username, isPlaying, progress, duration, videoId,
  onTogglePlay, onSkip, onRemove, onSeek,
}: {
  title: string; channel: string; username: string; isPlaying: boolean;
  progress: number; duration: number; videoId: string;
  onTogglePlay: () => void; onSkip: () => void; onRemove: () => void; onSeek: (s: number) => void;
}) {
  const { t } = useI18n();
  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  return (
    <div className="card p-0 overflow-hidden animate-slide-down">
      <div className="flex items-center gap-3 p-3">
        <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-black">
          <img
            src={`https://img.youtube.com/vi/${videoId}/default.jpg`}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Music className="w-5 h-5 text-white/80" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{title}</p>
          <p className="text-[11px] text-muted truncate">
            {channel ? `${channel} · ` : ""}@{username}
          </p>
        </div>
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-full bg-primary text-bg flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
        </button>
        <button onClick={onSkip} className="text-muted hover:text-text-soft transition-colors p-1.5 flex-shrink-0" title={t("music_skip")}>
          <SkipForward className="w-4 h-4" />
        </button>
        <button onClick={onRemove} className="text-muted hover:text-error-400 transition-colors p-1.5 flex-shrink-0" title={t("music_remove")}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2.5 text-[10px] text-muted tabular-nums">
        <span className="w-8 text-right">{fmt(progress)}</span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={1}
          value={progress}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="flex-1 h-1 rounded-full appearance-none bg-bg-hover cursor-pointer accent-primary"
        />
        <span className="w-8">{fmt(duration)}</span>
      </div>
    </div>
  );
}

function EmptyChat() {
  const { t } = useI18n();
  return (
    <div className="card text-center py-14 animate-slide-up">
      <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
        <Play className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-base font-bold mb-1">{t("chat_connect_title")}</h3>
      <p className="text-sm text-muted max-w-xs mx-auto">{t("chat_connect_desc")}</p>
    </div>
  );
}

// TikTok's CDN commonly blocks hot-linked <img> loads from other origins
// (the avatar URL is signed/tied to a referrer or session), so even when
// we correctly extract the URL, the browser's request gets rejected and
// onError silently falls back to initials. Route it through a public
// image proxy that fetches server-side (its own referrer) and returns a
// small, cached thumbnail — this is what actually makes the photo show.
function proxiedAvatar(url: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=96&h=96&fit=cover&default=1`;
}

const MessageBubble = memo(function MessageBubble({
  message,
  onSpeak,
  disabled,
}: {
  message: { username: string; nickname?: string | null; avatar?: string | null; message: string; skipped: boolean; read_at: string | null; created_at: string };
  onSpeak: () => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const displayName = message.nickname || message.username;
  const showAvatarImg = !!message.avatar && !avatarFailed;

  return (
    <div
      className={`card card-hover flex items-start gap-3 animate-slide-up ${
        message.skipped ? "opacity-50" : ""
      }`}
    >
      {showAvatarImg ? (
        <img
          src={proxiedAvatar(message.avatar!)}
          alt={displayName}
          className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-border"
          loading="lazy"
          onError={() => setAvatarFailed(true)}
        />
      ) : (
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-sm font-bold flex-shrink-0 border border-border">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-text">{displayName}</span>
          <span className="text-xs text-muted-soft">@{message.username}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 mb-1 flex-wrap">
          <span className="text-[10px] text-muted-soft">{time}</span>
          {message.skipped ? (
            <span className="badge-danger">{t("chat_filtered")}</span>
          ) : message.read_at ? (
            <span className="badge-success">{t("chat_read")}</span>
          ) : null}
        </div>
        <p className="text-sm text-text-soft break-words">{message.message}</p>
      </div>
      {!message.skipped && (
        <button
          onClick={onSpeak}
          disabled={disabled}
          className="text-muted hover:text-primary transition-colors flex-shrink-0 p-1.5"
          title={t("chat_read_aloud")}
        >
          <Volume2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});
