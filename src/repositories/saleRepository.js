import { query, withTransaction } from '../lib/database.js';

export const OPERACION_CONFIRMAR = 'VENTA_CONFIRMAR';
export const OPERACION_ANULAR = 'VENTA_ANULAR';
export const OPERACION_ENTREGA = 'VENTA_ENTREGA';
export const OPERACION_DEVOLUCION = 'VENTA_DEVOLUCION';
const MOTIVO_CONFIRMAR = 'VENTA_CONFIRMAR';
const MOTIVO_ANULAR = 'VENTA_ANULAR';
const MOTIVO_CAMBIO = 'CAMBIO_POR_DEFECTO';

// Total y cobrado calculados en SQL con la venta ya bloqueada (mismo redondeo half-up que computeTotals).
const lockedSaleBalance = async (client, idVenta) => {
  const { rows } = await client.query(
    `SELECT
       (SELECT round(coalesce(sum(cantidad * precio_unitario), 0), 2)
          FROM electronica_az.detalle_venta WHERE id_venta = $1) AS total,
       (SELECT coalesce(sum(monto), 0)
          FROM electronica_az.pago WHERE id_venta = $1 AND estado = 'CONFIRMADO') AS cobrado`,
    [idVenta],
  );
  const total = Number(rows[0].total);
  const cobrado = Number(rows[0].cobrado);
  return { total, cobrado, saldo: Number((total - cobrado).toFixed(2)) };
};

export const listSales = async (estado, idCliente, limite, desplazamiento) => {
  const result = await query(`
    SELECT v.id_venta, v.fecha_hora, v.estado, v.id_cliente, v.id_usuario,
      c.nombre AS cliente_nombre,
      count(*) OVER() AS total
    FROM electronica_az.venta v
    JOIN electronica_az.cliente c ON c.id_cliente = v.id_cliente
    WHERE ($1::text IS NULL OR v.estado = $1)
      AND ($2::uuid IS NULL OR v.id_cliente = $2)
    ORDER BY v.fecha_hora DESC, v.id_venta DESC
    LIMIT $3 OFFSET $4
  `, [estado ?? null, idCliente ?? null, limite, desplazamiento]);
  return result.rows;
};

export const getSaleById = async (idVenta) => {
  const header = await query(
    `SELECT v.id_venta, v.fecha_hora, v.estado, v.id_cliente, v.id_usuario, v.observacion_anulacion,
       c.nombre AS cliente_nombre, c.documento AS cliente_documento
     FROM electronica_az.venta v
     JOIN electronica_az.cliente c ON c.id_cliente = v.id_cliente
     WHERE v.id_venta = $1`,
    [idVenta],
  );
  if (!header.rows[0]) return null;

  const details = await query(
    `SELECT d.id_detalle_venta, d.id_producto, d.cantidad, d.precio_unitario, d.costo_unitario_historico,
       p.codigo, p.nombre, um.permite_fraccion, p.activo AS producto_activo
     FROM electronica_az.detalle_venta d
     JOIN electronica_az.producto p ON p.id_producto = d.id_producto
     JOIN electronica_az.unidad_medida um ON um.id_unidad_medida = p.id_unidad_medida
     WHERE d.id_venta = $1
     ORDER BY d.id_producto`,
    [idVenta],
  );

  const payments = await query(
    `SELECT id_pago, fecha_hora, monto, metodo, estado, referencia_externa, id_usuario
     FROM electronica_az.pago WHERE id_venta = $1
     ORDER BY fecha_hora ASC, id_pago ASC`,
    [idVenta],
  );

  const comprobante = await query(
    `SELECT numero, fecha_emision FROM electronica_az.comprobante WHERE id_venta = $1`,
    [idVenta],
  );

  const entrega = await query(
    `SELECT id_entrega, fecha_hora, id_usuario FROM electronica_az.entrega WHERE id_venta = $1`,
    [idVenta],
  );

  const devoluciones = await query(
    `SELECT dv.id_devolucion, dv.fecha_hora, dv.tipo, dv.cantidad, dv.monto_reembolso, dv.observacion,
       dv.id_detalle_venta, d.id_producto, dv.id_usuario
     FROM electronica_az.devolucion dv
     JOIN electronica_az.detalle_venta d ON d.id_detalle_venta = dv.id_detalle_venta
     WHERE dv.id_venta = $1
     ORDER BY dv.fecha_hora ASC, dv.id_devolucion ASC`,
    [idVenta],
  );

  return {
    ...header.rows[0],
    detalles: details.rows,
    pagos: payments.rows,
    comprobante: comprobante.rows[0] ?? null,
    entrega: entrega.rows[0] ?? null,
    devoluciones: devoluciones.rows,
  };
};

