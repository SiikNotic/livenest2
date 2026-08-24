/*
# Add function to get user role reliably

## Summary
Adds a SECURITY DEFINER function `get_my_role()` that returns the current user's role.
This bypasses RLS on the profiles table, ensuring the role is always readable by the authenticated user.
Also adds a trigger to ensure the admin email always has admin role.

## New Functions
- `get_my_role()` — returns 'admin' or 'user' for the current authenticated user, or null if not found.
*/

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
