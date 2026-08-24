/*
# Add live events, song requests, and music settings

1. New Tables
- `live_events`: historial de eventos del live que no son chat (regalos, follows, shares, likes, subs).
  - id (uuid, pk)
  - type (text: 'gift' | 'follow' | 'share' | 'like' | 'sub' | 'viewer')
  - username (text)
  - detail (text, nullable - ej. nombre del regalo o cantidad)
  - count (int, default 1)
  - created_at (timestamptz)
- `song_requests`: canciones pedidas por el chat mediante comandos.
  - id (uuid, pk)
  - username (text, quién la pidió)
  - query (text, lo que escribió el usuario)
  - video_id (text, ID de YouTube - nullable hasta que se resuelve)
  - video_title (text, nullable)
  - video_channel (text, nullable)
  - status (text: 'queued' | 'playing' | 'played' | 'skipped' | 'not_found')
  - created_at (timestamptz)

2. Modified Tables
- `settings`: añadidas columnas para el reproductor de música.
  - music_enabled (boolean, default false)
  - music_command (text, default '!song')
  - music_volume (real, default 0.5, check 0-1)
  - music_autoplay (boolean, default true)
  - max_song_queue (int, default 20)

3. Security
- RLS habilitado en las nuevas tablas.
- Políticas TO anon, authenticated (app sin login, datos compartidos).
*/

CREATE TABLE IF NOT EXISTS live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('gift','follow','share','like','sub','viewer')),
  username text NOT NULL,
  detail text,
  count int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE live_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_live_events" ON live_events;
CREATE POLICY "anon_select_live_events" ON live_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_live_events" ON live_events;
CREATE POLICY "anon_insert_live_events" ON live_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_live_events" ON live_events;
CREATE POLICY "anon_delete_live_events" ON live_events FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_live_events_created_at ON live_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_events_type ON live_events (type);

CREATE TABLE IF NOT EXISTS song_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  query text NOT NULL,
  video_id text,
  video_title text,
  video_channel text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','playing','played','skipped','not_found')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE song_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_song_requests" ON song_requests;
CREATE POLICY "anon_select_song_requests" ON song_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_song_requests" ON song_requests;
CREATE POLICY "anon_insert_song_requests" ON song_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_song_requests" ON song_requests;
CREATE POLICY "anon_update_song_requests" ON song_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_song_requests" ON song_requests;
CREATE POLICY "anon_delete_song_requests" ON song_requests FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_song_requests_created_at ON song_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_song_requests_status ON song_requests (status);

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS music_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS music_command text NOT NULL DEFAULT '!song',
  ADD COLUMN IF NOT EXISTS music_volume real NOT NULL DEFAULT 0.5 CHECK (music_volume BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS music_autoplay boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_song_queue int NOT NULL DEFAULT 20 CHECK (max_song_queue > 0);
