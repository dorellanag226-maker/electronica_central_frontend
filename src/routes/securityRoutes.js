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
import { requireAnyPermission, requirePermissions } from '../middlewares/authorizationMiddleware.js';
import { validateBody, validateParams } from '../middlewares/validateDto.js';

const securityRouter = Router();
securityRouter.use(authenticate);

// Solo administrador: editar usuarios, cambiar estado, roles, restablecer, gestionar roles.
const manageUsers = requirePermissions('USUARIOS_GESTIONAR');
// Administrador y empleado: listar y crear usuarios (la pantalla también necesita roles y permisos para cargar).
const usersAccess = requireAnyPermission('USUARIOS_GESTIONAR', 'USUARIOS_CREAR');

securityRouter.get('/usuarios', usersAccess, listUsersController);
securityRouter.post('/usuarios', usersAccess, validateBody(createUserDto), createUserController);
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

securityRouter.get('/roles', usersAccess, listRolesController);
securityRouter.post('/roles', manageUsers, validateBody(roleDto), createRoleController);
securityRouter.patch(
  '/roles/:id',
  manageUsers,
  validateParams(roleIdDto),
  validateBody(roleDto),
  updateRoleController,
);
securityRouter.get('/permisos', usersAccess, listPermissionsController);

securityRouter.get('/clientes', requirePermissions('CLIENTES_GESTIONAR'), listClientsController);
securityRouter.post(
  '/clientes',
  requirePermissions('CLIENTES_GESTIONAR'),
  validateBody(createClientDto),
  createClientController,
);
securityRouter.get('/bitacora', requirePermissions('BITACORA_CONSULTAR'), listLogsController);

export default securityRouter;