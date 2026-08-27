/*
# Desactivar voz para likes y shares por defecto

1. Tabla modificada: `settings`
   - `notif_voice_like` cambia de true a false (no leer likes por voz)
   - `notif_voice_share` cambia de true a false (no leer shares por voz)

2. Seguridad
   - No hay cambios de RLS — solo se actualizan valores por defecto de columnas existentes.
*/

ALTER TABLE settings
  ALTER COLUMN notif_voice_like SET DEFAULT false,
  ALTER COLUMN notif_voice_share SET DEFAULT false;
