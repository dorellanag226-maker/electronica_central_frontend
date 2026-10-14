import {
  assignUserRoleService,
  createClientService,
  createRoleService,
  createUserService,
  listClientsService,
  listLogsService,
  listPermissionsService,
  listRolesService,
  listUsersService,
  resetUserService,
  revokeUserRoleService,
  setUserStateService,
  updateRoleService,
  updateUserService,
} from '../services/securityService.js';
import { sendError } from '../utils/sendError.js';

const wrap = (fn, status = 200) => async (req, res) => {
  try {
    return res.status(status).json({ data: await fn(req) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const createClientController = wrap(
  (req) => createClientService(req.validated.body, req.auth.usuario, req.ip),
  201,
);

export const listClientsController = wrap(() => listClientsService());

export const listUsersController = wrap((req) => listUsersService(req.auth.usuario));

export const createUserController = wrap(
  (req) => createUserService(req.validated.body, req.auth.usuario, req.ip),
  201,
);

export const updateUserController = wrap((req) => updateUserService(
  req.validated.params.id,
  req.validated.body,
  req.auth.usuario,
  req.ip,
));

export const setUserStateController = wrap((req) => setUserStateService(
  req.validated.params.id,
  req.validated.body.activo,
  req.auth.usuario,
  req.ip,
));

export const assignUserRoleController = wrap((req) => assignUserRoleService(
  req.validated.params.id,
  req.validated.body.idRol,
  req.auth.usuario,
  req.ip,
));

export const revokeUserRoleController = wrap((req) => revokeUserRoleService(
  req.validated.params.id,
  req.validated.params.idRol,
  req.auth.usuario,
  req.ip,
));

export const resetUserController = wrap((req) => resetUserService(
  req.validated.params.id,
  req.validated.body,
  req.auth.usuario,
  req.ip,
));

export const listRolesController = wrap((req) => listRolesService(req.auth.usuario));

export const listPermissionsController = wrap(() => listPermissionsService());

export const createRoleController = wrap(
  (req) => createRoleService(req.validated.body, req.auth.usuario, req.ip),
  201,
);

export const updateRoleController = wrap((req) => updateRoleService(
  req.validated.params.id,
  req.validated.body,
  req.auth.usuario,
  req.ip,
));

export const listLogsController = wrap(() => listLogsService());
