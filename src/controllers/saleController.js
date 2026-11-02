import {
  anularSaleService,
  confirmSaleService,
  createSaleService,
  deliverSaleService,
  getComprobanteService,
  getSaleService,
  listSalesService,
  registerDefectReturnService,
  updateSaleService,
} from '../services/saleService.js';
import {
  createPaymentService,
  listPaymentsService,
} from '../services/paymentService.js';
import { buildComprobantePdfBuffer } from '../services/pdfService.js';
import { sendError } from '../utils/sendError.js';

export const listSalesController = async (req, res) => {
  try {
    const result = await listSalesService(req.validated.query, req.auth.usuario);
    return res.status(200).json({
      data: result.items,
      meta: { pagina: result.pagina, limite: result.limite, total: result.total },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getSaleController = async (req, res) => {
  try {
    const data = await getSaleService(req.validated.params.id, req.auth.usuario);
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const createSaleController = async (req, res) => {
  try {
    const data = await createSaleService(req.validated.body, req.auth.usuario);
    return res.status(201).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateSaleController = async (req, res) => {
  try {
    const data = await updateSaleService(
      req.validated.params.id,
      req.validated.body,
      req.auth.usuario,
    );
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const confirmSaleController = async (req, res) => {
  try {
    const result = await confirmSaleService(
      req.validated.params.id,
      req.validated.body,
      req.auth.usuario,
    );
    return res.status(result.statusHttp).json({ data: result.data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const anularSaleController = async (req, res) => {
  try {
    const result = await anularSaleService(
      req.validated.params.id,
      req.validated.body,
      req.auth.usuario,
    );
    return res.status(result.statusHttp).json({ data: result.data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getComprobanteController = async (req, res) => {
  try {
    const data = await getComprobanteService(req.validated.params.id, req.auth.usuario);
    const formato = req.validated.query?.formato ?? 'json';
    if (formato === 'pdf') {
      const buffer = await buildComprobantePdfBuffer(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="comprobante-${data.numero}.pdf"`);
      return res.status(200).send(buffer);
    }
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const deliverSaleController = async (req, res) => {
  try {
    const result = await deliverSaleService(
      req.validated.params.id,
      req.validated.body,
      req.auth.usuario,
    );
    return res.status(result.statusHttp).json({ data: result.data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const listSalePaymentsController = async (req, res) => {
  try {
    const data = await listPaymentsService(req.validated.params.id);
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const createSalePaymentController = async (req, res) => {
  try {
    const data = await createPaymentService(
      req.validated.params.id,
      req.validated.body,
      req.auth.usuario,
    );
    return res.status(201).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const registerDefectReturnController = async (req, res) => {
  try {
    const result = await registerDefectReturnService(
      req.validated.params.id,
      req.validated.body,
      req.auth.usuario,
    );
    return res.status(result.statusHttp).json({ data: result.data });
  } catch (error) {
    return sendError(res, error);
  }
};
