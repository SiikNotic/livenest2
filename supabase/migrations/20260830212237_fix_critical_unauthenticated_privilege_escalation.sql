-- CRÍTICO: admin_set_rank() y admin_set_staff_permission() comparaban
-- get_my_rank() <> 'owner' con un IF ... THEN RAISE sin ELSE. get_my_rank()
-- devolvía NULL (no 'none') cuando auth.uid() es NULL — es decir, para
-- CUALQUIER llamador sin sesión, usando solo la anon key pública que va
-- compilada en el bundle del frontend. Bajo lógica de 3 valores de SQL,
-- NULL <> 'owner' es NULL, y "IF NULL THEN ..." en plpgsql se trata como
-- falso — el RAISE nunca se ejecutaba, y la función seguía de largo. El
-- resultado: cualquiera, sin login, podía llamar
-- POST /rest/v1/rpc/admin_set_rank {p_user_id: "<cualquier-uuid>", p_rank:
-- "owner"} y quedar como Owner — el rango más alto de la app (banear a
-- cualquiera, gestionar permisos, ver métricas de facturación, borrar
-- cuentas vía la Edge Function delete-user, etc.), sin autenticarse en
-- absoluto.
--
-- Fix en dos capas:
-- 1. get_my_role()/get_my_rank() ahora devuelven el mismo default que ya
--    usa la columna en la base ('user'/'none') en vez de NULL cuando no
--    hay fila (auth.uid() nulo, o una cuenta sin perfil todavía) — así
--    CUALQUIER comparación con estos helpers, en cualquier función o
--    política RLS presente o futura, se comporta como booleano de verdad
--    y nunca puede colarse por el hueco de la lógica de 3 valores.
-- 2. Además, se agrega un chequeo explícito de auth.uid() IS NULL al
--    principio de las 3 funciones admin_set_* — defensa en profundidad,
--    y un mensaje de error más claro ("no autenticado" en vez de
--    "permisos insuficientes") para quien de verdad no inició sesión.

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user');
$$;

create or replace function public.get_my_rank()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select rank from public.profiles where id = auth.uid()), 'none');
$$;

create or replace function public.admin_set_rank(p_user_id uuid, p_rank text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if public.get_my_rank() <> 'owner' then
    raise exception 'insufficient_permissions';
  end if;

  if p_rank not in ('owner', 'staff', 'none') then
    raise exception 'invalid_rank';
  end if;

  if p_user_id = auth.uid() and p_rank <> 'owner' then
    raise exception 'cannot_demote_self';
  end if;

  update profiles
    set rank = p_rank,
        role = case when p_rank in ('owner', 'staff') then 'admin' else role end
    where id = p_user_id;
end;
$$;

create or replace function public.admin_set_staff_permission(p_key text, p_value boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if public.get_my_rank() <> 'owner' then
    raise exception 'insufficient_permissions';
  end if;

  if p_key = 'can_ban' then
    update rank_permissions set can_ban = p_value, updated_at = now() where rank = 'staff';
  elsif p_key = 'can_unban' then
    update rank_permissions set can_unban = p_value, updated_at = now() where rank = 'staff';
  else
    raise exception 'invalid_permission_key';
  end if;
end;
$$;

create or replace function public.admin_set_ban_status(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rank text := public.get_my_rank();
  v_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if v_rank = 'owner' then
    v_allowed := true;
  elsif v_rank = 'staff' then
    select (case when p_banned then can_ban else can_unban end)
      into v_allowed
      from rank_permissions where rank = 'staff';
  else
    v_allowed := false;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'insufficient_permissions';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot_moderate_self';
  end if;

  update profiles set banned = p_banned where id = p_user_id;
end;
$$;
