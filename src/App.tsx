import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useStore } from "./lib/store";
import { ytPlayer } from "./lib/youtubePlayer";
import { ChatView } from "./views/ChatView";
import { ChannelsView } from "./views/ChannelsView";
import { VoicesView } from "./views/VoicesView";
import { ReadingView } from "./views/ReadingView";
import { EventsView } from "./views/EventsView";
import { MusicView } from "./views/MusicView";
import { NotificationsView } from "./views/NotificationsView";
import { Header } from "./components/Header";
import { PageTransition } from "./motion";
import { MusicDock } from "./components/MusicDock";
import { Sidebar } from "./components/Sidebar";
import { DesktopDashboard } from "./components/DesktopDashboard";
import { TabletDashboard } from "./components/TabletDashboard";
import { GeneralView } from "./views/GeneralView";
import { AuthView } from "./views/AuthView";
import { UserPanelView } from "./views/UserPanelView";
import { AdminView } from "./views/AdminView";
import { ResetPasswordView } from "./views/ResetPasswordView";
import { UsernameRequiredView } from "./views/UsernameRequiredView";
import { AgeConfirmationRequiredView } from "./views/AgeConfirmationRequiredView";
import { LandingPage } from "./views/LandingPage";
import { OnboardingView } from "./views/OnboardingView";
import { hasSeenOnboarding } from "./components/onboarding/onboardingScreens";
import { useAuth } from "./lib/auth";

export type TabId = "chat" | "channels" | "events" | "music" | "notifications" | "voices" | "reading" | "general" | "account" | "admin";

const MAIN_TABS: TabId[] = ["chat", "events", "music"];

