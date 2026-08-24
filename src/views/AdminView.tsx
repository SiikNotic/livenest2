import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../lib/auth";
import { supabase, type Profile, type LicenseKey, type UserLicense, type UserRank, type RankPermissions } from "../lib/supabase";
import {
  Shield, Users, KeyRound, Plus, Trash2, Copy, Check, Loader2, AlertCircle,
  Clock, CheckCircle2, XCircle, Crown, LogOut, X, Ban, ShieldCheck,
  Mail, Calendar, BadgeCheck, Sparkles, Lock, SlidersHorizontal, Zap, RefreshCw, DollarSign,
} from "lucide-react";

type AdminTab = "users" | "keys" | "licenses" | "permissions";

const RANK_LABEL: Record<UserRank, string> = { owner: "Owner", staff: "Staff", none: "Ninguno" };
const RANK_STYLE: Record<UserRank, string> = {
  owner: "bg-accent/15 text-accent",
  staff: "bg-primary/15 text-primary",
  none: "bg-bg-soft text-muted",
};

export function AdminView() {
  const { profile, signOut, isOwner } = useAuth();
  const [tab, setTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<Profile[]>([]);
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [licenses, setLicenses] = useState<(UserLicense & { profile_email?: string })[]>([]);
  const [rankPerms, setRankPerms] = useState<RankPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [genLabel, setGenLabel] = useState<"7" | "30" | "365" | "lifetime">("30");
  const [genQty, setGenQty] = useState(1);
  const [genLoading, setGenLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [permError, setPermError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [usersRes, keysRes, licensesRes, permsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("license_keys").select("*").order("created_at", { ascending: false }),
      supabase.from("user_licenses").select("*").order("created_at", { ascending: false }),
      supabase.from("rank_permissions").select("*").eq("rank", "staff").maybeSingle(),
    ]);
    setUsers((usersRes.data as Profile[]) ?? []);
    setKeys((keysRes.data as LicenseKey[]) ?? []);
    setRankPerms((permsRes.data as RankPermissions) ?? null);

    const licData = (licensesRes.data as UserLicense[]) ?? [];
    const emails = await Promise.all(
      licData.map(async (l) => {
        const { data } = await supabase.from("profiles").select("email").eq("id", l.user_id).maybeSingle();
        return { ...l, profile_email: data?.email ?? "—" };
      })
    );
    setLicenses(emails);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real, current membership per user: active status AND not past expiry
  // (a DB row can lag briefly behind expiry until the next self-heal).
  const licenseByUser = useMemo(() => {
    const map = new Map<string, UserLicense>();
    for (const l of licenses) {
      if (l.status === "active" && (!l.expires_at || new Date(l.expires_at) > new Date())) {
        map.set(l.user_id, l);
      }
    }
    return map;
  }, [licenses]);

  // Client-side mirrors of the server-enforced rules — purely for UX
  // (disabling/hiding buttons). The real gate is the SECURITY DEFINER
  // RPCs below, which re-check this on the server no matter what the
  // client sends.
  const myRank: UserRank = profile?.rank ?? "none";
  const canBan = myRank === "owner" || (myRank === "staff" && !!rankPerms?.can_ban);
  const canUnban = myRank === "owner" || (myRank === "staff" && !!rankPerms?.can_unban);
  const canChangeRank = myRank === "owner";
  const canDelete = myRank === "owner";
  const canManagePermissions = myRank === "owner";

  const generateKeys = async () => {
    setGenLoading(true);
    const newKeys: { key: string; duration_days: number | null; duration_label: string }[] = [];
    const daysMap: Record<string, number | null> = { "7": 7, "30": 30, "365": 365, lifetime: null };
    for (let i = 0; i < genQty; i++) {
      newKeys.push({ key: genKey(), duration_days: daysMap[genLabel], duration_label: genLabel });
    }
    const { error } = await supabase.from("license_keys").insert(newKeys);
    if (!error) await loadData();
    setGenLoading(false);
  };

  const revokeKey = async (id: string) => {
    await supabase.from("license_keys").update({ status: "revoked" }).eq("id", id);
    await loadData();
  };

  const deleteKey = async (id: string) => {
    await supabase.from("license_keys").delete().eq("id", id);
    await loadData();
  };

  const copyKey = (id: string, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Every admin action below calls a SECURITY DEFINER RPC that re-checks
  // the caller's rank/permissions in the database, so this is enforced
  // even if someone bypasses the UI entirely.
  const setBanStatus = async (userId: string, banned: boolean) => {
    setPermError(null);
    const { error } = await supabase.rpc("admin_set_ban_status", { p_user_id: userId, p_banned: banned });
    if (error) {
      setPermError("No tienes permiso para realizar esta acción.");
      return;
    }
    await loadData();
    setSelectedUser((u) => (u && u.id === userId ? { ...u, banned } : u));
  };

  const setRank = async (userId: string, rank: UserRank) => {
    setPermError(null);
    const { error } = await supabase.rpc("admin_set_rank", { p_user_id: userId, p_rank: rank });
    if (error) {
      setPermError("No tienes permiso para cambiar el rango.");
      return;
    }
    await loadData();
    setSelectedUser((u) => (u && u.id === userId ? { ...u, rank } : u));
  };

  const setStaffPermission = async (key: "can_ban" | "can_unban", value: boolean) => {
    setPermError(null);
    const { error } = await supabase.rpc("admin_set_staff_permission", { p_key: key, p_value: value });
    if (error) {
      setPermError("No tienes permiso para modificar los permisos.");
      return;
    }
    await loadData();
  };

  const deleteUser = async (id: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("delete-user", {
      body: { userId: id },
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });
    if (error) {
      setPermError("No se pudo borrar la cuenta: solo el Owner puede hacerlo.");
      return;
    }
    setSelectedUser(null);
    await loadData();
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  const labelMap: Record<string, string> = { "7": "7 días", "30": "30 días", "365": "1 año", lifetime: "De por vida" };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-5">
      {/* Admin header */}
      <div className="glass rounded-2xl p-4 border border-border">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-error-400/15 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-error-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold">Panel de administración</h1>
            <p className="text-xs text-muted truncate">{profile?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-bg-soft border border-border text-xs font-semibold text-muted hover:text-error-400 transition-colors flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Salir
          </button>
        </div>
      </div>

      {isOwner && <ElevenLabsUsageCard />}
      {isOwner && <StripeMetricsCard />}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
        {([
          { id: "users", label: "Usuarios", icon: Users },
          { id: "keys", label: "Claves", icon: KeyRound },
          { id: "licenses", label: "Licencias", icon: Crown },
          ...(isOwner ? [{ id: "permissions" as const, label: "Permisos", icon: SlidersHorizontal }] : []),
        ] as { id: AdminTab; label: string; icon: typeof Users }[]).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all card-press flex-shrink-0 ${
                tab === t.id
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-bg-soft text-muted border border-border hover:text-text"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* USERS TAB */}
          {tab === "users" && (
            <div className="space-y-2">
              {users.map((u) => {
                const isMember = licenseByUser.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="glass rounded-xl p-3.5 border border-border w-full text-left flex items-center gap-3 card-press hover:border-primary/30 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-bg-soft flex items-center justify-center flex-shrink-0">
                      {u.role === "admin" ? (
                        <Shield className="w-4 h-4 text-error-400" />
                      ) : (
                        <Users className="w-4 h-4 text-muted" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{u.email}</p>
                      <p className="text-[11px] text-muted">{fmtDate(u.created_at)}</p>
                    </div>

                    <div className="hidden sm:flex flex-wrap items-center justify-end gap-1.5 flex-shrink-0 max-w-[45%]">
                      {u.rank !== "none" && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${RANK_STYLE[u.rank]}`}>
                          {RANK_LABEL[u.rank]}
                        </span>
                      )}
                      {isMember && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary/15 text-primary flex items-center gap-1 whitespace-nowrap">
                          <Crown className="w-3 h-3" /> Miembro
                        </span>
                      )}
                      {u.banned && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-error-400/15 text-error-400 whitespace-nowrap">
                          Baneado
                        </span>
                      )}
                    </div>

                    <div className="w-2 h-2 rounded-full bg-muted/40 flex-shrink-0 sm:hidden" />
                  </button>
                );
              })}
              {users.length === 0 && (
                <p className="text-center text-sm text-muted py-10">No hay usuarios registrados.</p>
              )}
            </div>
          )}

          {/* KEYS TAB */}
          {tab === "keys" && (
            <div className="space-y-4">
              <div className="glass rounded-2xl p-4 border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold">Generar claves</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["7", "30", "365", "lifetime"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setGenLabel(d)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        genLabel === d
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "bg-bg-soft text-muted border border-border hover:text-text"
                      }`}
                    >
                      {labelMap[d]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted">Cantidad:</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={genQty}
                    onChange={(e) => setGenQty(Math.max(1, Math.min(100, +e.target.value)))}
                    className="w-16 px-2 py-1.5 rounded-lg bg-bg-soft border border-border text-sm text-center focus:outline-none"
                  />
                  <button
                    onClick={generateKeys}
                    disabled={genLoading}
                    className="ml-auto px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {genLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Generar
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="glass rounded-xl p-3.5 border border-border flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[140px]">
                      <code className="text-sm font-mono font-bold text-text break-all">{k.key}</code>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted">{labelMap[k.duration_label]}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          k.status === "available" ? "bg-success-400/15 text-success-400"
                          : k.status === "redeemed" ? "bg-primary/15 text-primary"
                          : "bg-error-400/15 text-error-400"
                        }`}>
                          {k.status === "available" ? "Disponible" : k.status === "redeemed" ? "Usada" : "Revocada"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {k.status === "available" && (
                        <>
                          <button
                            onClick={() => copyKey(k.id, k.key)}
                            className="w-8 h-8 rounded-lg bg-bg-soft border border-border flex items-center justify-center text-muted hover:text-primary transition-colors"
                          >
                            {copiedId === k.id ? <Check className="w-3.5 h-3.5 text-success-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => revokeKey(k.id)}
                            className="w-8 h-8 rounded-lg bg-bg-soft border border-border flex items-center justify-center text-muted hover:text-warning-400 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => deleteKey(k.id)}
                        className="w-8 h-8 rounded-lg bg-bg-soft border border-border flex items-center justify-center text-muted hover:text-error-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {keys.length === 0 && (
                  <p className="text-center text-sm text-muted py-10">No hay claves generadas.</p>
                )}
              </div>
            </div>
          )}

          {/* LICENSES TAB */}
          {tab === "licenses" && (
            <div className="space-y-2">
              {licenses.map((l) => (
                <div key={l.id} className="glass rounded-xl p-3.5 border border-border flex flex-wrap items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-bg-soft flex items-center justify-center flex-shrink-0">
                    {l.status === "active" ? (
                      <CheckCircle2 className="w-4 h-4 text-success-400" />
                    ) : l.status === "cancelled" ? (
                      <XCircle className="w-4 h-4 text-error-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-warning-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm font-bold truncate">{l.profile_email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted">{l.source === "stripe" ? "Stripe" : "Clave"}</span>
                      <span className="text-[10px] text-muted">·</span>
                      <span className="text-[10px] text-muted">{l.expires_at ? fmtDate(l.expires_at) : "De por vida"}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
                    l.status === "active" ? "bg-success-400/15 text-success-400"
                    : l.status === "cancelled" ? "bg-error-400/15 text-error-400"
                    : "bg-warning-400/15 text-warning-400"
                  }`}>
                    {l.status === "active" ? "Activa" : l.status === "cancelled" ? "Cancelada" : "Expirada"}
                  </span>
                </div>
              ))}
              {licenses.length === 0 && (
                <p className="text-center text-sm text-muted py-10">No hay licencias registradas.</p>
              )}
            </div>
          )}

          {/* PERMISSIONS TAB — owner only (also enforced server-side) */}
          {tab === "permissions" && isOwner && (
            <div className="space-y-4">
              <div className="glass rounded-2xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold">Permisos del rango Staff</h2>
                </div>
                <p className="text-xs text-muted">
                  Como Owner, decides qué puede hacer el rango Staff. Cambiar rangos, gestionar
                  permisos y el rango Owner nunca están disponibles para Staff.
                </p>
              </div>

              <div className="glass rounded-xl border border-border divide-y divide-border">
                <PermissionRow
                  label="Banear usuarios"
                  description="Staff puede suspender cuentas."
                  checked={!!rankPerms?.can_ban}
                  onChange={(v) => setStaffPermission("can_ban", v)}
                />
                <PermissionRow
                  label="Desbanear usuarios"
                  description="Staff puede levantar suspensiones."
                  checked={!!rankPerms?.can_unban}
                  onChange={(v) => setStaffPermission("can_unban", v)}
                />
              </div>

              <div className="glass rounded-xl p-3.5 border border-border flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted leading-relaxed">
                  Cambiar el rango de un usuario, eliminar cuentas y modificar estos permisos
                  están reservados al Owner y se verifican en el servidor — Staff no puede
                  realizarlos aunque intente llamarlos directamente.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {selectedUser && (
        <UserModal
          user={selectedUser}
          license={licenseByUser.get(selectedUser.id) ?? null}
          fmtDate={fmtDate}
          canBan={canBan}
          canUnban={canUnban}
          canChangeRank={canChangeRank}
          canDelete={canDelete}
          canManagePermissions={canManagePermissions}
          error={permError}
          onClose={() => { setSelectedUser(null); setPermError(null); }}
          onBanToggle={() => setBanStatus(selectedUser.id, !selectedUser.banned)}
          onSetRank={(r) => setRank(selectedUser.id, r)}
          onDelete={() => deleteUser(selectedUser.id)}
        />
      )}
    </div>
  );
}

function ElevenLabsUsageCard() {
  const [usage, setUsage] = useState<{
    total_credits: number; used_credits: number; percent_used: number;
    resets_at: string | null; tier: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error: fnError } = await supabase.functions.invoke("tts-proxy", {
      body: { action: "usage", provider: "elevenlabs" },
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });
    if (fnError || data?.error) {
      setError(data?.error ?? "No se pudo cargar el uso de ElevenLabs.");
    } else {
      setError(null);
      setUsage(data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Near-real-time without reloading the app: poll on an interval and
  // refresh again whenever the tab regains focus.
  useEffect(() => {
    fetchUsage();
    const interval = setInterval(() => fetchUsage(), 30000);
    const onFocus = () => fetchUsage();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchUsage]);

  const fmtResetDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  const barColor = !usage
    ? "bg-primary"
    : usage.percent_used >= 90 ? "bg-error-400"
    : usage.percent_used >= 70 ? "bg-warning-400"
    : "bg-primary";

  return (
    <div className="glass rounded-2xl p-4 border border-border">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold">Uso de ElevenLabs</h2>
            <Lock className="w-3 h-3 text-muted" />
          </div>
          <p className="text-[11px] text-muted">Solo visible para Owner · vía backend seguro</p>
        </div>
        <button
          onClick={() => fetchUsage(true)}
          disabled={refreshing}
          className="w-8 h-8 rounded-lg bg-bg-soft border border-border flex items-center justify-center text-muted hover:text-primary transition-colors flex-shrink-0"
          title="Actualizar ahora"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-xs text-error-400 bg-error/10 rounded-xl p-2.5 border border-error/20">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : usage ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-bg-soft rounded-xl p-2.5 border border-border">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Total</p>
              <p className="text-sm font-bold">{usage.total_credits.toLocaleString("es-ES")}</p>
            </div>
            <div className="bg-bg-soft rounded-xl p-2.5 border border-border">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Usados</p>
              <p className="text-sm font-bold">{usage.used_credits.toLocaleString("es-ES")}</p>
            </div>
            <div className="bg-bg-soft rounded-xl p-2.5 border border-border">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Uso</p>
              <p className="text-sm font-bold">{usage.percent_used}%</p>
            </div>
          </div>

          <div>
            <div className="h-2 rounded-full bg-bg-soft overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.min(100, usage.percent_used)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>Se reinicia el {fmtResetDate(usage.resets_at)}</span>
            {usage.tier && <span className="capitalize">{usage.tier}</span>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StripeMetricsCard() {
  const [metrics, setMetrics] = useState<{
    revenue_this_month_cents: number; revenue_has_more: boolean;
    active_subscribers: number; active_subscribers_has_more: boolean;
    upcoming_renewals: { email: string | null; renews_at: string; amount_cents: number | null }[];
    recent_cancellations: { email: string | null; cancelled_at: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error: fnError } = await supabase.functions.invoke("stripe-admin-metrics", {
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });
    if (fnError || data?.error) {
      setError(data?.error ?? "No se pudieron cargar las métricas de Stripe.");
    } else {
      setError(null);
      setMetrics(data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(() => fetchMetrics(), 60000);
    const onFocus = () => fetchMetrics();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchMetrics]);

  const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtShortDate = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });

  return (
    <div className="glass rounded-2xl p-4 border border-border">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-success-400/15 flex items-center justify-center flex-shrink-0">
          <DollarSign className="w-4 h-4 text-success-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold">Ingresos y suscripciones</h2>
            <Lock className="w-3 h-3 text-muted" />
          </div>
          <p className="text-[11px] text-muted">Solo visible para Owner · vía backend seguro</p>
        </div>
        <button
          onClick={() => fetchMetrics(true)}
          disabled={refreshing}
          className="w-8 h-8 rounded-lg bg-bg-soft border border-border flex items-center justify-center text-muted hover:text-primary transition-colors flex-shrink-0"
          title="Actualizar ahora"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-xs text-error-400 bg-error/10 rounded-xl p-2.5 border border-error/20">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : metrics ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-bg-soft rounded-xl p-2.5 border border-border">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Ingresos este mes</p>
              <p className="text-lg font-extrabold text-success-400">
                {fmtMoney(metrics.revenue_this_month_cents)}
                {metrics.revenue_has_more && <span className="text-[10px] text-muted-soft font-normal">+</span>}
              </p>
            </div>
            <div className="bg-bg-soft rounded-xl p-2.5 border border-border">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Suscriptores activos</p>
              <p className="text-lg font-extrabold">
                {metrics.active_subscribers}
                {metrics.active_subscribers_has_more && <span className="text-[10px] text-muted-soft font-normal">+</span>}
              </p>
            </div>
          </div>

          <div className="pt-1">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">
              Próximas renovaciones (7 días)
            </p>
            {metrics.upcoming_renewals.length === 0 ? (
              <p className="text-xs text-muted-soft">Ninguna en los próximos 7 días.</p>
            ) : (
              <div className="space-y-1.5">
                {metrics.upcoming_renewals.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-soft truncate flex-1">{r.email ?? "—"}</span>
                    <span className="text-muted flex-shrink-0 ml-2">{fmtShortDate(r.renews_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-1 border-t border-border">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5 mt-2">
              Cancelaciones recientes
            </p>
            {metrics.recent_cancellations.length === 0 ? (
              <p className="text-xs text-muted-soft">Sin cancelaciones recientes.</p>
            ) : (
              <div className="space-y-1.5">
                {metrics.recent_cancellations.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-text-soft truncate flex-1">{c.email ?? "—"}</span>
                    <span className="text-error-400/80 flex-shrink-0 ml-2">{fmtShortDate(c.cancelled_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PermissionRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-soft">{label}</p>
        <p className="text-[11px] text-muted">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={`switch-track ${checked ? "switch-on" : ""}`}
      >
        <span className={`switch-thumb ${checked ? "switch-thumb-on" : ""}`} />
      </button>
    </div>
  );
}

function UserModal({
  user, license, fmtDate, canBan, canUnban, canChangeRank, canDelete, canManagePermissions,
  error, onClose, onBanToggle, onSetRank, onDelete,
}: {
  user: Profile;
  license: UserLicense | null;
  fmtDate: (iso: string | null) => string;
  canBan: boolean;
  canUnban: boolean;
  canChangeRank: boolean;
  canDelete: boolean;
  canManagePermissions: boolean;
  error: string | null;
  onClose: () => void;
  onBanToggle: () => void;
  onSetRank: (rank: UserRank) => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isMember = !!license;
  const banAllowed = user.banned ? canUnban : canBan;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 sm:inset-0 z-50 flex sm:items-center sm:justify-center pointer-events-none">
        <div className="pointer-events-auto w-full sm:max-w-md bg-bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border sticky top-0 bg-bg-card z-10">
            <div className="w-11 h-11 rounded-2xl bg-bg-soft flex items-center justify-center flex-shrink-0">
              {user.role === "admin" ? (
                <Shield className="w-5 h-5 text-error-400" />
              ) : (
                <Users className="w-5 h-5 text-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.email}</p>
              <p className="text-[11px] text-muted">Cuenta desde {fmtDate(user.created_at)}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-bg-soft border border-border flex items-center justify-center text-muted hover:text-text transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {error && (
              <div className="flex items-start gap-2 text-xs text-error-400 bg-error/10 rounded-xl p-2.5 border border-error/20">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Basic info */}
            <div className="space-y-2">
              <InfoRow icon={Mail} label="Correo" value={user.email} />
              <InfoRow icon={Calendar} label="Registrado" value={fmtDate(user.created_at)} />
            </div>

            {/* Membership */}
            <div className="glass rounded-xl p-3.5 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <Crown className={`w-4 h-4 ${isMember ? "text-primary" : "text-muted"}`} />
                <span className="text-sm font-bold">{isMember ? "Miembro con licencia activa" : "Sin licencia"}</span>
              </div>
              <p className="text-xs text-muted">
                {isMember
                  ? license?.expires_at
                    ? `Vence el ${fmtDate(license.expires_at)} · ${license.source === "stripe" ? "Stripe" : "Clave"}`
                    : `De por vida · ${license?.source === "stripe" ? "Stripe" : "Clave"}`
                  : "Este usuario no tiene acceso a funciones de miembro."}
              </p>
            </div>

            {/* Status + rank */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="glass rounded-xl p-3 border border-border">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Estado</p>
                <div className="flex items-center gap-1.5">
                  {user.banned ? (
                    <><Ban className="w-3.5 h-3.5 text-error-400" /><span className="text-sm font-bold text-error-400">Baneado</span></>
                  ) : (
                    <><BadgeCheck className="w-3.5 h-3.5 text-success-400" /><span className="text-sm font-bold text-success-400">Activa</span></>
                  )}
                </div>
              </div>
              <div className="glass rounded-xl p-3 border border-border">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Rango</p>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span className="text-sm font-bold">{RANK_LABEL[user.rank]}</span>
                </div>
              </div>
            </div>

            {/* Rank change — owner only, real permission enforced server-side too */}
            <div>
              <label className="label flex items-center gap-1.5">
                Cambiar rango
                {!canChangeRank && <Lock className="w-3 h-3 text-muted" />}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["owner", "staff", "none"] as UserRank[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => canChangeRank && onSetRank(r)}
                    disabled={!canChangeRank}
                    className={`px-2 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      user.rank === r
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-bg-soft text-muted border border-border hover:text-text"
                    }`}
                  >
                    {RANK_LABEL[r]}
                  </button>
                ))}
              </div>
              {!canChangeRank && (
                <p className="text-[11px] text-muted-soft mt-1.5">Solo el Owner puede cambiar rangos.</p>
              )}
            </div>

            {/* Actions */}
            {user.role !== "admin" && (
              <div className="space-y-2 pt-1">
                <button
                  onClick={onBanToggle}
                  disabled={!banAllowed}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    user.banned
                      ? "bg-success-400/15 text-success-400 hover:bg-success-400/25"
                      : "bg-warning-400/15 text-warning-400 hover:bg-warning-400/25"
                  }`}
                >
                  {user.banned ? <ShieldCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  {user.banned ? "Desbanear usuario" : "Banear usuario"}
                  {!banAllowed && <Lock className="w-3.5 h-3.5 ml-1" />}
                </button>

                {confirmingDelete ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onDelete}
                      className="flex-1 py-2.5 rounded-xl bg-error-400 text-white text-sm font-bold hover:bg-error-500 transition-colors"
                    >
                      Confirmar eliminación
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="px-4 py-2.5 rounded-xl bg-bg-soft border border-border text-sm font-bold text-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => canDelete && setConfirmingDelete(true)}
                    disabled={!canDelete}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-error-400/10 text-error-400 text-sm font-bold hover:bg-error-400/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar cuenta
                    {!canDelete && <Lock className="w-3.5 h-3.5 ml-1" />}
                  </button>
                )}
                {!canDelete && (
                  <p className="text-[11px] text-muted-soft text-center">Solo el Owner puede eliminar cuentas.</p>
                )}
              </div>
            )}

            {!canManagePermissions && (
              <p className="text-[10px] text-muted-soft text-center pt-1">
                Los permisos del rango Staff se configuran en la pestaña “Permisos” (solo Owner).
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-bg-soft flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-soft">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function genKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = "";
    for (let i = 0; i < 4; i++) seg += chars[Math.floor(Math.random() * chars.length)];
    segments.push(seg);
  }
  return segments.join("-");
}
