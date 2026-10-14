import { describePermission } from '../config/permissionCatalog.js';
import {
  clearLoginFailures,
  setPasswordChangeRequired,
} from '../repositories/authRepository.js';
import {
  addLog,
  addUserRole,
  countPermissions,
  createClient,
  createRole,
  createUser,
  emailTaken,
  findRolesByIds,
  findRolesByNames,
  listClients,
  listLogs,
  listPermissions,
  listRoles,
  listUsers,
  removeUserRole,
  revokeUserSessions,
  roleNameTaken,
  roleRowById,
  setUserActive,
  setUserPassword,
  updateRole,
  updateUser,
  userById,
  userRowById,
  usernameTaken,
} from '../repositories/securityRepository.js';
import { errorCodes } from '../config/errorCodes.js';
import { AppError } from '../utils/AppError.js';
import {
  businessRule,
  conflict,
  forbidden,
  notFound,
} from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';

const ADMIN = 'ADMINISTRADOR';
const DEVELOPER = 'DESARROLLADOR';
const SYSTEM_ROLES = ['CLIENTE', 'VENDEDOR', ADMIN, DEVELOPER];

const isDeveloper = (actor) => actor.roles.includes(DEVELOPER);
const logAction = (action, object, actor, ip) => addLog(action, object, 'OK', actor.id, ip ?? null);

// El rol DESARROLLADOR solo existe para soporte: nadie lo gestiona ni lo asigna por la API.
// El rol ADMINISTRADOR solo lo asigna o modifica un DESARROLLADOR.
const assertCanManage = (actor, target) => {
  if (target.id_usuario === actor.id) return;
  if (target.roles.includes(DEVELOPER)) throw forbidden('No tiene permiso para gestionar a este usuario.');
  if (!isDeveloper(actor) && target.roles.includes(ADMIN)) {
    throw forbidden('Solo el desarrollador puede gestionar a un administrador.');
  }
};

const assertCanGrant = (actor, roles) => {
  if (roles.some((role) => role.nombre === DEVELOPER)) {
    throw forbidden('El rol Desarrollador no se puede asignar desde el sistema.');
  }
  if (!isDeveloper(actor) && roles.some((role) => role.nombre === ADMIN)) {
    throw forbidden('Solo el desarrollador puede asignar el rol Administrador.');
  }
};

const loadTarget = async (id) => {
  const target = await userById(id);
  if (!target) throw notFound('El usuario no existe.');
  return target;
};

const emailConflict = (error) => {
  if (error.code === '23505' && String(error.constraint).includes('correo')) {
    return conflict('Ya existe un usuario con ese correo electrónico.', 'correo');
  }
  if (error.code === '23505') return conflict('Ya existe un usuario con esos datos.', 'correo');
  return error;
};

const baseUsername = (email) => {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return (local.length >= 3 ? local : `${local}usr`).slice(0, 100);
};

const uniqueUsername = async (email) => {
  const base = baseUsername(email);
  let candidate = base;
  for (let n = 2; await usernameTaken(candidate); n += 1) candidate = `${base}${n}`;
  return candidate;
};

// ---------- Clientes ----------

export const createClientService = async (data, actor, ip) => {
  try {
    const client = await createClient(data);
    await addLog('CLIENTE_CREADO', client.id_cliente, 'OK', actor.id, ip ?? null);
    return client;
  } catch (error) {
    if (error.code === '23505') throw new AppError(errorCodes.CONFLICT);
    throw error;
  }
};

export const listClientsService = listClients;

// ---------- Usuarios ----------

export const listUsersService = async (actor) => {
  const rows = await listUsers();
  return isDeveloper(actor) ? rows : rows.filter((row) => !row.roles.includes(DEVELOPER));
};

export const createUserService = async (data, actor, ip) => {
  const roles = data.rolesIds
    ? await findRolesByIds(data.rolesIds)
    : await findRolesByNames(data.roles);
  if (roles.length !== (data.rolesIds ?? data.roles).length) {
    throw notFound('Alguno de los roles seleccionados no existe.');
  }
  assertCanGrant(actor, roles);

  if (await emailTaken(data.correo)) {
    throw conflict('Ya existe un usuario con ese correo electrónico.', 'correo');
  }
  const username = data.nombreUsuario ?? await uniqueUsername(data.correo);
  if (data.nombreUsuario && await usernameTaken(username)) {
    throw conflict('Ya existe un usuario con ese nombre de usuario.', 'nombreUsuario');
  }

  try {
    const user = await createUser({
      username,
      email: data.correo,
      passwordHash: await hashPassword(data.contrasena),
      nombre: data.nombre ?? username,
      activo: data.activo,
      rolesIds: roles.map((role) => role.id_rol),
    });
    await logAction('USUARIO_CREADO', `Usuario ${username}`, actor, ip);
    return userRowById(user.id_usuario);
  } catch (error) {
    throw emailConflict(error);
  }
};

