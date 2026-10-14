-- Bloqueo de cuenta: 3 intentos fallidos => bloqueo de 3 minutos (la logica esta en authService.js).
BEGIN;

ALTER TABLE electronica_az.usuario
  ADD COLUMN IF NOT EXISTS intentos_fallidos integer NOT NULL DEFAULT 0
    CONSTRAINT ck_usuario_intentos_fallidos CHECK (intentos_fallidos >= 0),
  ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz;

COMMIT;
