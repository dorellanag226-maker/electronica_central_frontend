import { errorCodes } from '../config/errorCodes.js';
import { AppError } from './AppError.js';

// Errores de negocio con mensaje en espanol y, si aplica, el campo del formulario afectado.
// El mensaje viaja en `details.mensaje` y el frontend lo muestra tal cual.
const withMessage = (code, status, mensaje, campo, reason) => (
  new AppError(code, status, { mensaje, ...(campo ? { campo } : {}), ...(reason ? { reason } : {}) })
);

export const conflict = (mensaje, campo) => withMessage(errorCodes.CONFLICT, 409, mensaje, campo);
export const businessRule = (mensaje, campo, reason) => (
  withMessage(errorCodes.BUSINESS_RULE, 422, mensaje, campo, reason)
);
export const notFound = (mensaje) => withMessage(errorCodes.NOT_FOUND, 404, mensaje);
export const forbidden = (mensaje) => withMessage(errorCodes.ACCESS_DENIED, 403, mensaje);

/** Texto sin tildes ni mayusculas, para comparar nombres como lo hace el frontend. */
export const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .trim()
  .toLowerCase();
