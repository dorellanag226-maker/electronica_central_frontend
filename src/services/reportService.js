import ExcelJS from 'exceljs';
import { errorCodes } from '../config/errorCodes.js';
import {
  reportCogs,
  reportDefectReturns,
  reportDemandRequestsQty,
  reportDemandSalesQty,
  reportGanancias,
  reportInventorySnapshot,
  reportInventoryValueAt,
  reportSales,
} from '../repositories/reportRepository.js';
import { AppError } from '../utils/AppError.js';
import { roundHalfUp2 } from './saleHelpers.js';
import { laPazRangeExclusive } from './reportHelpers.js';

const assertPeriod = (desde, hasta) => {
  if (!desde || !hasta || desde > hasta) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 400, { reason: 'INVALID_PERIOD' });
  }
  return laPazRangeExclusive(desde, hasta);
};

export const getVentasReportService = async ({ desde, hasta, idUsuario, estado }) => {
  const { start, endExclusive } = assertPeriod(desde, hasta);
  const rows = await reportSales(start, endExclusive, idUsuario, estado);
  const items = rows.map((row) => {
    const totalBruto = roundHalfUp2(row.total_bruto);
    const cobrado = roundHalfUp2(row.cobrado);
    const reembolsado = roundHalfUp2(row.reembolsado ?? 0);
    return {
      idVenta: row.id_venta,
      fechaHora: row.fecha_hora,
      estado: row.estado,
      vendedor: row.vendedor,
      cliente: row.cliente,
      total: totalBruto,
      cobrado,
      saldo: roundHalfUp2(totalBruto - cobrado),
      reembolsado,
    };
  });
  const vendido = roundHalfUp2(
    items.filter((i) => i.estado === 'CONFIRMADA').reduce((a, i) => a + i.total, 0),
  );
  const cobradoTotal = roundHalfUp2(
    items.filter((i) => i.estado !== 'ANULADA').reduce((a, i) => a + i.cobrado, 0),
  );
  // Los pagos de ventas anuladas quedan ANULADO y ya no suman en `cobrado`.
  const reembolsado = roundHalfUp2(items.reduce((a, i) => a + i.reembolsado, 0));
  return {
    periodo: { desde, hasta, zona: 'America/La_Paz' },
    resumen: {
      vendido,
      cobrado: cobradoTotal,
      reembolsado,
      cobradoNeto: roundHalfUp2(cobradoTotal - reembolsado),
      excluyeAnuladasDeVendido: true,
    },
    items,
  };
};

export const getGananciasReportService = async ({ desde, hasta }) => {
  const { start, endExclusive } = assertPeriod(desde, hasta);
  const rows = await reportGanancias(start, endExclusive);
  const items = rows.map((row) => ({
    idVenta: row.id_venta,
    fechaHora: row.fecha_hora,
    codigo: row.codigo,
    nombre: row.nombre,
    cantidad: Number(row.cantidad),
    precioUnitario: Number(row.precio_unitario),
    costoUnitarioHistorico: Number(row.costo_unitario_historico),
    gananciaLinea: roundHalfUp2(row.ganancia_linea),
  }));
  const gananciaBruta = roundHalfUp2(items.reduce((a, i) => a + i.gananciaLinea, 0));
  const devoluciones = (await reportDefectReturns(start, endExclusive)).map((row) => ({
    idDevolucion: row.id_devolucion,
    idVenta: row.id_venta,
    fechaHora: row.fecha_hora,
    tipo: row.tipo,
    codigo: row.codigo,
    nombre: row.nombre,
    cantidad: Number(row.cantidad),
    montoReembolso: Number(row.monto_reembolso),
    perdida: roundHalfUp2(row.perdida),
  }));
  const perdidasPorDefecto = roundHalfUp2(devoluciones.reduce((a, d) => a + d.perdida, 0));
  return {
    periodo: { desde, hasta, zona: 'America/La_Paz' },
    resumen: {
      gananciaBruta,
      perdidasPorDefecto,
      gananciaNeta: roundHalfUp2(gananciaBruta - perdidasPorDefecto),
    },
    items,
    devoluciones,
  };
};

export const getInventarioReportService = async ({ fechaCorte }) => {
  if (!fechaCorte) throw new AppError(errorCodes.VALIDATION_ERROR, 400, { reason: 'FECHA_CORTE_REQUIRED' });
  const { endExclusive } = laPazRangeExclusive(fechaCorte, fechaCorte);
  const rows = await reportInventorySnapshot(endExclusive);
  const items = rows.map((row) => ({
    idProducto: row.id_producto,
    codigo: row.codigo,
    nombre: row.nombre,
    ubicacion: row.ubicacion_codigo,
    stockCorte: Number(row.stock_corte),
    stockMinimo: Number(row.stock_minimo),
    costoPromedio: Number(row.costo_promedio),
    valoracion: roundHalfUp2(row.valoracion),
    alerta: row.alerta,
  }));
  return {
    fechaCorte,
    zona: 'America/La_Paz',
    resumen: {
      valoracionTotal: roundHalfUp2(items.reduce((a, i) => a + i.valoracion, 0)),
      agotados: items.filter((i) => i.alerta === 'AGOTADO').length,
      bajoMinimo: items.filter((i) => i.alerta === 'BAJO_MINIMO').length,
    },
    items,
  };
};

export const getRotacionDemandaReportService = async ({ desde, hasta }) => {
  const { start, endExclusive } = assertPeriod(desde, hasta);
  const cogs = await reportCogs(start, endExclusive);
  const invInicio = await reportInventoryValueAt(start);
  const invFin = await reportInventoryValueAt(endExclusive);
  const promedio = (invInicio + invFin) / 2;
  const rotacion = promedio === 0
    ? { valor: null, etiqueta: 'No aplicable' }
    : { valor: roundHalfUp2(cogs / promedio), etiqueta: null };
  const ventasUnidades = await reportDemandSalesQty(start, endExclusive);
  const solicitudesUnidades = await reportDemandRequestsQty(start, endExclusive);
  return {
    periodo: { desde, hasta, zona: 'America/La_Paz' },
    rotacion: {
      cogs: roundHalfUp2(cogs),
      inventarioInicial: roundHalfUp2(invInicio),
      inventarioFinal: roundHalfUp2(invFin),
      inventarioPromedio: roundHalfUp2(promedio),
      ...rotacion,
    },
    demanda: {
      ventasUnidades,
      solicitudesUnidades,
      nota: 'Solicitudes atendidas no se suman a ventas',
    },
  };
};

export const buildExcelBuffer = async (sheetName, columns, rows) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
