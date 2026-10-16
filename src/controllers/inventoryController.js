import {
  confirmOpeningService,
  createInventoryAdjustmentService,
  getInventoryAlertsService,
  getInventoryListService,
  getInventoryMovementsService,
  previewOpeningService,
  updateStockMinimoService,
} from '../services/inventoryService.js';
import { sendError } from '../utils/sendError.js';

export const getInventoryListController = async (req, res) => {
  try {
    const result = await getInventoryListService(req.validated.query, req.auth.usuario.permisos);
    return res.status(200).json({
      data: result.items,
      meta: { pagina: result.pagina, limite: result.limite, total: result.total },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getInventoryAlertsController = async (req, res) => {
  try {
    const result = await getInventoryAlertsService(req.validated.query, req.auth.usuario.permisos);
    return res.status(200).json({
      data: result.items,
      meta: { pagina: result.pagina, limite: result.limite, total: result.total },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getInventoryMovementsController = async (req, res) => {
  try {
    const result = await getInventoryMovementsService(
      req.validated.params.productoId,
      req.validated.query,
      req.auth.usuario.permisos,
    );
    return res.status(200).json({
      data: result.items,
      meta: { pagina: result.pagina, limite: result.limite, total: result.total },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateStockMinimoController = async (req, res) => {
  try {
    const data = await updateStockMinimoService(
      req.validated.params.productoId,
      req.validated.body.stockMinimo,
    );
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const createInventoryAdjustmentController = async (req, res) => {
  try {
    const result = await createInventoryAdjustmentService(
      req.validated.body,
      req.auth.usuario,
      req.ip,
    );
    return res.status(result.statusHttp).json({ data: result.data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const previewOpeningController = async (req, res) => {
  try {
    const data = await previewOpeningService(req.validated.body);
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const confirmOpeningController = async (req, res) => {
  try {
    const result = await confirmOpeningService(req.validated.body, req.auth.usuario);
    return res.status(result.statusHttp).json({ data: result.data });
  } catch (error) {
    return sendError(res, error);
  }
};
