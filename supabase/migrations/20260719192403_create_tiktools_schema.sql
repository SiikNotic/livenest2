/*
# TikTools Live — Schema inicial

Aplicación single-tenant (sin login) para leer mensajes de TikTok Live en voz alta.

1. Nuevas tablas
- `settings`: configuración global (única fila). Campos: voice_id, rate, pitch, volume, auto_read, min_message_length, max_message_length, language, created_at, updated_at.
- `filters`: reglas de filtrado de mensajes. Campos: id, type, field, value, replacement, enabled, created_at.
- `templates`: plantillas de texto con variables. Campos: id, name, content, enabled, created_at.
- `chat_messages`: historial de mensajes del live. Campos: id, username, message, read_at, skipped, created_at.
- `stats_daily`: agregado diario. Campos: id, date, total_messages, read_messages, skipped_messages, unique_users, updated_at.

2. Seguridad
- RLS habilitado en todas las tablas.
- Políticas `TO anon, authenticated` (app sin login).
*/

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id text NOT NULL DEFAULT 'es-ES-Standard-A',
  rate real NOT NULL DEFAULT 1.0 CHECK (rate BETWEEN 0.5 AND 2.0),
  pitch real NOT NULL DEFAULT 1.0 CHECK (pitch BETWEEN 0.0 AND 2.0),
  volume real NOT NULL DEFAULT 1.0 CHECK (volume BETWEEN 0.0 AND 1.0),
  auto_read boolean NOT NULL DEFAULT true,
  min_message_length int NOT NULL DEFAULT 2 CHECK (min_message_length >= 0),
  max_message_length int NOT NULL DEFAULT 200 CHECK (max_message_length > 0),
  language text NOT NULL DEFAULT 'es-ES',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'block' CHECK (type IN ('allow','block','replace')),
  field text NOT NULL DEFAULT 'word' CHECK (field IN ('word','user','emoji','regex')),
  value text NOT NULL,
  replacement text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE filters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_filters" ON filters;
CREATE POLICY "anon_select_filters" ON filters FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_filters" ON filters;
CREATE POLICY "anon_insert_filters" ON filters FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_filters" ON filters;
CREATE POLICY "anon_update_filters" ON filters FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_filters" ON filters;
CREATE POLICY "anon_delete_filters" ON filters FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_templates" ON templates;
CREATE POLICY "anon_select_templates" ON templates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_templates" ON templates;
CREATE POLICY "anon_insert_templates" ON templates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_templates" ON templates;
CREATE POLICY "anon_update_templates" ON templates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_templates" ON templates;
CREATE POLICY "anon_delete_templates" ON templates FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  skipped boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chat_messages" ON chat_messages;
CREATE POLICY "anon_select_chat_messages" ON chat_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chat_messages" ON chat_messages;
CREATE POLICY "anon_insert_chat_messages" ON chat_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chat_messages" ON chat_messages;
CREATE POLICY "anon_update_chat_messages" ON chat_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chat_messages" ON chat_messages;
CREATE POLICY "anon_delete_chat_messages" ON chat_messages FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  total_messages int NOT NULL DEFAULT 0,
  read_messages int NOT NULL DEFAULT 0,
  skipped_messages int NOT NULL DEFAULT 0,
  unique_users int NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE stats_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_stats_daily" ON stats_daily;
CREATE POLICY "anon_select_stats_daily" ON stats_daily FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_stats_daily" ON stats_daily;
CREATE POLICY "anon_insert_stats_daily" ON stats_daily FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_stats_daily" ON stats_daily;
CREATE POLICY "anon_update_stats_daily" ON stats_daily FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_stats_daily" ON stats_daily;
CREATE POLICY "anon_delete_stats_daily" ON stats_daily FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM settings);

INSERT INTO filters (type, field, value, enabled)
SELECT 'block', 'word', 'spam', true
WHERE NOT EXISTS (SELECT 1 FROM filters);

INSERT INTO filters (type, field, value, enabled)
SELECT 'block', 'word', 'http', true
WHERE NOT EXISTS (SELECT 1 FROM filters WHERE value = 'http');

INSERT INTO templates (name, content, enabled)
SELECT 'Saludo con usuario', '{user} dice: {message}', true
WHERE NOT EXISTS (SELECT 1 FROM templates);
