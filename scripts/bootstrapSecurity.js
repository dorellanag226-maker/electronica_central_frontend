import { hashPassword } from '../src/utils/password.js';
import { closeDatabase, withTransaction } from '../src/lib/database.js';

const required = ['BOOTSTRAP_ADMIN_USERNAME', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'BOOTSTRAP_DEVELOPER_USERNAME', 'BOOTSTRAP_DEVELOPER_EMAIL', 'BOOTSTRAP_DEVELOPER_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing bootstrap variables: ${missing.join(', ')}`);

const roles = ['CLIENTE', 'VENDEDOR', 'ADMINISTRADOR', 'DESARROLLADOR'];
const permissions = [
  'USUARIOS_GESTIONAR',
  'CLIENTES_GESTIONAR',
  'BITACORA_CONSULTAR',
  'SOPORTE_RESTABLECER',
  'CATALOGO_GESTIONAR',
  'INVENTARIO_CONSULTAR',
  'INVENTARIO_GESTIONAR',
  'COMPRAS_GESTIONAR',
  'VENTAS_GESTIONAR',
  'SOLICITUDES_GESTIONAR',
  'REPORTES_CONSULTAR',
  'CATALOGO_CONSULTAR',
  'USUARIOS_CREAR',
];
const addUser = async (client, username, email, password, role) => {
  const hash = await hashPassword(password);
  const user = (await client.query('INSERT INTO electronica_az.usuario(nombre_usuario,correo,hash_contrasena) VALUES($1,$2,$3) ON CONFLICT (correo) DO UPDATE SET nombre_usuario=EXCLUDED.nombre_usuario RETURNING id_usuario', [username, email, hash])).rows[0];
  const roleId = (await client.query('SELECT id_rol FROM electronica_az.rol WHERE nombre=$1', [role])).rows[0].id_rol;
  await client.query('INSERT INTO electronica_az.usuario_rol(id_usuario,id_rol) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id_usuario, roleId]);
};

try {
  await withTransaction(async (client) => {
    for (const role of roles) await client.query('INSERT INTO electronica_az.rol(nombre) VALUES($1) ON CONFLICT DO NOTHING', [role]);
    for (const permission of permissions) await client.query('INSERT INTO electronica_az.permiso(codigo) VALUES($1) ON CONFLICT DO NOTHING', [permission]);
    await client.query("INSERT INTO electronica_az.rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM electronica_az.rol r CROSS JOIN electronica_az.permiso p WHERE r.nombre IN ('ADMINISTRADOR','DESARROLLADOR') ON CONFLICT DO NOTHING");
    await client.query("INSERT INTO electronica_az.rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM electronica_az.rol r JOIN electronica_az.permiso p ON p.codigo='CLIENTES_GESTIONAR' WHERE r.nombre='VENDEDOR' ON CONFLICT DO NOTHING");
    await client.query("INSERT INTO electronica_az.rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM electronica_az.rol r JOIN electronica_az.permiso p ON p.codigo='INVENTARIO_CONSULTAR' WHERE r.nombre='VENDEDOR' ON CONFLICT DO NOTHING");
    await client.query("INSERT INTO electronica_az.rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM electronica_az.rol r JOIN electronica_az.permiso p ON p.codigo='VENTAS_GESTIONAR' WHERE r.nombre='VENDEDOR' ON CONFLICT DO NOTHING");
    await client.query("INSERT INTO electronica_az.rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM electronica_az.rol r JOIN electronica_az.permiso p ON p.codigo='SOLICITUDES_GESTIONAR' WHERE r.nombre='VENDEDOR' ON CONFLICT DO NOTHING");
    // NUEVO: el empleado (VENDEDOR) puede consultar el catálogo y crear usuarios.
    await client.query("INSERT INTO electronica_az.rol_permiso(id_rol,id_permiso) SELECT r.id_rol,p.id_permiso FROM electronica_az.rol r JOIN electronica_az.permiso p ON p.codigo IN ('CATALOGO_CONSULTAR','USUARIOS_CREAR') WHERE r.nombre='VENDEDOR' ON CONFLICT DO NOTHING");
    await addUser(client, process.env.BOOTSTRAP_ADMIN_USERNAME, process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD, 'ADMINISTRADOR');
    await addUser(client, process.env.BOOTSTRAP_DEVELOPER_USERNAME, process.env.BOOTSTRAP_DEVELOPER_EMAIL, process.env.BOOTSTRAP_DEVELOPER_PASSWORD, 'DESARROLLADOR');
  });
  process.stdout.write('Security bootstrap completed.\n');
} finally {
  await closeDatabase();
}