export default function App() {
  const [tab, setTab] = useState<TabId>("chat");
  const { user, profile, loading, isAdmin, passwordRecovery } = useAuth();
  // La landing (marketing) solo tiene sentido en la web — quien ya
  // instaló la app nativa no necesita que le vendan LiveNest, va derecho
  // al login. En la web, si la URL trae un hash de Supabase (link de
  // recuperación vencido, o restos de un callback OAuth) también se salta
  // — si no, ese error/token nunca llega a AuthView, que es quien sabe
  // mostrarlo.
  const [showAuth, setShowAuth] = useState(() => {
    if (Capacitor.isNativePlatform()) return true;
    if (typeof window !== "undefined" && /error=|access_token=/.test(window.location.hash)) return true;
    return false;
  });
  // El onboarding cinematográfico se muestra una sola vez por cuenta —
  // null mientras no sabemos todavía (evita un parpadeo "sin onboarding →
  // con onboarding" apenas carga `user`). Se decide recién cuando ya
  // pasamos los demás gates (username/fecha de nacimiento confirmados),
  // así nunca se le muestra a alguien que todavía ni terminó de crear la
  // cuenta.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const loadSettings = useStore((s) => s.loadSettings);
  const loadFilters = useStore((s) => s.loadFilters);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const loadEvents = useStore((s) => s.loadEvents);
  const loadSongQueue = useStore((s) => s.loadSongQueue);
  const loadTtsUsage = useStore((s) => s.loadTtsUsage);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSettings();
    loadFilters();
    loadTemplates();
    loadEvents();
    loadSongQueue();
    loadTtsUsage();
  }, [user, loadSettings, loadFilters, loadTemplates, loadEvents, loadSongQueue, loadTtsUsage]);

  // Se decide una sola vez por sesión, recién cuando ya hay username y
  // fecha de nacimiento confirmados (profile.username/birth_date) — antes
  // de eso no tiene sentido ni se llega a ver, esos gates devuelven antes.
  useEffect(() => {
    if (!user || !profile?.username || !profile?.birth_date) return;
    if (showOnboarding === null) setShowOnboarding(!hasSeenOnboarding(user.id));
  }, [user, profile?.username, profile?.birth_date, showOnboarding]);

  useEffect(() => {
    if (playerContainerRef.current) {
      ytPlayer.attachContainer(playerContainerRef.current);
    }
  }, [loading]);

  const settings = useStore((s) => s.settings);
  const currentSong = useStore((s) => s.currentSong);
  const songQueue = useStore((s) => s.songQueue);
  const updateSongStatus = useStore((s) => s.updateSongStatus);
  const connectionStatus = useStore((s) => s.status);
  const maybeQueueFallbackSong = useStore((s) => s.maybeQueueFallbackSong);

  useEffect(() => {
    // Red de seguridad para cuando la cola tiene canciones pero ninguna
    // está marcada "playing" (ej. tras recargar la página con un estado
    // raro en la base). No debe pisar el ajuste de "Reproducir
    // automáticamente": sin este chequeo, una canción pedida por chat
    // arrancaba sola igual aunque el usuario tuviera el autoplay
    // desactivado — store.ts ya respeta ese ajuste al insertar una
    // canción nueva, pero este efecto lo ignoraba por completo.
    if (!settings?.music_enabled || !settings?.music_autoplay) return;
    if (!currentSong && songQueue.length > 0) {
      updateSongStatus(songQueue[0].id, "playing");
      return;
    }
    // Cola del todo vacía — si hay una lista de respaldo activada, que
    // suene algo de ahí en vez de quedarse en silencio. Solo mientras se
    // está conectado de verdad: sin esto, la música arrancaría sola por
    // estar sentado en Ajustes/Música antes de siquiera transmitir.
    if (!currentSong && songQueue.length === 0 && connectionStatus === "connected") {
      maybeQueueFallbackSong();
    }
  }, [songQueue, currentSong, settings?.music_enabled, settings?.music_autoplay, connectionStatus, updateSongStatus, maybeQueueFallbackSong]);

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

  // Pantalla de carga mientras arranca la sesión: un esqueleto que ya
  // dibuja la forma real del header + lista de mensajes, en vez de un
  // spinner sobre fondo vacío — reduce el "salto" de layout cuando el
  // contenido de verdad aparece y da una sensación de carga más rápida.
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-bg">
        <div className="glass sticky top-0 z-30 px-4 pt-3.5 pb-3 safe-top">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-bg-soft animate-pulse" />
              <div className="space-y-1.5">
                <div className="w-20 h-3.5 rounded bg-bg-soft animate-pulse" />
                <div className="w-14 h-2.5 rounded bg-bg-soft animate-pulse" />
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-bg-soft animate-pulse" />
          </div>
        </div>
        <div className="flex-1 px-4 pt-4 space-y-3 max-w-md mx-auto w-full">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card flex items-start gap-3">
              <div className="w-11 h-11 rounded-full bg-bg-soft animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="w-1/3 h-3 rounded bg-bg-soft animate-pulse" />
                <div className="w-2/3 h-3 rounded bg-bg-soft animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // El link de "recuperar contraseña" deja una sesión temporal activa (por
  // eso NO alcanza con el gate de !user de abajo) — hay que interceptarla
  // acá, antes que cualquier otra cosa, para que el usuario elija su nueva
  // contraseña en vez de caer derecho al dashboard con una sesión que en
  // realidad solo debería servir para ese único propósito.
  if (passwordRecovery) {
    return (
      <div className="min-h-screen flex flex-col">
        <ResetPasswordView />
      </div>
    );
  }

  // Sin cuenta, no hay nada que mostrar — todas las pestañas dependen de
  // datos por usuario (settings, filtros, plantillas...), así que antes un
  // visitante sin loguearse podía abrir el menú y navegar a Música/Alertas/
  // Voces igual, y esas vistas se quedaban en un loader infinito porque
  // loadSettings()/loadFilters()/etc. nunca corren sin sesión. Ahora se
  // pide iniciar sesión o registrarse antes de ver cualquier otra cosa.
  if (!user) {
    if (!showAuth) {
      return <LandingPage onLaunch={() => setShowAuth(true)} />;
    }
    return (
      <div className="min-h-screen flex flex-col">
        <AuthView />
      </div>
    );
  }

  // Cuentas de Google nuevas (y cuentas viejas de antes de que username
  // fuera obligatorio) llegan hasta acá sin username — no se las deja
  // seguir hasta que elijan uno, así queda garantizado en todo el resto de
  // la app que profile.username siempre existe para cualquier usuario
  // logueado.
  if (!profile?.username) {
    return (
      <div className="min-h-screen flex flex-col">
        <UsernameRequiredView />
      </div>
    );
  }

  // Mismo motivo que el gate de arriba: las cuentas de Google/Discord nunca
  // pasan por el formulario de registro de LiveNest, así que nunca llega a
  // pedírseles la fecha de nacimiento ahí. Se las frena acá hasta que la
  // confirmen — confirm_birth_date() (RPC) vuelve a chequear la edad mínima
  // y el consentimiento parental server-side, no solo en este formulario.
  if (!profile?.birth_date) {
    return (
      <div className="min-h-screen flex flex-col">
        <AgeConfirmationRequiredView />
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingView userId={user.id} onDone={() => setShowOnboarding(false)} />;
  }

  return (
    <div className={`min-h-screen flex relative ${Capacitor.isNativePlatform() ? "" : "ln-premium-web"}`}>
      <div className="fixed overflow-hidden pointer-events-none" style={{ left: -9999, top: -9999, width: 200, height: 200 }} aria-hidden>
        <div ref={playerContainerRef} style={{ width: 200, height: 200 }} />
      </div>

      <Sidebar active={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header active={tab} onChange={setTab} />

        {/* El padding inferior extra de los <main> de abajo suma el
            safe-area-inset-bottom del sistema: en un teléfono con barra de
            navegación en pantalla (los tres botones de Android, no
            gestos), esa barra se dibuja ENCIMA del contenido — sin este
            padding, lo último de cada pantalla (ej. el botón "Eliminar
            cuenta") queda tapado detrás de esos botones. El inset es 0 en
            el resto de los casos (gestos, sin barra, web), así que no
            cambia nada ahí. */}
        {tab === "account" ? (
          // Llegar hasta acá ya implica user !== null (ver el gate de arriba).
          <main className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <UserPanelView />
          </main>
        ) : tab === "admin" && isAdmin ? (
          <main className="flex-1 px-4 pt-2 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] lg:px-6 overflow-y-auto">
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
            <main className="md:hidden flex-1 px-4 pt-2 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] overflow-y-auto">
              <div className="max-w-md mx-auto w-full">
                {/* El dock vive acá, fuera de cada vista, para que la canción
                    siga sonando y visible al cambiar entre Chat y Eventos —
                    en Música ya está el reproductor grande, así que no se
                    duplica ahí. Fuera del PageTransition a propósito: no
                    tiene que re-animarse en cada cambio de pestaña, solo
                    cuando cambia la canción (ver MusicDock.tsx). */}
                {tab !== "music" && <MusicDock />}
                <PageTransition tabKey={tab}>
                  {tab === "chat" && <ChatView />}
                  {tab === "events" && <EventsView />}
                  {tab === "music" && <MusicView />}
                </PageTransition>
              </div>
            </main>
          </>
        ) : (
          <main className="flex-1 px-4 pt-2 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] lg:px-6 overflow-y-auto">
            <div className="max-w-2xl md:max-w-3xl mx-auto w-full">
              <PageTransition tabKey={tab}>
                {tab === "channels" && <ChannelsView />}
                {tab === "notifications" && <NotificationsView />}
                {tab === "voices" && <VoicesView />}
                {tab === "reading" && <ReadingView />}
                {tab === "general" && <GeneralView />}
              </PageTransition>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
