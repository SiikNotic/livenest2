/*
# Revertir el acceso de admin a api_secrets

`20260730161511_fix_rls_use_get_my_role.sql` agregó políticas que dejan a
cualquier usuario con role = 'admin' hacer SELECT/UPDATE sobre `api_secrets`
directamente desde el navegador (con su propia sesión, vía el cliente
anon/authenticated de Supabase). Eso contradice el diseño original de esta
tabla (ver `20260719193824_create_api_secrets_table.sql`): las claves de
terceros (ej. Euler Stream) solo deben ser legibles por el service role,
usado exclusivamente dentro de las Edge Functions — nunca desde el cliente,
ni siquiera por un admin.

Nada del frontend usa esta política hoy (ningún admin panel lee
`api_secrets`), así que quitarla no rompe nada — solo cierra una vía
innecesaria para que la clave de Euler Stream (u otras que se guarden aquí
después) termine expuesta en la sesión del navegador de un admin.
*/

DROP POLICY IF EXISTS api_secrets_select_admin ON api_secrets;
DROP POLICY IF EXISTS api_secrets_update_admin ON api_secrets;

-- Vuelve a quedar sin ninguna política: inaccesible desde anon/authenticated,
-- solo el service role (Edge Functions) puede leerla.
