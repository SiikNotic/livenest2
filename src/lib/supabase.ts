import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Falta configuración de Supabase en .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type Settings = {
  id: string;
  voice_id: string;
  rate: number;
  pitch: number;
  volume: number;
  auto_read: boolean;
  min_message_length: number;
  max_message_length: number;
  language: string;
  music_enabled: boolean;
  music_command: string;
  music_volume: number;
  music_autoplay: boolean;
  max_song_queue: number;
  notif_sound_enabled: boolean;
  notif_sound_type: string;
  notif_volume: number;
  notif_gift_sound: string;
  notif_follow_sound: string;
  notif_like_sound: string;
  notif_share_sound: string;
  notif_sub_sound: string;
  notif_voice_enabled: boolean;
  notif_voice_gift: boolean;
  notif_voice_follow: boolean;
  notif_voice_like: boolean;
  notif_voice_share: boolean;
  notif_voice_sub: boolean;
  music_blocked_keywords: string;
  voice_provider: "browser" | "google" | "elevenlabs" | "inworld";
  voice_random: boolean;
  theme: "midnight" | "mono" | "neon" | "ios" | "android" | "aurora" | "sunset" | "ocean" | "violet" | "ember" | "candy" | "forest";
  created_at: string;
  updated_at: string;
};

export type FilterRule = {
  id: string;
  type: "allow" | "block" | "replace";
  field: "word" | "user" | "emoji" | "regex";
  value: string;
  replacement: string | null;
  enabled: boolean;
  created_at: string;
};

export type Template = {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  message: string;
  read_at: string | null;
  skipped: boolean;
  created_at: string;
};

export type LiveEventType = "gift" | "follow" | "share" | "like" | "sub" | "viewer";

export type LiveEvent = {
  id: string;
  type: LiveEventType;
  username: string;
  detail: string | null;
  count: number;
  created_at: string;
};

export type SongRequestStatus = "queued" | "playing" | "played" | "skipped" | "not_found" | "blocked";

export type SongRequest = {
  id: string;
  username: string;
  query: string;
  video_id: string | null;
  video_title: string | null;
  video_channel: string | null;
  status: SongRequestStatus;
  created_at: string;
};

/**
 * Sube un archivo de audio personalizado (mp3/wav/ogg) al bucket `alert-sounds`
 * dentro de la carpeta del usuario autenticado, y devuelve la URL pública que
 * puede guardarse directamente en un campo de sonido de `settings`
 * (ej. `notif_follow_sound`).
 */
export async function uploadAlertSound(file: File, eventKey: string): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error("Debes iniciar sesión para subir un sonido personalizado.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
  const allowedExt = ["mp3", "wav", "ogg"];
  if (!allowedExt.includes(ext)) {
    throw new Error("Formato no soportado. Usa mp3, wav u ogg.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("El archivo supera el límite de 5MB.");
  }

  const path = `${userData.user.id}/${eventKey}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("alert-sounds")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    throw new Error(`No se pudo subir el archivo: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from("alert-sounds").getPublicUrl(path);
  return publicUrlData.publicUrl;
}

export type UserRole = "admin" | "user";
export type UserRank = "owner" | "staff" | "none";

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  rank: UserRank;
  banned: boolean;
  created_at: string;
};

export type RankPermissions = {
  rank: "staff";
  can_ban: boolean;
  can_unban: boolean;
  updated_at: string;
};

export type LicenseKey = {
  id: string;
  key: string;
  duration_days: number | null;
  duration_label: "7" | "30" | "365" | "lifetime";
  status: "available" | "redeemed" | "revoked";
  created_by: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
};

export type UserLicense = {
  id: string;
  user_id: string;
  license_key_id: string;
  source: "stripe" | "key";
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  expires_at: string | null;
  status: "active" | "expired" | "cancelled";
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
};
