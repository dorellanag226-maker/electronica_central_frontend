import { Router } from 'express';
import {
  assignUserRoleController,
  createClientController,
  createRoleController,
  createUserController,
  listClientsController,
  listLogsController,
  listPermissionsController,
  listRolesController,
  listUsersController,
  resetUserController,
  revokeUserRoleController,
  setUserStateController,
  updateRoleController,
  updateUserController,
} from '../controllers/securityController.js';
import {
  assignRoleDto,
  createClientDto,
  createUserDto,
  resetUserDto,
  roleDto,
  roleIdDto,
  updateUserDto,
  userIdDto,
  userRoleParamsDto,
  userStateDto,
} from '../dto/security.dto.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/authorizationMiddleware.js';
import { validateBody, validateParams } from '../middlewares/validateDto.js';

const securityRouter = Router();
securityRouter.use(authenticate);

const manageUsers = requirePermissions('USUARIOS_GESTIONAR');

securityRouter.get('/usuarios', manageUsers, listUsersController);
securityRouter.post('/usuarios', manageUsers, validateBody(createUserDto), createUserController);
securityRouter.patch(
  '/usuarios/:id',
  manageUsers,
  validateParams(userIdDto),
  validateBody(updateUserDto),
  updateUserController,
);
securityRouter.patch(
  '/usuarios/:id/estado',
  manageUsers,
  validateParams(userIdDto),
  validateBody(userStateDto),
  setUserStateController,
);
securityRouter.post(
  '/usuarios/:id/roles',
  manageUsers,
  validateParams(userIdDto),
  validateBody(assignRoleDto),
  assignUserRoleController,
);
securityRouter.delete(
  '/usuarios/:id/roles/:idRol',
  manageUsers,
  validateParams(userRoleParamsDto),
  revokeUserRoleController,
);
securityRouter.post(
  '/usuarios/:id/restablecer',
  manageUsers,
  validateParams(userIdDto),
  validateBody(resetUserDto),
  resetUserController,
);

securityRouter.get('/roles', manageUsers, listRolesController);
securityRouter.post('/roles', manageUsers, validateBody(roleDto), createRoleController);
securityRouter.patch(
  '/roles/:id',
  manageUsers,
  validateParams(roleIdDto),
  validateBody(roleDto),
  updateRoleController,
);
securityRouter.get('/permisos', manageUsers, listPermissionsController);

securityRouter.get('/clientes', requirePermissions('CLIENTES_GESTIONAR'), listClientsController);
securityRouter.post(
  '/clientes',
  requirePermissions('CLIENTES_GESTIONAR'),
  validateBody(createClientDto),
  createClientController,
);
securityRouter.get('/bitacora', requirePermissions('BITACORA_CONSULTAR'), listLogsController);

export default securityRouter;
