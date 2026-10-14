import { errorCodes } from '../config/errorCodes.js';
import {
  createClientAccount,
  clearLoginFailures,
  createSession,
  findSession,
  findUserById,
  findUserForLogin,
  registerFailedLogin,
  revokeSession,
  setPasswordChangeRequired,
  touchSession,
  updatePassword,
} from '../repositories/authRepository.js';
import { addLog } from '../repositories/securityRepository.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createSessionToken, hashToken } from '../utils/token.js';


const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 3 * 60;

// La bitacora es auxiliar: si falla el registro, el inicio de sesion no debe fallar.
const logEvent = async (action, object, result, userId, ip) => {
  try {
    await addLog(action, object, result, userId, ip ?? null);
  } catch {
    // Se ignora a proposito: el evento se pierde, pero la operacion continua.
  }
};

const accountLocked = (bloqueadoHasta) => new AppError(errorCodes.ACCOUNT_LOCKED, null, {
  reason: 'ACCOUNT_LOCKED',
  bloqueadoHasta: new Date(bloqueadoHasta).toISOString(),
});


const safeUser = (user) => ({
  id: user.id_usuario,
  nombreUsuario: user.nombre_usuario,
  correo: user.correo,
  roles: user.roles,
  permisos: user.permisos ?? [],
  cambioContrasenaObligatorio: user.cambio_contrasena_obligatorio,
});

const isStaff = (roles) => roles.some((role) => (
  ['ADMINISTRADOR', 'VENDEDOR', 'DESARROLLADOR'].includes(role)
));

const expiration = (roles) => new Date(
  Date.now() + (isStaff(roles) ? 8 * 60 * 60 : 7 * 24 * 60 * 60) * 1000,
);

export const loginAuthService = async ({ identificador, contrasena }, ip) => {
  const user = await findUserForLogin(identificador);
  if (!user) {
    await logEvent('INICIO_SESION_FALLIDO', 'IDENTIFICADOR_NO_REGISTRADO', 'FALLIDO', null, ip);
    throw new AppError(errorCodes.INVALID_CREDENTIALS);
  }
  if (!user.activo) {
    await logEvent('INICIO_SESION_INACTIVO', user.nombre_usuario, 'FALLIDO', user.id_usuario, ip);
    throw new AppError(errorCodes.INVALID_CREDENTIALS);
  }
  if (user.bloqueada) {
    await logEvent('INICIO_SESION_BLOQUEADO', user.nombre_usuario, 'BLOQUEADO', user.id_usuario, ip);
    throw accountLocked(user.bloqueado_hasta);
  }

  if (!(await verifyPassword(contrasena, user.hash_contrasena))) {
    const failure = await registerFailedLogin(user.id_usuario, MAX_LOGIN_ATTEMPTS, LOCKOUT_SECONDS);
    await logEvent('INICIO_SESION_FALLIDO', user.nombre_usuario, 'FALLIDO', user.id_usuario, ip);
    if (failure.bloqueada && failure.bloqueadoHasta) {
      await logEvent('CUENTA_BLOQUEADA', user.nombre_usuario, 'BLOQUEADO', user.id_usuario, ip);
      throw accountLocked(failure.bloqueadoHasta);
    }
    throw new AppError(errorCodes.INVALID_CREDENTIALS);
  }

  await clearLoginFailures(user.id_usuario);
  const token = createSessionToken();
  const session = await createSession(hashToken(token), expiration(user.roles), user.id_usuario);
  await logEvent('INICIO_SESION', user.nombre_usuario, 'OK', user.id_usuario, ip);
  return {
    token,
    expiraEn: session.expira_en,
    usuario: safeUser(user),
  };
};

export const registerAuthService = async (data) => {
  try {
    return {
      usuario: await createClientAccount(data, await hashPassword(data.contrasena)),
    };
  } catch (error) {
    if (error.code === '23505') throw new AppError(errorCodes.CONFLICT);
    throw error;
  }
};

export const getSessionAuthService = async (token) => {
  const session = await findSession(hashToken(token));
  if (!session || !session.activo) {
    throw new AppError(errorCodes.INVALID_CREDENTIALS);
  }

  const now = Date.now();
  const maxIdle = isStaff(session.roles) ? 30 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  if (
    new Date(session.expira_en).getTime() <= now
    || now - new Date(session.ultima_actividad_en).getTime() > maxIdle
  ) {
    throw new AppError(errorCodes.SESSION_EXPIRED);
  }

  await touchSession(session.id_sesion);
  return { token, usuario: safeUser(session) };
};

export const logoutAuthService = async (token, usuario, ip) => {
  await revokeSession(hashToken(token));
  if (usuario) await logEvent('CIERRE_SESION', usuario.nombreUsuario, 'OK', usuario.id, ip);
};

export const changePasswordAuthService = async (session, data, ip) => {
  const user = await findUserById(session.usuario.id);
  if (!user || !user.activo) {
    throw new AppError(errorCodes.INVALID_CREDENTIALS);
  }

  const ok = await verifyPassword(data.contrasenaActual, user.hash_contrasena);
  if (!ok) {
    await logEvent('CAMBIO_CONTRASENA_FALLIDO', user.nombre_usuario, 'FALLIDO', user.id_usuario, ip);
    throw new AppError(errorCodes.INVALID_CREDENTIALS, 401, {
      reason: 'CURRENT_PASSWORD_MISMATCH',
    });
  }

  await updatePassword(user.id_usuario, await hashPassword(data.contrasenaNueva));
  await setPasswordChangeRequired(user.id_usuario, false);
  await logEvent('CONTRASENA_CAMBIADA', user.nombre_usuario, 'OK', user.id_usuario, ip);
  return { changed: true };
};
