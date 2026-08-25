/*
# Reemplazar Edge TTS por Google Translate TTS

Edge TTS (Microsoft) dejó de funcionar: dependía de un token/firma no
oficiales que Microsoft invalidó sin aviso, y no hay forma confiable de
mantenerlo arreglado desde afuera — es el mismo tipo de fragilidad que
StreamElements ya mostró antes en este proyecto (ver las dos migraciones
"replace_*_with_streamelements", que también terminaron revertidas).

Se reemplaza por Google Translate TTS: gratis, sin API key, y una simple
petición HTTPS (sin WebSocket ni token que vencer) — mucho menos frágil,
aunque con una sola voz por idioma en vez del catálogo de voces con nombre
de Edge.

- Las filas que tenían voice_provider = 'edge' pasan a 'google'.
- Su voice_id (un nombre de voz de Edge, ej. "es-ES-ElviraNeural") ya no
  existe en el catálogo nuevo — se reemplaza por el código de idioma que
  mejor le corresponde ('en' si el voice_id empezaba con "en-", 'es' en
  cualquier otro caso, que es el idioma por defecto de la app).
*/

UPDATE public.settings
SET voice_id = CASE WHEN voice_id LIKE 'en-%' THEN 'en' ELSE 'es' END
WHERE voice_provider = 'edge';

UPDATE public.settings
SET voice_provider = 'google'
WHERE voice_provider = 'edge';

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_voice_provider_check
  CHECK (voice_provider IN ('browser', 'google', 'elevenlabs'));
