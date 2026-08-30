import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, type Profile, type UserLicense } from "./supabase";
import { useStore } from "./store";
import { useI18n } from "./i18n";

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  license: UserLicense | null;
  loading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  hasActiveLicense: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshLicense: () => Promise<void>;
  setUsername: (username: string) => Promise<{ error: string | null }>;
  // true mientras el usuario está en medio de un flujo de "recuperar
  // contraseña" (llegó desde el link del email) — App.tsx usa esto para
  // mostrar la pantalla de "establecer nueva contraseña" en vez del
  // dashboard normal, aunque supabase-js ya haya creado una sesión válida.
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  updateEmail: (newEmail: string) => Promise<{ error: string | null }>;
  reauthenticateWithPassword: (currentPassword: string) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [license, setLicense] = useState<UserLicense | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadProfile = useCallback(async (uid: string, email?: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (data) {
      setProfile(data as Profile);
      if ((data as Profile).banned) {
        // resetSession() (que limpia live_events/song_requests si seguía
        // conectada) tiene que correr ANTES de signOut() — una vez cerrada
        // la sesión, esa limpieza ya no tiene permiso (RLS la descarta en
        // silencio, 0 filas) y quedaban eventos huérfanos que reaparecían
        // como "actividad vieja" la próxima vez que alguien entrara.
        useStore.getState().resetSession();
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setLicense(null);
      }
    } else {
      // No profile row for this logged-in account (e.g. it was previously
      // deleted). Create a real row via the server instead of faking one
      // locally, so future actions (like redeeming a license) don't fail.
      const { data: ensured, error: ensureError } = await supabase.rpc("ensure_profile");
      if (!ensureError && ensured) {
        setProfile(ensured as Profile);
      } else {
        setProfile({
          id: uid,
          email: email ?? "",
          username: null,
          role: "user",
          rank: "none",
          banned: false,
          created_at: new Date().toISOString(),
        });
      }
    }
  }, []);

  const loadLicense = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("user_licenses")
      .select("*")
      .eq("user_id", uid)
      .eq("status", "active")
      .maybeSingle();
    if (!error && data) {
      const lic = data as UserLicense;
      if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
        // Self-heal: write the expiration back to the database, not just
        // local state, so the admin panel and future redemptions see it too.
        await supabase
          .from("user_licenses")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", lic.id);
        setLicense(null);
      } else {
        setLicense(lic);
      }
    } else {
      setLicense(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        (async () => {
          await loadProfile(data.session!.user.id, data.session!.user.email);
          await loadLicense(data.session!.user.id);
          setLoading(false);
        })();
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      (async () => {
        // El link de recuperación de contraseña hace que supabase-js cree
        // una sesión temporal a partir del hash de la URL y dispare este
        // evento — hay que marcarlo ANTES de nada más, porque de lo
        // contrario sess?.user ya está seteado y el resto del flujo trata
        // esto como un login normal, mandando al usuario derecho al
        // dashboard en vez de a la pantalla de "elegí tu nueva contraseña".
        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecovery(true);
        }
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) {
          await loadProfile(sess.user.id, sess.user.email);
          await loadLicense(sess.user.id);
        } else {
          setProfile(null);
          setLicense(null);
        }
        setLoading(false);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile, loadLicense]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (data.user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("banned")
        .eq("id", data.user.id)
        .maybeSingle();
      if (prof?.banned) {
        // Mismo orden que en loadProfile: limpiar antes de cerrar sesión.
        useStore.getState().resetSession();
        await supabase.auth.signOut();
        return { error: useI18n.getState().t("auth_err_account_suspended") };
      }
    }
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    // El username viaja como metadata de auth.users (raw_user_meta_data) —
    // de ahí lo lee handle_new_user() al crear la fila de profiles, para
    // que quede seteado desde el primer momento en vez de en un segundo
    // paso separado.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });
    return { error: error?.message ?? null };
  }, []);

  // Para cuentas que llegaron sin username (Google, o una cuenta vieja de
  // antes de que este campo existiera) — se guarda en el propio profiles
  // vía la política RLS que ya deja a cada usuario editar su propia fila.
  const setUsername = useCallback(async (username: string) => {
    if (!user) return { error: useI18n.getState().t("auth_err_not_authenticated") };
    const clean = username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) {
      return { error: useI18n.getState().t("auth_err_username_length") };
    }
    const { error } = await supabase.from("profiles").update({ username: clean }).eq("id", user.id);
    if (error) {
      if (error.code === "23505") return { error: useI18n.getState().t("auth_err_username_taken") };
      return { error: error.message };
    }
    setProfile((p) => (p ? { ...p, username: clean } : p));
    return { error: null };
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    // signInWithOAuth performs a full-page redirect to Google on success,
    // so this only ever resolves with an error (e.g. misconfiguration or
    // the browser blocking the redirect). A successful flow never reaches
    // the code after this call — the app reloads at redirectTo instead.
    //
    // window.location.origin por sí solo NO alcanza en GitHub Pages: la
    // app vive bajo un subpath (ej. https://siiknotic.github.io/livenest2/),
    // pero origin solo da "https://siiknotic.github.io" — sin el subpath.
    // Esa URL no está en la lista de redirects permitidos de Supabase, así
    // que el login con Google se rechazaba. import.meta.env.BASE_URL es el
    // mismo "base" configurado en vite.config.ts ("/livenest2/" en prod,
    // "/" en local), así que sumarlo reconstruye la URL real de la app.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setPasswordRecovery(false);
  }, []);

  // Envía el email de "recuperar contraseña". redirectTo apunta a la propia
  // app (mismo patrón que signInWithGoogle: hay que sumar BASE_URL porque en
  // GitHub Pages vive bajo un subpath) — Supabase agrega ahí el hash con el
  // token de recuperación, y el listener de arriba lo detecta solo.
  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    });
    return { error: error?.message ?? null };
  }, []);

  // Usada tanto para completar la recuperación (con la sesión temporal que
  // crea el link) como para "cambiar contraseña" desde el perfil (después
  // de reautenticar, ver reauthenticateWithPassword). updateUser NUNCA crea
  // una cuenta nueva ni cambia auth.users.id — sigue siendo el mismo UUID,
  // así que la membresía (ligada a ese UUID en user_licenses) no se toca.
  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setPasswordRecovery(false);
    return { error: null };
  }, []);

  // Igual que updatePassword: cambia el email en auth.users manteniendo el
  // mismo id. Supabase envía confirmación al correo nuevo (y, si "secure
  // email change" está activo en el dashboard, también al viejo) antes de
  // aplicar el cambio de verdad — hasta que se confirma, sigue funcionando
  // el login con el email anterior. El trigger sync_profile_email en la
  // base de datos se encarga de reflejar el nuevo email en profiles cuando
  // el cambio se confirma.
  const updateEmail = useCallback(async (newEmail: string) => {
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    return { error: error?.message ?? null };
  }, []);

  // Antes de dejar cambiar la contraseña actual (o el email) desde el
  // perfil, se re-verifica la contraseña actual re-autenticando contra el
  // mismo email — signInWithPassword no crea sesión nueva "de otra cuenta",
  // solo confirma que quien está en el perfil de verdad conoce la
  // contraseña vigente, igual que pedir la contraseña actual en cualquier
  // otro sitio.
  const reauthenticateWithPassword = useCallback(async (currentPassword: string) => {
    if (!user?.email) return { error: useI18n.getState().t("auth_err_not_authenticated") };
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    return { error: error?.message ?? null };
  }, [user]);

  const signOut = useCallback(async () => {
    // resetSession() limpia los ajustes/filtros/plantillas/chat de la
    // cuenta que se va (el store es un singleton que si no, seguía
    // mostrando datos de la sesión anterior) — y si seguía conectada a un
    // canal, también borra live_events/song_requests. Tiene que correr
    // ANTES de signOut(): una vez cerrada la sesión ya no hay permiso
    // (RLS) para ese borrado, y quedaban eventos huérfanos que
    // reaparecían como "actividad vieja" la próxima vez que se entraba.
    useStore.getState().resetSession();
    await supabase.auth.signOut();
    setProfile(null);
    setLicense(null);
    setPasswordRecovery(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id, user.email);
  }, [user, loadProfile]);

  const refreshLicense = useCallback(async () => {
    if (user) await loadLicense(user.id);
  }, [user, loadLicense]);

  const isAdmin = profile?.role === "admin";
  const isOwner = profile?.rank === "owner";
  const hasActiveLicense = !!license;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        license,
        loading,
        isAdmin,
        isOwner,
        hasActiveLicense,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        refreshProfile,
        refreshLicense,
        setUsername,
        passwordRecovery,
        clearPasswordRecovery,
        sendPasswordReset,
        updatePassword,
        updateEmail,
        reauthenticateWithPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}