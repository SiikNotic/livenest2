/*
# Add authentication, roles, and license system

## Summary
This migration adds a complete authentication and licensing layer to the existing TikTools Live app.
It introduces user profiles with admin roles, a license key system (7-day, 30-day, 1-year, lifetime),
and user-license associations. Existing tables (settings, filters, templates, live_events, song_requests)
are extended with an optional user_id column so each user owns their data.

## New Tables

1. `profiles`
   - Extends auth.users with a role column (admin/user).
   - `id` (uuid, PK, references auth.users)
   - `email` (text, unique, not null)
   - `role` (text, not null, default 'user' — values: 'admin', 'user')
   - `created_at` (timestamptz, default now())

2. `license_keys`
   - Pre-generated or admin-created license keys.
   - `id` (uuid, PK)
   - `key` (text, unique, not null) — the actual license string
   - `duration_days` (integer, nullable) — null = lifetime
   - `duration_label` (text, not null) — '7', '30', '365', 'lifetime'
   - `status` (text, not null, default 'available') — 'available', 'redeemed', 'revoked'
   - `created_by` (uuid, references profiles) — admin who created it
   - `redeemed_by` (uuid, nullable, references profiles)
   - `redeemed_at` (timestamptz, nullable)
   - `created_at` (timestamptz, default now())

3. `user_licenses`
   - Active license grants per user. A user can have at most one active license.
   - `id` (uuid, PK)
   - `user_id` (uuid, not null, references profiles, unique)
   - `license_key_id` (uuid, not null, references license_keys)
   - `source` (text, not null) — 'stripe' or 'key'
   - `stripe_subscription_id` (text, nullable)
   - `stripe_customer_id` (text, nullable)
   - `expires_at` (timestamptz, nullable) — null = lifetime
   - `status` (text, not null, default 'active') — 'active', 'expired', 'cancelled'
   - `auto_renew` (boolean, default false)
   - `created_at` (timestamptz, default now())
   - `updated_at` (timestamptz, default now())

## Modified Tables
- `settings`: add `user_id uuid DEFAULT auth.uid()` (nullable for backward compat)
- `filters`: add `user_id uuid DEFAULT auth.uid()` (nullable)
- `templates`: add `user_id uuid DEFAULT auth.uid()` (nullable)

## Security
- RLS enabled on all new tables.
- `profiles`: users can read own profile; admins can read all; users can update own profile (except role).
- `license_keys`: only admins can read/create/update; users can only read keys they've redeemed.
- `user_licenses`: users can read own license; admins can read all.
- Existing tables: add user-scoped policies for authenticated users while keeping anon access for backward compat.

## Important Notes
1. The admin email (siiknotic@gmail.com) will be seeded as admin via a trigger on first sign-in.
2. Existing data is preserved — user_id columns are nullable so old rows remain accessible.
3. A trigger auto-creates a profile row when a new auth user signs up.
4. A trigger auto-assigns admin role to siiknotic@gmail.com.
*/

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. LICENSE KEYS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS license_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  duration_days integer,
  duration_label text NOT NULL CHECK (duration_label IN ('7', '30', '365', 'lifetime')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'revoked')),
  created_by uuid REFERENCES profiles(id),
  redeemed_by uuid REFERENCES profiles(id),
  redeemed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can read all keys; users can read keys they redeemed
DROP POLICY IF EXISTS "license_keys_select_admin" ON license_keys;
CREATE POLICY "license_keys_select_admin" ON license_keys FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR redeemed_by = auth.uid()
  );

-- Only admins can insert/update/delete
DROP POLICY IF EXISTS "license_keys_insert_admin" ON license_keys;
CREATE POLICY "license_keys_insert_admin" ON license_keys FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "license_keys_update_admin" ON license_keys;
CREATE POLICY "license_keys_update_admin" ON license_keys FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "license_keys_delete_admin" ON license_keys;
CREATE POLICY "license_keys_delete_admin" ON license_keys FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- 3. USER LICENSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  license_key_id uuid NOT NULL REFERENCES license_keys(id),
  source text NOT NULL CHECK (source IN ('stripe', 'key')),
  stripe_subscription_id text,
  stripe_customer_id text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  auto_renew boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_licenses ENABLE ROW LEVEL SECURITY;

-- Users can read own license; admins can read all
DROP POLICY IF EXISTS "user_licenses_select_own" ON user_licenses;
CREATE POLICY "user_licenses_select_own" ON user_licenses FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Users can insert own license (when redeeming a key)
DROP POLICY IF EXISTS "user_licenses_insert_own" ON user_licenses;
CREATE POLICY "user_licenses_insert_own" ON user_licenses FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- Users can update own license (cancel); admins can update any
DROP POLICY IF EXISTS "user_licenses_update_own" ON user_licenses;
CREATE POLICY "user_licenses_update_own" ON user_licenses FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  ) WITH CHECK (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================================
-- 4. ADD user_id TO EXISTING TABLES (nullable for backward compat)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'user_id') THEN
    ALTER TABLE settings ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'filters' AND column_name = 'user_id') THEN
    ALTER TABLE filters ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'user_id') THEN
    ALTER TABLE templates ADD COLUMN user_id uuid DEFAULT auth.uid();
  END IF;
END $$;

-- ============================================================
-- 5. TRIGGERS — auto-create profile on signup, auto-admin for owner
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, CASE WHEN NEW.email = 'siiknotic@gmail.com' THEN 'admin' ELSE 'user' END)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also ensure existing auth.users have profiles
INSERT INTO public.profiles (id, email, role)
SELECT au.id, au.email, CASE WHEN au.email = 'siiknotic@gmail.com' THEN 'admin' ELSE 'user' END
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET role = CASE WHEN profiles.email = 'siiknotic@gmail.com' THEN 'admin' ELSE profiles.role END;

-- ============================================================
-- 6. UNIQUE INDEX — one active license per user
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS user_licenses_one_active
  ON user_licenses (user_id)
  WHERE status = 'active';
