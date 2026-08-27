/*
# Añadir ajustes de sonido de notificaciones

1. Tabla modificada: `settings`
   - `notif_sound_enabled` (boolean, default true): activa/desactiva sonidos de notificación
   - `notif_sound_type` (text, default 'chime'): tipo de sonido — 'chime', 'pop', 'bell', 'coin', 'none'
   - `notif_volume` (numeric, default 0.5): volumen de las notificaciones (0 a 1)
   - `notif_gift_sound` (text, default 'coin'): sonido específico para regalos
   - `notif_follow_sound` (text, default 'bell'): sonido específico para nuevos seguidores
   - `notif_like_sound` (text, default 'pop'): sonido específico para likes
   - `notif_share_sound` (text, default 'chime'): sonido específico para shares
   - `notif_sub_sound` (text, default 'bell'): sonido específico para suscripciones

2. Seguridad
   - No hay cambios de RLS — solo se añaden columnas a una tabla existente.
*/

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS notif_sound_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_sound_type text NOT NULL DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS notif_volume numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS notif_gift_sound text NOT NULL DEFAULT 'coin',
  ADD COLUMN IF NOT EXISTS notif_follow_sound text NOT NULL DEFAULT 'bell',
  ADD COLUMN IF NOT EXISTS notif_like_sound text NOT NULL DEFAULT 'pop',
  ADD COLUMN IF NOT EXISTS notif_share_sound text NOT NULL DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS notif_sub_sound text NOT NULL DEFAULT 'bell';
