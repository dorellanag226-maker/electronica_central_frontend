-- CU-16: cobro en linea mediante pasarela de pago externa (Stripe Checkout).
--   * pago.metodo admite 'EN_LINEA': lo confirma o rechaza la pasarela por webhook, no el vendedor.
--   * pago.referencia_externa guarda el id de la sesion de pago de la pasarela (ya es UNIQUE).
BEGIN;

ALTER TABLE electronica_az.pago DROP CONSTRAINT IF EXISTS ck_pago_metodo;
ALTER TABLE electronica_az.pago
  ADD CONSTRAINT ck_pago_metodo CHECK (metodo IN ('EFECTIVO', 'QR', 'EN_LINEA'));

COMMENT ON COLUMN electronica_az.pago.referencia_externa IS
  'Identificador del pago en el medio de cobro: comprobante QR o id de la sesion de la pasarela';

COMMIT;
