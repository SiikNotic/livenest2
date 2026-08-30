-- user_licenses: cerrar el insert/update directo que dejaba a cualquier
-- usuario autenticado insertar una fila propia con status='active' y
-- cualquier source/expires_at (auto-otorgarse membresía gratis sin
-- pagar), o reactivar una licencia cancelada/vencida. Toda alta/baja
-- legítima de licencia ya pasa por rutas SECURITY DEFINER
-- (redeem_license_key, el webhook de Stripe con service role) que no
-- dependen de estas políticas.
drop policy if exists user_licenses_insert_own on public.user_licenses;
drop policy if exists user_licenses_update_own on public.user_licenses;
revoke insert, update, delete on public.user_licenses from authenticated, anon;

-- El único caso legítimo de "el propio usuario toca su fila" era el
-- auto-heal de una licencia vencida hecho directo desde el cliente
-- (auth.tsx) — se reemplaza por una función server-side que hace
-- exactamente lo mismo, sin dejar abierta la puerta a escribir cualquier
-- otro campo.
create or replace function public.self_heal_expired_license()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update user_licenses
    set status = 'expired', updated_at = now()
    where user_id = auth.uid()
      and status = 'active'
      and expires_at is not null
      and expires_at < now();
end;
$$;
grant execute on function public.self_heal_expired_license() to authenticated;

-- license_keys: la política de SELECT dejaba ver el texto de CUALQUIER
-- clave todavía no canjeada a cualquier usuario autenticado ("redeemed_by
-- IS NULL" sin exigir ser admin), y la de UPDATE dejaba a cualquiera
-- reclamarla como propia sin pasar por redeem_license_key (que sí valida
-- correctamente con FOR UPDATE + el chequeo de licencia activa). Ningún
-- flujo del frontend necesita que un usuario normal lea o actualice
-- license_keys directamente — todo pasa por esa RPC o por AdminView bajo
-- get_my_role() = 'admin'.
drop policy if exists license_keys_select_admin on public.license_keys;
create policy license_keys_select_admin on public.license_keys
  for select to authenticated
  using (get_my_role() = 'admin' or redeemed_by = auth.uid());

drop policy if exists license_keys_update_admin on public.license_keys;
create policy license_keys_update_admin on public.license_keys
  for update to authenticated
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
