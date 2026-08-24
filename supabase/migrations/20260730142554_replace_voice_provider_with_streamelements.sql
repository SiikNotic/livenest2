-- Replace Edge TTS and Google voice providers with StreamElements
-- StreamElements is free, needs no API key, and works 100% from the browser

-- Update existing settings: edge -> streamelements, google -> streamelements
UPDATE public.settings
SET voice_provider = 'streamelements'
WHERE voice_provider IN ('edge', 'google');

-- Update the column constraint to only allow browser and streamelements
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_voice_provider_check;
ALTER TABLE public.settings ADD CONSTRAINT settings_voice_provider_check
  CHECK (voice_provider IN ('browser', 'streamelements'));

-- Set default voice_id to a StreamElements voice if it was an Edge voice
UPDATE public.settings
SET voice_id = 'Brian'
WHERE voice_provider = 'streamelements'
  AND voice_id NOT IN (
    'Brian', 'Amy', 'Emma', 'Joey', 'Justin', 'Matthew', 'Ivy', 'Joanna',
    'Kendra', 'Kimberly', 'Salli', 'Nicole', 'Russell', 'Conchita', 'Enrique',
    'Miguel', 'Penelope', 'Lupe', 'Jorge', 'Carla', 'Mathieu', 'Celine',
    'Marlene', 'Hans', 'Giorgio', 'Ricardo', 'Vitoria', 'Takumi', 'Mizuki', 'Seoyeon'
  );
