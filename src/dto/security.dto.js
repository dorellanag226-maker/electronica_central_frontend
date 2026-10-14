import { z } from 'zod';

const uuid = z.string().uuid();
const password = z.string().min(8).max(128);

export const userIdDto = z.object({
  id: uuid,
});

export const userRoleParamsDto = z.object({
  id: uuid,
  idRol: uuid,
});

export const roleIdDto = z.object({
  id: uuid,
});

export const createClientDto = z.object({
  nombre: z.string().trim().min(1).max(120),
  documento: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(120).optional(),
  correo: z.string().trim().email().max(254).optional(),
});

export const resetUserDto = z.object({
  contrasenaTemporal: password,
});

// El panel envia `nombre`, `correo`, `contrasena` y `rolesIds`; `nombreUsuario` se genera
// desde el correo si no se indica. `roles` (nombres) se mantiene por compatibilidad.
export const createUserDto = z.object({
  nombreUsuario: z.string().trim().min(3).max(120).optional(),
  nombre: z.string().trim().min(1).max(120).optional(),
  correo: z.string().trim().email().max(254),
  contrasena: password,
  roles: z.array(z.enum(['VENDEDOR', 'CLIENTE'])).min(1).optional(),
  rolesIds: z.array(uuid).min(1).optional(),
  activo: z.boolean().default(true),
}).refine((data) => data.roles || data.rolesIds, {
  message: 'Indique al menos un rol',
  path: ['rolesIds'],
});

export const updateUserDto = z.object({
  nombre: z.string().trim().min(1).max(120),
  correo: z.string().trim().email().max(254),
  activo: z.boolean(),
  rolesIds: z.array(uuid),
});

export const userStateDto = z.object({
  activo: z.boolean(),
});

export const assignRoleDto = z.object({
  idRol: uuid,
});

export const roleDto = z.object({
  nombre: z.string().trim().min(1).max(120),
  descripcion: z.string().trim().max(2_000).default(''),
  permisosIds: z.array(uuid),
});

export const listLogDto = z.object({});
