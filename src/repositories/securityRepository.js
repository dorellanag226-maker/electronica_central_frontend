import { query, withTransaction } from '../lib/database.js';

export const createClient = async (data) => (
  await query(
    `INSERT INTO electronica_az.cliente(nombre, documento, telefono, correo)
     VALUES ($1, $2, $3, $4)
     RETURNING id_cliente, nombre, documento, telefono, correo`,
    [data.nombre, data.documento, data.telefono, data.correo],
  )
).rows[0];

export const listClients = async () => (
  await query(
    `SELECT id_cliente, nombre, documento, telefono, correo, id_usuario
     FROM electronica_az.cliente
     ORDER BY nombre`,
  )
).rows;

// ---------- Usuarios ----------

const userRowSelect = `
  SELECT u.id_usuario, u.nombre, u.nombre_usuario, u.correo, u.activo, u.creado_en,
    COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles,
    COALESCE(array_agg(r.id_rol::text) FILTER (WHERE r.id_rol IS NOT NULL), '{}') AS roles_ids
  FROM electronica_az.usuario u
  LEFT JOIN electronica_az.usuario_rol ur ON ur.id_usuario = u.id_usuario
  LEFT JOIN electronica_az.rol r ON r.id_rol = ur.id_rol
`;

export const listUsers = async () => (
  await query(`${userRowSelect} GROUP BY u.id_usuario ORDER BY u.creado_en DESC, u.nombre_usuario`)
).rows;

export const userRowById = async (id) => (
  await query(`${userRowSelect} WHERE u.id_usuario = $1 GROUP BY u.id_usuario`, [id])
).rows[0];

export const userById = async (id) => (
  await query(`
    SELECT u.id_usuario, u.nombre_usuario, u.correo, u.hash_contrasena, u.activo,
      COALESCE(array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles,
      COALESCE(array_agg(r.id_rol::text) FILTER (WHERE r.id_rol IS NOT NULL), '{}') AS roles_ids
    FROM electronica_az.usuario u
    LEFT JOIN electronica_az.usuario_rol ur ON ur.id_usuario = u.id_usuario
    LEFT JOIN electronica_az.rol r ON r.id_rol = ur.id_rol
    WHERE u.id_usuario = $1
    GROUP BY u.id_usuario
  `, [id])
).rows[0];

export const emailTaken = async (email, exceptId = null) => (
  (await query(
    `SELECT 1 FROM electronica_az.usuario
     WHERE lower(correo) = lower($1) AND ($2::uuid IS NULL OR id_usuario <> $2)`,
    [email, exceptId],
  )).rowCount > 0
);

export const usernameTaken = async (username) => (
  (await query(
    'SELECT 1 FROM electronica_az.usuario WHERE lower(nombre_usuario) = lower($1)',
    [username],
  )).rowCount > 0
);

export const findRolesByIds = async (ids) => (
  await query(
    'SELECT id_rol, nombre FROM electronica_az.rol WHERE id_rol = ANY($1::uuid[])',
    [ids],
  )
).rows;

export const findRolesByNames = async (names) => (
  await query(
    'SELECT id_rol, nombre FROM electronica_az.rol WHERE nombre = ANY($1::text[])',
    [names],
  )
).rows;

export const createUser = (data) => withTransaction(async (client) => {
  const user = (
    await client.query(
      `INSERT INTO electronica_az.usuario(nombre_usuario, correo, hash_contrasena, nombre, activo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_usuario, nombre_usuario, correo`,
      [data.username, data.email, data.passwordHash, data.nombre, data.activo],
    )
  ).rows[0];

  await client.query(
    `INSERT INTO electronica_az.usuario_rol(id_usuario, id_rol)
     SELECT $1, UNNEST($2::uuid[])`,
    [user.id_usuario, data.rolesIds],
  );
  return user;
});

export const updateUser = (id, data) => withTransaction(async (client) => {
  await client.query(
    `UPDATE electronica_az.usuario
     SET nombre = $2, correo = $3, activo = $4
     WHERE id_usuario = $1`,
    [id, data.nombre, data.correo, data.activo],
  );
  if (data.rolesIds) {
    await client.query('DELETE FROM electronica_az.usuario_rol WHERE id_usuario = $1', [id]);
    await client.query(
      `INSERT INTO electronica_az.usuario_rol(id_usuario, id_rol)
       SELECT $1, UNNEST($2::uuid[])`,
      [id, data.rolesIds],
    );
  }
});

