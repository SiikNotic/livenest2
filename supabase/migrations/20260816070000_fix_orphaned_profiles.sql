/*
# Fix orphaned auth accounts (missing profile rows)

## Problem
The admin "Delete account" action only deleted the `profiles` row, never the
underlying Supabase Auth account. That left the person able to log in
(auth.users still existed) with no matching `profiles` row. The app then
silently faked an in-memory-only profile just to render the UI — so
everything looked normal until the person tried to do anything that writes
to the database (like redeeming a license key), which failed with a foreign
key error because `profiles.id` didn't actually exist.

## Fix
1. `ensure_profile()` — SECURITY DEFINER RPC a logged-in user can call to
   create their own `profiles` row if it's missing, using their real auth
   email. The client now calls this automatically on login instead of
   faking a local-only profile.
2. Backfill: immediately create profile rows for any current auth user that
   is missing one — this repairs already-affected accounts (like this one)
   the moment this migration runs, no app update needed for them.
*/

CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row FROM profiles WHERE id = v_uid;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO profiles (id, email, role)
  VALUES (v_uid, v_email, CASE WHEN v_email = 'siiknotic@gmail.com' THEN 'admin' ELSE 'user' END)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;

-- Backfill: repair any auth user currently missing a profile row.
INSERT INTO public.profiles (id, email, role)
SELECT au.id, au.email, CASE WHEN au.email = 'siiknotic@gmail.com' THEN 'admin' ELSE 'user' END
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
