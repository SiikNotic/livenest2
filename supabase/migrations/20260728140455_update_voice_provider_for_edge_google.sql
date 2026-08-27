/*
# Update voice_provider to support Edge TTS and Google Cloud TTS

1. Changes
- Alter `voice_provider` column to accept 'browser', 'edge', or 'google'
- Add `google_tts_key` text column for Google Cloud TTS API key (nullable)
2. Notes
- Edge TTS is free and needs no API key
- Google Cloud TTS requires an API key stored in settings
*/

DO $$ BEGIN
  ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE settings ALTER COLUMN voice_provider TYPE text;
ALTER TABLE settings ALTER COLUMN voice_provider SET DEFAULT 'browser';

DO $$ BEGIN
  ALTER TABLE settings ADD CONSTRAINT settings_voice_provider_check
    CHECK (voice_provider IN ('browser', 'edge', 'google'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS google_tts_key text;
