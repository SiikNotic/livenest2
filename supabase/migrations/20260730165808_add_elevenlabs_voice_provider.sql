/*
# Add elevenlabs as a valid voice provider

## Summary
The settings.voice_provider column has a CHECK constraint that only allows
'browser' and 'edge'. We need to add 'elevenlabs' as a valid value.

## Changes
- Drop the old constraint and add a new one that includes 'elevenlabs'.
*/

ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;

ALTER TABLE settings ADD CONSTRAINT settings_voice_provider_check
  CHECK (voice_provider IN ('browser', 'edge', 'elevenlabs'));
