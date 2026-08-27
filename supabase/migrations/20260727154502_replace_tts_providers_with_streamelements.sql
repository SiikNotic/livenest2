/*
# Replace cloud TTS providers: remove Azure/Google, add StreamElements

1. Modified Tables
- `settings`:
  - Drops `azure_subscription_key`, `azure_region`, `google_api_key` columns (no longer needed).
  - Changes `voice_provider` allowed values from 'browser'|'azure'|'google' to 'browser'|'streamelements'.
    Since it's a free text column (no CHECK constraint), we only update existing rows that reference
    removed providers back to 'browser' so they don't break.

2. Security
- No policy changes. Existing RLS on `settings` covers all columns.

3. Notes
- StreamElements is free and needs no API key, so no secret columns are required.
- The `voice_id` column continues to store the selected voice name (browser voiceURI or
  StreamElements voice id like "Conchita").
*/

UPDATE settings
SET voice_provider = 'browser'
WHERE voice_provider IN ('azure', 'google');

ALTER TABLE settings
  DROP COLUMN IF EXISTS azure_subscription_key,
  DROP COLUMN IF EXISTS azure_region,
  DROP COLUMN IF EXISTS google_api_key;
