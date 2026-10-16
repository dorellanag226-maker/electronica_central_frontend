import { createHash } from 'node:crypto';
import { errorCodes } from '../config/errorCodes.js';
import {
  applyInventoryAdjustment,
  confirmOpeningBatch,
  getExistenceWithUnit,
  getIdempotencyRecord,
  getInventoryAlerts,
  getInventoryList,
  getInventoryMovements,
  getProductByCodigo,
  getProductExists,
  getProductsByIds,
  saveIdempotencyRecord,
  updateStockMinimo,
} from '../repositories/inventoryRepository.js';
import { addLog } from '../repositories/securityRepository.js';
import { AppError } from '../utils/AppError.js';
import {
  assertQuantityFraction,
  computeOpeningCost,
  computeWeightedAverageCost,
  projectInventoryRow,
} from './inventoryHelpers.js';

const OPERACION_AJUSTE = 'INVENTARIO_AJUSTE';
const OPERACION_APERTURA = 'INVENTARIO_APERTURA_CONFIRM';
const MOTIVO_APERTURA = 'APERTURA_INVENTARIO';

const canSeeCost = (permisos = []) => permisos.includes('INVENTARIO_GESTIONAR');

const hashPayload = (payload) => createHash('sha256')
  .update(JSON.stringify(payload))
  .digest('hex');

const toNumber = (value) => Number(value);

const mapMovement = (row, includeCost) => {
  const movement = {
    idMovimiento: row.id_movimiento,
    fechaHora: row.fecha_hora,
    tipo: row.tipo,
    cantidad: toNumber(row.cantidad),
    motivo: row.motivo,
    idProducto: row.id_producto,
    idUsuario: row.id_usuario,
    responsable: row.nombre_usuario,
  };
  if (includeCost) movement.costoUnitario = toNumber(row.costo_unitario);
  return movement;
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

export const getInventoryListService = async ({ buscar, pagina, limite }, permisos) => {
  const rows = await getInventoryList(buscar, limite, (pagina - 1) * limite);
  const includeCost = canSeeCost(permisos);
  const total = toNumber(rows[0]?.total ?? 0);
  const items = rows.map((row) => {
    const projected = projectInventoryRow(row, includeCost);
    return projected;
  });
  return { items, total, pagina, limite };
};

export const getInventoryAlertsService = async ({ pagina, limite }, permisos) => {
  const rows = await getInventoryAlerts(limite, (pagina - 1) * limite);
  const includeCost = canSeeCost(permisos);
  const total = toNumber(rows[0]?.total ?? 0);
  const items = rows.map((row) => projectInventoryRow(row, includeCost));
  return { items, total, pagina, limite };
};

export const getInventoryMovementsService = async (productoId, { pagina, limite }, permisos) => {
  const product = await getProductExists(productoId);
  if (!product) throw new AppError(errorCodes.NOT_FOUND);
  const rows = await getInventoryMovements(productoId, limite, (pagina - 1) * limite);
  const includeCost = canSeeCost(permisos);
  const total = toNumber(rows[0]?.total ?? 0);
  return {
    items: rows.map((row) => mapMovement(row, includeCost)),
    total,
    pagina,
    limite,
  };
};

export const updateStockMinimoService = async (productoId, stockMinimo) => {
  const updated = await updateStockMinimo(productoId, stockMinimo);
  if (!updated) throw new AppError(errorCodes.NOT_FOUND);
  return {
    idProducto: updated.id_producto,
    stockActual: toNumber(updated.stock_actual),
    stockMinimo: toNumber(updated.stock_minimo),
    costoPromedio: toNumber(updated.costo_promedio),
  };
};

export const createInventoryAdjustmentService = async (body, usuario, ip = null) => {
  const payload = {
    idProducto: body.idProducto,
    tipo: body.tipo,
    cantidad: body.cantidad,
    motivo: body.motivo,
    costoUnitario: body.costoUnitario ?? null,
  };

  const idem = await resolveIdempotency(usuario.id, OPERACION_AJUSTE, body.claveIdempotencia, payload);
  if (idem.hit) return { cached: true, statusHttp: idem.statusHttp, data: idem.respuesta };

  const existence = await getExistenceWithUnit(body.idProducto);
  if (!existence || !existence.activo) throw new AppError(errorCodes.NOT_FOUND);

  assertQuantityFraction(body.cantidad, existence.permite_fraccion);

  const costoUnitario = body.tipo === 'ENTRADA'
    ? body.costoUnitario
    : (body.costoUnitario ?? toNumber(existence.costo_promedio));

  if (body.tipo === 'ENTRADA' && (costoUnitario === undefined || costoUnitario === null)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 400, { reason: 'COST_REQUIRED_FOR_ENTRADA' });
  }

  const result = await applyInventoryAdjustment(
    body.idProducto,
    body.tipo,
    body.cantidad,
    body.motivo,
    costoUnitario,
    usuario.id,
  );

  if (result.status === 'NOT_FOUND') throw new AppError(errorCodes.NOT_FOUND);
  if (result.status === 'INSUFFICIENT_STOCK') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, { reason: 'INSUFFICIENT_STOCK' });
  }

  const data = {
    movimiento: {
      idMovimiento: result.movimiento.id_movimiento,
      tipo: result.movimiento.tipo,
      cantidad: toNumber(result.movimiento.cantidad),
      motivo: result.movimiento.motivo,
      costoUnitario: toNumber(result.movimiento.costo_unitario),
      fechaHora: result.movimiento.fecha_hora,
    },
    existencia: {
      idProducto: result.existencia.id_producto,
      stockActual: toNumber(result.existencia.stock_actual),
      stockMinimo: toNumber(result.existencia.stock_minimo),
      costoPromedio: toNumber(result.existencia.costo_promedio),
    },
  };

  const raced = await persistIdempotency(
    usuario.id, OPERACION_AJUSTE, body.claveIdempotencia, idem.hash, 201, data,
  );
  if (raced) return raced;

  const objeto = `Producto ${existence.codigo} (${existence.nombre}) - Ajuste ${body.tipo} ${body.cantidad} unid. Motivo: ${body.motivo}`;
  await addLog(OPERACION_AJUSTE, objeto, 'OK', usuario.id, ip ?? null).catch(() => undefined);

  return { cached: false, statusHttp: 201, data };
};

