import { query, withTransaction } from '../lib/database.js';

const userAuthSelect = `
  SELECT
    u.id_usuario,
    u.nombre_usuario,
    u.correo,
    u.hash_contrasena,
    u.activo,
    u.cambio_contrasena_obligatorio,
    u.intentos_fallidos,
    u.bloqueado_hasta,
    COALESCE(u.bloqueado_hasta > CURRENT_TIMESTAMP, false) AS bloqueada,
    COALESCE(array_agg(DISTINCT r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles,
    COALESCE(array_agg(DISTINCT p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
  FROM electronica_az.usuario u
  LEFT JOIN electronica_az.usuario_rol ur ON ur.id_usuario = u.id_usuario
  LEFT JOIN electronica_az.rol r ON r.id_rol = ur.id_rol
  LEFT JOIN electronica_az.rol_permiso rp ON rp.id_rol = r.id_rol
  LEFT JOIN electronica_az.permiso p ON p.id_permiso = rp.id_permiso
`;

export const findUserForLogin = async (identifier) => (
  await query(`
    ${userAuthSelect}
    WHERE lower(u.correo) = lower($1) OR lower(u.nombre_usuario) = lower($1)
    GROUP BY u.id_usuario
  `, [identifier])
).rows[0];

export const findUserById = async (idUsuario) => (
  await query(`
    ${userAuthSelect}
    WHERE u.id_usuario = $1
    GROUP BY u.id_usuario
  `, [idUsuario])
).rows[0];

// La expiracion se calcula con el reloj de la BD (no con el de Node) para que todas las
// comparaciones de tiempo de la sesion usen una sola fuente de verdad.
export const createSession = async (tokenHash, ttlSeconds, userId) => (
  await query(
    `INSERT INTO electronica_az.sesion_usuario(token_hash, expira_en, id_usuario)
     VALUES ($1, CURRENT_TIMESTAMP + make_interval(secs => $2), $3)
     RETURNING id_sesion, expira_en`,
    [tokenHash, ttlSeconds, userId],
  )
).rows[0];

export const findSession = async (tokenHash) => (
  await query(`
    SELECT
      s.id_sesion,
      s.expira_en,
      s.ultima_actividad_en,
      (s.expira_en <= CURRENT_TIMESTAMP) AS expirada,
      (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.ultima_actividad_en)) * 1000)::float8 AS inactividad_ms,
      u.id_usuario,
      u.nombre_usuario,
      u.correo,
      u.activo,
      u.cambio_contrasena_obligatorio,
      COALESCE(array_agg(DISTINCT r.nombre) FILTER (WHERE r.nombre IS NOT NULL), '{}') AS roles,
      COALESCE(array_agg(DISTINCT p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
    FROM electronica_az.sesion_usuario s
    JOIN electronica_az.usuario u ON u.id_usuario = s.id_usuario
    LEFT JOIN electronica_az.usuario_rol ur ON ur.id_usuario = u.id_usuario
    LEFT JOIN electronica_az.rol r ON r.id_rol = ur.id_rol
    LEFT JOIN electronica_az.rol_permiso rp ON rp.id_rol = r.id_rol
    LEFT JOIN electronica_az.permiso p ON p.id_permiso = rp.id_permiso
    WHERE s.token_hash = $1 AND s.revocada_en IS NULL
    GROUP BY s.id_sesion, u.id_usuario
  `, [tokenHash])
).rows[0];

export const touchSession = (sessionId) => query(
  'UPDATE electronica_az.sesion_usuario SET ultima_actividad_en = CURRENT_TIMESTAMP WHERE id_sesion = $1',
  [sessionId],
);

export const revokeSession = (tokenHash) => query(
  `UPDATE electronica_az.sesion_usuario
   SET revocada_en = CURRENT_TIMESTAMP
   WHERE token_hash = $1 AND revocada_en IS NULL`,
  [tokenHash],
);

export const updatePassword = (userId, hash) => query(
  'UPDATE electronica_az.usuario SET hash_contrasena = $1 WHERE id_usuario = $2',
  [hash, userId],
);

export const setPasswordChangeRequired = (userId, required) => query(
  'UPDATE electronica_az.usuario SET cambio_contrasena_obligatorio = $1 WHERE id_usuario = $2',
  [required, userId],
);

export const createClientAccount = (data, passwordHash) => withTransaction(async (client) => {
  const user = (
    await client.query(
      `INSERT INTO electronica_az.usuario(nombre_usuario, correo, hash_contrasena)
       VALUES ($1, $2, $3)
       RETURNING id_usuario, nombre_usuario, correo`,
      [data.nombreUsuario, data.correo, passwordHash],
    )
  ).rows[0];

  const role = (
    await client.query("SELECT id_rol FROM electronica_az.rol WHERE nombre = 'CLIENTE'")
  ).rows[0];
  if (!role) throw new Error('CLIENTE role is not initialized');

  await client.query(
    'INSERT INTO electronica_az.usuario_rol(id_usuario, id_rol) VALUES ($1, $2)',
    [user.id_usuario, role.id_rol],
  );
  await client.query(
    `INSERT INTO electronica_az.cliente(nombre, telefono, correo, id_usuario)
     VALUES ($1, $2, $3, $4)`,
    [data.nombre, data.telefono, data.correo, user.id_usuario],
  );
  return user;
});





export const registerFailedLogin = async (idUsuario, maxAttempts, lockSeconds) => {
  const updated = (await query(
    `UPDATE electronica_az.usuario
     SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
         bloqueado_hasta = CASE
           WHEN intentos_fallidos + 1 >= $2 THEN CURRENT_TIMESTAMP + make_interval(secs => $3)
           ELSE bloqueado_hasta
         END
     WHERE id_usuario = $1
       AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= CURRENT_TIMESTAMP)
     RETURNING (intentos_fallidos = 0) AS bloqueada, bloqueado_hasta`,
    [idUsuario, maxAttempts, lockSeconds],
  )).rows[0];
  if (updated) return { bloqueada: updated.bloqueada, bloqueadoHasta: updated.bloqueado_hasta };

  const current = (await query(
    'SELECT bloqueado_hasta FROM electronica_az.usuario WHERE id_usuario = $1',
    [idUsuario],
  )).rows[0];
  return { bloqueada: true, bloqueadoHasta: current?.bloqueado_hasta ?? null };
};

export const clearLoginFailures = (idUsuario) => query(
  `UPDATE electronica_az.usuario
   SET intentos_fallidos = 0, bloqueado_hasta = NULL
   WHERE id_usuario = $1 AND (intentos_fallidos <> 0 OR bloqueado_hasta IS NOT NULL)`,
  [idUsuario],
);
