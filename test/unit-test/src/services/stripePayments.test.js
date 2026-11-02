import Stripe from 'stripe';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const WEBHOOK_SECRET = 'whsec_unit_test';

// vi.mock se eleva al inicio del archivo: todo lo que usan sus fabricas se declara con vi.hoisted.
const { mockAllFunctions, gateway } = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test';
  return {
    mockAllFunctions: async (importOriginal) => {
      const original = await importOriginal();
      return Object.fromEntries(Object.keys(original).map((name) => [
        name,
        typeof original[name] === 'function' ? vi.fn() : original[name],
      ]));
    },
    // Cliente falso de la pasarela; `webhooks` es el real de Stripe para verificar firmas de verdad.
    gateway: {
      configured: true,
      client: {
        checkout: { sessions: { create: vi.fn(), expire: vi.fn() } },
        refunds: { create: vi.fn() },
        webhooks: null,
      },
    },
  };
});
vi.mock('../../../../src/repositories/paymentRepository.js', mockAllFunctions);
vi.mock('../../../../src/repositories/saleRepository.js', mockAllFunctions);
vi.mock('../../../../src/repositories/securityRepository.js', mockAllFunctions);
vi.mock('../../../../src/lib/stripe.js', async () => {
  const { default: RealStripe } = await import('stripe');
  gateway.client.webhooks = new RealStripe('sk_test_unit').webhooks;
  return { getStripe: () => (gateway.configured ? gateway.client : null) };
});

const realStripe = new Stripe('sk_test_unit');
const fakeStripe = gateway.client;

import { createApp } from '../../../../src/app.js';
import {
  confirmPayment,
  createPayment,
  getIdempotencyRecord,
  getPaymentById,
  getPaymentByReference,
  markPaymentRefunded,
  rejectPayment,
} from '../../../../src/repositories/paymentRepository.js';
import { getSaleById } from '../../../../src/repositories/saleRepository.js';
import { addLog } from '../../../../src/repositories/securityRepository.js';
import {
  confirmPaymentService,
  createOnlinePaymentService,
  handleStripeWebhookService,
} from '../../../../src/services/paymentService.js';

const vendedor = { id: 'u1', roles: ['VENDEDOR'] };
const draftSale = {
  id_venta: 'v1',
  estado: 'BORRADOR',
  cliente_nombre: 'Ana',
  detalles: [{ cantidad: 2, precio_unitario: 10.15 }],
  pagos: [],
};
const pendingOnline = {
  id_pago: 'pg1', id_venta: 'v1', monto: '20.30', metodo: 'EN_LINEA', estado: 'PENDIENTE', referencia_externa: 'cs_1',
};

const signedEvent = (type, session) => {
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type, data: { object: session } });
  const signature = realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, signature };
};

const paidSession = { id: 'cs_1', payment_status: 'paid', amount_total: 2030, payment_intent: 'pi_1' };

beforeEach(() => {
  vi.clearAllMocks();
  gateway.configured = true;
  getIdempotencyRecord.mockResolvedValue(null);
  addLog.mockResolvedValue(undefined);
});

describe('CU-16 cobro en linea', () => {
  test('creates a checkout session for the exact balance and stores it as a pending online payment', async () => {
    getSaleById.mockResolvedValue(draftSale);
    fakeStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    createPayment.mockImplementation(async (idVenta, idUsuario, monto, metodo, ref) => ({
      id_pago: 'pg1', id_venta: idVenta, monto, metodo, estado: 'PENDIENTE', referencia_externa: ref,
    }));

    const result = await createOnlinePaymentService('v1', {}, vendedor);

    const params = fakeStripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'bob', unit_amount: 2030 });
    expect(params.metadata).toEqual({ idVenta: 'v1' });
    expect(createPayment).toHaveBeenCalledWith('v1', 'u1', 20.3, 'EN_LINEA', 'cs_1');
    expect(result).toMatchObject({ estado: 'PENDIENTE', urlPago: 'https://checkout.stripe.com/c/pay/cs_1' });
  });

  test('answers 503 when the gateway keys are not configured', async () => {
    gateway.configured = false;
    await expect(createOnlinePaymentService('v1', {}, vendedor)).rejects.toMatchObject({
      statusCode: 503,
      details: { reason: 'PAYMENT_GATEWAY_NOT_CONFIGURED' },
    });
  });

  test('cancels the gateway session if the payment cannot be stored', async () => {
    getSaleById.mockResolvedValue(draftSale);
    fakeStripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_2', url: 'u' });
    fakeStripe.checkout.sessions.expire.mockResolvedValue({});
    createPayment.mockRejectedValue(new Error('db down'));
    await expect(createOnlinePaymentService('v1', {}, vendedor)).rejects.toThrow('db down');
    expect(fakeStripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_2');
  });

  test('an online payment cannot be confirmed by hand', async () => {
    getPaymentById.mockResolvedValue(pendingOnline);
    await expect(confirmPaymentService('pg1', { claveIdempotencia: 'k1' }, vendedor))
      .rejects.toMatchObject({ details: { reason: 'PAYMENT_CONFIRMED_BY_GATEWAY' } });
    expect(confirmPayment).not.toHaveBeenCalled();
  });
});