export const getClientById = async (idCliente) => {
  const result = await query(
    'SELECT id_cliente, nombre, documento FROM electronica_az.cliente WHERE id_cliente = $1',
    [idCliente],
  );
  return result.rows[0] ?? null;
};

export const getProductsForSale = async (ids) => {
  if (!ids.length) return [];
  const result = await query(
    `SELECT p.id_producto, p.codigo, p.nombre, p.activo, p.precio_venta,
       um.permite_fraccion, e.costo_promedio, e.stock_actual
     FROM electronica_az.producto p
     JOIN electronica_az.unidad_medida um ON um.id_unidad_medida = p.id_unidad_medida
     JOIN electronica_az.existencia e ON e.id_producto = p.id_producto
     WHERE p.id_producto = ANY($1::uuid[])`,
    [ids],
  );
  return result.rows;
};

export const createSale = async (idCliente, idUsuario, detalles) => withTransaction(async (client) => {
  const venta = await client.query(
    `INSERT INTO electronica_az.venta(id_cliente, id_usuario, estado)
     VALUES ($1, $2, 'BORRADOR')
     RETURNING id_venta, fecha_hora, estado, id_cliente, id_usuario`,
    [idCliente, idUsuario],
  );

  const inserted = [];
  for (const detail of detalles) {
    const row = await client.query(
      `INSERT INTO electronica_az.detalle_venta(
         id_venta, id_producto, cantidad, precio_unitario, costo_unitario_historico
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id_detalle_venta, id_producto, cantidad, precio_unitario, costo_unitario_historico`,
      [
        venta.rows[0].id_venta,
        detail.idProducto,
        detail.cantidad,
        detail.precioUnitario,
        detail.costoUnitarioHistorico,
      ],
    );
    inserted.push(row.rows[0]);
  }
  return { ...venta.rows[0], detalles: inserted };
});

export const replaceSale = async (idVenta, idCliente, detalles) => withTransaction(async (client) => {
  const locked = await client.query(
    `SELECT id_venta, estado FROM electronica_az.venta WHERE id_venta = $1 FOR UPDATE`,
    [idVenta],
  );
  const venta = locked.rows[0];
  if (!venta) return { status: 'NOT_FOUND' };
  if (venta.estado !== 'BORRADOR') return { status: 'INVALID_STATE', estado: venta.estado };

  // Cambiar los productos cambia el total: con pagos en curso el saldo dejaria de cuadrar.
  const activePayments = await client.query(
    `SELECT count(*)::int AS total FROM electronica_az.pago
     WHERE id_venta = $1 AND estado IN ('PENDIENTE', 'CONFIRMADO')`,
    [idVenta],
  );
  if (activePayments.rows[0].total > 0) return { status: 'HAS_PAYMENTS' };

  await client.query(
    `UPDATE electronica_az.venta SET id_cliente = $2 WHERE id_venta = $1`,
    [idVenta, idCliente],
  );
  await client.query('DELETE FROM electronica_az.detalle_venta WHERE id_venta = $1', [idVenta]);

  const inserted = [];
  for (const detail of detalles) {
    const row = await client.query(
      `INSERT INTO electronica_az.detalle_venta(
         id_venta, id_producto, cantidad, precio_unitario, costo_unitario_historico
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id_detalle_venta, id_producto, cantidad, precio_unitario, costo_unitario_historico`,
      [
        idVenta,
        detail.idProducto,
        detail.cantidad,
        detail.precioUnitario,
        detail.costoUnitarioHistorico,
      ],
    );
    inserted.push(row.rows[0]);
  }

  const updated = await client.query(
    `SELECT id_venta, fecha_hora, estado, id_cliente, id_usuario
     FROM electronica_az.venta WHERE id_venta = $1`,
    [idVenta],
  );
  return { status: 'OK', venta: { ...updated.rows[0], detalles: inserted } };
});

