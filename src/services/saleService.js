import { createHash } from 'node:crypto';
import { errorCodes } from '../config/errorCodes.js';
import {
  OPERACION_ANULAR,
  OPERACION_CONFIRMAR,
  OPERACION_DEVOLUCION,
  OPERACION_ENTREGA,
  anularSale,
  confirmSale,
  createDelivery,
  createSale,
  getClientById,
  getIdempotencyRecord,
  getProductsForSale,
  getSaleById,
  listSales,
  registerDefectReturn,
  replaceSale,
  saveIdempotencyRecord,
} from '../repositories/saleRepository.js';
import { addLog } from '../repositories/securityRepository.js';
import { AppError } from '../utils/AppError.js';
import { assertQuantityFraction } from './inventoryHelpers.js';
import { roundHalfUp2 } from './saleHelpers.js';

const hashPayload = (payload) => createHash('sha256')
  .update(JSON.stringify(payload))
  .digest('hex');

const canSeeCost = (usuario) => {
  const roles = usuario.roles ?? [];
  return roles.includes('ADMINISTRADOR') || roles.includes('DESARROLLADOR');
};

const canAnularAny = (usuario) => {
  const roles = usuario.roles ?? [];
  return roles.includes('ADMINISTRADOR') || roles.includes('DESARROLLADOR');
};

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

const mapDetail = (row, includeCost) => {
  const detail = {
    idDetalleVenta: row.id_detalle_venta,
    idProducto: row.id_producto,
    cantidad: Number(row.cantidad),
    precioUnitario: Number(row.precio_unitario),
    codigo: row.codigo,
    nombre: row.nombre,
    subtotal: roundHalfUp2(Number(row.cantidad) * Number(row.precio_unitario)),
  };
  if (includeCost) detail.costoUnitarioHistorico = Number(row.costo_unitario_historico);
  return detail;
};

const mapPayment = (row) => ({
  idPago: row.id_pago,
  fechaHora: row.fecha_hora,
  monto: Number(row.monto),
  metodo: row.metodo,
  estado: row.estado,
  referenciaExterna: row.referencia_externa,
});

const computeTotals = (detalles, pagos = []) => {
  const bruto = detalles.reduce(
    (acc, row) => acc + (Number(row.cantidad) * Number(row.precio_unitario ?? row.precioUnitario)),
    0,
  );
  const total = roundHalfUp2(bruto);
  const cobrado = roundHalfUp2(
    pagos.filter((p) => p.estado === 'CONFIRMADO').reduce((acc, p) => acc + Number(p.monto), 0),
  );
  return { total, cobrado, saldo: roundHalfUp2(total - cobrado) };
};

const mapReturn = (row) => ({
  idDevolucion: row.id_devolucion,
  fechaHora: row.fecha_hora,
  tipo: row.tipo,
  idProducto: row.id_producto,
  cantidad: Number(row.cantidad),
  montoReembolso: Number(row.monto_reembolso),
  observacion: row.observacion,
});

// La bitacora es auxiliar: si falla el registro, la operacion de venta no cambia.
const logSaleEvent = (accion, objeto, usuario) => (
  addLog(accion, objeto, 'OK', usuario.id, null).catch(() => undefined)
);

const mapSale = (row, usuario) => {
  const includeCost = canSeeCost(usuario);
  const detalles = (row.detalles ?? []).map((d) => mapDetail(d, includeCost));
  const pagos = (row.pagos ?? []).map(mapPayment);
  const devoluciones = (row.devoluciones ?? []).map(mapReturn);
  const totals = computeTotals(row.detalles ?? [], row.pagos ?? []);
  const reembolsado = roundHalfUp2(devoluciones.reduce((acc, d) => acc + d.montoReembolso, 0));
  return {
    idVenta: row.id_venta,
    fechaHora: row.fecha_hora,
    estado: row.estado,
    idCliente: row.id_cliente,
    clienteNombre: row.cliente_nombre,
    idUsuario: row.id_usuario,
    detalles,
    pagos,
    total: totals.total,
    cobrado: totals.cobrado,
    saldo: totals.saldo,
    devoluciones,
    reembolsado,
    observacionAnulacion: row.observacion_anulacion ?? null,
    comprobante: row.comprobante
      ? { numero: row.comprobante.numero, fechaEmision: row.comprobante.fecha_emision }
      : null,
    entrega: row.entrega
      ? {
        idEntrega: row.entrega.id_entrega,
        fechaHora: row.entrega.fecha_hora,
        idUsuario: row.entrega.id_usuario,
      }
      : null,
  };
};

