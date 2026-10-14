-- Soporte del panel de administracion (frontend): nombre y fecha de alta de usuarios,
-- jerarquia/estado de categorias y estado de unidades de medida.
BEGIN;

ALTER TABLE electronica_az.usuario
  ADD COLUMN IF NOT EXISTS nombre varchar(120),
  ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE electronica_az.usuario SET nombre = nombre_usuario WHERE nombre IS NULL;

ALTER TABLE electronica_az.categoria
  ADD COLUMN IF NOT EXISTS id_categoria_padre uuid,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_categoria_padre'
  ) THEN
    ALTER TABLE electronica_az.categoria
      ADD CONSTRAINT fk_categoria_padre FOREIGN KEY (id_categoria_padre)
        REFERENCES electronica_az.categoria (id_categoria)
        ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_categoria_no_propia_padre'
  ) THEN
    ALTER TABLE electronica_az.categoria
      ADD CONSTRAINT ck_categoria_no_propia_padre CHECK (id_categoria_padre IS NULL OR id_categoria_padre <> id_categoria);
  END IF;
END $$;

ALTER TABLE electronica_az.unidad_medida
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

COMMIT;
