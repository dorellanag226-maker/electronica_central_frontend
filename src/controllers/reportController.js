import {
  buildExcelBuffer,
  getGananciasReportService,
  getInventarioReportService,
  getRotacionDemandaReportService,
  getVentasReportService,
} from '../services/reportService.js';
import { buildReportPdfBuffer } from '../services/pdfService.js';
import { sendError } from '../utils/sendError.js';

const sendReport = async (res, formato, filename, data, excelSpec, pdfTitle) => {
  if (formato === 'xlsx') {
    const buffer = await buildExcelBuffer(excelSpec.sheet, excelSpec.columns, excelSpec.rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return res.status(200).send(buffer);
  }
  if (formato === 'pdf') {
    const buffer = await buildReportPdfBuffer(pdfTitle, data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return res.status(200).send(buffer);
  }
  return res.status(200).json({ data });
};

export const reportVentasController = async (req, res) => {
  try {
    const data = await getVentasReportService(req.validated.query);
    const { formato } = req.validated.query;
    return sendReport(res, formato, 'reporte-ventas', data, {
      sheet: 'Ventas',
      columns: [
        { header: 'Id', key: 'idVenta', width: 36 },
        { header: 'Fecha', key: 'fechaHora', width: 24 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Vendedor', key: 'vendedor', width: 20 },
        { header: 'Cliente', key: 'cliente', width: 24 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Cobrado', key: 'cobrado', width: 12 },
        { header: 'Saldo', key: 'saldo', width: 12 },
        { header: 'Reembolsado', key: 'reembolsado', width: 14 },
      ],
      rows: data.items,
    }, 'Reporte de ventas');
  } catch (error) {
    return sendError(res, error);
  }
};

export const reportGananciasController = async (req, res) => {
  try {
    const data = await getGananciasReportService(req.validated.query);
    const { formato } = req.validated.query;
    return sendReport(res, formato, 'reporte-ganancias', data, {
      sheet: 'Ganancias',
      columns: [
        { header: 'Venta', key: 'idVenta', width: 36 },
        { header: 'Codigo', key: 'codigo', width: 16 },
        { header: 'Producto', key: 'nombre', width: 28 },
        { header: 'Cantidad', key: 'cantidad', width: 12 },
        { header: 'Precio', key: 'precioUnitario', width: 12 },
        { header: 'Costo', key: 'costoUnitarioHistorico', width: 12 },
        { header: 'Ganancia', key: 'gananciaLinea', width: 12 },
      ],
      rows: data.items,
    }, 'Reporte de ganancias');
  } catch (error) {
    return sendError(res, error);
  }
};

export const reportInventarioController = async (req, res) => {
  try {
    const data = await getInventarioReportService(req.validated.query);
    const { formato } = req.validated.query;
    return sendReport(res, formato, 'reporte-inventario', data, {
      sheet: 'Inventario',
      columns: [
        { header: 'Codigo', key: 'codigo', width: 16 },
        { header: 'Producto', key: 'nombre', width: 28 },
        { header: 'Ubicacion', key: 'ubicacion', width: 14 },
        { header: 'Stock corte', key: 'stockCorte', width: 12 },
        { header: 'Minimo', key: 'stockMinimo', width: 10 },
        { header: 'Costo prom', key: 'costoPromedio', width: 12 },
        { header: 'Valoracion', key: 'valoracion', width: 12 },
        { header: 'Alerta', key: 'alerta', width: 12 },
      ],
      rows: data.items,
    }, 'Reporte de inventario');
  } catch (error) {
    return sendError(res, error);
  }
};

export const reportRotacionController = async (req, res) => {
  try {
    const data = await getRotacionDemandaReportService(req.validated.query);
    const { formato } = req.validated.query;
    return sendReport(res, formato, 'reporte-rotacion-demanda', data, {
      sheet: 'Rotacion',
      columns: [
        { header: 'Metrica', key: 'metrica', width: 28 },
        { header: 'Valor', key: 'valor', width: 20 },
      ],
      rows: [
        { metrica: 'COGS', valor: data.rotacion.cogs },
        { metrica: 'Inventario inicial', valor: data.rotacion.inventarioInicial },
        { metrica: 'Inventario final', valor: data.rotacion.inventarioFinal },
        { metrica: 'Inventario promedio', valor: data.rotacion.inventarioPromedio },
        { metrica: 'Rotacion', valor: data.rotacion.etiqueta ?? data.rotacion.valor },
        { metrica: 'Demanda ventas (u)', valor: data.demanda.ventasUnidades },
        { metrica: 'Demanda solicitudes (u)', valor: data.demanda.solicitudesUnidades },
      ],
    }, 'Rotacion y demanda');
  } catch (error) {
    return sendError(res, error);
  }
};