export const getIdempotencyRecord = async (idUsuario, operacion, clave) => {
  const result = await query(
    `SELECT id_idempotencia, hash_solicitud, estado_http, respuesta
     FROM electronica_az.idempotencia_operacion
     WHERE id_usuario = $1 AND operacion = $2 AND clave = $3`,
    [idUsuario, operacion, clave],
  );
  return result.rows[0] ?? null;
};

export const saveIdempotencyRecord = async (idUsuario, operacion, clave, hashSolicitud, estadoHttp, respuesta) => {
  const result = await query(
    `INSERT INTO electronica_az.idempotencia_operacion(
       id_usuario, operacion, clave, hash_solicitud, estado_http, respuesta
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id_idempotencia`,
    [idUsuario, operacion, clave, hashSolicitud, estadoHttp, JSON.stringify(respuesta)],
  );
  return result.rows[0];
};

const nextComprobanteNumero = async (client) => {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const prefix = `V-${day}-`;
  // Serialize numbering across concurrent confirms (suite + production).
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);
  const counted = await client.query(
    `SELECT coalesce(max(substring(numero from length($1) + 1)::int), 0)::int AS last
     FROM electronica_az.comprobante WHERE numero LIKE $2`,
    [prefix, `${prefix}%`],
  );
  return `${prefix}${String(counted.rows[0].last + 1).padStart(4, '0')}`;
};

