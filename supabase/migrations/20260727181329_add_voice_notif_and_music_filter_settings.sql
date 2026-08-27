/*
# Añadir ajustes de voz para notificaciones y filtro de canciones troll

1. Tabla modificada: `settings`
   - `notif_voice_enabled` (boolean, default false): activa/desactiva la lectura por voz de notificaciones
   - `notif_voice_gift` (boolean, default true): leer regalos por voz
   - `notif_voice_follow` (boolean, default true): leer nuevos seguidores por voz
   - `notif_voice_like` (boolean, default false): leer likes por voz
   - `notif_voice_share` (boolean, default true): leer shares por voz
   - `notif_voice_sub` (boolean, default true): leer suscripciones por voz
   - `music_blocked_keywords` (text, default ''): palabras clave separadas por coma para filtrar canciones troll

2. Seguridad
   - No hay cambios de RLS — solo se añaden columnas a una tabla existente.
*/

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS notif_voice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_voice_gift boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_voice_follow boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_voice_like boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_voice_share boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_voice_sub boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS music_blocked_keywords text NOT NULL DEFAULT '';