describe('CU-16 webhook de la pasarela', () => {
  test('rejects a request with an invalid signature', async () => {
    const { payload } = signedEvent('checkout.session.completed', paidSession);
    await expect(handleStripeWebhookService(Buffer.from(payload), 't=1,v1=bad'))
      .rejects.toMatchObject({ statusCode: 400, details: { reason: 'INVALID_WEBHOOK_SIGNATURE' } });
  });

  test('a paid session confirms the pending payment', async () => {
    getPaymentByReference.mockResolvedValue(pendingOnline);
    confirmPayment.mockResolvedValue({ status: 'OK', pago: { ...pendingOnline, estado: 'CONFIRMADO' } });
    const { payload, signature } = signedEvent('checkout.session.completed', paidSession);
    await expect(handleStripeWebhookService(Buffer.from(payload), signature))
      .resolves.toMatchObject({ resultado: 'CONFIRMADO' });
  });

  test('a repeated notification is applied only once', async () => {
    getPaymentByReference.mockResolvedValue({ ...pendingOnline, estado: 'CONFIRMADO' });
    const { payload, signature } = signedEvent('checkout.session.completed', paidSession);
    await expect(handleStripeWebhookService(Buffer.from(payload), signature))
      .resolves.toMatchObject({ resultado: 'YA_PROCESADO' });
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  test('refunds in the gateway when the sale was already paid meanwhile', async () => {
    getPaymentByReference.mockResolvedValue(pendingOnline);
    confirmPayment.mockResolvedValue({ status: 'OVERPAY', confirmedBefore: 20.3, saleTotal: 20.3 });
    const { payload, signature } = signedEvent('checkout.session.completed', paidSession);
    await expect(handleStripeWebhookService(Buffer.from(payload), signature))
      .resolves.toMatchObject({ resultado: 'DEVUELTO', motivo: 'OVERPAY' });
    expect(fakeStripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: 'refund-cs_1' });
    expect(markPaymentRefunded).toHaveBeenCalledWith('pg1');
  });

  test('refunds when the charged amount does not match the payment', async () => {
    getPaymentByReference.mockResolvedValue(pendingOnline);
    const { payload, signature } = signedEvent('checkout.session.completed', { ...paidSession, amount_total: 100 });
    await expect(handleStripeWebhookService(Buffer.from(payload), signature))
      .resolves.toMatchObject({ resultado: 'DEVUELTO', motivo: 'MONTO_DISTINTO' });
    expect(confirmPayment).not.toHaveBeenCalled();
  });

  test('an expired session rejects the pending payment', async () => {
    getPaymentByReference.mockResolvedValue(pendingOnline);
    rejectPayment.mockResolvedValue({ status: 'OK', pago: { ...pendingOnline, estado: 'RECHAZADO' } });
    const { payload, signature } = signedEvent('checkout.session.expired', { id: 'cs_1' });
    await expect(handleStripeWebhookService(Buffer.from(payload), signature))
      .resolves.toMatchObject({ resultado: 'RECHAZADO' });
    expect(rejectPayment).toHaveBeenCalledWith('pg1');
  });

  test('the route receives the raw body so the signature can be verified', async () => {
    getPaymentByReference.mockResolvedValue(pendingOnline);
    confirmPayment.mockResolvedValue({ status: 'OK', pago: pendingOnline });
    const { payload, signature } = signedEvent('checkout.session.completed', paidSession);
    const response = await request(createApp())
      .post('/api/pagos/webhook/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, resultado: 'CONFIRMADO' });
  });
});
