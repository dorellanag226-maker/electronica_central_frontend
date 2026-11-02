/**
 * Single source for OpenAPI + Postman generation.
 * Run: node scripts/generateApiDocs.mjs
 */
export const apiMeta = {
  title: 'Electrónica Central AZ API',
  version: '0.1.0',
  description:
    'API backend de Electrónica Central AZ. Auth Bearer JWT. Zona reportes: America/La_Paz.',
  serverUrl: 'http://localhost:3000',
};

/** @typedef {{ method: string, path: string, operationId: string, summary: string, tags: string[], auth?: boolean|string, query?: object, pathParams?: string[], body?: object, bodyRequired?: boolean }} Endpoint */

/** @type {Endpoint[]} */
export const endpoints = [
  // Health
  { method: 'get', path: '/health', operationId: 'getHealth', summary: 'Health check', tags: ['Health'], auth: false },
  { method: 'get', path: '/ready', operationId: 'getReady', summary: 'Readiness (PostgreSQL)', tags: ['Health'], auth: false },

  // Auth
  {
    method: 'post', path: '/api/auth/registro', operationId: 'authRegister', summary: 'Registro cliente', tags: ['Auth'], auth: false,
    body: {
      type: 'object',
      required: ['nombreUsuario', 'correo', 'contrasena', 'nombre'],
      properties: {
        nombreUsuario: { type: 'string', minLength: 3 },
        correo: { type: 'string', format: 'email' },
        contrasena: { type: 'string', minLength: 12 },
        nombre: { type: 'string' },
        telefono: { type: 'string' },
      },
    },
  },
  {
    method: 'post', path: '/api/auth/login', operationId: 'authLogin', summary: 'Login', tags: ['Auth'], auth: false,
    body: {
      type: 'object',
      required: ['identificador', 'contrasena'],
      properties: {
        identificador: { type: 'string' },
        contrasena: { type: 'string' },
      },
    },
  },
  { method: 'get', path: '/api/auth/me', operationId: 'authMe', summary: 'Perfil sesión', tags: ['Auth'], auth: true },
  { method: 'post', path: '/api/auth/logout', operationId: 'authLogout', summary: 'Cerrar sesión', tags: ['Auth'], auth: true },
  {
    method: 'post', path: '/api/auth/cambiar-contrasena', operationId: 'authChangePassword', summary: 'Cambiar contraseña', tags: ['Auth'], auth: true,
    body: {
      type: 'object',
      required: ['contrasenaActual', 'contrasenaNueva'],
      properties: {
        contrasenaActual: { type: 'string' },
        contrasenaNueva: { type: 'string', minLength: 12 },
      },
    },
  },
  {
    method: 'post', path: '/api/auth/recuperar-contrasena', operationId: 'authRequestPasswordReset', summary: 'Solicitar enlace de recuperación de contraseña', tags: ['Auth'], auth: false,
    body: {
      type: 'object',
      required: ['correo'],
      properties: {
        correo: { type: 'string', format: 'email' },
      },
    },
  },
  {
    method: 'post', path: '/api/auth/restablecer-contrasena', operationId: 'authResetPassword', summary: 'Restablecer contraseña con el enlace recibido', tags: ['Auth'], auth: false,
    body: {
      type: 'object',
      required: ['token', 'contrasenaNueva', 'confirmacionContrasena'],
      properties: {
        token: { type: 'string', example: '{{resetToken}}' },
        contrasenaNueva: { type: 'string', minLength: 8 },
        confirmacionContrasena: { type: 'string', minLength: 8 },
      },
    },
  },

  // Catalog público
  {
    method: 'get', path: '/api/catalogo/productos', operationId: 'catalogPublicList', summary: 'Catálogo público', tags: ['CatalogoPublico'], auth: false,
    query: {
      buscar: { type: 'string' },
      idCategoria: { type: 'string', format: 'uuid' },
      idMarca: { type: 'string', format: 'uuid' },
      idModelo: { type: 'string', format: 'uuid' },
      pagina: { type: 'integer', default: 1 },
      limite: { type: 'integer', default: 20 },
    },
  },
  {
    method: 'get', path: '/api/catalogo/productos/{id}', operationId: 'catalogPublicGet', summary: 'Producto público', tags: ['CatalogoPublico'], auth: false,
    pathParams: ['id'],
  },
  { method: 'get', path: '/api/catalogo/filtros', operationId: 'catalogFilters', summary: 'Filtros catálogo', tags: ['CatalogoPublico'], auth: false },

  // Catalog admin
  {
    method: 'post', path: '/api/categorias', operationId: 'createCategoria', summary: 'Crear categoría', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    body: { type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' }, descripcion: { type: 'string' } } },
  },
  {
    method: 'post', path: '/api/marcas', operationId: 'createMarca', summary: 'Crear marca', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    body: { type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' } } },
  },
  {
    method: 'post', path: '/api/unidades', operationId: 'createUnidad', summary: 'Crear unidad', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    body: {
      type: 'object',
      required: ['nombre', 'simbolo'],
      properties: {
        nombre: { type: 'string' },
        simbolo: { type: 'string' },
        permiteFraccion: { type: 'boolean', default: false },
      },
    },
  },
  {
    method: 'post', path: '/api/ubicaciones', operationId: 'createUbicacion', summary: 'Crear ubicación', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    body: {
      type: 'object',
      required: ['codigo', 'pasillo', 'estante'],
      properties: {
        codigo: { type: 'string' },
        pasillo: { type: 'string' },
        estante: { type: 'string' },
      },
    },
  },
  {
    method: 'post', path: '/api/modelos', operationId: 'createModelo', summary: 'Crear modelo', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    body: {
      type: 'object',
      required: ['nombre', 'idMarca'],
      properties: {
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        idMarca: { type: 'string', format: 'uuid' },
      },
    },
  },
  { method: 'get', path: '/api/marcas', operationId: 'listMarcas', summary: 'Listar marcas', tags: ['Catalogo'], auth: 'CATALOGO_CONSULTAR' },
  {
    method: 'patch', path: '/api/marcas/{id}', operationId: 'updateMarca', summary: 'Editar marca', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    pathParams: ['id'],
    body: { type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' } } },
  },
  {
    method: 'get', path: '/api/modelos', operationId: 'listModelos', summary: 'Listar modelos (opcional por marca)', tags: ['Catalogo'], auth: 'CATALOGO_CONSULTAR',
    query: { idMarca: { type: 'string', format: 'uuid' } },
  },
  {
    method: 'patch', path: '/api/modelos/{id}', operationId: 'updateModelo', summary: 'Editar modelo', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        idMarca: { type: 'string', format: 'uuid' },
      },
    },
  },
  { method: 'get', path: '/api/ubicaciones', operationId: 'listUbicaciones', summary: 'Listar ubicaciones', tags: ['Catalogo'], auth: 'CATALOGO_CONSULTAR' },
  {
    method: 'patch', path: '/api/ubicaciones/{id}', operationId: 'updateUbicacion', summary: 'Editar ubicación', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      properties: {
        codigo: { type: 'string' },
        pasillo: { type: 'string' },
        estante: { type: 'string' },
      },
    },
  },
  {
    method: 'patch', path: '/api/ubicaciones/{id}/productos', operationId: 'assignUbicacionProductos', summary: 'Asignar ubicación a productos', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      required: ['idProductos'],
      properties: { idProductos: { type: 'array', items: { type: 'string', format: 'uuid' } } },
    },
  },
  {
    method: 'post', path: '/api/productos', operationId: 'createProducto', summary: 'Crear producto', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    body: {
      type: 'object',
      required: ['codigo', 'nombre', 'precioVenta', 'idCategoria', 'idUnidadMedida', 'idUbicacion'],
      properties: {
        codigo: { type: 'string' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        precioVenta: { type: 'number' },
        idCategoria: { type: 'string', format: 'uuid' },
        idUnidadMedida: { type: 'string', format: 'uuid' },
        idUbicacion: { type: 'string', format: 'uuid' },
        idMarca: { type: 'string', format: 'uuid' },
        idModelo: { type: 'string', format: 'uuid' },
        stockMinimo: { type: 'number', default: 0 },
      },
    },
  },
  {
    method: 'patch', path: '/api/productos/{id}', operationId: 'deactivateProducto', summary: 'Editar producto (datos, estado o ubicación)', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      properties: {
        activo: { type: 'boolean', example: false },
        idUbicacion: { type: 'string', format: 'uuid' },
      },
    },
  },
  {
    method: 'post', path: '/api/productos/{id}/compatibilidades', operationId: 'createCompatibilidad', summary: 'Alta compatibilidad', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      required: ['idModelo'],
      properties: { idModelo: { type: 'string', format: 'uuid' }, observaciones: { type: 'string' } },
    },
  },
  {
    method: 'delete', path: '/api/productos/{id}/compatibilidades/{idModelo}', operationId: 'deleteCompatibilidad', summary: 'Borrar compatibilidad', tags: ['Catalogo'], auth: 'CATALOGO_GESTIONAR',
    pathParams: ['id', 'idModelo'],
  },

  // Seguridad / clientes
  { method: 'get', path: '/api/usuarios', operationId: 'listUsuarios', summary: 'Listar usuarios', tags: ['Seguridad'], auth: 'USUARIOS_GESTIONAR' },
  {
    method: 'post', path: '/api/usuarios', operationId: 'createUsuario', summary: 'Crear usuario', tags: ['Seguridad'], auth: 'USUARIOS_GESTIONAR',
    body: {
      type: 'object',
      required: ['nombreUsuario', 'correo', 'contrasena', 'roles'],
      properties: {
        nombreUsuario: { type: 'string' },
        correo: { type: 'string', format: 'email' },
        contrasena: { type: 'string', minLength: 12 },
        roles: { type: 'array', items: { type: 'string', enum: ['VENDEDOR', 'CLIENTE'] } },
      },
    },
  },
  {
    method: 'post', path: '/api/usuarios/{id}/restablecer', operationId: 'resetUsuario', summary: 'Restablecer acceso', tags: ['Seguridad'], auth: 'USUARIOS_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      required: ['contrasenaTemporal'],
      properties: { contrasenaTemporal: { type: 'string', minLength: 12 } },
    },
  },
  { method: 'get', path: '/api/clientes', operationId: 'listClientes', summary: 'Listar clientes', tags: ['Clientes'], auth: 'CLIENTES_GESTIONAR' },
  {
    method: 'post', path: '/api/clientes', operationId: 'createCliente', summary: 'Registrar cliente', tags: ['Clientes'], auth: 'CLIENTES_GESTIONAR',
    body: {
      type: 'object',
      required: ['nombre'],
      properties: {
        nombre: { type: 'string' },
        documento: { type: 'string' },
        telefono: { type: 'string' },
        correo: { type: 'string', format: 'email' },
      },
    },
  },
  {
    method: 'get', path: '/api/bitacora', operationId: 'listBitacora', summary: 'Consultar bitácora (filtros y paginación)', tags: ['Seguridad'], auth: 'BITACORA_CONSULTAR',
    query: {
      desde: { type: 'string', format: 'date' },
      hasta: { type: 'string', format: 'date' },
      idUsuario: { type: 'string', format: 'uuid' },
      accion: { type: 'string' },
      resultado: { type: 'string' },
      pagina: { type: 'integer', default: 1 },
      limite: { type: 'integer', default: 100 },
    },
  },
  { method: 'get', path: '/api/bitacora/filtros', operationId: 'listBitacoraFiltros', summary: 'Acciones y resultados para los filtros de bitácora', tags: ['Seguridad'], auth: 'BITACORA_CONSULTAR' },
  {
    method: 'get', path: '/api/bitacora/{id}', operationId: 'getBitacora', summary: 'Detalle de un registro de bitácora', tags: ['Seguridad'], auth: 'BITACORA_CONSULTAR',
    pathParams: ['id'],
  },

  // Inventario
  {
    method: 'get', path: '/api/inventario', operationId: 'listInventario', summary: 'Listar inventario', tags: ['Inventario'], auth: 'INVENTARIO_CONSULTAR',
    query: { buscar: { type: 'string' }, pagina: { type: 'integer', default: 1 }, limite: { type: 'integer', default: 20 } },
  },
  {
    method: 'get', path: '/api/inventario/alertas', operationId: 'listInventarioAlertas', summary: 'Alertas stock', tags: ['Inventario'], auth: 'INVENTARIO_CONSULTAR',
    query: { pagina: { type: 'integer', default: 1 }, limite: { type: 'integer', default: 20 } },
  },
  {
    method: 'get', path: '/api/inventario/{productoId}/movimientos', operationId: 'listMovimientos', summary: 'Movimientos por producto', tags: ['Inventario'], auth: 'INVENTARIO_CONSULTAR',
    pathParams: ['productoId'],
    query: { pagina: { type: 'integer', default: 1 }, limite: { type: 'integer', default: 50 } },
  },
  {
    method: 'patch', path: '/api/inventario/{productoId}', operationId: 'patchStockMinimo', summary: 'Actualizar stock mínimo', tags: ['Inventario'], auth: 'INVENTARIO_GESTIONAR',
    pathParams: ['productoId'],
    body: { type: 'object', required: ['stockMinimo'], properties: { stockMinimo: { type: 'number' } } },
  },
  {
    method: 'post', path: '/api/inventario/ajustes', operationId: 'createAjuste', summary: 'Ajuste inventario', tags: ['Inventario'], auth: 'INVENTARIO_GESTIONAR',
    body: {
      type: 'object',
      required: ['idProducto', 'tipo', 'cantidad', 'motivo', 'claveIdempotencia'],
      properties: {
        idProducto: { type: 'string', format: 'uuid' },
        tipo: { type: 'string', enum: ['ENTRADA', 'SALIDA'] },
        cantidad: { type: 'number' },
        motivo: { type: 'string' },
        costoUnitario: { type: 'number' },
        claveIdempotencia: { type: 'string' },
      },
    },
  },
  {
    method: 'post', path: '/api/inventario/aperturas/preview', operationId: 'previewApertura', summary: 'Preview apertura', tags: ['Inventario'], auth: 'INVENTARIO_GESTIONAR',
    body: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              codigo: { type: 'string' },
              idProducto: { type: 'string', format: 'uuid' },
              cantidad: { type: 'number' },
              precioExcel: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    method: 'post', path: '/api/inventario/aperturas/confirm', operationId: 'confirmApertura', summary: 'Confirmar apertura', tags: ['Inventario'], auth: 'INVENTARIO_GESTIONAR',
    body: {
      type: 'object',
      required: ['claveIdempotencia', 'items'],
      properties: {
        claveIdempotencia: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['idProducto', 'cantidad', 'costoUnitario'],
            properties: {
              idProducto: { type: 'string', format: 'uuid' },
              cantidad: { type: 'number' },
              costoUnitario: { type: 'number' },
            },
          },
        },
      },
    },
  },

  // Proveedores
  {
    method: 'get', path: '/api/proveedores', operationId: 'listProveedores', summary: 'Listar proveedores', tags: ['Proveedores'], auth: 'COMPRAS_GESTIONAR',
    query: {
      buscar: { type: 'string' },
      activo: { type: 'boolean' },
      pagina: { type: 'integer', default: 1 },
      limite: { type: 'integer', default: 20 },
    },
  },
  {
    method: 'post', path: '/api/proveedores', operationId: 'createProveedor', summary: 'Crear proveedor', tags: ['Proveedores'], auth: 'COMPRAS_GESTIONAR',
    body: {
      type: 'object',
      required: ['razonSocial'],
      properties: {
        razonSocial: { type: 'string' },
        documento: { type: 'string' },
        telefono: { type: 'string' },
        correo: { type: 'string', format: 'email' },
        direccion: { type: 'string' },
      },
    },
  },
  {
    method: 'get', path: '/api/proveedores/{id}', operationId: 'getProveedor', summary: 'Detalle proveedor', tags: ['Proveedores'], auth: 'COMPRAS_GESTIONAR',
    pathParams: ['id'],
  },
  {
    method: 'patch', path: '/api/proveedores/{id}', operationId: 'updateProveedor', summary: 'Actualizar proveedor', tags: ['Proveedores'], auth: 'COMPRAS_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      properties: {
        razonSocial: { type: 'string' },
        documento: { type: 'string' },
        telefono: { type: 'string' },
        correo: { type: 'string', format: 'email' },
        direccion: { type: 'string' },
        activo: { type: 'boolean' },
      },
    },
  },

  // Compras
  {
    method: 'get', path: '/api/compras', operationId: 'listCompras', summary: 'Listar compras', tags: ['Compras'], auth: 'COMPRAS_GESTIONAR',
    query: {
      estado: { type: 'string', enum: ['PENDIENTE', 'RECIBIDA', 'CANCELADA'] },
      idProveedor: { type: 'string', format: 'uuid' },
      pagina: { type: 'integer', default: 1 },
      limite: { type: 'integer', default: 20 },
    },
  },
  {
    method: 'post', path: '/api/compras', operationId: 'createCompra', summary: 'Crear compra', tags: ['Compras'], auth: 'COMPRAS_GESTIONAR',
    body: {
      type: 'object',
      required: ['idProveedor', 'detalles'],
      properties: {
        idProveedor: { type: 'string', format: 'uuid' },
        fecha: { type: 'string', format: 'date-time' },
        detalles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['idProducto', 'cantidad', 'costoUnitario'],
            properties: {
              idProducto: { type: 'string', format: 'uuid' },
              cantidad: { type: 'number' },
              costoUnitario: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    method: 'get', path: '/api/compras/{id}', operationId: 'getCompra', summary: 'Detalle compra', tags: ['Compras'], auth: 'COMPRAS_GESTIONAR',
    pathParams: ['id'],
  },
  {
    method: 'patch', path: '/api/compras/{id}', operationId: 'updateCompra', summary: 'Editar compra pendiente', tags: ['Compras'], auth: 'COMPRAS_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      required: ['idProveedor', 'detalles'],
      properties: {
        idProveedor: { type: 'string', format: 'uuid' },
        fecha: { type: 'string', format: 'date-time' },
        detalles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['idProducto', 'cantidad', 'costoUnitario'],
            properties: {
              idProducto: { type: 'string', format: 'uuid' },
              cantidad: { type: 'number' },
              costoUnitario: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    method: 'post', path: '/api/compras/{id}/recibir', operationId: 'receiveCompra', summary: 'Recibir compra', tags: ['Compras'], auth: 'COMPRAS_GESTIONAR',
    pathParams: ['id'],
    body: { type: 'object', required: ['claveIdempotencia'], properties: { claveIdempotencia: { type: 'string' } } },
  },
  {
    method: 'post', path: '/api/compras/{id}/cancelar', operationId: 'cancelCompra', summary: 'Cancelar compra', tags: ['Compras'], auth: 'COMPRAS_GESTIONAR',
    pathParams: ['id'],
  },

  // Ventas
  {
    method: 'get', path: '/api/ventas', operationId: 'listVentas', summary: 'Listar ventas', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    query: {
      estado: { type: 'string', enum: ['BORRADOR', 'CONFIRMADA', 'ANULADA'] },
      idCliente: { type: 'string', format: 'uuid' },
      pagina: { type: 'integer', default: 1 },
      limite: { type: 'integer', default: 20 },
    },
  },
  {
    method: 'post', path: '/api/ventas', operationId: 'createVenta', summary: 'Crear venta borrador', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    body: {
      type: 'object',
      required: ['idCliente', 'detalles'],
      properties: {
        idCliente: { type: 'string', format: 'uuid' },
        detalles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['idProducto', 'cantidad'],
            properties: {
              idProducto: { type: 'string', format: 'uuid' },
              cantidad: { type: 'number' },
              precioUnitario: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    method: 'get', path: '/api/ventas/{id}', operationId: 'getVenta', summary: 'Detalle venta', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
  },
  {
    method: 'patch', path: '/api/ventas/{id}', operationId: 'updateVenta', summary: 'Editar borrador', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      required: ['idCliente', 'detalles'],
      properties: {
        idCliente: { type: 'string', format: 'uuid' },
        detalles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['idProducto', 'cantidad'],
            properties: {
              idProducto: { type: 'string', format: 'uuid' },
              cantidad: { type: 'number' },
              precioUnitario: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    method: 'post', path: '/api/ventas/{id}/confirmar', operationId: 'confirmVenta', summary: 'Confirmar venta', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
    body: { type: 'object', required: ['claveIdempotencia'], properties: { claveIdempotencia: { type: 'string' } } },
  },
  {
    method: 'post', path: '/api/ventas/{id}/anular', operationId: 'anularVenta', summary: 'Anular venta', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
    body: { type: 'object', required: ['claveIdempotencia'], properties: { claveIdempotencia: { type: 'string' } } },
  },
  {
    method: 'get', path: '/api/ventas/{id}/comprobante', operationId: 'getComprobante', summary: 'Comprobante JSON/PDF', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
    query: { formato: { type: 'string', enum: ['json', 'pdf'], default: 'json' } },
  },
  {
    method: 'post', path: '/api/ventas/{id}/entrega', operationId: 'deliverVenta', summary: 'Registrar entrega', tags: ['Ventas'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
    body: { type: 'object', required: ['claveIdempotencia'], properties: { claveIdempotencia: { type: 'string' } } },
  },
  {
    method: 'get', path: '/api/ventas/{id}/pagos', operationId: 'listPagosVenta', summary: 'Listar pagos de venta', tags: ['Pagos'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
  },
  {
    method: 'post', path: '/api/ventas/{id}/pagos', operationId: 'createPago', summary: 'Registrar pago', tags: ['Pagos'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
    body: {
      type: 'object',
      required: ['monto', 'metodo'],
      properties: {
        monto: { type: 'number' },
        metodo: { type: 'string', enum: ['EFECTIVO', 'QR'] },
        referenciaExterna: { type: 'string' },
      },
    },
  },
  {
    method: 'post', path: '/api/pagos/{id}/confirmar', operationId: 'confirmPago', summary: 'Confirmar pago', tags: ['Pagos'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
    body: { type: 'object', required: ['claveIdempotencia'], properties: { claveIdempotencia: { type: 'string' } } },
  },
  {
    method: 'post', path: '/api/pagos/{id}/rechazar', operationId: 'rejectPago', summary: 'Rechazar pago', tags: ['Pagos'], auth: 'VENTAS_GESTIONAR',
    pathParams: ['id'],
  },

  // Solicitudes
  {
    method: 'get', path: '/api/solicitudes', operationId: 'listSolicitudes', summary: 'Listar solicitudes', tags: ['Solicitudes'], auth: true,
    query: {
      estado: { type: 'string', enum: ['PENDIENTE', 'ATENDIDA', 'CANCELADA'] },
      pagina: { type: 'integer', default: 1 },
      limite: { type: 'integer', default: 20 },
    },
  },
  {
    method: 'post', path: '/api/solicitudes', operationId: 'createSolicitud', summary: 'Crear solicitud', tags: ['Solicitudes'], auth: true,
    body: {
      type: 'object',
      required: ['descripcionProducto', 'cantidad'],
      properties: {
        descripcionProducto: { type: 'string' },
        cantidad: { type: 'number' },
        observaciones: { type: 'string' },
        idCliente: { type: 'string', format: 'uuid' },
        idProducto: { type: 'string', format: 'uuid' },
        idModelo: { type: 'string', format: 'uuid' },
      },
    },
  },
  {
    method: 'get', path: '/api/solicitudes/{id}', operationId: 'getSolicitud', summary: 'Detalle solicitud', tags: ['Solicitudes'], auth: true,
    pathParams: ['id'],
  },
  {
    method: 'patch', path: '/api/solicitudes/{id}/estado', operationId: 'patchSolicitudEstado', summary: 'Atender/cancelar (Admin)', tags: ['Solicitudes'], auth: true,
    pathParams: ['id'],
    body: {
      type: 'object',
      required: ['estado'],
      properties: { estado: { type: 'string', enum: ['ATENDIDA', 'CANCELADA'] } },
    },
  },

  // Reportes
  {
    method: 'get', path: '/api/reportes/ventas', operationId: 'reportVentas', summary: 'Reporte ventas', tags: ['Reportes'], auth: 'REPORTES_CONSULTAR',
    query: {
      desde: { type: 'string', example: '2026-09-01', required: true },
      hasta: { type: 'string', example: '2026-09-30', required: true },
      idUsuario: { type: 'string', format: 'uuid' },
      estado: { type: 'string', enum: ['BORRADOR', 'CONFIRMADA', 'ANULADA'] },
      formato: { type: 'string', enum: ['json', 'xlsx', 'pdf'], default: 'json' },
    },
  },
  {
    method: 'get', path: '/api/reportes/ganancias', operationId: 'reportGanancias', summary: 'Reporte ganancias', tags: ['Reportes'], auth: 'REPORTES_CONSULTAR',
    query: {
      desde: { type: 'string', example: '2026-09-01', required: true },
      hasta: { type: 'string', example: '2026-09-30', required: true },
      formato: { type: 'string', enum: ['json', 'xlsx', 'pdf'], default: 'json' },
    },
  },
  {
    method: 'get', path: '/api/reportes/inventario', operationId: 'reportInventario', summary: 'Reporte inventario', tags: ['Reportes'], auth: 'REPORTES_CONSULTAR',
    query: {
      fechaCorte: { type: 'string', example: '2026-09-25', required: true },
      formato: { type: 'string', enum: ['json', 'xlsx', 'pdf'], default: 'json' },
    },
  },
  {
    method: 'get', path: '/api/reportes/rotacion-demanda', operationId: 'reportRotacion', summary: 'Rotación y demanda', tags: ['Reportes'], auth: 'REPORTES_CONSULTAR',
    query: {
      desde: { type: 'string', example: '2026-09-01', required: true },
      hasta: { type: 'string', example: '2026-09-30', required: true },
      formato: { type: 'string', enum: ['json', 'xlsx', 'pdf'], default: 'json' },
    },
  },
];
