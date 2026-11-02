import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { errorCodes } from '../config/errorCodes.js';
import { logger } from '../lib/logger.js';
import { getStripe } from '../lib/stripe.js';
import {
  OPERACION_PAGO_CONFIRMAR,
  confirmPayment,
  createPayment,
  getIdempotencyRecord,
  getPaymentById,
  getPaymentByReference,
  listPaymentsBySale,
  markPaymentRefunded,
  rejectPayment,
  saveIdempotencyRecord,
} from '../repositories/paymentRepository.js';
import { getSaleById } from '../repositories/saleRepository.js';
import { addLog } from '../repositories/securityRepository.js';
import { AppError } from '../utils/AppError.js';
import { ceilToHalfStep, roundHalfUp2 } from './saleHelpers.js';
import { computeTotals } from './saleService.js';

const hashPayload = (payload) => createHash('sha256')
  .update(JSON.stringify(payload))
  .digest('hex');

const mapPayment = (row) => ({
  idPago: row.id_pago,
  fechaHora: row.fecha_hora,
  monto: Number(row.monto),
  metodo: row.metodo,
  estado: row.estado,
  referenciaExterna: row.referencia_externa,
  idVenta: row.id_venta,
});

const resolveIdempotency = async (idUsuario, operacion, clave, payload) => {
  const hash = hashPayload(payload);
  const existing = await getIdempotencyRecord(idUsuario, operacion, clave);
  if (!existing) return { hash, hit: false };
  if (existing.hash_solicitud !== hash) {
    throw new AppError(errorCodes.CONFLICT, 409, { reason: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  }
  return {
    hash,
    hit: true,
    statusHttp: existing.estado_http,
    respuesta: existing.respuesta,
  };
};

const persistIdempotency = async (idUsuario, operacion, clave, hash, statusHttp, data) => {
  try {
    await saveIdempotencyRecord(idUsuario, operacion, clave, hash, statusHttp, data);
  } catch (error) {
    if (error.code === '23505') {
      const existing = await getIdempotencyRecord(idUsuario, operacion, clave);
      if (existing && existing.hash_solicitud === hash) {
        return { cached: true, statusHttp: existing.estado_http, data: existing.respuesta };
      }
      throw new AppError(errorCodes.CONFLICT, 409, { reason: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
    }
    throw error;
  }
  return null;
};

export const listPaymentsService = async (idVenta) => {
  const sale = await getSaleById(idVenta);
  if (!sale) throw new AppError(errorCodes.NOT_FOUND);
  const rows = await listPaymentsBySale(idVenta);
  return rows.map(mapPayment);
};

// CU-16: el pago se registra con la venta en BORRADOR y luego se confirma la venta (CU-15).
// CONFIRMADA se admite solo para cobrar saldos de ventas confirmadas antes de esta regla.
export const PAYABLE_SALE_STATES = ['BORRADOR', 'CONFIRMADA'];

export const createPaymentService = async (idVenta, body, usuario) => {
  const sale = await getSaleById(idVenta);
  if (!sale) throw new AppError(errorCodes.NOT_FOUND);
  if (!PAYABLE_SALE_STATES.includes(sale.estado)) {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'SALE_NOT_PAYABLE', estado: sale.estado });
  }

  const totals = computeTotals(sale.detalles, sale.pagos);
  let monto = ceilToHalfStep(body.monto);
  // Los precios no son multiplos de 0.50: si el pago redondeado salda la venta, se cobra el saldo
  // exacto. Si no, una venta de 20.30 nunca llegaria a saldo 0 y no se podria confirmar.
  const saldoRedondeado = Number((Math.ceil(roundHalfUp2(totals.saldo) / 0.5) * 0.5).toFixed(2));
  if (totals.saldo > 0 && monto > totals.saldo && monto <= saldoRedondeado) monto = totals.saldo;
  if (roundHalfUp2(totals.cobrado + monto) > totals.total) {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'PAYMENT_EXCEEDS_BALANCE',
      total: totals.total,
      cobrado: totals.cobrado,
      monto,
    });
  }

  try {
    const row = await createPayment(
      idVenta,
      usuario.id,
      monto,
      body.metodo,
      body.referenciaExterna,
    );
    return mapPayment(row);
  } catch (error) {
    if (error.code === '23505') throw new AppError(errorCodes.CONFLICT, 409, { reason: 'DUPLICATE_REFERENCE' });
    throw error;
  }
};

