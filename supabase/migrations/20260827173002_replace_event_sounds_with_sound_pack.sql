/*
# Reemplazar los sonidos sintetizados por evento con LiveNest2-Sound-Pack-v1

Hasta ahora notif_gift_sound / notif_follow_sound / notif_like_sound /
notif_share_sound / notif_sub_sound guardaban el nombre de un tono
sintetizado en el navegador (Web Audio API, ver src/lib/soundManager.ts),
ej. 'coin', 'bell', 'pop'. El picker de "Sonido por tipo de evento" ahora
ofrece sonidos reales del pack agregado en LiveNest2-Sound-Pack-v1/ (ver
src/lib/soundPack.ts), servidos como archivos estáticos desde /sounds/.

Esta migración:
- Cambia el DEFAULT de cada columna a un archivo del pack.
- Actualiza las filas existentes que todavía tienen uno de los nombres
  sintetizados viejos (no una URL subida por el usuario) para que pasen
  a sonar con el pack directamente, sin que el usuario tenga que volver
  a elegir manualmente.

Las filas que ya apuntan a un sonido personalizado subido (URL http/https
de Supabase Storage) NO se tocan.
*/

ALTER TABLE public.settings
  ALTER COLUMN notif_gift_sound SET DEFAULT '/sounds/success_001.wav',
  ALTER COLUMN notif_follow_sound SET DEFAULT '/sounds/notification_001.wav',
  ALTER COLUMN notif_like_sound SET DEFAULT '/sounds/cute_001.wav',
  ALTER COLUMN notif_share_sound SET DEFAULT '/sounds/whoosh_001.wav',
  ALTER COLUMN notif_sub_sound SET DEFAULT '/sounds/epic_001.wav';

UPDATE public.settings
SET notif_gift_sound = '/sounds/success_001.wav'
WHERE notif_gift_sound NOT LIKE 'http://%' AND notif_gift_sound NOT LIKE 'https://%';

UPDATE public.settings
SET notif_follow_sound = '/sounds/notification_001.wav'
WHERE notif_follow_sound NOT LIKE 'http://%' AND notif_follow_sound NOT LIKE 'https://%';

UPDATE public.settings
SET notif_like_sound = '/sounds/cute_001.wav'
WHERE notif_like_sound NOT LIKE 'http://%' AND notif_like_sound NOT LIKE 'https://%';

UPDATE public.settings
SET notif_share_sound = '/sounds/whoosh_001.wav'
WHERE notif_share_sound NOT LIKE 'http://%' AND notif_share_sound NOT LIKE 'https://%';

UPDATE public.settings
SET notif_sub_sound = '/sounds/epic_001.wav'
WHERE notif_sub_sound NOT LIKE 'http://%' AND notif_sub_sound NOT LIKE 'https://%';
