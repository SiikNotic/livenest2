-- Migrate existing values first, then update constraint
UPDATE settings SET voice_provider = 'browser' WHERE voice_provider IN ('streamelements', 'polly', 'google', 'elevenlabs');

ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;
ALTER TABLE settings ADD CONSTRAINT settings_voice_provider_check
  CHECK (voice_provider IN ('browser', 'piper', 'kokoro'));
