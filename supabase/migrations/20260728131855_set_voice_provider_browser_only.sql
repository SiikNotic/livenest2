-- Migrate any non-browser values to browser
UPDATE settings SET voice_provider = 'browser' WHERE voice_provider NOT IN ('browser');

-- Update constraint to only allow browser
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;
ALTER TABLE settings ADD CONSTRAINT settings_voice_provider_check
  CHECK (voice_provider = 'browser');
