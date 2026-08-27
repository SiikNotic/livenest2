import { supabase } from "./supabase";
import { useI18n } from "./i18n";

export type SavedChannel = {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  created_at: string;
  last_connected_at: string | null;
};

/** Free plan: 1 saved channel. With an active license: up to 5 — mirrors the DB trigger. */
export function getMaxSavedChannels(hasActiveLicense: boolean): number {
  return hasActiveLicense ? 5 : 1;
}

export async function listSavedChannels(): Promise<SavedChannel[]> {
  const { data, error } = await supabase
    .from("saved_channels")
    .select("*")
    .order("last_connected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedChannel[];
}

export async function addSavedChannel(
  username: string,
  displayName?: string | null
): Promise<{ error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { error: useI18n.getState().t("channels_err_login_required") };

  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return { error: useI18n.getState().t("channels_err_invalid_username") };

  const { error } = await supabase.from("saved_channels").upsert(
    {
      user_id: userData.user.id,
      username: clean,
      display_name: displayName?.trim() || null,
    },
    { onConflict: "user_id,username" }
  );

  if (error) {
    if (error.message.includes("saved_channels_limit_reached")) {
      return { error: useI18n.getState().t("channels_err_limit_reached") };
    }
    return { error: error.message };
  }
  return { error: null };
}

export async function removeSavedChannel(id: string): Promise<void> {
  const { error } = await supabase.from("saved_channels").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function touchSavedChannel(username: string): Promise<void> {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  await supabase
    .from("saved_channels")
    .update({ last_connected_at: new Date().toISOString() })
    .eq("username", clean);
}
