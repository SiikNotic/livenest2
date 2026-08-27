-- Add constraint to only allow browser and edge voice providers
ALTER TABLE public.settings ADD CONSTRAINT settings_voice_provider_check
  CHECK (voice_provider IN ('browser', 'edge'));
