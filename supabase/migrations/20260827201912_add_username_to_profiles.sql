/*
# Agregar username a profiles

El registro no pedía ningún nombre — el "perfil" del usuario era solo su
email. Se agrega una columna `username`, se usa como nombre del perfil en
la app, y se llena automáticamente al registrarse.

- Nullable (no se puede rellenar retroactivamente para cuentas ya
  existentes, y una cuenta de Google puede loguearse sin pasar por el
  formulario de registro con el campo nuevo) — la UI le pide a quien no
  tenga uno que elija uno la próxima vez que entre.
- UNIQUE: Postgres no cuenta los NULL como duplicados entre sí, así que
  varias cuentas sin username todavía no chocan entre ellas.
- handle_new_user() y ensure_profile() ahora leen `raw_user_meta_data->>
  'username'`, que es donde queda el campo que se manda como `data` en
  supabase.auth.signUp() (ver src/lib/auth.tsx).
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
  END IF;
  -- 3-24 caracteres, letras/números/guión bajo — NULL sigue permitido (no
  -- aplica a cuentas sin username todavía).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format
      CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_]{3,24}$');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, role, username)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email = 'siiknotic@gmail.com' THEN 'admin' ELSE 'user' END,
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), '')
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_username text;
  v_row profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row FROM profiles WHERE id = v_uid;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT email, NULLIF(trim(raw_user_meta_data->>'username'), '')
    INTO v_email, v_username
    FROM auth.users WHERE id = v_uid;

  INSERT INTO profiles (id, email, role, username)
  VALUES (v_uid, v_email, CASE WHEN v_email = 'siiknotic@gmail.com' THEN 'admin' ELSE 'user' END, v_username)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
