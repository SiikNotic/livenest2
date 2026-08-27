/*
# Rank & permission system for the admin panel

## Summary
Adds a second, more granular layer on top of the existing `profiles.role`
(admin/user, which only gates access to the admin panel):

- `profiles.rank`: 'owner' | 'staff' | 'none'
  - owner: full control over ranks, permissions, and every admin action.
  - staff: can perform only the actions the owner has enabled for staff
    (initially: ban / unban). Staff can NEVER change ranks, change
    permissions, or promote themselves/anyone to owner — this is hardcoded
    in the RPCs below, not just hidden in the UI.
  - none: no administrative permissions at all.

- `rank_permissions`: single row (rank = 'staff') holding the toggleable
  permissions the owner can grant to staff. Only the owner can change it.

## Enforcement
All rank-gated actions go through SECURITY DEFINER RPCs
(`admin_set_ban_status`, `admin_set_rank`, `admin_set_staff_permission`)
that re-check the caller's rank/permissions on the server, so a user
without the right rank cannot perform the action even by calling the
function directly — hiding the button client-side is not the security
boundary.

siiknotic@gmail.com (the existing seeded admin) is set as 'owner'.
*/

-- ============================================================
-- 1. rank column on profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank text NOT NULL DEFAULT 'none'
  CHECK (rank IN ('owner', 'staff', 'none'));

UPDATE profiles SET rank = 'owner' WHERE email = 'siiknotic@gmail.com' AND rank <> 'owner';

-- ============================================================
-- 2. get_my_rank() — SSOT for the caller's rank, bypasses RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_rank()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT rank FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_rank() TO authenticated;

-- ============================================================
-- 3. rank_permissions — configurable permissions for 'staff'
-- ============================================================
CREATE TABLE IF NOT EXISTS rank_permissions (
  rank text PRIMARY KEY CHECK (rank = 'staff'),
  can_ban boolean NOT NULL DEFAULT true,
  can_unban boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rank_permissions (rank, can_ban, can_unban)
VALUES ('staff', true, true)
ON CONFLICT (rank) DO NOTHING;

ALTER TABLE rank_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rank_permissions_select ON rank_permissions;
CREATE POLICY rank_permissions_select ON rank_permissions FOR SELECT
  TO authenticated USING (public.get_my_rank() IN ('owner', 'staff') OR public.get_my_role() = 'admin');

-- Direct table writes are blocked; changes must go through
-- admin_set_staff_permission() below so the owner-only check is uniform.
DROP POLICY IF EXISTS rank_permissions_no_direct_write ON rank_permissions;

-- ============================================================
-- 3b. Close the direct-table-write loophole
-- ============================================================
-- Promoting someone to Staff sets role = 'admin' (see admin_set_rank
-- below) so the rest of the schema's existing admin RLS keeps working.
-- But that would also let a Staff account bypass the fine-grained
-- checks above by calling supabase.from('profiles').update(...) or
-- .rpc() directly instead of going through admin_set_ban_status /
-- admin_set_rank. Restrict direct row-level writes on OTHER people's
-- profiles to the Owner rank only; Staff must go through the
-- SECURITY DEFINER RPCs (which run with elevated privileges and do
-- their own permission check, independent of this policy).
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.get_my_rank() = 'owner')
  WITH CHECK (auth.uid() = id OR public.get_my_rank() = 'owner');

-- Same reasoning for row deletion — account deletion is Owner-only.
DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  TO authenticated
  USING (public.get_my_rank() = 'owner');

-- ============================================================
-- 4. admin_set_ban_status — owner: always; staff: if permitted
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_ban_status(p_user_id uuid, p_banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank text := public.get_my_rank();
  v_allowed boolean;
BEGIN
  IF v_rank = 'owner' THEN
    v_allowed := true;
  ELSIF v_rank = 'staff' THEN
    SELECT (CASE WHEN p_banned THEN can_ban ELSE can_unban END)
      INTO v_allowed
      FROM rank_permissions WHERE rank = 'staff';
  ELSE
    v_allowed := false;
  END IF;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'insufficient_permissions';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_moderate_self';
  END IF;

  UPDATE profiles SET banned = p_banned WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_ban_status(uuid, boolean) TO authenticated;

-- ============================================================
-- 5. admin_set_rank — owner only, always
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_rank(p_user_id uuid, p_rank text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_rank() <> 'owner' THEN
    RAISE EXCEPTION 'insufficient_permissions';
  END IF;

  IF p_rank NOT IN ('owner', 'staff', 'none') THEN
    RAISE EXCEPTION 'invalid_rank';
  END IF;

  IF p_user_id = auth.uid() AND p_rank <> 'owner' THEN
    RAISE EXCEPTION 'cannot_demote_self';
  END IF;

  -- Owner/Staff need panel access (the existing `role` column gates that
  -- everywhere else in the schema), so keep it in sync with the rank.
  -- Demoting to 'none' also revokes panel access unless the account was
  -- already a plain admin independent of this rank system.
  UPDATE profiles
  SET rank = p_rank,
      role = CASE WHEN p_rank IN ('owner', 'staff') THEN 'admin' ELSE role END
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_rank(uuid, text) TO authenticated;

-- ============================================================
-- 6. admin_set_staff_permission — owner only, always
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_staff_permission(p_key text, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_rank() <> 'owner' THEN
    RAISE EXCEPTION 'insufficient_permissions';
  END IF;

  IF p_key = 'can_ban' THEN
    UPDATE rank_permissions SET can_ban = p_value, updated_at = now() WHERE rank = 'staff';
  ELSIF p_key = 'can_unban' THEN
    UPDATE rank_permissions SET can_unban = p_value, updated_at = now() WHERE rank = 'staff';
  ELSE
    RAISE EXCEPTION 'invalid_permission_key';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_staff_permission(text, boolean) TO authenticated;
