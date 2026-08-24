import { supabase } from "./supabase";

/*
Foto de perfil del canal de TikTok.

La URL real de la foto se resuelve en el servidor (edge function
`tiktok-profile-photo`), porque TikTok no expone una API pública para esto y
el navegador no puede leer la página del canal por CORS.

Además, el CDN de TikTok suele bloquear el hotlink de sus imágenes desde otros
orígenes, así que la URL resuelta se sirve a través de un proxy público de
imágenes (`proxiedAvatar`) — el mismo patrón que ya usan los avatares del chat.
*/

/** Envuelve una URL de TikTok en el proxy de imágenes para que el <img> cargue. */
export function proxiedAvatar(url: string, size = 96): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${size}&h=${size}&fit=cover&default=1`;
}

export function cleanUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

const CACHE_KEY = "livenest.tiktok_avatars.v1";
/** Una foto de perfil cambia poco: se reusa un día antes de volver a pedirla. */
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
/** Si el canal no tiene foto (o falló), se reintenta antes — puede ponerla luego. */
const MISS_TTL_MS = 60 * 60 * 1000;

type CacheEntry = { url: string | null; at: number };

let cache: Record<string, CacheEntry> | null = null;
const inFlight = new Map<string, Promise<string | null>>();

function loadCache(): Record<string, CacheEntry> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function writeCache(username: string, url: string | null) {
  const store = loadCache();
  store[username] = { url, at: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // localStorage lleno o bloqueado — la caché en memoria sigue sirviendo.
  }
}

/** Devuelve la foto cacheada, o `undefined` si no hay nada fresco guardado. */
export function getCachedAvatar(username: string): string | null | undefined {
  const entry = loadCache()[cleanUsername(username)];
  if (!entry) return undefined;
  const ttl = entry.url ? HIT_TTL_MS : MISS_TTL_MS;
  if (Date.now() - entry.at > ttl) return undefined;
  return entry.url;
}

/**
 * Resuelve la foto de perfil de un canal de TikTok. Devuelve `null` cuando el
 * canal no tiene foto o no se pudo resolver — quien llama muestra entonces las
 * iniciales.
 */
export async function fetchTikTokAvatar(username: string): Promise<string | null> {
  const clean = cleanUsername(username);
  if (!clean) return null;

  const cached = getCachedAvatar(clean);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(clean);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/tiktok-profile-photo?username=${encodeURIComponent(clean)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json().catch(() => null);
      const url = typeof json?.avatar_url === "string" && json.avatar_url ? json.avatar_url : null;
      writeCache(clean, url);
      return url;
    } catch {
      return null;
    } finally {
      inFlight.delete(clean);
    }
  })();

  inFlight.set(clean, request);
  return request;
}

/** El <img> no cargó: se olvida esa URL para no reintentarla en cada render. */
export function forgetAvatar(username: string) {
  writeCache(cleanUsername(username), null);
}