export const setUserActive = (id, activo) => query(
  'UPDATE electronica_az.usuario SET activo = $2 WHERE id_usuario = $1',
  [id, activo],
);

export const addUserRole = async (idUsuario, idRol) => (
  await query(
    `INSERT INTO electronica_az.usuario_rol(id_usuario, id_rol) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING id_usuario`,
    [idUsuario, idRol],
  )
).rowCount > 0;

export const removeUserRole = async (idUsuario, idRol) => (
  await query(
    'DELETE FROM electronica_az.usuario_rol WHERE id_usuario = $1 AND id_rol = $2',
    [idUsuario, idRol],
  )
).rowCount > 0;

export const setUserPassword = async (id, hash) => query(
  'UPDATE electronica_az.usuario SET hash_contrasena = $1 WHERE id_usuario = $2',
  [hash, id],
);

export const revokeUserSessions = async (id) => query(
  `UPDATE electronica_az.sesion_usuario
   SET revocada_en = CURRENT_TIMESTAMP
   WHERE id_usuario = $1 AND revocada_en IS NULL`,
  [id],
);

// ---------- Roles y permisos ----------

const roleRowSelect = `
  SELECT r.id_rol, r.nombre, r.descripcion,
    COALESCE(array_agg(rp.id_permiso::text) FILTER (WHERE rp.id_permiso IS NOT NULL), '{}') AS permisos_ids
  FROM electronica_az.rol r
  LEFT JOIN electronica_az.rol_permiso rp ON rp.id_rol = r.id_rol
`;

export const listRoles = async () => (
  await query(`${roleRowSelect} GROUP BY r.id_rol ORDER BY r.nombre`)
).rows;

export const roleRowById = async (id) => (
  await query(`${roleRowSelect} WHERE r.id_rol = $1 GROUP BY r.id_rol`, [id])
).rows[0];

export const listPermissions = async () => (
  await query('SELECT id_permiso, codigo, descripcion FROM electronica_az.permiso ORDER BY codigo')
).rows;

export const countPermissions = async (ids) => Number((
  await query(
    'SELECT count(*) AS total FROM electronica_az.permiso WHERE id_permiso = ANY($1::uuid[])',
    [ids],
  )
).rows[0].total);

export const roleNameTaken = async (nombre, exceptId = null) => (
  (await query(
    `SELECT 1 FROM electronica_az.rol
     WHERE lower(btrim(nombre)) = lower(btrim($1)) AND ($2::uuid IS NULL OR id_rol <> $2)`,
    [nombre, exceptId],
  )).rowCount > 0
);

const replaceRolePermissions = async (client, idRol, permisosIds) => {
  await client.query('DELETE FROM electronica_az.rol_permiso WHERE id_rol = $1', [idRol]);
  if (permisosIds.length > 0) {
    await client.query(
      `INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
       SELECT $1, UNNEST($2::uuid[])`,
      [idRol, permisosIds],
    );
  }
};

export const createRole = (data) => withTransaction(async (client) => {
  const role = (
    await client.query(
      'INSERT INTO electronica_az.rol(nombre, descripcion) VALUES ($1, $2) RETURNING id_rol',
      [data.nombre, data.descripcion],
    )
  ).rows[0];
  await replaceRolePermissions(client, role.id_rol, data.permisosIds);
  return role.id_rol;
});

export const updateRole = (id, data) => withTransaction(async (client) => {
  await client.query(
    'UPDATE electronica_az.rol SET nombre = $2, descripcion = $3 WHERE id_rol = $1',
    [id, data.nombre, data.descripcion],
  );
  await replaceRolePermissions(client, id, data.permisosIds);
});

// ---------- Bitacora ----------

export const addLog = async (action, object, result, userId, ip = null) => query(
  `INSERT INTO electronica_az.registro_bitacora(accion, objeto_afectado, resultado, id_usuario, direccion_ip)
   VALUES ($1, $2, $3, $4, $5)`,
  [action, object, result, userId ?? null, ip],
);

export const listLogs = async () => (
  await query(
    `SELECT b.id_registro, b.fecha_hora, b.accion, b.objeto_afectado, b.resultado,
       host(b.direccion_ip) AS direccion_ip, u.nombre_usuario
     FROM electronica_az.registro_bitacora b
     LEFT JOIN electronica_az.usuario u ON u.id_usuario = b.id_usuario
     ORDER BY b.fecha_hora DESC
     LIMIT 1000`,
  )
).rows;