const assertUniqueProductLines = (detalles) => {
  const seen = new Set();
  for (const detail of detalles) {
    if (seen.has(detail.idProducto)) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 400, { reason: 'DUPLICATE_PRODUCT_LINE' });
    }
    seen.add(detail.idProducto);
  }
};

const validateSaleLines = async (idCliente, detalles) => {
  assertUniqueProductLines(detalles);
  const client = await getClientById(idCliente);
  if (!client) throw new AppError(errorCodes.NOT_FOUND, 404, { reason: 'CLIENT_NOT_FOUND' });

  const products = await getProductsForSale(detalles.map((d) => d.idProducto));
  const byId = new Map(products.map((row) => [row.id_producto, row]));
  const normalized = [];

  for (const detail of detalles) {
    const product = byId.get(detail.idProducto);
    if (!product) throw new AppError(errorCodes.NOT_FOUND, 404, { idProducto: detail.idProducto });
    if (!product.activo) {
      throw new AppError(errorCodes.BUSINESS_RULE, 422, {
        reason: 'PRODUCT_INACTIVE',
        idProducto: detail.idProducto,
      });
    }
    assertQuantityFraction(detail.cantidad, product.permite_fraccion);
    const precioUnitario = detail.precioUnitario ?? Number(product.precio_venta);
    normalized.push({
      idProducto: detail.idProducto,
      cantidad: detail.cantidad,
      precioUnitario,
      costoUnitarioHistorico: Number(product.costo_promedio),
    });
  }
  return normalized;
};

export const listSalesService = async (queryParams, usuario) => {
  const rows = await listSales(
    queryParams.estado,
    queryParams.idCliente,
    queryParams.limite,
    (queryParams.pagina - 1) * queryParams.limite,
  );
  const total = Number(rows[0]?.total ?? 0);
  return {
    items: rows.map((row) => mapSale({ ...row, detalles: [], pagos: [] }, usuario)),
    total,
    pagina: queryParams.pagina,
    limite: queryParams.limite,
  };
};

export const getSaleService = async (id, usuario) => {
  const row = await getSaleById(id);
  if (!row) throw new AppError(errorCodes.NOT_FOUND);
  return mapSale(row, usuario);
};

export const createSaleService = async (body, usuario) => {
  const detalles = await validateSaleLines(body.idCliente, body.detalles);
  const created = await createSale(body.idCliente, usuario.id, detalles);
  const full = await getSaleById(created.id_venta);
  return mapSale(full, usuario);
};

export const updateSaleService = async (id, body, usuario) => {
  const detalles = await validateSaleLines(body.idCliente, body.detalles);
  const result = await replaceSale(id, body.idCliente, detalles);
  if (result.status === 'NOT_FOUND') throw new AppError(errorCodes.NOT_FOUND);
  if (result.status === 'HAS_PAYMENTS') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'SALE_HAS_PAYMENTS',
      mensaje: 'La venta ya tiene pagos registrados; rechace los pendientes antes de modificarla.',
    });
  }
  if (result.status === 'INVALID_STATE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'SALE_NOT_DRAFT',
      estado: result.estado,
    });
  }
  const full = await getSaleById(id);
  return mapSale(full, usuario);
};

