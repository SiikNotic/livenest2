-- Add voice_random and theme columns to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS voice_random boolean DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS theme text DEFAULT 'midnight'
  CHECK (theme IN ('midnight', 'mono', 'neon', 'ios', 'android'));
