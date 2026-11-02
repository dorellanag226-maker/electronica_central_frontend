import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../../src/repositories/saleRepository.js', async (importOriginal) => {
  const original = await importOriginal();
  return Object.fromEntries(Object.keys(original).map((name) => [
    name,
    typeof original[name] === 'function' ? vi.fn() : original[name],
  ]));
});
vi.mock('../../../../src/repositories/paymentRepository.js', async (importOriginal) => {
  const original = await importOriginal();
  return Object.fromEntries(Object.keys(original).map((name) => [
    name,
    typeof original[name] === 'function' ? vi.fn() : original[name],
  ]));
});
vi.mock('../../../../src/repositories/securityRepository.js', () => ({ addLog: vi.fn(() => Promise.resolve()) }));

import { createPayment } from '../../../../src/repositories/paymentRepository.js';
import {
  anularSale,
  confirmSale,
  getIdempotencyRecord,
  getSaleById,
  registerDefectReturn,
} from '../../../../src/repositories/saleRepository.js';
import { createPaymentService } from '../../../../src/services/paymentService.js';
import {
  anularSaleService,
  confirmSaleService,
  registerDefectReturnService,
} from '../../../../src/services/saleService.js';

const vendedor = { id: 'u1', roles: ['VENDEDOR'] };
const saleRow = (estado, precio = 10, pagos = []) => ({
  id_venta: 'v1',
  estado,
  id_usuario: 'u1',
  detalles: [{ id_detalle_venta: 'd1', id_producto: 'p1', cantidad: 2, precio_unitario: precio }],
  pagos,
  devoluciones: [],
});

describe('CU-15/16 pago antes de confirmar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getIdempotencyRecord.mockResolvedValue(null);
    createPayment.mockImplementation(async (idVenta, idUsuario, monto, metodo) => ({
      id_pago: 'pg1', monto, metodo, estado: 'PENDIENTE', id_venta: idVenta,
    }));
  });

  test('accepts a payment while the sale is still a draft', async () => {
    getSaleById.mockResolvedValue(saleRow('BORRADOR'));
    await expect(createPaymentService('v1', { monto: 5.2, metodo: 'EFECTIVO' }, vendedor))
      .resolves.toMatchObject({ monto: 5.5, estado: 'PENDIENTE' });
  });

  test('rejects payments on an annulled sale', async () => {
    getSaleById.mockResolvedValue(saleRow('ANULADA'));
    await expect(createPaymentService('v1', { monto: 5, metodo: 'EFECTIVO' }, vendedor))
      .rejects.toMatchObject({ details: { reason: 'SALE_NOT_PAYABLE' } });
  });

  test('the settling payment is charged at the exact balance instead of rounding up', async () => {
    getSaleById.mockResolvedValue(saleRow('BORRADOR', 10.15)); // total 20.30
    await payExpecting(20.3, 20.3);
    getSaleById.mockResolvedValue(saleRow('BORRADOR', 10.15, [{ estado: 'CONFIRMADO', monto: 20 }]));
    await payExpecting(0.3, 0.3);
  });

  test('a partial payment still rounds up to the next 0.50', async () => {
    getSaleById.mockResolvedValue(saleRow('BORRADOR', 10.15));
    await payExpecting(5.2, 5.5);
  });

  test('confirming with an outstanding balance is rejected with the amounts', async () => {
    confirmSale.mockResolvedValue({ status: 'BALANCE_NOT_ZERO', total: 20, cobrado: 5.5, saldo: 14.5 });
    await expect(confirmSaleService('v1', { claveIdempotencia: 'k1' }, vendedor)).rejects.toMatchObject({
      code: 'UE001',
      details: { reason: 'SALE_BALANCE_NOT_ZERO', saldo: 14.5 },
    });
  });
});

const payExpecting = async (monto, esperado) => {
  await expect(createPaymentService('v1', { monto, metodo: 'EFECTIVO' }, vendedor))
    .resolves.toMatchObject({ monto: esperado });
};

describe('CU-15 anulacion y devoluciones por defecto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getIdempotencyRecord.mockResolvedValue(null);
  });

  test('anular passes the reason to the repository', async () => {
    getSaleById.mockResolvedValue(saleRow('CONFIRMADA'));
    anularSale.mockResolvedValue({ status: 'OK', montoDevuelto: 20 });
    await anularSaleService('v1', { claveIdempotencia: 'k1', observacion: 'Producto equivocado' }, vendedor);
    expect(anularSale).toHaveBeenCalledWith('v1', 'u1', 'Producto equivocado');
  });

  test('a sale with defect returns cannot be annulled', async () => {
    getSaleById.mockResolvedValue(saleRow('CONFIRMADA'));
    anularSale.mockResolvedValue({ status: 'HAS_RETURNS' });
    await expect(anularSaleService('v1', { claveIdempotencia: 'k1', observacion: 'Error' }, vendedor))
      .rejects.toMatchObject({ details: { reason: 'SALE_HAS_RETURNS' } });
  });

  test('maps a refund result and reports quantity limits', async () => {
    registerDefectReturn.mockResolvedValueOnce({
      status: 'OK',
      stockRestante: 0,
      devolucion: { id_devolucion: 'dv1', tipo: 'REEMBOLSO', cantidad: '1', monto_reembolso: '15.00', observacion: 'No enciende' },
    });
    const body = { claveIdempotencia: 'k2', idProducto: 'p1', cantidad: 1, observacion: 'No enciende' };
    await expect(registerDefectReturnService('v1', body, vendedor)).resolves.toMatchObject({
      statusHttp: 201,
      data: { tipo: 'REEMBOLSO', cantidad: 1, montoReembolso: 15, stockRestante: 0 },
    });

    registerDefectReturn.mockResolvedValueOnce({ status: 'QUANTITY_EXCEEDED', disponible: 1 });
    await expect(registerDefectReturnService('v1', { ...body, claveIdempotencia: 'k3' }, vendedor))
      .rejects.toMatchObject({ details: { reason: 'RETURN_QUANTITY_EXCEEDED', disponible: 1 } });
  });

  test('only confirmed sales accept defect returns', async () => {
    registerDefectReturn.mockResolvedValue({ status: 'INVALID_STATE', estado: 'BORRADOR' });
    const body = { claveIdempotencia: 'k4', idProducto: 'p1', cantidad: 1, observacion: 'No enciende' };
    await expect(registerDefectReturnService('v1', body, vendedor))
      .rejects.toMatchObject({ details: { reason: 'SALE_NOT_CONFIRMADA' } });
  });
});
