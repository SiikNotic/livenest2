import { useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, type Profile, type UserLicense } from "./supabase";
import { useStore } from "./store";

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
};

const AuthContext = createContext<AuthState | null>(null);

import { createContext, useContext } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [license, setLicense] = useState<UserLicense | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string, email?: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (data) {
      setProfile(data as Profile);
      if ((data as Profile).banned) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setLicense(null);
        useStore.getState().resetSession();
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
        await supabase.auth.signOut();
        useStore.getState().resetSession();
        return { error: "Esta cuenta ha sido suspendida." };
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
    if (!user) return { error: "No autenticado" };
    const clean = username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) {
      return { error: "El usuario debe tener entre 3 y 24 caracteres (letras, números o _)." };
    }
    const { error } = await supabase.from("profiles").update({ username: clean }).eq("id", user.id);
    if (error) {
      if (error.code === "23505") return { error: "Ese usuario ya está en uso." };
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setLicense(null);
    // Limpia los ajustes/filtros/plantillas/chat de la cuenta que se va —
    // el store es un singleton que si no, seguía mostrando datos de la
    // sesión anterior hasta que algo los recargara.
    useStore.getState().resetSession();
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