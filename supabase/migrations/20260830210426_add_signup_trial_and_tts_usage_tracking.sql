-- 1 semana de membresía de prueba gratis para cuentas nuevas.
alter table public.user_licenses drop constraint user_licenses_source_check;
alter table public.user_licenses add constraint user_licenses_source_check
  check (source = any (array['stripe','key','trial']));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, role, username)
  values (
    new.id,
    new.email,
    case when new.email = 'siiknotic@gmail.com' then 'admin' else 'user' end,
    nullif(trim(new.raw_user_meta_data->>'username'), '')
  )
  on conflict (id) do update set email = excluded.email;

  -- La prueba gratis nunca debe poder tumbar el alta de la cuenta: si algo
  -- sale mal acá (constraint, lo que sea), se ignora y el signup sigue.
  begin
    insert into public.user_licenses (user_id, source, expires_at, status, auto_renew)
    values (new.id, 'trial', now() + interval '7 days', 'active', false);
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- redeem_license_key: una prueba gratis activa no debe bloquear canjear
-- una clave de verdad — se reemplaza automáticamente por la licencia nueva
-- (mismo criterio que ya aplicaba el webhook de Stripe con una suscripción
-- real, que ya cancelaba cualquier licencia activa antes de insertar la
-- nueva). Una licencia activa que NO sea de prueba (ya paga) sigue
-- bloqueando el canje, igual que antes.
create or replace function public.redeem_license_key(p_key text)
returns table(license_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key_row license_keys%rowtype;
  v_uid uuid := auth.uid();
  v_expires_at timestamptz;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Self-heal: expire the caller's own stale active license first.
  update user_licenses ul
    set status = 'expired', updated_at = now()
    where ul.user_id = v_uid
      and ul.status = 'active'
      and ul.expires_at is not null
      and ul.expires_at < now();

  -- Una prueba gratis todavía vigente se reemplaza sola, no bloquea.
  update user_licenses ul
    set status = 'cancelled', updated_at = now()
    where ul.user_id = v_uid
      and ul.status = 'active'
      and ul.source = 'trial';

  -- Reject if a genuinely active (non-trial, non-expired) license still exists.
  if exists (
    select 1 from user_licenses ul
      where ul.user_id = v_uid and ul.status = 'active'
  ) then
    raise exception 'already_has_active_license';
  end if;

  -- Lock and validate the key.
  select * into v_key_row
    from license_keys lk
    where lk.key = p_key and lk.status = 'available'
    for update;

  if not found then
    raise exception 'invalid_or_used_key';
  end if;

  v_expires_at := case
    when v_key_row.duration_days is null then null
    else now() + (v_key_row.duration_days || ' days')::interval
  end;

  insert into user_licenses (user_id, license_key_id, source, expires_at, status, auto_renew)
    values (v_uid, v_key_row.id, 'key', v_expires_at, 'active', false)
    returning id into v_new_id;

  update license_keys lk
    set status = 'redeemed', redeemed_by = v_uid, redeemed_at = now()
    where lk.id = v_key_row.id;

  return query select v_new_id, v_expires_at;
end;
$$;

-- Contador de mensajes leídos por TTS para usuarios sin membresía activa —
-- se resetea cada 30 días desde el primer mensaje leído del ciclo. Solo se
-- puede leer la fila propia desde el cliente; el único camino de escritura
-- es la RPC de abajo (SECURITY DEFINER), así que no hay forma de que el
-- cliente se auto-resetee el contador o infle/desinfle el número.
create table public.tts_usage (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages_read integer not null default 0,
  cycle_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tts_usage enable row level security;

create policy tts_usage_select_own on public.tts_usage
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.tts_usage from authenticated, anon;
grant select on public.tts_usage to authenticated;

create or replace function public.increment_tts_usage()
returns public.tts_usage
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.tts_usage%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.tts_usage (user_id, messages_read, cycle_start)
    values (v_uid, 0, now())
    on conflict (user_id) do nothing;

  select * into v_row from public.tts_usage where user_id = v_uid for update;

  if v_row.cycle_start < now() - interval '30 days' then
    v_row.messages_read := 0;
    v_row.cycle_start := now();
  end if;

  v_row.messages_read := v_row.messages_read + 1;

  update public.tts_usage
    set messages_read = v_row.messages_read,
        cycle_start = v_row.cycle_start,
        updated_at = now()
    where user_id = v_uid;

  select * into v_row from public.tts_usage where user_id = v_uid;
  return v_row;
end;
$$;

grant execute on function public.increment_tts_usage() to authenticated;
