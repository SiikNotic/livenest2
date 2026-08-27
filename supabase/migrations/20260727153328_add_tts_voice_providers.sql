/*
# Add TTS voice provider support (Azure Speech + Google TTS)

1. Modified Tables
- `settings`: adds columns for choosing a TTS engine and storing API keys.
  - `voice_provider` (text, default 'browser'): which engine to use — 'browser', 'azure', or 'google'.
  - `azure_subscription_key` (text, nullable): Azure Speech resource key.
  - `azure_region` (text, default 'eastus'): Azure region for the Speech resource.
  - `google_api_key` (text, nullable): Google Cloud TTS API key.

2. Security
- No new tables. Existing RLS policies on `settings` (anon/authenticated CRUD) already cover the new columns.
- The API keys are stored in the settings row. This is a single-tenant app with no auth,
  so the keys are readable by the anon client — same sensitivity as the existing Euler Stream
  key stored in `api_secrets`. For a production multi-user app these would move to `api_secrets`
  (service-role-only) and be proxied through an edge function.

3. Notes
- `voice_id` continues to store the selected voice name (browser voiceURI, Azure voice name,
  or Google voice name) regardless of provider.
- Defaults keep the app working unchanged for users who don't configure cloud TTS.
*/

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS voice_provider text NOT NULL DEFAULT 'browser';

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS azure_subscription_key text;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS azure_region text NOT NULL DEFAULT 'eastus';

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS google_api_key text;
