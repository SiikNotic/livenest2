/*
# Tabla api_secrets — almacenamiento seguro de claves

Almacena claves de APIs de terceros (ej. Euler Stream) para que las Edge Functions
las lean con el service role. El frontend NUNCA debe leer esta tabla — las políticas
de RLS bloquean completamente el acceso anónimo/autenticado.

1. Nueva tabla
- `api_secrets`: id, provider, key_name, secret_value (text), created_at, updated_at.

2. Seguridad
- RLS habilitado.
- NO se crean políticas para anon ni authenticated → la tabla es inaccesible
  desde el cliente (anon key). Solo el service role (que bypassa RLS) puede leerla,
  exclusivamente desde las Edge Functions.
*/

CREATE TABLE IF NOT EXISTS api_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  key_name text NOT NULL,
  secret_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, key_name)
);

ALTER TABLE api_secrets ENABLE ROW LEVEL SECURITY;

-- Intencionalmente SIN políticas: bloquea todo acceso desde el cliente (anon/auth).
-- Solo el service role puede acceder (bypassa RLS), usado por las Edge Functions.

-- La clave real de Euler Stream vivía aquí en texto plano. Este repo es
-- público, así que quedó expuesta en el historial de git — se retiró de
-- este archivo (revisión de seguridad) y DEBE rotarse desde el panel de
-- Euler Stream; la clave vieja hay que darla por comprometida. Después de
-- rotarla, cárgala en `api_secrets` directamente en Supabase (SQL editor
-- o Table editor), nunca en un archivo versionado.
INSERT INTO api_secrets (provider, key_name, secret_value)
VALUES ('eulerstream', 'api_key', '')
ON CONFLICT (provider, key_name) DO NOTHING;
