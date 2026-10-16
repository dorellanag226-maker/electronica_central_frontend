// Nombre legible y modulo de cada permiso, para mostrarlos en el panel de roles.
const catalog = {
  USUARIOS_GESTIONAR: { nombre: 'Gestionar usuarios y roles', modulo: 'Usuarios y Roles' },
  SOPORTE_RESTABLECER: { nombre: 'Restablecer accesos de usuarios', modulo: 'Usuarios y Roles' },
  BITACORA_CONSULTAR: { nombre: 'Consultar la bitácora', modulo: 'Bitácora' },
  CATALOGO_GESTIONAR: { nombre: 'Gestionar productos, categorías y unidades', modulo: 'Catálogo' },
  CLIENTES_GESTIONAR: { nombre: 'Gestionar clientes', modulo: 'Clientes' },
  INVENTARIO_CONSULTAR: { nombre: 'Consultar inventario', modulo: 'Inventario' },
  INVENTARIO_GESTIONAR: { nombre: 'Gestionar inventario', modulo: 'Inventario' },
  COMPRAS_GESTIONAR: { nombre: 'Gestionar compras', modulo: 'Compras' },
  VENTAS_GESTIONAR: { nombre: 'Gestionar ventas', modulo: 'Ventas' },
  SOLICITUDES_GESTIONAR: { nombre: 'Gestionar solicitudes', modulo: 'Solicitudes' },
  REPORTES_CONSULTAR: { nombre: 'Consultar reportes', modulo: 'Reportes' },
  CATALOGO_CONSULTAR: { nombre: 'Consultar producto, categorias y unidades', modulo: 'Catalogo'},
  USUARIOS_CREAR: { nombre: 'Crear usuarios', modulo: 'Usuarios y Roles'},

};

export const describePermission = (codigo, descripcion) => (
  catalog[codigo] ?? { nombre: descripcion ?? codigo, modulo: 'Otros' }
);
