import { query, withTransaction } from '../lib/database.js';

export const OPERACION_PAGO_CONFIRMAR = 'PAGO_CONFIRMAR';

export const listPaymentsBySale = async (idVenta) => {
  const result = await query(
    `SELECT id_pago, fecha_hora, monto, metodo, estado, referencia_externa, id_venta, id_usuario
     FROM electronica_az.pago WHERE id_venta = $1
     ORDER BY fecha_hora ASC, id_pago ASC`,
    [idVenta],
  );
  return result.rows;
};

export const getPaymentById = async (idPago) => {
  const result = await query(
    `SELECT id_pago, fecha_hora, monto, metodo, estado, referencia_externa, id_venta, id_usuario
     FROM electronica_az.pago WHERE id_pago = $1`,
    [idPago],
  );
  return result.rows[0] ?? null;
};

export const getPaymentByReference = async (referenciaExterna) => {
  const result = await query(
    `SELECT id_pago, fecha_hora, monto, metodo, estado, referencia_externa, id_venta, id_usuario
     FROM electronica_az.pago WHERE referencia_externa = $1`,
    [referenciaExterna],
  );
  return result.rows[0] ?? null;
};

// La pasarela cobro pero el pago no podia aplicarse (venta anulada, ya pagada o pago rechazado antes):
// se devolvio el dinero en la pasarela y el pago queda ANULADO (cobrado y devuelto).
export const markPaymentRefunded = async (idPago) => {
  const result = await query(
    `UPDATE electronica_az.pago SET estado = 'ANULADO'
     WHERE id_pago = $1 AND estado IN ('PENDIENTE', 'RECHAZADO')
     RETURNING id_pago, fecha_hora, monto, metodo, estado, referencia_externa, id_venta, id_usuario`,
    [idPago],
  );
  return result.rows[0] ?? null;
};

export const createPayment = async (idVenta, idUsuario, monto, metodo, referenciaExterna) => {
  const result = await query(
    `INSERT INTO electronica_az.pago(
       id_venta, id_usuario, monto, metodo, estado, referencia_externa
     ) VALUES ($1, $2, $3, $4, 'PENDIENTE', $5)
     RETURNING id_pago, fecha_hora, monto, metodo, estado, referencia_externa, id_venta, id_usuario`,
    [idVenta, idUsuario, monto, metodo, referenciaExterna ?? null],
  );
  return result.rows[0];
};

export const confirmPayment = async (idPago, payableStates) => withTransaction(async (client) => {
  const payment = await client.query(
    `SELECT id_pago, estado, monto, id_venta, metodo, referencia_externa, id_usuario, fecha_hora
     FROM electronica_az.pago WHERE id_pago = $1 FOR UPDATE`,
    [idPago],
  );
  const row = payment.rows[0];
  if (!row) return { status: 'NOT_FOUND' };
  if (row.estado !== 'PENDIENTE') return { status: 'INVALID_STATE', estado: row.estado };

  const venta = await client.query(
    `SELECT id_venta, estado FROM electronica_az.venta WHERE id_venta = $1 FOR UPDATE`,
    [row.id_venta],
  );
  if (!venta.rows[0] || !payableStates.includes(venta.rows[0].estado)) {
    return { status: 'SALE_NOT_PAYABLE', estado: venta.rows[0]?.estado ?? null };
  }

  // Mismo redondeo que computeTotals (half-up a 2 decimales): numeric round() redondea hacia arriba en .5.
  const saleTotal = Number((await client.query(
    `SELECT round(coalesce(sum(cantidad * precio_unitario), 0), 2) AS total
     FROM electronica_az.detalle_venta WHERE id_venta = $1`,
    [row.id_venta],
  )).rows[0].total);

  const sum = await client.query(
    `SELECT coalesce(sum(monto), 0)::numeric AS total
     FROM electronica_az.pago WHERE id_venta = $1 AND estado = 'CONFIRMADO'`,
    [row.id_venta],
  );
  const confirmedBefore = Number(sum.rows[0].total);
  const next = Number((confirmedBefore + Number(row.monto)).toFixed(2));
  if (next > Number(saleTotal)) {
    return { status: 'OVERPAY', confirmedBefore, saleTotal: Number(saleTotal) };
  }

  await client.query(
    `UPDATE electronica_az.pago SET estado = 'CONFIRMADO' WHERE id_pago = $1`,
    [idPago],
  );

  return {
    status: 'OK',
    pago: { ...row, estado: 'CONFIRMADO' },
    confirmedBefore,
  };
});

export const rejectPayment = async (idPago) => withTransaction(async (client) => {
  const payment = await client.query(
    `SELECT id_pago, estado, monto, id_venta, metodo, referencia_externa, id_usuario, fecha_hora
     FROM electronica_az.pago WHERE id_pago = $1 FOR UPDATE`,
    [idPago],
  );
  const row = payment.rows[0];
  if (!row) return { status: 'NOT_FOUND' };
  if (row.estado !== 'PENDIENTE') return { status: 'INVALID_STATE', estado: row.estado };

  await client.query(
    `UPDATE electronica_az.pago SET estado = 'RECHAZADO' WHERE id_pago = $1`,
    [idPago],
  );
  return { status: 'OK', pago: { ...row, estado: 'RECHAZADO' } };
});

export {
  getIdempotencyRecord,
  saveIdempotencyRecord,
} from './saleRepository.js';
