-- Repasando el fix anterior con más cuidado: has_active_license() podía
-- devolver NULL (no false) en vez de un booleano limpio — el término
-- "p_user_id = auth.uid()" agregado para cerrar la fuga de privacidad es
-- NULL cuando auth.uid() es NULL (llamador anónimo) y p_user_id es de
-- otra persona, y "NULL OR get_my_role()='admin'" sigue siendo NULL (no
-- false), porque el OR entre NULL y un lado falso da NULL, no false.
--
-- Ahora mismo esto no es explotable en la práctica: los dos triggers que
-- llaman has_active_license(NEW.user_id) solo se disparan después de que
-- RLS ya validó NEW.user_id = auth.uid() en el insert, así que auth.uid()
-- nunca es NULL ahí — pero es exactamente el mismo patrón de lógica de 3
-- valores que causó el bug crítico de admin_set_rank (un futuro trigger o
-- RPC que haga "IF NOT has_active_license(...)" sin saberlo quedaría
-- expuesto al mismo hueco). Se envuelve todo en COALESCE(..., false) para
-- que esta función NUNCA devuelva NULL, pase lo que pase con auth.uid().
create or replace function public.has_active_license(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    exists (
      select 1 from user_licenses
      where user_id = p_user_id
        and status = 'active'
        and (expires_at is null or expires_at > now())
    )
    and (p_user_id = auth.uid() or public.get_my_role() = 'admin'),
    false
  );
$$;
