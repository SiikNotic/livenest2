import { useEffect, useState, useCallback } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { ytPlayer, type PlayerState } from "../lib/youtubePlayer";
import { shortenDefaultUsername } from "../lib/voiceManager";
import {
  Music, Play, Pause, SkipForward, ListMusic, X, Youtube, Clock,
  ChevronDown, ChevronUp, Settings2, Plus, Link2, AlertCircle, Volume2, Crown,
  Loader2, CheckCircle2,
} from "lucide-react";
import type { SongRequest } from "../lib/supabase";

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (urlMatch) return urlMatch[1];
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

// Solo se trata como playlist un link tipo .../playlist?list=... — un
// link de un video suelto que de casualidad trae &list= (por venir de
// dentro de una playlist mientras se mira un video) sigue agregando ESE
// video nomás, como antes, sin sorprender a nadie con toda la playlist.
function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!/\/playlist(\?|$)/.test(trimmed)) return null;
  const m = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function MusicView() {
  const { hasActiveLicense } = useAuth();
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const songQueue = useStore((s) => s.songQueue);
  const currentSong = useStore((s) => s.currentSong);
  const skipSong = useStore((s) => s.skipSong);
  const updateSongStatus = useStore((s) => s.updateSongStatus);
  const stopMusic = useStore((s) => s.stopMusic);
  const loadSongQueue = useStore((s) => s.loadSongQueue);
  const addSongByUrl = useStore((s) => s.addSongByUrl);
  const addPlaylistByUrl = useStore((s) => s.addPlaylistByUrl);
  const { t } = useI18n();

  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlNotice, setUrlNotice] = useState<string | null>(null);
  const [addingSong, setAddingSong] = useState(false);
  const [addingPlaylist, setAddingPlaylist] = useState(false);
  const [history, setHistory] = useState<SongRequest[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState>(ytPlayer.getState());

  useEffect(() => {
    return ytPlayer.subscribe(setPlayerState);
  }, []);

  useEffect(() => {
    if (settings?.music_volume !== undefined) {
      ytPlayer.setVolume(settings.music_volume);
    }
  }, [settings?.music_volume]);

  useEffect(() => {
    loadSongQueue();
  }, [loadSongQueue]);

  const togglePlay = useCallback(() => {
    ytPlayer.togglePlay();
  }, []);

  function seekTo(seconds: number) {
    ytPlayer.seekTo(seconds);
  }

  function playSong(song: SongRequest) {
    updateSongStatus(song.id, "playing");
  }

  function removeFromQueue(song: SongRequest) {
    updateSongStatus(song.id, "skipped");
  }

  // Quitar la canción que SUENA AHORA necesita parar el reproductor ya, sin
  // esperar a la base de datos (ver stopMusic en el store) — distinto de
  // quitar una canción que solo espera en la cola.
  function stopCurrent() {
    stopMusic();
  }

  async function handleAddUrl() {
    const input = urlInput.trim();
    if (!input) return;

    const playlistId = extractPlaylistId(input);
    if (playlistId) {
      setAddingPlaylist(true);
      setUrlError(null);
      setUrlNotice(null);
      try {
        const { added, total } = await addPlaylistByUrl(playlistId, t("music_you"));
        if (total === 0) {
          setUrlError(t("music_playlist_empty"));
        } else {
          setUrlNotice(t("music_playlist_added", { added, total }));
          setUrlInput("");
        }
      } catch {
        setUrlError(t("music_playlist_error"));
      } finally {
        setAddingPlaylist(false);
      }
      return;
    }

    const videoId = extractVideoId(input);
    if (!videoId) {
      setUrlError(t("music_invalid_link"));
      return;
    }
    setAddingSong(true);
    setUrlError(null);
    setUrlNotice(null);
    try {
      await addSongByUrl(videoId, t("music_you"));
      setUrlInput("");
    } catch {
      setUrlError(t("music_add_error"));
    } finally {
      setAddingSong(false);
    }
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("song_requests")
      .select("*")
      .in("status", ["played", "skipped"])
      .order("created_at", { ascending: false })
      .limit(30);
    setHistory((data as SongRequest[]) ?? []);
  }

  if (!settings) return <div className="card animate-pulse h-48" />;

  if (!hasActiveLicense) {
    return (
      <div className="card text-center py-14 animate-fade-in">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <Crown className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-sm font-bold mb-1">{t("music_title")}</h2>
        <p className="text-sm text-muted max-w-xs mx-auto">
          {t("music_members_only_desc")}
        </p>
      </div>
    );
  }

  const cmd = settings.music_command;
  const fmtTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center glow-primary">
            <Music className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold">{t("music_title")}</h2>
            <p className="text-xs text-muted">{t("music_subtitle")}</p>
          </div>
        </div>
        <Toggle
          checked={settings.music_enabled}
          onChange={() => saveSettings({ music_enabled: !settings.music_enabled })}
        />
      </div>

      {settings.music_enabled && (
        <>
          <div className="card overflow-hidden p-0">
            <div className="relative w-full aspect-video bg-black rounded-t-2xl overflow-hidden flex items-center justify-center">
              {currentSong && currentSong.video_id ? (
                <img
                  src={`https://img.youtube.com/vi/${currentSong.video_id}/hqdefault.jpg`}
                  alt={currentSong.video_title ?? ""}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted">
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2.5">
                    <Music className="w-6 h-6 text-muted" />
                  </div>
                  <p className="text-xs">{t("music_waiting_song")}</p>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${playerState.isPlaying ? "bg-success-400 animate-pulse-soft" : "bg-muted"}`} />
                  <span className="text-[10px] font-bold tracking-wider text-white/90">
                    {playerState.isPlaying ? t("music_playing") : t("music_paused")}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white truncate">
                  {currentSong?.video_title ?? currentSong?.query ?? t("music_no_song")}
                </p>
                <p className="text-xs text-white/60 truncate">
                  {currentSong?.video_channel ? `${currentSong.video_channel} · ` : ""}
                  {t("music_requested_by", { user: currentSong?.username ?? "" })}
                </p>
              </div>
            </div>

            {currentSong && currentSong.video_id ? (
              <div className="p-4">
                <div className="flex items-center justify-center gap-6 mb-3">
                  <button
                    onClick={skipSong}
                    className="w-10 h-10 rounded-full bg-bg-hover flex items-center justify-center text-muted hover:text-text-soft hover:bg-white/10 transition-colors card-press"
                    title={t("music_skip")}
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="w-14 h-14 rounded-full bg-primary text-bg flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform"
                  >
                    {playerState.isPlaying ? (
                      <Pause className="w-6 h-6" fill="currentColor" />
                    ) : (
                      <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                    )}
                  </button>
                  <button
                    onClick={stopCurrent}
                    className="w-10 h-10 rounded-full bg-bg-hover flex items-center justify-center text-muted hover:text-error-400 hover:bg-error/10 transition-colors card-press"
                    title={t("music_remove")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted tabular-nums mb-3">
                  <span className="w-8 text-right">{fmtTime(playerState.progress)}</span>
                  <input
                    type="range"
                    min={0}
                    max={playerState.duration || 100}
                    step={1}
                    value={playerState.progress}
                    onChange={(e) => seekTo(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 rounded-full appearance-none bg-bg-hover cursor-pointer accent-primary"
                  />
                  <span className="w-8">{fmtTime(playerState.duration)}</span>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Volume2 className="w-4 h-4 text-muted flex-shrink-0" />
                  <span className="text-[11px] text-muted flex-shrink-0">{t("music_music_volume")}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.music_volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      saveSettings({ music_volume: v });
                      ytPlayer.setVolume(v);
                    }}
                    className="flex-1 h-1.5 rounded-full appearance-none bg-bg-hover cursor-pointer accent-primary"
                  />
                  <span className="text-[11px] font-bold text-primary tabular-nums w-8 text-right">
                    {Math.round(settings.music_volume * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-bg-hover flex items-center justify-center mb-3">
                  <Music className="w-6 h-6 text-muted" />
                </div>
                <p className="text-sm text-muted">{t("music_no_song_playing")}</p>
                <p className="text-xs text-muted-soft mt-1">
                  {t("music_when_command", { cmd })}
                </p>
              </div>
            )}

            {playerState.error && (
              <div className="mx-4 mb-4 flex items-start gap-2 text-xs text-error-400 bg-error/10 rounded-xl p-2.5 border border-error/20">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{playerState.error}</span>
              </div>
            )}
          </div>

          <div className="card">
            <label className="label">{t("music_add_by_link")}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                  placeholder={t("music_link_placeholder")}
                  disabled={addingSong || addingPlaylist}
                  className="input pl-9"
                />
              </div>
              <button
                onClick={handleAddUrl}
                disabled={addingSong || addingPlaylist || !urlInput.trim()}
                className="w-11 h-11 flex-shrink-0 rounded-xl bg-primary text-bg flex items-center justify-center shadow-md shadow-primary/25 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-transform"
              >
                {addingSong || addingPlaylist ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-muted-soft mt-1.5">{t("music_playlist_hint")}</p>
            {addingPlaylist && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted bg-bg-soft rounded-lg p-2.5">
                <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />
                <span>{t("music_adding_playlist")}</span>
              </div>
            )}
            {urlError && (
              <div className="mt-2 flex items-start gap-2 text-xs text-error-400 bg-error/10 rounded-lg p-2.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{urlError}</span>
              </div>
            )}
            {urlNotice && (
              <div className="mt-2 flex items-start gap-2 text-xs text-success-400 bg-success-400/10 rounded-lg p-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{urlNotice}</span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Youtube className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-bold">{t("music_how_works")}</h3>
            </div>
            <p className="text-xs text-muted mb-2">
              {t("music_viewers_write")}
            </p>
            <div className="bg-bg-soft rounded-xl px-3 py-2.5 font-mono text-sm text-accent border border-border">
              {cmd} {t("music_command_example_song_name")}
            </div>
            <p className="text-xs text-muted mt-2">
              {t("music_example")} <span className="text-text-soft">{cmd} Don Omar Danza Kuduro</span>
            </p>
            <p className="text-xs text-muted mt-2">
              {t("music_persists")}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-text-soft">{t("music_queue")}</h3>
            </div>
            <span className="badge-muted">{t("music_in_queue", { n: songQueue.length })}</span>
          </div>

          {songQueue.length === 0 && !currentSong ? (
            <div className="card text-center py-10">
              <Music className="w-8 h-8 text-muted mx-auto mb-2" />
              <p className="text-sm text-muted">{t("music_queue_empty")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {songQueue.map((song, i) => (
                <div key={song.id} className="card card-hover flex items-center gap-3 animate-slide-up">
                  <span className="w-7 h-7 rounded-lg bg-bg-hover flex items-center justify-center text-xs font-bold text-muted flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {song.video_title ?? song.query}
                    </p>
                    <p className="text-xs text-muted truncate">
                      @{shortenDefaultUsername(song.username)}
                      {song.video_channel ? ` · ${song.video_channel}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => playSong(song)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                    title={t("music_skip")}
                  >
                    <Play className="w-3.5 h-3.5" fill="currentColor" />
                  </button>
                  <button
                    onClick={() => removeFromQueue(song)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-error-400 hover:bg-error/10 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (!showHistory) loadHistory();
              setShowHistory(!showHistory);
            }}
            className="text-xs text-muted hover:text-text-soft transition-colors flex items-center gap-1"
          >
            <Clock className="w-3.5 h-3.5" />
            {showHistory ? t("music_hide_history") : t("music_history")}
          </button>

          {showHistory && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">{t("music_no_history")}</p>
              ) : (
                history.map((song) => (
                  <div key={song.id} className="card flex items-center gap-3 opacity-60">
                    <span className="w-7 h-7 rounded-lg bg-bg-hover flex items-center justify-center flex-shrink-0">
                      {song.status === "played" ? (
                        <Play className="w-3.5 h-3.5 text-success-400" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-muted" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{song.video_title ?? song.query}</p>
                      <p className="text-xs text-muted">@{shortenDefaultUsername(song.username)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="card w-full flex items-center justify-between card-hover"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted" />
              <span className="text-sm font-bold text-text-soft">{t("music_player_settings")}</span>
            </div>
            {showSettings ? (
              <ChevronUp className="w-4 h-4 text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted" />
            )}
          </button>

          {showSettings && (
            <div className="card space-y-4 animate-slide-down">
              <div>
                <label className="label">{t("music_chat_command")}</label>
                <input
                  type="text"
                  value={settings.music_command}
                  onChange={(e) => saveSettings({ music_command: e.target.value })}
                  placeholder="!song"
                  className="input font-mono"
                />
                <p className="text-[11px] text-muted-soft mt-1.5">
                  {t("music_command_hint")}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text-soft flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" /> {t("music_volume")}
                  </span>
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {Math.round(settings.music_volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.music_volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    saveSettings({ music_volume: v });
                    ytPlayer.setVolume(v);
                  }}
                  className="w-full h-2 rounded-full appearance-none bg-bg-soft cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text-soft">{t("music_max_queue")}</span>
                  <span className="text-sm font-bold text-primary tabular-nums">
                    {settings.max_song_queue}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={settings.max_song_queue}
                  onChange={(e) => saveSettings({ max_song_queue: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none bg-bg-soft cursor-pointer accent-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-text-soft">{t("music_autoplay")}</span>
                <Toggle
                  checked={settings.music_autoplay}
                  onChange={() => saveSettings({ music_autoplay: !settings.music_autoplay })}
                />
              </div>

              <div>
                <label className="label flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-warning" />
                  {t("music_troll_filter")}
                </label>
                <input
                  type="text"
                  value={settings.music_blocked_keywords ?? ""}
                  onChange={(e) => saveSettings({ music_blocked_keywords: e.target.value })}
                  placeholder={t("music_troll_placeholder")}
                  className="input"
                />
                <p className="text-[11px] text-muted-soft mt-1.5">
                  {t("music_troll_hint")}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
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
