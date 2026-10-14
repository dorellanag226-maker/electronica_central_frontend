import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import healthRouter from './routes/healthRoutes.js';
import authRouter from './routes/authRoutes.js';
import catalogRouter from './routes/catalogRoutes.js';
import { createDocsRouter } from './routes/docsRoutes.js';
import inventoryRouter from './routes/inventoryRoutes.js';
import purchaseRouter from './routes/purchaseRoutes.js';
import paymentRouter from './routes/paymentRoutes.js';
import reportRouter from './routes/reportRoutes.js';
import requestRouter from './routes/requestRoutes.js';
import saleRouter from './routes/saleRoutes.js';
import supplierRouter from './routes/supplierRoutes.js';
import securityRouter from './routes/securityRoutes.js';
import { sendError } from './utils/sendError.js';

export const createApp = () => {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((origen) => origen.trim()) }));
  app.use(express.json());
  app.use(healthRouter);
  app.use('/api/docs', createDocsRouter());
  app.use('/api/auth', authRouter);
  app.use('/api', catalogRouter);
  app.use('/api/inventario', inventoryRouter);
  app.use('/api/proveedores', supplierRouter);
  app.use('/api/compras', purchaseRouter);
  app.use('/api/ventas', saleRouter);
  app.use('/api/pagos', paymentRouter);
  app.use('/api/solicitudes', requestRouter);
  app.use('/api/reportes', reportRouter);
  app.use('/api', securityRouter);
  app.use((error, _req, res, next) => {
    void next;
    return sendError(res, error);
  });

  return app;
};