import { useEffect, useRef, useState } from "react";
import { useStore } from "./lib/store";
import { ytPlayer } from "./lib/youtubePlayer";
import { ChatView } from "./views/ChatView";
import { ChannelsView } from "./views/ChannelsView";
import { VoicesView } from "./views/VoicesView";
import { FiltersView } from "./views/FiltersView";
import { TemplatesView } from "./views/TemplatesView";
import { EventsView } from "./views/EventsView";
import { MusicView } from "./views/MusicView";
import { NotificationsView } from "./views/NotificationsView";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { DesktopDashboard } from "./components/DesktopDashboard";
import { TabletDashboard } from "./components/TabletDashboard";
import { GeneralView } from "./views/GeneralView";
import { AuthView } from "./views/AuthView";
import { UserPanelView } from "./views/UserPanelView";
import { AdminView } from "./views/AdminView";
import { useAuth } from "./lib/auth";
import { Loader2 } from "lucide-react";

export type TabId = "chat" | "channels" | "events" | "music" | "notifications" | "voices" | "filters" | "templates" | "general" | "account" | "admin";

const MAIN_TABS: TabId[] = ["chat", "events", "music"];

export default function App() {
  const [tab, setTab] = useState<TabId>("chat");
  const { user, loading, isAdmin } = useAuth();
  const loadSettings = useStore((s) => s.loadSettings);
  const loadFilters = useStore((s) => s.loadFilters);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const loadEvents = useStore((s) => s.loadEvents);
  const loadSongQueue = useStore((s) => s.loadSongQueue);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSettings();
    loadFilters();
    loadTemplates();
    loadEvents();
    loadSongQueue();
  }, [user, loadSettings, loadFilters, loadTemplates, loadEvents, loadSongQueue]);

  useEffect(() => {
    if (playerContainerRef.current) {
      ytPlayer.attachContainer(playerContainerRef.current);
    }
  }, [loading]);

  const settings = useStore((s) => s.settings);
  const currentSong = useStore((s) => s.currentSong);
  const songQueue = useStore((s) => s.songQueue);
  const updateSongStatus = useStore((s) => s.updateSongStatus);

  useEffect(() => {
    if (!settings?.music_enabled) return;
    if (!currentSong && songQueue.length > 0) {
      updateSongStatus(songQueue[0].id, "playing");
    }
  }, [songQueue, currentSong, settings?.music_enabled, updateSongStatus]);

  useEffect(() => {
    const vid = currentSong?.video_id ?? null;
    if (vid) {
      ytPlayer.loadQueueVideo(vid);
    } else {
      ytPlayer.endQueue();
    }
  }, [currentSong?.id, currentSong?.video_id]);

  // Use a ref for the onEnded callback so it always has the latest currentSong
  // without needing to re-register the listener on every song change.
  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;
  const songQueueRef = useRef(songQueue);
  songQueueRef.current = songQueue;

  useEffect(() => {
    ytPlayer.setOnEnded(() => {
      const song = currentSongRef.current;
      if (!song) return;
      // Si no queda nada más en la cola, parar el reproductor YA MISMO —
      // sincrónico, antes de esperar la respuesta de la base de datos.
      // updateSongStatus tarda un ratito en volver (viaje de red), y en
      // ese hueco el iframe de YouTube puede arrancar solo su pantalla de
      // "próximo vídeo" — que en un canal con pocos vídeos subidos suele
      // proponer el MISMO vídeo que acaba de terminar. Así se veía como
      // que "la canción se repite": no era nuestro código recargándola,
      // era YouTube autorreproduciendo su propia sugerencia mientras
      // nuestro stop() todavía viajaba por la red. Deteniéndolo aquí, sin
      // await de por medio, no le queda ventana para hacerlo.
      if (songQueueRef.current.length === 0) {
        ytPlayer.stop();
      }
      updateSongStatus(song.id, "played");
    });
    return () => ytPlayer.setOnEnded(null);
  }, [updateSongStatus]);

  const isDashboard = MAIN_TABS.includes(tab);

  useEffect(() => {
    const theme = settings?.theme ?? "midnight";
    document.documentElement.setAttribute("data-theme", theme);
  }, [settings?.theme]);

  // Redirect non-admin away from admin tab
  useEffect(() => {
    if (tab === "admin" && !isAdmin && !loading) {
      setTab("chat");
    }
  }, [tab, isAdmin, loading]);

  // Cualquier vista puede pedir mostrar la pantalla de membresía llamando a
  // requestUpgrade() (ver src/components/PremiumLock.tsx) sin necesitar
  // props de navegación — solo escuchamos el evento aquí.
  useEffect(() => {
    const onRequestUpgrade = () => setTab("account");
    window.addEventListener("livenest:request-upgrade", onRequestUpgrade);
    return () => window.removeEventListener("livenest:request-upgrade", onRequestUpgrade);
  }, []);

  // After a successful login (email/password or Google), send the user to
  // the main dashboard instead of leaving them on the auth screen.
  const wasLoggedOutRef = useRef(!user);
  useEffect(() => {
    if (loading) return;
    if (user && wasLoggedOutRef.current && tab === "account") {
      setTab("chat");
    }
    wasLoggedOutRef.current = !user;
  }, [user, loading, tab]);

  // Show loading screen while auth initializes
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex relative">
      <div className="fixed overflow-hidden pointer-events-none" style={{ left: -9999, top: -9999, width: 200, height: 200 }} aria-hidden>
        <div ref={playerContainerRef} style={{ width: 200, height: 200 }} />
      </div>

      <Sidebar active={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header active={tab} onChange={setTab} />

        {tab === "account" ? (
          <main className="flex-1 overflow-y-auto">
            {user ? <UserPanelView /> : <AuthView />}
          </main>
        ) : tab === "admin" && isAdmin ? (
          <main className="flex-1 px-4 pt-2 pb-6 lg:px-6 overflow-y-auto">
            <AdminView />
          </main>
        ) : isDashboard ? (
          <>
            <main className="hidden lg:block flex-1 overflow-hidden">
              <DesktopDashboard />
            </main>
            <main className="hidden md:block lg:hidden flex-1 overflow-hidden">
              <TabletDashboard />
            </main>
            <main className="md:hidden flex-1 px-4 pt-2 pb-6 overflow-y-auto">
              <div className="max-w-md mx-auto w-full">
                {tab === "chat" && <ChatView />}
                {tab === "events" && <EventsView />}
                {tab === "music" && <MusicView />}
              </div>
            </main>
          </>
        ) : (
          <main className="flex-1 px-4 pt-2 pb-6 lg:px-6 overflow-y-auto">
            <div className="max-w-2xl md:max-w-3xl mx-auto w-full">
              {tab === "channels" && <ChannelsView />}
              {tab === "notifications" && <NotificationsView />}
              {tab === "voices" && <VoicesView />}
              {tab === "filters" && <FiltersView />}
              {tab === "templates" && <TemplatesView />}
              {tab === "general" && <GeneralView />}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
