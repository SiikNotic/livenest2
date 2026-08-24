/*
# Add new voice providers: Streamlabs Polly and Google Translate TTS

1. Modified Tables
- `settings`
  - Change `voice_provider` constraint to allow: 'browser', 'streamelements', 'polly', 'google'.
  - Default remains 'streamelements'.

2. Notes
- 'polly' = Streamlabs Polly (public endpoint, same voices as StreamElements, alternative host).
- 'google' = Google Translate TTS (proxied through an edge function to avoid CORS).
- No data loss: existing rows keep their value; only the constraint is widened.
*/

DO $$
BEGIN
  -- Drop old constraint if exists, then add the new one with all 4 providers
  ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;
  ALTER TABLE settings ADD CONSTRAINT settings_voice_provider_check
    CHECK (voice_provider IN ('browser', 'streamelements', 'polly', 'google'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
