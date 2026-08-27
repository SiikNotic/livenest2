import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import {
  listSavedChannels, addSavedChannel, removeSavedChannel, touchSavedChannel,
  getMaxSavedChannels, type SavedChannel,
} from "../lib/savedChannels";
import { fetchTikTokAvatar, proxiedAvatar, forgetAvatar } from "../lib/tiktokProfile";
import {
  Bookmark, BookmarkPlus, Trash2, ArrowRightLeft, Loader2, Crown, AlertCircle,
  Plus, Radio, Clock,
} from "lucide-react";

const AVATAR_GRADIENTS = [
  "from-primary/60 to-accent/60",
  "from-fuchsia-500/60 to-purple-500/60",
  "from-amber-500/60 to-orange-500/60",
  "from-emerald-500/60 to-teal-500/60",
  "from-rose-500/60 to-pink-500/60",
];

function gradientFor(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function ChannelsView() {
  const { t } = useI18n();
  const { user, hasActiveLicense } = useAuth();
  const status = useStore((s) => s.status);
  const username = useStore((s) => s.username);
  const connect = useStore((s) => s.connect);
  const disconnect = useStore((s) => s.disconnect);

  const [channels, setChannels] = useState<SavedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Foto de perfil real de cada canal de TikTok; `null` = ese canal no tiene
  // foto (o no se pudo traer) y se queda con las iniciales de siempre.
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const avatarsRequested = useRef<Set<string>>(new Set());

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const maxChannels = getMaxSavedChannels(hasActiveLicense);
  const isCurrentSaved = channels.some((c) => c.username === username.toLowerCase());
  const atLimit = channels.length >= maxChannels;

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setChannels(await listSavedChannels());
    } catch {
      // silently ignore — non-critical UI
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Trae la foto de perfil de TikTok de cada canal guardado. Se pide una sola
  // vez por usuario (el resultado además queda cacheado en localStorage).
  useEffect(() => {
    let cancelled = false;
    for (const c of channels) {
      if (avatarsRequested.current.has(c.username)) continue;
      avatarsRequested.current.add(c.username);
      fetchTikTokAvatar(c.username).then((url) => {
        if (!cancelled) setAvatars((prev) => ({ ...prev, [c.username]: url }));
      });
    }
    return () => { cancelled = true; };
  }, [channels]);

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  };

  const handleAdd = async () => {
    const clean = newUsername.trim().replace(/^@/, "");
    if (!clean) return;
    setAdding(true);
    const { error } = await addSavedChannel(clean);
    setAdding(false);
    if (error) {
      flashError(error);
      return;
    }
    setNewUsername("");
    await refresh();
  };

  const handleSaveCurrent = async () => {
    const { error } = await addSavedChannel(username);
    if (error) {
      flashError(error);
      return;
    }
    await refresh();
  };

  const handleSwitch = async (target: string) => {
    if (target === username.toLowerCase() && isConnected) return;
    setSwitching(target);
    if (isConnected || isConnecting) disconnect();
    await touchSavedChannel(target).catch(() => {});
    await connect(target);
    await refresh();
    setSwitching(null);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await removeSavedChannel(id);
      await refresh();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return t("channels_never_connected");
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) +
      " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!user) {
    return (
      <div className="card text-center py-14 animate-fade-in">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-bg-hover flex items-center justify-center mb-3">
          <Bookmark className="w-6 h-6 text-muted" />
        </div>
        <p className="text-sm text-muted">{t("channels_page_subtitle")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold leading-tight">{t("channels_title")}</h2>
            <p className="text-xs text-muted leading-tight">{t("channels_page_subtitle")}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
          atLimit ? "text-amber-400 border-amber-500/30 bg-amber-500/10" : "text-muted border-border bg-bg-soft"
        }`}>
          {t("channels_count", { n: channels.length, max: maxChannels })}
        </span>
      </div>

      <div className="card">
        <label className="label">{t("channels_add_username")}</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">@</span>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !adding && handleAdd()}
              placeholder={t("chat_user_placeholder")}
              disabled={adding || atLimit}
              className="input pl-8"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || atLimit || !newUsername.trim()}
            className="btn-primary"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t("channels_add_button")}
          </button>
        </div>

        {isConnected && !isCurrentSaved && !atLimit && (
          <button
            onClick={handleSaveCurrent}
            className="btn-ghost text-xs mt-3 w-full justify-center"
          >
            <BookmarkPlus className="w-3.5 h-3.5" /> {t("channels_save")} @{username}
          </button>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg p-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!hasActiveLicense && atLimit && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2.5">
            <Crown className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{t("channels_upgrade_hint")}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      ) : channels.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-bg-hover flex items-center justify-center mb-3">
            <Bookmark className="w-6 h-6 text-muted" />
          </div>
          <p className="text-sm text-muted">{t("channels_empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((c) => {
            const isActive = isConnected && c.username === username.toLowerCase();
            const isBusy = switching === c.username;
            const isDeleting = deleting === c.id;
            const avatar = avatars[c.username] ?? null;
            return (
              <div
                key={c.id}
                className={`card card-hover flex items-center gap-3 transition-all duration-150 ${
                  isActive ? "border-primary/60 bg-primary/5" : ""
                }`}
              >
                <div className="relative w-11 h-11 flex-shrink-0">
                  {avatar ? (
                    <img
                      src={proxiedAvatar(avatar)}
                      alt={c.display_name || `@${c.username}`}
                      className="w-11 h-11 rounded-2xl object-cover border border-border"
                      loading="lazy"
                      onError={() => {
                        forgetAvatar(c.username);
                        setAvatars((prev) => ({ ...prev, [c.username]: null }));
                      }}
                    />
                  ) : (
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradientFor(c.username)} flex items-center justify-center text-sm font-bold text-white`}>
                      {c.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  {isActive && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success-400 ring-2 ring-bg-card flex items-center justify-center">
                      <Radio className="w-2 h-2 text-bg" strokeWidth={3} />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">
                      {c.display_name || `@${c.username}`}
                    </p>
                    {isActive && <span className="badge-success text-[10px] flex-shrink-0">{t("status_connected")}</span>}
                  </div>
                  <p className="text-[11px] text-muted-soft truncate flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {fmtDate(c.last_connected_at)}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {!isActive && (
                    <button
                      onClick={() => handleSwitch(c.username)}
                      disabled={isBusy || isConnecting}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                      title={isConnected ? t("channels_switch") : t("channels_connect_action")}
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={isDeleting}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title={t("channels_delete")}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
