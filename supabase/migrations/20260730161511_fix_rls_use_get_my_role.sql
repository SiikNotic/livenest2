/*
# Fix RLS policies to use get_my_role() avoiding recursion

## Summary
The existing RLS policies on license_keys, user_licenses, and profiles
use subqueries on `profiles` to check admin role. This can fail due to
RLS recursion (the policy on profiles references profiles itself).
Replace those subqueries with calls to `get_my_role()` which is a
SECURITY DEFINER function that bypasses RLS.

## Changes
- Drop and recreate all admin-check policies to use `public.get_my_role() = 'admin'`
*/

-- profiles: keep own-select + admin-select, but use get_my_role for admin check
DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.get_my_role() = 'admin');

-- license_keys
DROP POLICY IF EXISTS license_keys_select_admin ON license_keys;
DROP POLICY IF EXISTS license_keys_insert_admin ON license_keys;
DROP POLICY IF EXISTS license_keys_update_admin ON license_keys;
DROP POLICY IF EXISTS license_keys_delete_admin ON license_keys;

CREATE POLICY license_keys_select_admin ON license_keys
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin' OR redeemed_by = auth.uid());

CREATE POLICY license_keys_insert_admin ON license_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY license_keys_update_admin ON license_keys
  FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY license_keys_delete_admin ON license_keys
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- user_licenses
DROP POLICY IF EXISTS user_licenses_select_own ON user_licenses;
DROP POLICY IF EXISTS user_licenses_insert_own ON user_licenses;
DROP POLICY IF EXISTS user_licenses_update_own ON user_licenses;

CREATE POLICY user_licenses_select_own ON user_licenses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY user_licenses_insert_own ON user_licenses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_licenses_update_own ON user_licenses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR public.get_my_role() = 'admin');

-- api_secrets: allow admin to read
DROP POLICY IF EXISTS api_secrets_select_admin ON api_secrets;
DROP POLICY IF EXISTS api_secrets_update_admin ON api_secrets;

CREATE POLICY api_secrets_select_admin ON api_secrets
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

CREATE POLICY api_secrets_update_admin ON api_secrets
  FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
