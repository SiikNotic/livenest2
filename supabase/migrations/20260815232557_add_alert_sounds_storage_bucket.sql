/*
# Añadir bucket de Storage para sonidos de alerta personalizados

## Resumen
Permite a cada usuario subir sus propios archivos de audio (mp3/wav/ogg) para
usarlos como sonidos de alerta de follow, like, sub, share y gift, en lugar de
(o además de) los sonidos sintéticos generados por Web Audio API.

## Bucket
- `alert-sounds` (público para lectura, ya que los archivos deben poder
  reproducirse directamente en el navegador mediante una URL pública)

## Convención de rutas
Cada usuario sube sus archivos bajo su propio uid como prefijo de carpeta:
  {user_id}/{event_key}-{timestamp}.{ext}
Esto permite aplicar políticas de RLS basadas en auth.uid() sin necesitar
columnas adicionales.

## Seguridad
- Lectura (SELECT): pública, cualquiera puede reproducir un sonido si conoce la URL.
- Escritura (INSERT/UPDATE/DELETE): solo el propio usuario autenticado, y solo
  dentro de la carpeta que empieza con su propio auth.uid().
*/

-- Crear el bucket si no existe (público, límite de 5MB por archivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'alert-sounds',
  'alert-sounds',
  true,
  5242880,
  ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/x-wav']
)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública de los archivos del bucket
CREATE POLICY "Public read access for alert sounds"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'alert-sounds');

-- Solo el usuario dueño de la carpeta puede subir archivos nuevos
CREATE POLICY "Users can upload their own alert sounds"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'alert-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Solo el usuario dueño puede actualizar sus propios archivos
CREATE POLICY "Users can update their own alert sounds"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'alert-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'alert-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Solo el usuario dueño puede borrar sus propios archivos
CREATE POLICY "Users can delete their own alert sounds"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'alert-sounds'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