export const confirmSaleService = async (id, body, usuario) => {
  const payload = { idVenta: id };
  const idem = await resolveIdempotency(usuario.id, OPERACION_CONFIRMAR, body.claveIdempotencia, payload);
  if (idem.hit) return { cached: true, statusHttp: idem.statusHttp, data: idem.respuesta };

  const result = await confirmSale(id, usuario.id);
  if (result.status === 'NOT_FOUND') throw new AppError(errorCodes.NOT_FOUND);
  if (result.status === 'INVALID_STATE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'SALE_NOT_DRAFT',
      estado: result.estado,
    });
  }
  if (result.status === 'BALANCE_NOT_ZERO') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'SALE_BALANCE_NOT_ZERO',
      mensaje: 'El pago no cubre el total de la venta.',
      total: result.total,
      cobrado: result.cobrado,
      saldo: result.saldo,
    });
  }
  if (result.status === 'INSUFFICIENT_STOCK') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'INSUFFICIENT_STOCK',
      idProducto: result.idProducto,
    });
  }
  if (result.status === 'INACTIVE_PRODUCT' || result.status === 'MISSING_EXISTENCE' || result.status === 'NO_DETAILS') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: result.status });
  }

  const full = await getSaleById(id);
  const data = mapSale(full, usuario);
  const raced = await persistIdempotency(
    usuario.id, OPERACION_CONFIRMAR, body.claveIdempotencia, idem.hash, 200, data,
  );
  if (raced) return raced;
  return { cached: false, statusHttp: 200, data };
};

export const anularSaleService = async (id, body, usuario) => {
  const existing = await getSaleById(id);
  if (!existing) throw new AppError(errorCodes.NOT_FOUND);
  if (!canAnularAny(usuario) && existing.id_usuario !== usuario.id) {
    throw new AppError(errorCodes.ACCESS_DENIED, 403, { reason: 'NOT_OWN_SALE' });
  }

  const payload = { idVenta: id };
  const idem = await resolveIdempotency(usuario.id, OPERACION_ANULAR, body.claveIdempotencia, payload);
  if (idem.hit) return { cached: true, statusHttp: idem.statusHttp, data: idem.respuesta };

  const result = await anularSale(id, usuario.id, body.observacion);
  if (result.status === 'NOT_FOUND') throw new AppError(errorCodes.NOT_FOUND);
  if (result.status === 'INVALID_STATE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'SALE_NOT_CONFIRMADA',
      estado: result.estado,
    });
  }
  if (result.status === 'HAS_RETURNS') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'SALE_HAS_RETURNS',
      mensaje: 'La venta tiene devoluciones por defecto registradas y ya no se puede anular.',
    });
  }
  if (result.status === 'MISSING_EXISTENCE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'MISSING_EXISTENCE', idProducto: result.idProducto });
  }

  await logSaleEvent(
    'VENTA_ANULADA',
    `Venta ${id}: error de registro (${body.observacion}); devuelto ${result.montoDevuelto}`,
    usuario,
  );
  const full = await getSaleById(id);
  const data = mapSale(full, usuario);
  const raced = await persistIdempotency(
    usuario.id, OPERACION_ANULAR, body.claveIdempotencia, idem.hash, 200, data,
  );
  if (raced) return raced;
  return { cached: false, statusHttp: 200, data };
};

export const getComprobanteService = async (id, usuario) => {
  const sale = await getSaleById(id);
  if (!sale) throw new AppError(errorCodes.NOT_FOUND);
  if (sale.estado !== 'CONFIRMADA' && sale.estado !== 'ANULADA') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'COMPROBANTE_UNAVAILABLE' });
  }
  if (!sale.comprobante) throw new AppError(errorCodes.NOT_FOUND, 404, { reason: 'COMPROBANTE_MISSING' });
  const mapped = mapSale(sale, usuario);
  return {
    numero: mapped.comprobante.numero,
    fechaEmision: mapped.comprobante.fechaEmision,
    idVenta: mapped.idVenta,
    estadoVenta: mapped.estado,
    cliente: { idCliente: mapped.idCliente, nombre: mapped.clienteNombre },
    lineas: mapped.detalles.map((d) => ({
      codigo: d.codigo,
      nombre: d.nombre,
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      subtotal: d.subtotal,
    })),
    total: mapped.total,
    pagos: mapped.pagos,
    cobrado: mapped.cobrado,
    saldo: mapped.saldo,
  };
};

