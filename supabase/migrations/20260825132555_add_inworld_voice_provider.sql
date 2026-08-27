/*
# Agregar Inworld como voice_provider válido

Inworld se suma a la lista de proveedores de voz permitidos en
settings.voice_provider (browser, google, elevenlabs, inworld).

La API key de Inworld se guarda en `api_secrets` (provider='inworld',
key_name='api_key') — no en este archivo, para no repetir el error de
dejar una clave en texto plano dentro de una migración versionada.
*/

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_voice_provider_check
  CHECK (voice_provider IN ('browser', 'google', 'elevenlabs', 'inworld'));
