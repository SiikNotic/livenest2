-- La migración anterior (revoke update (columnas) ...) no tuvo efecto:
-- verificado contra information_schema.column_privileges que TODAS las
-- columnas de profiles seguían apareciendo como UPDATE-ables por
-- `authenticated`, porque ya existía un GRANT UPDATE ON public.profiles
-- TO authenticated de tabla completa (sin lista de columnas) desde el
-- setup default de Supabase — ese grant ancho por sí solo sigue
-- autorizando escribir cualquier columna, sin importar qué REVOKE
-- columna-específico se aplique encima.
--
-- Patrón correcto: revocar el grant de tabla completa primero, y volver a
-- otorgar UPDATE solo sobre la columna que de verdad debe quedar editable
-- por el propio usuario (username). El resto de columnas (id, email,
-- role, rank, banned) quedan escribibles únicamente vía funciones
-- SECURITY DEFINER (handle_new_user, ensure_profile, admin_set_rank,
-- admin_set_ban_status, sync_profile_email), que corren con privilegios
-- del owner de la función y no se ven afectadas por estos REVOKE.
revoke update on public.profiles from authenticated;
grant update (username) on public.profiles to authenticated;