export const deliverSaleService = async (id, body, usuario) => {
  const sale = await getSaleById(id);
  if (!sale) throw new AppError(errorCodes.NOT_FOUND);
  const mapped = mapSale(sale, usuario);
  if (mapped.estado !== 'CONFIRMADA') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'SALE_NOT_CONFIRMADA' });
  }
  if (mapped.saldo !== 0) {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'SALE_BALANCE_NOT_ZERO', saldo: mapped.saldo });
  }

  const payload = { idVenta: id };
  const idem = await resolveIdempotency(usuario.id, OPERACION_ENTREGA, body.claveIdempotencia, payload);
  if (idem.hit) return { cached: true, statusHttp: idem.statusHttp, data: idem.respuesta };

  const result = await createDelivery(id, usuario.id);
  if (result.status === 'NOT_FOUND') throw new AppError(errorCodes.NOT_FOUND);
  if (result.status === 'INVALID_STATE') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'SALE_NOT_CONFIRMADA' });
  }
  if (result.status === 'ALREADY_DELIVERED') {
    throw new AppError(errorCodes.CONFLICT, 409, { reason: 'ALREADY_DELIVERED' });
  }

  const data = {
    idEntrega: result.entrega.id_entrega,
    idVenta: result.entrega.id_venta,
    fechaHora: result.entrega.fecha_hora,
    idUsuario: result.entrega.id_usuario,
  };
  const raced = await persistIdempotency(
    usuario.id, OPERACION_ENTREGA, body.claveIdempotencia, idem.hash, 201, data,
  );
  if (raced) return raced;
  return { cached: false, statusHttp: 201, data };
};

export { assertUniqueProductLines, computeTotals, canAnularAny };

const returnErrors = {
  NOT_FOUND: () => new AppError(errorCodes.NOT_FOUND),
  INVALID_STATE: (r) => new AppError(errorCodes.BUSINESS_RULE, 422, {
    reason: 'SALE_NOT_CONFIRMADA',
    estado: r.estado,
    mensaje: 'Solo se registran devoluciones de ventas confirmadas.',
  }),
  PRODUCT_NOT_IN_SALE: () => new AppError(errorCodes.BUSINESS_RULE, 422, {
    reason: 'PRODUCT_NOT_IN_SALE',
    mensaje: 'El producto no forma parte de esta venta.',
  }),
  FRACTION_NOT_ALLOWED: () => new AppError(errorCodes.BUSINESS_RULE, 422, {
    reason: 'FRACTION_NOT_ALLOWED',
    mensaje: 'La unidad de medida del producto no admite cantidades fraccionarias.',
  }),
  QUANTITY_EXCEEDED: (r) => new AppError(errorCodes.BUSINESS_RULE, 422, {
    reason: 'RETURN_QUANTITY_EXCEEDED',
    disponible: r.disponible,
    mensaje: 'La cantidad supera lo vendido que aún no fue reembolsado.',
  }),
  MISSING_EXISTENCE: () => new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'MISSING_EXISTENCE' }),
};

// CU-15: producto fallado. El sistema decide segun el stock: CAMBIO por otro igual si alcanza,
// si no REEMBOLSO de cantidad x precio de venta. El arrepentimiento del cliente no es motivo valido.
export const registerDefectReturnService = async (id, body, usuario) => {
  const payload = { idVenta: id, idProducto: body.idProducto, cantidad: body.cantidad };
  const idem = await resolveIdempotency(usuario.id, OPERACION_DEVOLUCION, body.claveIdempotencia, payload);
  if (idem.hit) return { cached: true, statusHttp: idem.statusHttp, data: idem.respuesta };

  const result = await registerDefectReturn(id, body.idProducto, body.cantidad, body.observacion, usuario.id);
  if (result.status !== 'OK') throw returnErrors[result.status](result);

  const { devolucion } = result;
  await logSaleEvent(
    devolucion.tipo === 'CAMBIO' ? 'DEVOLUCION_CAMBIO' : 'DEVOLUCION_REEMBOLSO',
    `Venta ${id}: ${Number(devolucion.cantidad)} u. de ${body.idProducto} (${body.observacion})`,
    usuario,
  );
  const data = {
    idDevolucion: devolucion.id_devolucion,
    idVenta: id,
    idProducto: body.idProducto,
    tipo: devolucion.tipo,
    cantidad: Number(devolucion.cantidad),
    montoReembolso: Number(devolucion.monto_reembolso),
    observacion: devolucion.observacion,
    fechaHora: devolucion.fecha_hora,
    stockRestante: result.stockRestante,
  };
  const raced = await persistIdempotency(
    usuario.id, OPERACION_DEVOLUCION, body.claveIdempotencia, idem.hash, 201, data,
  );
  if (raced) return raced;
  return { cached: false, statusHttp: 201, data };
};
