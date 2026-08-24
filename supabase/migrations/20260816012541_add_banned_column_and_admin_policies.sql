/*
# Add missing 'banned' column and admin RLS policies on profiles

## Summary
The client code (AdminView, auth.tsx) reads/writes a `banned` column on
`profiles` and expects admins to be able to ban/delete other users, but:
1. The `banned` column was never added to the table.
2. `profiles_update_own` only allowed a user to update their own row,
   so admins could not actually ban another user (RLS silently blocked it).
3. There was no DELETE policy on `profiles`, so admin "delete user" also
   silently failed.

## Changes
- Add `banned boolean NOT NULL DEFAULT false` to `profiles`.
- Replace `profiles_update_own` with a policy that also allows admins
  (via `get_my_role()`) to update any profile.
- Add `profiles_delete_admin` policy allowing admins to delete profiles.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.get_my_role() = 'admin')
  WITH CHECK (auth.uid() = id OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin');