export const confirmPaymentService = async (idPago, body, usuario) => {
  const payload = { idPago };
  const idem = await resolveIdempotency(
    usuario.id, OPERACION_PAGO_CONFIRMAR, body.claveIdempotencia, payload,
  );
  if (idem.hit) return { cached: true, statusHttp: idem.statusHttp, data: idem.respuesta };

  const existing = await getPaymentById(idPago);
  if (!existing) throw new AppError(errorCodes.NOT_FOUND);
  if (existing.metodo === ONLINE_METHOD) {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'PAYMENT_CONFIRMED_BY_GATEWAY',
      mensaje: 'Los pagos en línea los confirma la pasarela de pago automáticamente.',
    });
  }

  // El total de la venta se calcula dentro de la transaccion, con la venta bloqueada.
  const result = await confirmPayment(idPago, PAYABLE_SALE_STATES);
  if (result.status === 'NOT_FOUND') throw new AppError(errorCodes.NOT_FOUND);
  if (result.status === 'INVALID_STATE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'PAYMENT_NOT_PENDING',
      estado: result.estado,
    });
  }
  if (result.status === 'SALE_NOT_PAYABLE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'SALE_NOT_PAYABLE', estado: result.estado });
  }
  if (result.status === 'OVERPAY') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'PAYMENT_EXCEEDS_BALANCE',
      total: result.saleTotal,
      cobrado: result.confirmedBefore,
    });
  }

  const data = mapPayment(result.pago);
  const raced = await persistIdempotency(
    usuario.id, OPERACION_PAGO_CONFIRMAR, body.claveIdempotencia, idem.hash, 200, data,
  );
  if (raced) return raced;
  return { cached: false, statusHttp: 200, data };
};

export const rejectPaymentService = async (idPago) => {
  const existing = await getPaymentById(idPago);
  if (!existing) throw new AppError(errorCodes.NOT_FOUND);
  // Un cobro en linea pendiente se cancela tambien en la pasarela, para que el cliente ya no pueda pagarlo.
  if (existing.metodo === ONLINE_METHOD && existing.estado === 'PENDIENTE') {
    const stripe = requireStripe();
    try {
      await stripe.checkout.sessions.expire(existing.referencia_externa);
    } catch (error) {
      throw new AppError(errorCodes.CONFLICT, 409, {
        reason: 'PAYMENT_ALREADY_PROCESSED_BY_GATEWAY',
        mensaje: 'La pasarela ya procesó este cobro; espere su confirmación.',
        detalle: error.message,
      });
    }
  }

  const result = await rejectPayment(idPago);
  if (result.status === 'NOT_FOUND') throw new AppError(errorCodes.NOT_FOUND);
  if (result.status === 'INVALID_STATE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'PAYMENT_NOT_PENDING',
      estado: result.estado,
    });
  }
  return mapPayment(result.pago);
};

// ---------- Pasarela de pago en linea (CU-16) ----------

export const ONLINE_METHOD = 'EN_LINEA';

const requireStripe = () => {
  const stripe = getStripe();
  if (!stripe) {
    throw new AppError(errorCodes.SERVICE_UNAVAILABLE, 503, {
      reason: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
      mensaje: 'El cobro en línea no está habilitado en el servidor.',
    });
  }
  return stripe;
};

const toMinorUnits = (monto) => Math.round(roundHalfUp2(monto) * 100);

// La bitacora es auxiliar: si falla el registro, el cobro no cambia.
const logGatewayEvent = (accion, objeto, resultado, idUsuario = null) => (
  addLog(accion, objeto, resultado, idUsuario, null).catch(() => undefined)
);

// Genera el cobro en la pasarela y devuelve el enlace de pago (el frontend lo muestra como enlace o QR).
// El pago queda PENDIENTE hasta que la pasarela avise por webhook.
export const createOnlinePaymentService = async (idVenta, body, usuario) => {
  const stripe = requireStripe();
  const sale = await getSaleById(idVenta);
  if (!sale) throw new AppError(errorCodes.NOT_FOUND);
  if (!PAYABLE_SALE_STATES.includes(sale.estado)) {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'SALE_NOT_PAYABLE', estado: sale.estado });
  }

  const totals = computeTotals(sale.detalles, sale.pagos);
  if (totals.saldo <= 0) {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'SALE_ALREADY_PAID' });
  }
  // En linea se cobra el importe exacto (sin redondeo a 0.50); por defecto, todo el saldo.
  const monto = roundHalfUp2(body.monto ?? totals.saldo);
  if (monto > totals.saldo) {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'PAYMENT_EXCEEDS_BALANCE',
      total: totals.total,
      cobrado: totals.cobrado,
      monto,
    });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + env.STRIPE_CHECKOUT_EXPIRES_MINUTES * 60;
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: env.STRIPE_CURRENCY,
          unit_amount: toMinorUnits(monto),
          product_data: { name: `Electrónica Central AZ - venta a ${sale.cliente_nombre}` },
        },
      }],
      metadata: { idVenta },
      success_url: env.PAYMENT_SUCCESS_URL,
      cancel_url: env.PAYMENT_CANCEL_URL,
      expires_at: expiresAt,
    });
  } catch (error) {
    logger.error('stripe.checkout_create_failed', { idVenta, message: error.message });
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'PAYMENT_GATEWAY_ERROR',
      mensaje: 'La pasarela de pago rechazó la solicitud de cobro.',
      detalle: error.message,
    });
  }

  let row;
  try {
    row = await createPayment(idVenta, usuario.id, monto, ONLINE_METHOD, session.id);
  } catch (error) {
    // Si no se pudo registrar el pago, se cancela el cobro para que nadie pague algo que no existe.
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    throw error;
  }

  await logGatewayEvent('PAGO_EN_LINEA_GENERADO', `Venta ${idVenta}: ${monto} (${session.id})`, 'OK', usuario.id);
  return {
    ...mapPayment(row),
    urlPago: session.url,
    expiraEn: new Date(expiresAt * 1000).toISOString(),
  };
};