export const confirmSale = async (idVenta, idUsuario) => withTransaction(async (client) => {
  const locked = await client.query(
    `SELECT id_venta, estado, id_cliente, id_usuario, fecha_hora
     FROM electronica_az.venta WHERE id_venta = $1 FOR UPDATE`,
    [idVenta],
  );
  const venta = locked.rows[0];
  if (!venta) return { status: 'NOT_FOUND' };
  if (venta.estado !== 'BORRADOR') return { status: 'INVALID_STATE', estado: venta.estado };

  // CU-15: no se confirma si los pagos confirmados no cubren el total.
  const balance = await lockedSaleBalance(client, idVenta);
  if (balance.saldo > 0) return { status: 'BALANCE_NOT_ZERO', ...balance };

  const details = await client.query(
    `SELECT d.id_detalle_venta, d.id_producto, d.cantidad, d.precio_unitario,
       p.activo AS producto_activo, um.permite_fraccion
     FROM electronica_az.detalle_venta d
     JOIN electronica_az.producto p ON p.id_producto = d.id_producto
     JOIN electronica_az.unidad_medida um ON um.id_unidad_medida = p.id_unidad_medida
     WHERE d.id_venta = $1
     ORDER BY d.id_producto`,
    [idVenta],
  );
  if (!details.rows.length) return { status: 'NO_DETAILS' };

  const productIds = details.rows.map((row) => row.id_producto);
  const existences = await client.query(
    `SELECT e.id_producto, e.stock_actual, e.costo_promedio
     FROM electronica_az.existencia e
     WHERE e.id_producto = ANY($1::uuid[])
     ORDER BY e.id_producto
     FOR UPDATE OF e`,
    [productIds],
  );
  const existenceById = new Map(existences.rows.map((row) => [row.id_producto, row]));

  const movimientos = [];
  for (const detail of details.rows) {
    if (!detail.producto_activo) {
      return { status: 'INACTIVE_PRODUCT', idProducto: detail.id_producto };
    }
    const existence = existenceById.get(detail.id_producto);
    if (!existence) return { status: 'MISSING_EXISTENCE', idProducto: detail.id_producto };

    const stockActual = Number(existence.stock_actual);
    const qty = Number(detail.cantidad);
    if (stockActual < qty) {
      return { status: 'INSUFFICIENT_STOCK', idProducto: detail.id_producto, stockActual };
    }

    const costoHistorico = Number(existence.costo_promedio);
    await client.query(
      `UPDATE electronica_az.detalle_venta
       SET costo_unitario_historico = $2
       WHERE id_detalle_venta = $1`,
      [detail.id_detalle_venta, costoHistorico],
    );

    const movimiento = await client.query(
      `INSERT INTO electronica_az.movimiento_inventario(
         tipo, cantidad, motivo, costo_unitario, id_producto, id_usuario, id_detalle_venta
       ) VALUES ('SALIDA', $1, $2, $3, $4, $5, $6)
       RETURNING id_movimiento, id_detalle_venta, id_producto, cantidad`,
      [qty, MOTIVO_CONFIRMAR, costoHistorico, detail.id_producto, idUsuario, detail.id_detalle_venta],
    );

    const nextStock = stockActual - qty;
    await client.query(
      `UPDATE electronica_az.existencia SET stock_actual = $2 WHERE id_producto = $1`,
      [detail.id_producto, nextStock],
    );
    existence.stock_actual = nextStock;
    movimientos.push(movimiento.rows[0]);
  }

  let numero = await nextComprobanteNumero(client);
  let inserted = false;
  for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
    try {
      await client.query(
        `INSERT INTO electronica_az.comprobante(id_venta, numero) VALUES ($1, $2)`,
        [idVenta, numero],
      );
      inserted = true;
    } catch (error) {
      if (error.code !== '23505') throw error;
      numero = await nextComprobanteNumero(client);
    }
  }
  if (!inserted) {
    throw new Error('COMPROBANTE_NUMBER_EXHAUSTED');
  }

  await client.query(
    `UPDATE electronica_az.venta SET estado = 'CONFIRMADA' WHERE id_venta = $1`,
    [idVenta],
  );

  return {
    status: 'OK',
    venta: { ...venta, estado: 'CONFIRMADA' },
    movimientos,
    comprobante: { numero, idVenta },
  };
});

