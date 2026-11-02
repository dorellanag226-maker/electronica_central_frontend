-- Recuperacion de contrasena (CU-22): enlace de un solo uso y con validez limitada.
-- Solo se guarda el hash SHA-256 del token; el token en claro viaja unicamente en el correo.
BEGIN;

CREATE TABLE IF NOT EXISTS electronica_az.token_recuperacion (
  id_token uuid NOT NULL DEFAULT gen_random_uuid(),
  hash_token varchar(64) NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en timestamptz NOT NULL,
  usado_en timestamptz,
  id_usuario uuid NOT NULL,
  CONSTRAINT pk_token_recuperacion PRIMARY KEY (id_token),
  CONSTRAINT uq_token_recuperacion_hash UNIQUE (hash_token),
  CONSTRAINT ck_token_recuperacion_expira CHECK (expira_en > creado_en),
  CONSTRAINT fk_token_recuperacion_id_usuario FOREIGN KEY (id_usuario)
    REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_token_recuperacion_id_usuario
  ON electronica_az.token_recuperacion (id_usuario);

COMMENT ON TABLE electronica_az.token_recuperacion IS
  'Enlaces de recuperacion de contrasena; un solo uso, validez limitada, solo se almacena el hash';

COMMIT;
