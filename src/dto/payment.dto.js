import { z } from 'zod';

const uuidDto = z.string().uuid();
const idempotencyKeyDto = z.string().trim().min(1).max(255);

export const paymentIdParamsDto = z.object({
  id: uuidDto,
});

export const createPaymentDto = z.object({
  monto: z.coerce.number().finite().positive(),
  metodo: z.enum(['EFECTIVO', 'QR']),
  referenciaExterna: z.string().trim().min(1).max(200).optional().nullable(),
});

// Cobro en linea: sin `monto` se cobra todo el saldo pendiente de la venta.
export const createOnlinePaymentDto = z.object({
  monto: z.coerce.number().finite().positive().optional(),
});

export const confirmPaymentDto = z.object({
  claveIdempotencia: idempotencyKeyDto,
});