// El cobro no se puede aplicar a la venta: se devuelve el dinero en la pasarela y el pago queda ANULADO.
const refundUnapplicablePayment = async (stripe, pago, session, motivo) => {
  await stripe.refunds.create(
    { payment_intent: session.payment_intent },
    { idempotencyKey: `refund-${session.id}` },
  );
  await markPaymentRefunded(pago.id_pago);
  await logGatewayEvent('PAGO_EN_LINEA_DEVUELTO', `Pago ${pago.id_pago}: ${motivo}`, 'DEVUELTO');
  return { pago: pago.id_pago, resultado: 'DEVUELTO', motivo };
};

const settleCompletedSession = async (stripe, session) => {
  const pago = await getPaymentByReference(session.id);
  if (!pago) {
    logger.warn('stripe.unknown_session', { sessionId: session.id });
    return { resultado: 'IGNORADO', motivo: 'SESION_DESCONOCIDA' };
  }
  if (pago.estado === 'CONFIRMADO' || pago.estado === 'ANULADO') {
    return { pago: pago.id_pago, resultado: 'YA_PROCESADO' }; // Stripe reintenta: el aviso se aplica una vez.
  }
  if (session.amount_total !== toMinorUnits(pago.monto)) {
    return refundUnapplicablePayment(stripe, pago, session, 'MONTO_DISTINTO');
  }
  if (pago.estado === 'RECHAZADO') {
    return refundUnapplicablePayment(stripe, pago, session, 'PAGO_RECHAZADO_ANTES');
  }

  const result = await confirmPayment(pago.id_pago, PAYABLE_SALE_STATES);
  if (result.status === 'OK') {
    await logGatewayEvent('PAGO_EN_LINEA_CONFIRMADO', `Pago ${pago.id_pago} de venta ${pago.id_venta}`, 'OK');
    return { pago: pago.id_pago, resultado: 'CONFIRMADO' };
  }
  if (result.status === 'OVERPAY' || result.status === 'SALE_NOT_PAYABLE') {
    return refundUnapplicablePayment(stripe, pago, session, result.status);
  }
  return { pago: pago.id_pago, resultado: 'IGNORADO', motivo: result.status };
};

const rejectExpiredSession = async (session) => {
  const pago = await getPaymentByReference(session.id);
  if (!pago || pago.estado !== 'PENDIENTE') return { resultado: 'IGNORADO' };
  await rejectPayment(pago.id_pago);
  await logGatewayEvent('PAGO_EN_LINEA_RECHAZADO', `Pago ${pago.id_pago} de venta ${pago.id_venta}`, 'RECHAZADO');
  return { pago: pago.id_pago, resultado: 'RECHAZADO' };
};

// Webhook de la pasarela: verifica la firma con el cuerpo crudo y aplica el resultado del cobro.
export const handleStripeWebhookService = async (rawBody, signature) => {
  const stripe = requireStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(errorCodes.SERVICE_UNAVAILABLE, 503, { reason: 'PAYMENT_WEBHOOK_NOT_CONFIGURED' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    logger.warn('stripe.invalid_signature', { message: error.message });
    throw new AppError(errorCodes.VALIDATION_ERROR, 400, { reason: 'INVALID_WEBHOOK_SIGNATURE' });
  }

  const session = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      // Con medios asincronos el pago aun no esta acreditado; llegara async_payment_succeeded.
      return session.payment_status === 'paid'
        ? settleCompletedSession(stripe, session)
        : { resultado: 'EN_ESPERA' };
    case 'checkout.session.async_payment_succeeded':
      return settleCompletedSession(stripe, session);
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return rejectExpiredSession(session);
    default:
      return { resultado: 'IGNORADO', tipo: event.type };
  }
};