export const previewOpeningService = async ({ items }) => {
  const ok = [];
  const pendientes = [];

  for (const item of items) {
    let product = null;
    if (item.idProducto) {
      const rows = await getProductsByIds([item.idProducto]);
      product = rows[0] ?? null;
    } else if (item.codigo) {
      product = await getProductByCodigo(item.codigo);
    }

    if (!product || !product.activo) {
      pendientes.push({
        ...item,
        reason: 'NO_CATALOG_MATCH',
      });
      continue;
    }

    const precioExcel = item.precioExcel;
    if (precioExcel === undefined || precioExcel === null || Number(precioExcel) <= 0) {
      pendientes.push({
        codigo: product.codigo,
        idProducto: product.id_producto,
        cantidad: item.cantidad,
        precioExcel,
        reason: 'MISSING_OR_ZERO_PRECIO',
      });
      continue;
    }

    if (Number(item.cantidad) < 0) {
      pendientes.push({
        codigo: product.codigo,
        idProducto: product.id_producto,
        cantidad: item.cantidad,
        reason: 'INVALID_QUANTITY',
      });
      continue;
    }

    try {
      if (Number(item.cantidad) > 0) {
        assertQuantityFraction(item.cantidad, product.permite_fraccion);
      }
    } catch (error) {
      pendientes.push({
        codigo: product.codigo,
        idProducto: product.id_producto,
        cantidad: item.cantidad,
        reason: error.details?.reason ?? 'INVALID_FRACTION',
      });
      continue;
    }

    ok.push({
      idProducto: product.id_producto,
      codigo: product.codigo,
      nombre: product.nombre,
      cantidad: Number(item.cantidad),
      precioExcel: Number(precioExcel),
      costoUnitario: computeOpeningCost(precioExcel),
    });
  }

  return { ok, pendientes };
};

export const confirmOpeningService = async ({ claveIdempotencia, items }, usuario) => {
  const payload = {
    items: items.map((item) => ({
      idProducto: item.idProducto,
      cantidad: item.cantidad,
      costoUnitario: item.costoUnitario,
    })),
  };

  const idem = await resolveIdempotency(usuario.id, OPERACION_APERTURA, claveIdempotencia, payload);
  if (idem.hit) return { cached: true, statusHttp: idem.statusHttp, data: idem.respuesta };

  const ids = items.map((item) => item.idProducto);
  const products = await getProductsByIds(ids);
  const byId = new Map(products.map((row) => [row.id_producto, row]));

  const validated = [];
  for (const item of items) {
    const product = byId.get(item.idProducto);
    if (!product || !product.activo) {
      throw new AppError(errorCodes.NOT_FOUND, 404, { idProducto: item.idProducto });
    }
    if (Number(item.cantidad) < 0 || Number(item.costoUnitario) < 0) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 400, { reason: 'INVALID_OPENING_ITEM' });
    }
    if (Number(item.cantidad) > 0) {
      assertQuantityFraction(item.cantidad, product.permite_fraccion);
    }
    validated.push({
      idProducto: item.idProducto,
      cantidad: Number(item.cantidad),
      costoUnitario: Number(item.costoUnitario),
    });
  }

  const result = await confirmOpeningBatch(validated, usuario.id, MOTIVO_APERTURA);
  const data = {
    abiertos: result.abiertos,
    omitidos: result.omitidos,
  };

  const raced = await persistIdempotency(
    usuario.id, OPERACION_APERTURA, claveIdempotencia, idem.hash, 201, data,
  );
  if (raced) return raced;

  return { cached: false, statusHttp: 201, data };
};

export {
  assertQuantityFraction,
  computeOpeningCost,
  computeWeightedAverageCost,
  projectInventoryRow,
};
