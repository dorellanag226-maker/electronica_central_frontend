import { query } from '../lib/database.js';

export const reportSales = async (start, endExclusive, idUsuarioVendedor, estado) => {
  const result = await query(`
    SELECT v.id_venta, v.fecha_hora, v.estado, v.id_usuario, v.id_cliente,
      u.nombre_usuario AS vendedor,
      c.nombre AS cliente,
      coalesce((
        SELECT sum(d.cantidad * d.precio_unitario)
        FROM electronica_az.detalle_venta d WHERE d.id_venta = v.id_venta
      ), 0)::numeric AS total_bruto,
      coalesce((
        SELECT sum(p.monto) FROM electronica_az.pago p
        WHERE p.id_venta = v.id_venta AND p.estado = 'CONFIRMADO'
      ), 0)::numeric AS cobrado,
      coalesce((
        SELECT sum(dv.monto_reembolso) FROM electronica_az.devolucion dv
        WHERE dv.id_venta = v.id_venta
      ), 0)::numeric AS reembolsado
    FROM electronica_az.venta v
    JOIN electronica_az.usuario u ON u.id_usuario = v.id_usuario
    JOIN electronica_az.cliente c ON c.id_cliente = v.id_cliente
    WHERE v.fecha_hora >= $1 AND v.fecha_hora < $2
      AND ($3::uuid IS NULL OR v.id_usuario = $3)
      AND ($4::text IS NULL OR v.estado = $4)
    ORDER BY v.fecha_hora ASC
  `, [start, endExclusive, idUsuarioVendedor ?? null, estado ?? null]);
  return result.rows;
};

export const reportGanancias = async (start, endExclusive) => {
  const result = await query(`
    SELECT d.id_detalle_venta, d.id_producto, d.cantidad, d.precio_unitario, d.costo_unitario_historico,
      p.codigo, p.nombre, v.id_venta, v.fecha_hora,
      (d.cantidad * (d.precio_unitario - d.costo_unitario_historico))::numeric AS ganancia_linea
    FROM electronica_az.detalle_venta d
    JOIN electronica_az.venta v ON v.id_venta = d.id_venta
    JOIN electronica_az.producto p ON p.id_producto = d.id_producto
    WHERE v.estado = 'CONFIRMADA'
      AND v.fecha_hora >= $1 AND v.fecha_hora < $2
    ORDER BY v.fecha_hora ASC, p.codigo
  `, [start, endExclusive]);
  return result.rows;
};

export const reportInventorySnapshot = async (cutExclusive) => {
  const result = await query(`
    WITH mov AS (
      SELECT id_producto,
        sum(CASE WHEN tipo = 'ENTRADA' THEN cantidad ELSE -cantidad END)::numeric AS delta
      FROM electronica_az.movimiento_inventario
      WHERE fecha_hora < $1
      GROUP BY id_producto
    )
    SELECT p.id_producto, p.codigo, p.nombre, e.stock_minimo, e.costo_promedio,
      u.codigo AS ubicacion_codigo,
      coalesce(m.delta, 0)::numeric AS stock_corte,
      (coalesce(m.delta, 0) * e.costo_promedio)::numeric AS valoracion,
      CASE
        WHEN coalesce(m.delta, 0) = 0 THEN 'AGOTADO'
        WHEN coalesce(m.delta, 0) <= e.stock_minimo THEN 'BAJO_MINIMO'
        ELSE NULL
      END AS alerta
    FROM electronica_az.producto p
    JOIN electronica_az.existencia e ON e.id_producto = p.id_producto
    JOIN electronica_az.ubicacion u ON u.id_ubicacion = p.id_ubicacion
    LEFT JOIN mov m ON m.id_producto = p.id_producto
    WHERE p.activo
    ORDER BY p.nombre, p.codigo
  `, [cutExclusive]);
  return result.rows;
};

// Costo de lo que salio del inventario: lo vendido mas las unidades de reemplazo entregadas en cambios.
export const reportCogs = async (start, endExclusive) => {
  const result = await query(`
    SELECT (
      coalesce((
        SELECT sum(d.cantidad * d.costo_unitario_historico)
        FROM electronica_az.detalle_venta d
        JOIN electronica_az.venta v ON v.id_venta = d.id_venta
        WHERE v.estado = 'CONFIRMADA'
          AND v.fecha_hora >= $1 AND v.fecha_hora < $2
      ), 0)
      + coalesce((
        SELECT sum(dv.cantidad * dv.costo_unitario)
        FROM electronica_az.devolucion dv
        WHERE dv.tipo = 'CAMBIO' AND dv.fecha_hora >= $1 AND dv.fecha_hora < $2
      ), 0)
    )::numeric AS cogs
  `, [start, endExclusive]);
  return Number(result.rows[0].cogs);
};

export const reportInventoryValueAt = async (cutExclusive) => {
  const result = await query(`
    WITH mov AS (
      SELECT id_producto,
        sum(CASE WHEN tipo = 'ENTRADA' THEN cantidad ELSE -cantidad END)::numeric AS delta
      FROM electronica_az.movimiento_inventario
      WHERE fecha_hora < $1
      GROUP BY id_producto
    )
    SELECT coalesce(sum(coalesce(m.delta, 0) * e.costo_promedio), 0)::numeric AS valor
    FROM electronica_az.existencia e
    LEFT JOIN mov m ON m.id_producto = e.id_producto
  `, [cutExclusive]);
  return Number(result.rows[0].valor);
};

export const reportDemandSalesQty = async (start, endExclusive) => {
  const result = await query(`
    SELECT coalesce(sum(d.cantidad), 0)::numeric AS unidades
    FROM electronica_az.detalle_venta d
    JOIN electronica_az.venta v ON v.id_venta = d.id_venta
    WHERE v.estado = 'CONFIRMADA'
      AND v.fecha_hora >= $1 AND v.fecha_hora < $2
  `, [start, endExclusive]);
  return Number(result.rows[0].unidades);
};

export const reportDemandRequestsQty = async (start, endExclusive) => {
  const result = await query(`
    SELECT coalesce(sum(cantidad), 0)::numeric AS unidades
    FROM electronica_az.solicitud_producto
    WHERE fecha_hora >= $1 AND fecha_hora < $2
  `, [start, endExclusive]);
  return Number(result.rows[0].unidades);
};

// Devoluciones por defecto del periodo (por fecha de la devolucion). La perdida de un CAMBIO es el
// costo de la unidad de reemplazo; la de un REEMBOLSO, el dinero devuelto (la unidad fallada ya
// estaba contada como costo de la venta y no vuelve al stock).
export const reportDefectReturns = async (start, endExclusive) => {
  const result = await query(`
    SELECT dv.id_devolucion, dv.fecha_hora, dv.tipo, dv.cantidad, dv.monto_reembolso, dv.costo_unitario,
      dv.id_venta, p.codigo, p.nombre,
      (CASE WHEN dv.tipo = 'CAMBIO' THEN dv.cantidad * dv.costo_unitario ELSE dv.monto_reembolso END)::numeric
        AS perdida
    FROM electronica_az.devolucion dv
    JOIN electronica_az.detalle_venta d ON d.id_detalle_venta = dv.id_detalle_venta
    JOIN electronica_az.producto p ON p.id_producto = d.id_producto
    WHERE dv.fecha_hora >= $1 AND dv.fecha_hora < $2
    ORDER BY dv.fecha_hora ASC
  `, [start, endExclusive]);
  return result.rows;
};