// Anulacion por error de registro: el stock vuelve, los pagos cobrados se devuelven (ANULADO) y los
// pendientes se rechazan. Si la venta ya tuvo devoluciones por defecto no se anula (el stock no cuadraria).
export const anularSale = async (idVenta, idUsuario, observacion) => withTransaction(async (client) => {
  const locked = await client.query(
    `SELECT id_venta, estado, id_cliente, id_usuario, fecha_hora
     FROM electronica_az.venta WHERE id_venta = $1 FOR UPDATE`,
    [idVenta],
  );
  const venta = locked.rows[0];
  if (!venta) return { status: 'NOT_FOUND' };
  if (venta.estado !== 'CONFIRMADA') return { status: 'INVALID_STATE', estado: venta.estado };

  const returns = await client.query(
    'SELECT count(*)::int AS total FROM electronica_az.devolucion WHERE id_venta = $1',
    [idVenta],
  );
  if (returns.rows[0].total > 0) return { status: 'HAS_RETURNS' };

  const details = await client.query(
    `SELECT d.id_detalle_venta, d.id_producto, d.cantidad, d.costo_unitario_historico
     FROM electronica_az.detalle_venta d
     WHERE d.id_venta = $1
     ORDER BY d.id_producto`,
    [idVenta],
  );

  const productIds = details.rows.map((row) => row.id_producto);
  const existences = await client.query(
    `SELECT e.id_producto, e.stock_actual, e.costo_promedio
     FROM electronica_az.existencia e
     WHERE e.id_producto = ANY($1::uuid[])
     ORDER BY e.id_producto
     FOR UPDATE OF e`,
    [productIds],
  );
  const existenceById = new Map(existences.rows.map((row) => [row.id_producto, row]));

  for (const detail of details.rows) {
    const existence = existenceById.get(detail.id_producto);
    if (!existence) return { status: 'MISSING_EXISTENCE', idProducto: detail.id_producto };

    const stockActual = Number(existence.stock_actual);
    const avg = Number(existence.costo_promedio);
    const qty = Number(detail.cantidad);
    const cost = Number(detail.costo_unitario_historico);
    const nextStock = stockActual + qty;
    const nextAvg = nextStock > 0
      ? Number((((stockActual * avg) + (qty * cost)) / nextStock).toFixed(4))
      : cost;

    await client.query(
      `INSERT INTO electronica_az.movimiento_inventario(
         tipo, cantidad, motivo, costo_unitario, id_producto, id_usuario, id_detalle_venta
       ) VALUES ('ENTRADA', $1, $2, $3, $4, $5, $6)`,
      [qty, MOTIVO_ANULAR, cost, detail.id_producto, idUsuario, detail.id_detalle_venta],
    );
    await client.query(
      `UPDATE electronica_az.existencia
       SET stock_actual = $2, costo_promedio = $3
       WHERE id_producto = $1`,
      [detail.id_producto, nextStock, nextAvg],
    );
  }

  const pagos = await client.query(
    `UPDATE electronica_az.pago
     SET estado = CASE estado WHEN 'CONFIRMADO' THEN 'ANULADO' ELSE 'RECHAZADO' END
     WHERE id_venta = $1 AND estado IN ('CONFIRMADO', 'PENDIENTE')
     RETURNING id_pago, estado, monto`,
    [idVenta],
  );

  await client.query(
    `UPDATE electronica_az.venta SET estado = 'ANULADA', observacion_anulacion = $2 WHERE id_venta = $1`,
    [idVenta, observacion],
  );

  const devuelto = pagos.rows
    .filter((p) => p.estado === 'ANULADO')
    .reduce((acc, p) => acc + Number(p.monto), 0);
  return { status: 'OK', venta: { ...venta, estado: 'ANULADA' }, montoDevuelto: Number(devuelto.toFixed(2)) };
});

export const createDelivery = async (idVenta, idUsuario) => withTransaction(async (client) => {
  const locked = await client.query(
    `SELECT id_venta, estado FROM electronica_az.venta WHERE id_venta = $1 FOR UPDATE`,
    [idVenta],
  );
  const venta = locked.rows[0];
  if (!venta) return { status: 'NOT_FOUND' };
  if (venta.estado !== 'CONFIRMADA') return { status: 'INVALID_STATE', estado: venta.estado };

  const existing = await client.query(
    'SELECT id_entrega FROM electronica_az.entrega WHERE id_venta = $1',
    [idVenta],
  );
  if (existing.rows[0]) return { status: 'ALREADY_DELIVERED', idEntrega: existing.rows[0].id_entrega };

  const inserted = await client.query(
    `INSERT INTO electronica_az.entrega(id_venta, id_usuario)
     VALUES ($1, $2)
     RETURNING id_entrega, fecha_hora, id_venta, id_usuario`,
    [idVenta, idUsuario],
  );
  return { status: 'OK', entrega: inserted.rows[0] };
});

export const sumConfirmedPayments = async (idVenta, client = null) => {
  const runner = client
    ? (sql, params) => client.query(sql, params)
    : (sql, params) => query(sql, params);
  const result = await runner(
    `SELECT coalesce(sum(monto), 0)::numeric AS total
     FROM electronica_az.pago WHERE id_venta = $1 AND estado = 'CONFIRMADO'`,
    [idVenta],
  );
  return Number(result.rows[0].total);
};

