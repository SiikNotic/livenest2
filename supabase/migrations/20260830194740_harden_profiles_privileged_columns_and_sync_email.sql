-- Cierra un hueco de escalada de privilegios: la política RLS
-- profiles_update_own ((auth.uid() = id) OR (get_my_rank() = 'owner'))
-- solo restringe qué FILA se puede tocar, no qué COLUMNAS — cualquier
-- usuario autenticado podía llamar al cliente de Supabase directo y
-- auto-asignarse role='admin', rank='owner' o banned=false, sin pasar por
-- las RPCs admin-only (admin_set_rank, admin_set_ban_status).
--
-- NOTA: este primer intento resultó ineficaz por sí solo — ver la
-- migración fix_profiles_column_grant_narrowing que le sigue. Un
-- REVOKE UPDATE (columnas) no tiene efecto si ya existe un GRANT UPDATE
-- de tabla completa sin lista de columnas (el default de Supabase para
-- toda tabla nueva). Se deja este archivo tal cual se aplicó, en el
-- mismo orden, para que el historial de migraciones coincida con lo que
-- de verdad se ejecutó contra producción.
revoke update (id, email, role, rank, banned) on public.profiles from authenticated;

-- profiles.email solo se sincronizaba una vez, al crear la cuenta (via
-- handle_new_user) — si el usuario cambiaba su email después, profiles
-- quedaba con el viejo para siempre. Este trigger lo mantiene al día en
-- cada cambio confirmado en auth.users.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email();
