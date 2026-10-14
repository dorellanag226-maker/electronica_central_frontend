export const errorCodes = {
  VALIDATION_ERROR: 'BR001',
  INVALID_CREDENTIALS: 'AU001',
  SESSION_EXPIRED: 'AU002',
  MISSING_TOKEN: 'AU003',
  ACCESS_DENIED: 'FB001',
  NOT_FOUND: 'NF001',
  CONFLICT: 'CF001',
  BUSINESS_RULE: 'UE001',
  INTERNAL_ERROR: 'SE001',
  SERVICE_UNAVAILABLE: 'SU001',
  ACCOUNT_LOCKED: 'AU004',
};

export const errorCatalog = {
  [errorCodes.VALIDATION_ERROR]: { statusHttp: 400, message: 'Invalid request data' },
  [errorCodes.INVALID_CREDENTIALS]: { statusHttp: 401, message: 'Invalid credentials or session' },
  [errorCodes.SESSION_EXPIRED]: { statusHttp: 401, message: 'Session expired' },
  [errorCodes.MISSING_TOKEN]: { statusHttp: 401, message: 'Authentication required' },
  [errorCodes.ACCOUNT_LOCKED]: { statusHttp: 423, message: 'Account temporarily locked' },
  [errorCodes.ACCESS_DENIED]: { statusHttp: 403, message: 'Access denied' },
  [errorCodes.NOT_FOUND]: { statusHttp: 404, message: 'Resource not found' },
  [errorCodes.CONFLICT]: { statusHttp: 409, message: 'Resource conflict' },
  [errorCodes.BUSINESS_RULE]: { statusHttp: 422, message: 'Business rule cannot be satisfied' },
  [errorCodes.INTERNAL_ERROR]: {
    statusHttp: 500,
    message: 'Internal server error',
  },
  [errorCodes.SERVICE_UNAVAILABLE]: {
    statusHttp: 503,
    message: 'Service unavailable',
  },
};

export const getErrorMessage = (code) => errorCatalog[code] ?? errorCatalog[errorCodes.INTERNAL_ERROR];
