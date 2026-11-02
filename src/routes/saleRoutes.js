import { Router } from 'express';
import {
  anularSaleController,
  confirmSaleController,
  createSaleController,
  createSalePaymentController,
  deliverSaleController,
  getComprobanteController,
  getSaleController,
  listSalePaymentsController,
  listSalesController,
  registerDefectReturnController,
  updateSaleController,
} from '../controllers/saleController.js';
import {
  anularSaleDto,
  createSaleDto,
  comprobanteQueryDto,
  defectReturnDto,
  idempotentSaleActionDto,
  listSalesQueryDto,
  saleIdParamsDto,
  updateSaleDto,
} from '../dto/sale.dto.js';
import { createOnlinePaymentController } from '../controllers/paymentController.js';
import { createOnlinePaymentDto, createPaymentDto } from '../dto/payment.dto.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/authorizationMiddleware.js';
import { validateBody, validateParams, validateQuery } from '../middlewares/validateDto.js';

const saleRouter = Router();
const manageSales = [authenticate, requirePermissions('VENTAS_GESTIONAR')];

saleRouter.get('/', ...manageSales, validateQuery(listSalesQueryDto), listSalesController);
saleRouter.post('/', ...manageSales, validateBody(createSaleDto), createSaleController);
saleRouter.get('/:id', ...manageSales, validateParams(saleIdParamsDto), getSaleController);
saleRouter.patch(
  '/:id',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateBody(updateSaleDto),
  updateSaleController,
);
saleRouter.post(
  '/:id/confirmar',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateBody(idempotentSaleActionDto),
  confirmSaleController,
);
saleRouter.post(
  '/:id/anular',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateBody(anularSaleDto),
  anularSaleController,
);
saleRouter.post(
  '/:id/devoluciones',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateBody(defectReturnDto),
  registerDefectReturnController,
);
saleRouter.get(
  '/:id/comprobante',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateQuery(comprobanteQueryDto),
  getComprobanteController,
);
saleRouter.post(
  '/:id/entrega',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateBody(idempotentSaleActionDto),
  deliverSaleController,
);
saleRouter.get(
  '/:id/pagos',
  ...manageSales,
  validateParams(saleIdParamsDto),
  listSalePaymentsController,
);
saleRouter.post(
  '/:id/pagos',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateBody(createPaymentDto),
  createSalePaymentController,
);
saleRouter.post(
  '/:id/pagos/en-linea',
  ...manageSales,
  validateParams(saleIdParamsDto),
  validateBody(createOnlinePaymentDto),
  createOnlinePaymentController,
);

export default saleRouter;
