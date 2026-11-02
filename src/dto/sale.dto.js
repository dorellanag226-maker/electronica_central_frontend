import { z } from 'zod';

const uuidDto = z.string().uuid();
const positiveQuantityDto = z.coerce.number().finite().positive();
const nonnegativePriceDto = z.coerce.number().finite().nonnegative();
const idempotencyKeyDto = z.string().trim().min(1).max(255);

const saleDetailDto = z.object({
  idProducto: uuidDto,
  cantidad: positiveQuantityDto,
  precioUnitario: nonnegativePriceDto.optional(),
});

const assertUniqueProducts = (detalles, ctx) => {
  const seen = new Set();
  for (const [index, detail] of detalles.entries()) {
    if (seen.has(detail.idProducto)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate idProducto in detalles',
        path: ['detalles', index, 'idProducto'],
      });
    }
    seen.add(detail.idProducto);
  }
};

export const saleIdParamsDto = z.object({
  id: uuidDto,
});

export const comprobanteQueryDto = z.object({
  formato: z.enum(['json', 'pdf']).default('json'),
});

export const listSalesQueryDto = z.object({
  estado: z.enum(['BORRADOR', 'CONFIRMADA', 'ANULADA']).optional(),
  idCliente: uuidDto.optional(),
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().positive().max(100).default(20),
});

export const createSaleDto = z.object({
  idCliente: uuidDto,
  detalles: z.array(saleDetailDto).min(1),
}).superRefine((data, ctx) => assertUniqueProducts(data.detalles, ctx));

export const updateSaleDto = z.object({
  idCliente: uuidDto,
  detalles: z.array(saleDetailDto).min(1),
}).superRefine((data, ctx) => assertUniqueProducts(data.detalles, ctx));

export const idempotentSaleActionDto = z.object({
  claveIdempotencia: idempotencyKeyDto,
});

// Solo se anula por error de registro; la observacion explica cual fue el error.
export const anularSaleDto = z.object({
  claveIdempotencia: idempotencyKeyDto,
  observacion: z.string().trim().min(5).max(500),
});

export const defectReturnDto = z.object({
  claveIdempotencia: idempotencyKeyDto,
  idProducto: uuidDto,
  cantidad: positiveQuantityDto,
  observacion: z.string().trim().min(5).max(500),
});