export const updateUserService = async (id, data, actor, ip) => {
  const target = await loadTarget(id);
  assertCanManage(actor, target);
  const self = target.id_usuario === actor.id;

  if (self && !data.activo) throw businessRule('No puede desactivar su propia cuenta.');
  if (await emailTaken(data.correo, id)) {
    throw conflict('Ya existe un usuario con ese correo electrónico.', 'correo');
  }

  let rolesIds;
  const current = [...target.roles_ids].sort();
  const desired = [...new Set(data.rolesIds)].sort();
  if (current.join() !== desired.join()) {
    if (self) throw businessRule('No puede cambiar sus propios roles.', 'rolesIds');
    const roles = await findRolesByIds(desired);
    if (roles.length !== desired.length) throw notFound('Alguno de los roles seleccionados no existe.');
    assertCanGrant(actor, roles.filter((role) => !target.roles_ids.includes(role.id_rol)));
    rolesIds = desired;
  }

  try {
    await updateUser(id, { nombre: data.nombre, correo: data.correo, activo: data.activo, rolesIds });
  } catch (error) {
    throw emailConflict(error);
  }
  if (!data.activo && target.activo) await revokeUserSessions(id);
  await logAction('USUARIO_ACTUALIZADO', `Usuario ${target.nombre_usuario}`, actor, ip);
  return userRowById(id);
};

export const setUserStateService = async (id, activo, actor, ip) => {
  const target = await loadTarget(id);
  assertCanManage(actor, target);
  if (target.id_usuario === actor.id && !activo) {
    throw businessRule('No puede desactivar su propia cuenta.');
  }

  await setUserActive(id, activo);
  if (!activo) await revokeUserSessions(id);
  await logAction(activo ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO', `Usuario ${target.nombre_usuario}`, actor, ip);
  return userRowById(id);
};

export const assignUserRoleService = async (id, idRol, actor, ip) => {
  const target = await loadTarget(id);
  assertCanManage(actor, target);
  if (target.id_usuario === actor.id) throw businessRule('No puede cambiar sus propios roles.', 'rolId');
  const [role] = await findRolesByIds([idRol]);
  if (!role) throw notFound('El rol no existe.');
  assertCanGrant(actor, [role]);

  if (!(await addUserRole(id, idRol))) throw conflict('El usuario ya tiene asignado ese rol.', 'rolId');
  await logAction('ROL_ASIGNADO', `Rol ${role.nombre} a ${target.nombre_usuario}`, actor, ip);
  return userRowById(id);
};

export const revokeUserRoleService = async (id, idRol, actor, ip) => {
  const target = await loadTarget(id);
  assertCanManage(actor, target);
  if (target.id_usuario === actor.id) throw businessRule('No puede cambiar sus propios roles.', 'rolId');
  const [role] = await findRolesByIds([idRol]);
  if (!role) throw notFound('El rol no existe.');

  if (!(await removeUserRole(id, idRol))) throw conflict('El usuario no tiene asignado ese rol.', 'rolId');
  await revokeUserSessions(id);
  await logAction('ROL_REVOCADO', `Rol ${role.nombre} a ${target.nombre_usuario}`, actor, ip);
  return userRowById(id);
};

export const resetUserService = async (id, data, actor, ip) => {
  const target = await userById(id);
  if (!target) throw new AppError(errorCodes.NOT_FOUND);

  const actorDev = isDeveloper(actor);
  const targetAdmin = target.roles.includes(ADMIN);
  if (target.roles.includes(DEVELOPER) || (!actorDev && targetAdmin)) {
    throw new AppError(errorCodes.ACCESS_DENIED);
  }

  await setUserPassword(id, await hashPassword(data.contrasenaTemporal));
  await setPasswordChangeRequired(id, true);
  await clearLoginFailures(id);
  await revokeUserSessions(id);
  await addLog('ACCESO_RESTABLECIDO', id, 'OK', actor.id, ip ?? null);
  return { id, restablecido: true };
};

// ---------- Roles y permisos ----------

export const listRolesService = async (actor) => {
  const rows = await listRoles();
  return isDeveloper(actor) ? rows : rows.filter((row) => row.nombre !== DEVELOPER);
};

export const listPermissionsService = async () => (
  (await listPermissions()).map((permiso) => ({
    id_permiso: permiso.id_permiso,
    codigo: permiso.codigo,
    ...describePermission(permiso.codigo, permiso.descripcion),
  }))
);

const assertPermissionsExist = async (permisosIds) => {
  const unique = [...new Set(permisosIds)];
  if ((await countPermissions(unique)) !== unique.length) {
    throw notFound('Algún permiso seleccionado no existe.');
  }
  return unique;
};

export const createRoleService = async (data, actor, ip) => {
  if (await roleNameTaken(data.nombre)) throw conflict('Ya existe un rol con ese nombre.', 'nombre');
  const permisosIds = await assertPermissionsExist(data.permisosIds);

  const id = await createRole({ ...data, permisosIds });
  await logAction('ROL_CREADO', `Rol ${data.nombre}`, actor, ip);
  return roleRowById(id);
};

export const updateRoleService = async (id, data, actor, ip) => {
  const role = await roleRowById(id);
  if (!role) throw notFound('El rol no existe.');
  if (role.nombre === DEVELOPER) throw forbidden('El rol Desarrollador no se puede modificar.');
  if (role.nombre === ADMIN && !isDeveloper(actor)) {
    throw forbidden('Solo el desarrollador puede modificar el rol Administrador.');
  }
  // El codigo busca estos roles por nombre (por ejemplo, el registro asigna CLIENTE).
  if (SYSTEM_ROLES.includes(role.nombre) && data.nombre !== role.nombre) {
    throw businessRule('Los roles base del sistema no se pueden renombrar.', 'nombre');
  }
  if (await roleNameTaken(data.nombre, id)) throw conflict('Ya existe un rol con ese nombre.', 'nombre');
  const permisosIds = await assertPermissionsExist(data.permisosIds);

  await updateRole(id, { ...data, permisosIds });
  await logAction('ROL_ACTUALIZADO', `Rol ${data.nombre}`, actor, ip);
  return roleRowById(id);
};

export const listLogsService = listLogs;
