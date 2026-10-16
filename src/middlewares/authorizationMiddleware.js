import { errorCodes } from '../config/errorCodes.js';
import { AppError } from '../utils/AppError.js';

export const requireRoles = (...roles) => (req, _res, next) => (
  roles.some((role) => req.auth.usuario.roles.includes(role))
    ? next()
    : next(new AppError(errorCodes.ACCESS_DENIED))
);

export const requirePermissions = (...permissions) => (req, _res, next) => (
  permissions.every((permission) => req.auth.usuario.permisos.includes(permission))
    ? next()
    : next(new AppError(errorCodes.ACCESS_DENIED))
);


export const requireAnyPermission = (...permissions) => (req, _res, next) => (
  permissions.some((permission) => req.auth.usuario.permisos.includes(permission))
    ? next()
    : next(new AppError(errorCodes.ACCESS_DENIED))
);