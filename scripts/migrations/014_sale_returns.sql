-- CU-15/16: pago antes de confirmar, anulacion por error de registro y devoluciones por defecto.
--   * pago.estado admite 'ANULADO': el pago se cobro y se devolvio al anular la venta.
--   * venta.observacion_anulacion: por que se anulo (solo se anula por error de registro).
--   * devolucion: producto fallado de una venta confirmada. Si hay stock se CAMBIA por otro igual;
--     si no, se REEMBOLSA. En ambos casos la unidad fallada no vuelve al stock disponible.
BEGIN;

ALTER TABLE electronica_az.pago DROP CONSTRAINT IF EXISTS ck_pago_estado;
ALTER TABLE electronica_az.pago
  ADD CONSTRAINT ck_pago_estado CHECK (estado IN ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'ANULADO'));

ALTER TABLE electronica_az.venta
  ADD COLUMN IF NOT EXISTS observacion_anulacion text;

CREATE TABLE IF NOT EXISTS electronica_az.devolucion (
  id_devolucion uuid NOT NULL DEFAULT gen_random_uuid(),
  fecha_hora timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo varchar(20) NOT NULL,
  cantidad numeric(18,4) NOT NULL,
  monto_reembolso numeric(18,2) NOT NULL DEFAULT 0,
  costo_unitario numeric(18,4) NOT NULL,
  observacion text NOT NULL,
  id_venta uuid NOT NULL,
  id_detalle_venta uuid NOT NULL,
  id_movimiento uuid,
  id_usuario uuid NOT NULL,
  CONSTRAINT pk_devolucion PRIMARY KEY (id_devolucion),
  CONSTRAINT ck_devolucion_tipo CHECK (tipo IN ('CAMBIO', 'REEMBOLSO')),
  CONSTRAINT ck_devolucion_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
  CONSTRAINT ck_devolucion_monto CHECK (monto_reembolso >= 0 AND monto_reembolso <> 'NaN'::numeric),
  CONSTRAINT ck_devolucion_costo CHECK (costo_unitario >= 0 AND costo_unitario <> 'NaN'::numeric),
  -- Un cambio no devuelve dinero y siempre saca la unidad de reemplazo del stock.
  CONSTRAINT ck_devolucion_cambio CHECK (
    tipo <> 'CAMBIO' OR (monto_reembolso = 0 AND id_movimiento IS NOT NULL)
  ),
  CONSTRAINT ck_devolucion_observacion CHECK (btrim(observacion) <> ''),
  CONSTRAINT fk_devolucion_venta FOREIGN KEY (id_venta)
    REFERENCES electronica_az.venta (id_venta) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_devolucion_detalle_venta FOREIGN KEY (id_detalle_venta)
    REFERENCES electronica_az.detalle_venta (id_detalle_venta) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_devolucion_movimiento FOREIGN KEY (id_movimiento)
    REFERENCES electronica_az.movimiento_inventario (id_movimiento) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_devolucion_usuario FOREIGN KEY (id_usuario)
    REFERENCES electronica_az.usuario (id_usuario) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_devolucion_id_venta ON electronica_az.devolucion (id_venta);
CREATE INDEX IF NOT EXISTS ix_devolucion_id_detalle_venta ON electronica_az.devolucion (id_detalle_venta);
CREATE INDEX IF NOT EXISTS ix_devolucion_fecha_hora ON electronica_az.devolucion (fecha_hora);

COMMENT ON TABLE electronica_az.devolucion IS
  'Productos fallados de ventas confirmadas: CAMBIO por otro igual si hay stock, si no REEMBOLSO';

COMMIT;