// Producto fallado (CU-15): si hay stock se CAMBIA por otro igual; si no, se REEMBOLSA. La unidad
// fallada nunca vuelve al stock disponible. Solo los reembolsos agotan la cantidad devolvible de la
// linea (una unidad de reemplazo tambien puede fallar y volver a cambiarse).
export const registerDefectReturn = async (idVenta, idProducto, cantidad, observacion, idUsuario) => (
  withTransaction(async (client) => {
    const venta = (await client.query(
      'SELECT id_venta, estado FROM electronica_az.venta WHERE id_venta = $1 FOR UPDATE',
      [idVenta],
    )).rows[0];
    if (!venta) return { status: 'NOT_FOUND' };
    if (venta.estado !== 'CONFIRMADA') return { status: 'INVALID_STATE', estado: venta.estado };

    const detail = (await client.query(
      `SELECT d.id_detalle_venta, d.cantidad, d.precio_unitario, um.permite_fraccion
       FROM electronica_az.detalle_venta d
       JOIN electronica_az.producto p ON p.id_producto = d.id_producto
       JOIN electronica_az.unidad_medida um ON um.id_unidad_medida = p.id_unidad_medida
       WHERE d.id_venta = $1 AND d.id_producto = $2`,
      [idVenta, idProducto],
    )).rows[0];
    if (!detail) return { status: 'PRODUCT_NOT_IN_SALE' };
    if (!detail.permite_fraccion && !Number.isInteger(cantidad)) return { status: 'FRACTION_NOT_ALLOWED' };

    const refunded = Number((await client.query(
      `SELECT coalesce(sum(cantidad), 0) AS total FROM electronica_az.devolucion
       WHERE id_detalle_venta = $1 AND tipo = 'REEMBOLSO'`,
      [detail.id_detalle_venta],
    )).rows[0].total);
    const disponible = Number(detail.cantidad) - refunded;
    if (cantidad > disponible) return { status: 'QUANTITY_EXCEEDED', disponible };

    const existence = (await client.query(
      `SELECT stock_actual, costo_promedio FROM electronica_az.existencia
       WHERE id_producto = $1 FOR UPDATE`,
      [idProducto],
    )).rows[0];
    if (!existence) return { status: 'MISSING_EXISTENCE' };

    const stockActual = Number(existence.stock_actual);
    const costo = Number(existence.costo_promedio);
    const esCambio = stockActual >= cantidad;
    let idMovimiento = null;

    if (esCambio) {
      idMovimiento = (await client.query(
        `INSERT INTO electronica_az.movimiento_inventario(
           tipo, cantidad, motivo, costo_unitario, id_producto, id_usuario, id_detalle_venta
         ) VALUES ('SALIDA', $1, $2, $3, $4, $5, $6)
         RETURNING id_movimiento`,
        [cantidad, MOTIVO_CAMBIO, costo, idProducto, idUsuario, detail.id_detalle_venta],
      )).rows[0].id_movimiento;
      await client.query(
        'UPDATE electronica_az.existencia SET stock_actual = $2 WHERE id_producto = $1',
        [idProducto, stockActual - cantidad],
      );
    }

    const montoReembolso = esCambio ? 0 : Number((cantidad * Number(detail.precio_unitario)).toFixed(2));
    const devolucion = (await client.query(
      `INSERT INTO electronica_az.devolucion(
         tipo, cantidad, monto_reembolso, costo_unitario, observacion,
         id_venta, id_detalle_venta, id_movimiento, id_usuario
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id_devolucion, fecha_hora, tipo, cantidad, monto_reembolso, costo_unitario, observacion`,
      [
        esCambio ? 'CAMBIO' : 'REEMBOLSO', cantidad, montoReembolso, costo, observacion,
        idVenta, detail.id_detalle_venta, idMovimiento, idUsuario,
      ],
    )).rows[0];

    return { status: 'OK', devolucion, stockRestante: esCambio ? stockActual - cantidad : stockActual };
  })
);
