-- El REVOKE anterior apuntaba a "anon, authenticated", pero Postgres
-- otorga EXECUTE en toda función nueva a PUBLIC por default — un
-- pseudo-rol que anon/authenticated heredan aparte de sus propios grants
-- explícitos. Revocar de anon/authenticated no quita lo heredado de
-- PUBLIC; había que revocarlo de PUBLIC directamente. Verificado con
-- has_function_privilege() que el REVOKE anterior no había surtido efecto,
-- y con una prueba aislada (tabla y trigger temporales, ajenos al esquema
-- real) que confirma que un trigger real sigue disparando sin problema
-- para el rol `authenticated` aunque su función no tenga EXECUTE — la
-- invocación de un trigger no pasa por ese chequeo de privilegios.
revoke execute on function public.expire_stale_licenses() from public;
revoke execute on function public.sync_profile_email() from public;
revoke execute on function public.enforce_settings_plan_limits() from public;
revoke execute on function public.enforce_song_requests_license() from public;
revoke execute on function public.enforce_saved_channels_limit() from public;
