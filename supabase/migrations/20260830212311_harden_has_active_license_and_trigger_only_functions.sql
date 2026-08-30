-- has_active_license(p_user_id) dejaba a CUALQUIER usuario autenticado (o
-- incluso anónimo) consultar si OTRO usuario cualquiera tiene membresía
-- activa, pasando un uuid ajeno — un problema de privacidad/enumeración
-- (permite mapear qué cuentas pagan) sin ninguna necesidad real: todos los
-- llamadores legítimos (tts-proxy, los triggers de settings/song_requests,
-- la política de storage de alert-sounds) siempre consultan al propio
-- usuario (NEW.user_id en un insert propio, o auth.uid() directo) — nunca
-- a un tercero. Se agrega el chequeo de que solo se puede consultar la
-- propia licencia (o cualquiera, si quien pregunta es admin).
create or replace function public.has_active_license(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from user_licenses
    where user_id = p_user_id
      and status = 'active'
      and (expires_at is null or expires_at > now())
  )
  and (p_user_id = auth.uid() or public.get_my_role() = 'admin');
$$;

-- expire_stale_licenses() no tiene ningún filtro por usuario — barre TODA
-- la tabla user_licenses. Su efecto es benigno en sí mismo (solo pasa a
-- 'expired' licencias que YA vencieron, nunca corta una vigente antes de
-- tiempo), pero no hay ningún flujo del frontend que necesite dispararlo:
-- se revoca el EXECUTE de anon/authenticated para que deje de ser un
-- endpoint público que cualquiera pueda golpear sin motivo.
revoke execute on function public.expire_stale_licenses() from anon, authenticated;

-- Funciones que son SOLO triggers (retornan el pseudo-tipo "trigger") —
-- Postgres ya impide llamarlas directo fuera de un trigger real
-- ("trigger functions can only be called as triggers"), pero el EXECUTE
-- por default a PUBLIC seguía ahí y el linter de seguridad las marcaba
-- como "el público puede ejecutar esto". Se revoca por prolijidad — cero
-- cambio de comportamiento real, menos ruido para auditar a futuro.
--
-- NOTA: este REVOKE (apuntando a anon, authenticated) resultó ineficaz —
-- ver fix_execute_revoke_target_public_not_roles más abajo. Se deja tal
-- cual se aplicó, en el mismo orden, para que el historial coincida con
-- lo que de verdad se ejecutó contra producción.
revoke execute on function public.sync_profile_email() from anon, authenticated;
revoke execute on function public.enforce_settings_plan_limits() from anon, authenticated;
revoke execute on function public.enforce_song_requests_license() from anon, authenticated;
revoke execute on function public.enforce_saved_channels_limit() from anon, authenticated;
