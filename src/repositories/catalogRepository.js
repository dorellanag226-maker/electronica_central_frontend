import { query, withTransaction } from '../lib/database.js';

export const listCategories = async () => (
  await query(`
    SELECT c.id_categoria, c.nombre, c.descripcion, c.id_categoria_padre, c.activo,
           (SELECT COUNT(*)::int FROM electronica_az.producto p
             WHERE p.id_categoria = c.id_categoria) AS total_productos
    FROM electronica_az.categoria c
    ORDER BY c.nombre
  `)
).rows;

export const categoryById = async (idCategoria) => (
  await query(`
    SELECT id_categoria, nombre, descripcion, id_categoria_padre, activo
    FROM electronica_az.categoria WHERE id_categoria = $1
  `, [idCategoria])
).rows[0];

export const createCategory = (nombre, descripcion, idCategoriaPadre, activo) => query(
  `INSERT INTO electronica_az.categoria(nombre, descripcion, id_categoria_padre, activo)
   VALUES($1, $2, $3, $4)
   RETURNING id_categoria, nombre, descripcion, id_categoria_padre, activo`,
  [nombre, descripcion, idCategoriaPadre ?? null, activo],
);

export const updateCategory = (idCategoria, nombre, descripcion, idCategoriaPadre, activo) => query(
  `UPDATE electronica_az.categoria
   SET nombre = $2, descripcion = $3, id_categoria_padre = $4, activo = COALESCE($5, activo)
   WHERE id_categoria = $1
   RETURNING id_categoria, nombre, descripcion, id_categoria_padre, activo`,
  [idCategoria, nombre, descripcion, idCategoriaPadre ?? null, activo ?? null],
);

export const setCategoryActive = (idCategoria, activo) => query(
  `UPDATE electronica_az.categoria SET activo = $2 WHERE id_categoria = $1
   RETURNING id_categoria, nombre, descripcion, id_categoria_padre, activo`,
  [idCategoria, activo],
);

export const createBrand = (nombre) => query(
  'INSERT INTO electronica_az.marca(nombre) VALUES($1) RETURNING *',
  [nombre],
);

export const listBrands = async () => (
  await query(`
    SELECT m.id_marca, m.nombre,
           (SELECT COUNT(*)::int FROM electronica_az.modelo mo WHERE mo.id_marca = m.id_marca) AS total_modelos,
           (SELECT COUNT(*)::int FROM electronica_az.producto p WHERE p.id_marca = m.id_marca) AS total_productos
    FROM electronica_az.marca m
    ORDER BY m.nombre
  `)
).rows;

export const updateBrand = (idMarca, nombre) => query(
  'UPDATE electronica_az.marca SET nombre = $2 WHERE id_marca = $1 RETURNING *',
  [idMarca, nombre],
);

const unitColumns = 'id_unidad_medida, nombre, simbolo, permite_fraccion, activo';

export const listUnits = async () => (
  await query(`
    SELECT u.id_unidad_medida, u.nombre, u.simbolo, u.permite_fraccion, u.activo,
           (SELECT COUNT(*)::int FROM electronica_az.producto p
             WHERE p.id_unidad_medida = u.id_unidad_medida) AS total_productos
    FROM electronica_az.unidad_medida u
    ORDER BY u.nombre
  `)
).rows;

export const unitById = async (idUnidad) => (
  await query(`SELECT ${unitColumns} FROM electronica_az.unidad_medida WHERE id_unidad_medida = $1`, [idUnidad])
).rows[0];

export const createUnit = (nombre, simbolo, permiteFraccion, activo) => query(
  `INSERT INTO electronica_az.unidad_medida(nombre, simbolo, permite_fraccion, activo)
   VALUES($1, $2, $3, $4) RETURNING ${unitColumns}`,
  [nombre, simbolo, permiteFraccion, activo],
);

export const updateUnit = (idUnidad, nombre, simbolo, activo, permiteFraccion) => query(
  `UPDATE electronica_az.unidad_medida
   SET nombre = $2, simbolo = $3, activo = COALESCE($4, activo),
       permite_fraccion = COALESCE($5, permite_fraccion)
   WHERE id_unidad_medida = $1 RETURNING ${unitColumns}`,
  [idUnidad, nombre, simbolo, activo ?? null, permiteFraccion ?? null],
);

export const setUnitActive = (idUnidad, activo) => query(
  `UPDATE electronica_az.unidad_medida SET activo = $2
   WHERE id_unidad_medida = $1 RETURNING ${unitColumns}`,
  [idUnidad, activo],
);

export const createLocation = (codigo, pasillo, estante) => query(
  `INSERT INTO electronica_az.ubicacion(codigo, pasillo, estante)
   VALUES($1, $2, $3) RETURNING *`,
  [codigo, pasillo, estante],
);

// Ubicacion que se asigna a los productos creados sin indicar una; la crea el propio sistema.
export const DEFAULT_LOCATION_CODE = 'SIN-UBICACION';

export const listLocations = async () => (
  await query(`
    SELECT u.id_ubicacion, u.codigo, u.pasillo, u.estante,
           (lower(btrim(u.codigo)) = lower($1)) AS es_predeterminada,
           (SELECT COUNT(*)::int FROM electronica_az.producto p
             WHERE p.id_ubicacion = u.id_ubicacion) AS total_productos
    FROM electronica_az.ubicacion u
    ORDER BY u.codigo
  `, [DEFAULT_LOCATION_CODE])
).rows;

export const locationById = async (idUbicacion) => (
  await query(
    `SELECT id_ubicacion, codigo, pasillo, estante,
            (lower(btrim(codigo)) = lower($2)) AS es_predeterminada
     FROM electronica_az.ubicacion WHERE id_ubicacion = $1`,
    [idUbicacion, DEFAULT_LOCATION_CODE],
  )
).rows[0];

export const updateLocation = (idUbicacion, codigo, pasillo, estante) => query(
  `UPDATE electronica_az.ubicacion
   SET codigo = COALESCE($2, codigo), pasillo = COALESCE($3, pasillo), estante = COALESCE($4, estante)
   WHERE id_ubicacion = $1 RETURNING *`,
  [idUbicacion, codigo ?? null, pasillo ?? null, estante ?? null],
);

// Asigna la ubicacion a varios productos; devuelve los ids que no existen (si hay, no cambia nada).
export const assignLocationToProducts = (idUbicacion, idProductos) => withTransaction(async (client) => {
  const found = await client.query(
    'SELECT id_producto FROM electronica_az.producto WHERE id_producto = ANY($1::uuid[]) FOR UPDATE',
    [idProductos],
  );
  const existing = new Set(found.rows.map((row) => row.id_producto));
  const missing = idProductos.filter((id) => !existing.has(id));
  if (missing.length > 0) return { missing, actualizados: 0 };

  const updated = await client.query(
    'UPDATE electronica_az.producto SET id_ubicacion = $1 WHERE id_producto = ANY($2::uuid[])',
    [idUbicacion, idProductos],
  );
  return { missing: [], actualizados: updated.rowCount };
});

export const createModel = (nombre, descripcion, idMarca) => query(
  `INSERT INTO electronica_az.modelo(nombre, descripcion, id_marca)
   VALUES($1, $2, $3) RETURNING *`,
  [nombre, descripcion, idMarca],
);

export const listModels = async (idMarca) => (
  await query(`
    SELECT mo.id_modelo, mo.nombre, mo.descripcion, mo.id_marca, m.nombre AS marca,
           (SELECT COUNT(*)::int FROM electronica_az.producto p WHERE p.id_modelo = mo.id_modelo) AS total_productos,
           (SELECT COUNT(*)::int FROM electronica_az.compatibilidad c WHERE c.id_modelo = mo.id_modelo)
             AS total_compatibilidades
    FROM electronica_az.modelo mo
    JOIN electronica_az.marca m ON m.id_marca = mo.id_marca
    WHERE ($1::uuid IS NULL OR mo.id_marca = $1)
    ORDER BY m.nombre, mo.nombre
  `, [idMarca ?? null])
).rows;

export const modelById = async (idModelo) => (
  await query(
    `SELECT mo.id_modelo, mo.nombre, mo.descripcion, mo.id_marca,
            (SELECT COUNT(*)::int FROM electronica_az.producto p WHERE p.id_modelo = mo.id_modelo) AS total_productos
     FROM electronica_az.modelo mo WHERE mo.id_modelo = $1`,
    [idModelo],
  )
).rows[0];

export const updateModel = (idModelo, nombre, descripcion, idMarca) => query(
  `UPDATE electronica_az.modelo
   SET nombre = COALESCE($2, nombre), descripcion = COALESCE($3, descripcion), id_marca = COALESCE($4, id_marca)
   WHERE id_modelo = $1 RETURNING *`,
  [idModelo, nombre ?? null, descripcion ?? null, idMarca ?? null],
);

export const getCatalogFilters = async () => {
  const result = await query(`
    SELECT 'CATEGORIA' AS tipo, c.id_categoria AS id, c.nombre
    FROM electronica_az.categoria c
    WHERE EXISTS (SELECT 1 FROM electronica_az.producto p WHERE p.activo AND p.id_categoria = c.id_categoria)
    UNION ALL
    SELECT 'MARCA' AS tipo, m.id_marca AS id, m.nombre
    FROM electronica_az.marca m
    WHERE EXISTS (SELECT 1 FROM electronica_az.producto p WHERE p.activo AND p.id_marca = m.id_marca)
    UNION ALL
    SELECT 'MODELO' AS tipo, mo.id_modelo AS id, mo.nombre
    FROM electronica_az.modelo mo
    WHERE EXISTS (SELECT 1 FROM electronica_az.producto p WHERE p.activo AND p.id_modelo = mo.id_modelo)
    ORDER BY tipo, nombre
  `);
  return result.rows;
};

const adminProductSelect = `
  SELECT p.id_producto, p.codigo, p.nombre, p.descripcion, p.precio_venta::float8 AS precio_venta,
    p.activo, p.id_categoria, p.id_unidad_medida,
    m.nombre AS marca, mo.nombre AS modelo,
    p.id_ubicacion, u.codigo AS ubicacion_codigo, u.pasillo, u.estante
  FROM electronica_az.producto p
  LEFT JOIN electronica_az.marca m ON m.id_marca = p.id_marca
  LEFT JOIN electronica_az.modelo mo ON mo.id_modelo = p.id_modelo
  LEFT JOIN electronica_az.ubicacion u ON u.id_ubicacion = p.id_ubicacion
`;

export const listAdminProducts = async () => (
  await query(`${adminProductSelect} ORDER BY p.nombre, p.codigo`)
).rows;

export const adminProductById = async (idProducto, client = { query }) => (
  await client.query(`${adminProductSelect} WHERE p.id_producto = $1`, [idProducto])
).rows[0];

const domainError = (code, details = {}) => Object.assign(new Error(code), { code, details });

const findOrCreateBrand = async (client, nombre) => {
  const found = (await client.query(
    'SELECT id_marca FROM electronica_az.marca WHERE lower(btrim(nombre)) = lower(btrim($1))',
    [nombre],
  )).rows[0];
  if (found) return found.id_marca;
  return (await client.query(
    'INSERT INTO electronica_az.marca(nombre) VALUES($1) RETURNING id_marca',
    [nombre],
  )).rows[0].id_marca;
};

const findOrCreateModel = async (client, nombre, idMarca) => {
  const found = (await client.query(
    `SELECT id_modelo FROM electronica_az.modelo
     WHERE id_marca = $1 AND lower(btrim(nombre)) = lower(btrim($2))`,
    [idMarca, nombre],
  )).rows[0];
  if (found) return found.id_modelo;
  return (await client.query(
    'INSERT INTO electronica_az.modelo(nombre, id_marca) VALUES($1, $2) RETURNING id_modelo',
    [nombre, idMarca],
  )).rows[0].id_modelo;
};

// Resuelve marca y modelo a partir de ids o de texto libre (el panel escribe el nombre).
const resolveBrandAndModel = async (client, { idMarca, idModelo, marca, modelo }) => {
  let brandId = idMarca ?? null;
  if (!brandId && marca) brandId = await findOrCreateBrand(client, marca);

  let modelId = idModelo ?? null;
  if (modelId) {
    const model = (await client.query(
      'SELECT id_marca FROM electronica_az.modelo WHERE id_modelo = $1',
      [modelId],
    )).rows[0];
    if (!model || model.id_marca !== brandId) {
      throw domainError('MODEL_BRAND_MISMATCH', {
        idModelo: modelId,
        idMarcaEnviado: brandId,
        idMarcaDelModelo: model?.id_marca ?? null,
        hint: 'El idModelo debe pertenecer a idMarca, o omite idModelo. Crea el modelo con POST /api/modelos usando la misma marca.',
      });
    }
  } else if (modelo) {
    if (!brandId) throw domainError('MODEL_WITHOUT_BRAND');
    modelId = await findOrCreateModel(client, modelo, brandId);
  }
  return { brandId, modelId };
};

const defaultLocation = async (client) => {
  const found = (await client.query(
    'SELECT id_ubicacion FROM electronica_az.ubicacion WHERE lower(btrim(codigo)) = lower($1)',
    [DEFAULT_LOCATION_CODE],
  )).rows[0];
  if (found) return found.id_ubicacion;
  return (await client.query(
    `INSERT INTO electronica_az.ubicacion(codigo, pasillo, estante)
     VALUES ($1, 'N/A', 'N/A') RETURNING id_ubicacion`,
    [DEFAULT_LOCATION_CODE],
  )).rows[0].id_ubicacion;
};

const nextProductCode = async (client) => {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(substring(codigo FROM '^PRD-([0-9]+)$')::int), 0) + 1 AS siguiente
     FROM electronica_az.producto`,
  );
  return `PRD-${String(rows[0].siguiente).padStart(5, '0')}`;
};

const assertNotDuplicated = async (client, nombre, idMarca, exceptId) => {
  const duplicated = await client.query(
    `SELECT 1 FROM electronica_az.producto
     WHERE lower(btrim(nombre)) = lower(btrim($1))
       AND id_marca IS NOT DISTINCT FROM $2::uuid
       AND ($3::uuid IS NULL OR id_producto <> $3)`,
    [nombre, idMarca, exceptId ?? null],
  );
  if (duplicated.rowCount > 0) throw domainError('PRODUCT_DUPLICATED');
};

export const createProduct = (data) => withTransaction(async (client) => {
  const { brandId, modelId } = await resolveBrandAndModel(client, data);
  await assertNotDuplicated(client, data.nombre, brandId);

  const product = await client.query(`
    INSERT INTO electronica_az.producto(
      codigo, nombre, descripcion, precio_venta, activo, id_categoria,
      id_unidad_medida, id_ubicacion, id_marca, id_modelo
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id_producto
  `, [
    data.codigo ?? await nextProductCode(client), data.nombre, data.descripcion, data.precioVenta,
    data.activo, data.idCategoria, data.idUnidadMedida,
    data.idUbicacion ?? await defaultLocation(client), brandId, modelId,
  ]);

  await client.query(
    'INSERT INTO electronica_az.existencia(id_producto, stock_minimo) VALUES($1, $2)',
    [product.rows[0].id_producto, data.stockMinimo],
  );
  return adminProductById(product.rows[0].id_producto, client);
});

export const updateProduct = (idProducto, changes) => withTransaction(async (client) => {
  const current = (await client.query(
    'SELECT * FROM electronica_az.producto WHERE id_producto = $1 FOR UPDATE',
    [idProducto],
  )).rows[0];
  if (!current) return null;

  // `marca`/`modelo` en texto reemplazan a los actuales; una cadena vacia los quita.
  let brandId = current.id_marca;
  let modelId = current.id_modelo;
  if (changes.marca !== undefined || changes.idMarca !== undefined) {
    if (changes.marca === '' || changes.idMarca === null) {
      brandId = null;
      modelId = null;
    } else {
      ({ brandId } = await resolveBrandAndModel(client, { idMarca: changes.idMarca, marca: changes.marca }));
      if (brandId !== current.id_marca) modelId = null; // el modelo anterior era de otra marca
    }
  }
  if (changes.modelo !== undefined) {
    if (changes.modelo === '') modelId = null;
    else ({ modelId } = await resolveBrandAndModel(client, { idMarca: brandId, modelo: changes.modelo }));
  }

  const nombre = changes.nombre ?? current.nombre;
  await assertNotDuplicated(client, nombre, brandId, idProducto);

  await client.query(`
    UPDATE electronica_az.producto
    SET nombre = $2, descripcion = $3, precio_venta = $4, activo = $5, id_categoria = $6,
        id_unidad_medida = $7, id_marca = $8, id_modelo = $9, id_ubicacion = $10
    WHERE id_producto = $1
  `, [
    idProducto, nombre, changes.descripcion ?? current.descripcion,
    changes.precioVenta ?? current.precio_venta, changes.activo ?? current.activo,
    changes.idCategoria ?? current.id_categoria, changes.idUnidadMedida ?? current.id_unidad_medida,
    brandId, modelId, changes.idUbicacion ?? current.id_ubicacion,
  ]);
  return adminProductById(idProducto, client);
});

export const createCompatibility = (idProducto, idModelo, observaciones) => query(
  `INSERT INTO electronica_az.compatibilidad(id_producto, id_modelo, observaciones)
   VALUES($1, $2, $3) RETURNING *`,
  [idProducto, idModelo, observaciones],
);

export const deleteCompatibility = (idProducto, idModelo) => query(
  `DELETE FROM electronica_az.compatibilidad
   WHERE id_producto = $1 AND id_modelo = $2 RETURNING *`,
  [idProducto, idModelo],
);

export const getPublicProducts = async (buscar, idCategoria, idMarca, idModelo, limite, desplazamiento) => {
  const result = await query(`
    SELECT p.id_producto, p.codigo, p.nombre, p.descripcion, p.precio_venta,
      c.nombre AS categoria, m.nombre AS marca, mo.nombre AS modelo,
      CASE WHEN e.stock_actual > 0 THEN 'DISPONIBLE' ELSE 'NO_DISPONIBLE' END AS disponibilidad,
      count(*) OVER() AS total
    FROM electronica_az.producto p
    JOIN electronica_az.categoria c ON c.id_categoria = p.id_categoria
    LEFT JOIN electronica_az.marca m ON m.id_marca = p.id_marca
    LEFT JOIN electronica_az.modelo mo ON mo.id_modelo = p.id_modelo
    JOIN electronica_az.existencia e ON e.id_producto = p.id_producto
    WHERE p.activo
      AND ($1::text IS NULL OR p.codigo ILIKE '%' || $1 || '%' OR p.nombre ILIKE '%' || $1 || '%')
      AND ($2::uuid IS NULL OR p.id_categoria = $2)
      AND ($3::uuid IS NULL OR p.id_marca = $3)
      AND ($4::uuid IS NULL OR p.id_modelo = $4)
    ORDER BY p.nombre, p.codigo
    LIMIT $5 OFFSET $6
  `, [buscar, idCategoria, idMarca, idModelo, limite, desplazamiento]);
  return result.rows;
};

// Detalle del CU-10: ademas de la disponibilidad, la ubicacion fisica (null si el producto sigue
// en SIN-UBICACION) y los modelos compatibles registrados en el CU-9.
export const getPublicProductById = async (idProducto) => {
  const result = await query(`
    SELECT p.id_producto, p.codigo, p.nombre, p.descripcion, p.precio_venta,
      c.nombre AS categoria, m.nombre AS marca, mo.nombre AS modelo,
      CASE WHEN e.stock_actual > 0 THEN 'DISPONIBLE' ELSE 'NO_DISPONIBLE' END AS disponibilidad,
      CASE WHEN u.id_ubicacion IS NULL OR lower(btrim(u.codigo)) = lower($2) THEN NULL
           ELSE json_build_object('codigo', u.codigo, 'pasillo', u.pasillo, 'estante', u.estante)
      END AS ubicacion,
      COALESCE((
        SELECT json_agg(json_build_object(
                 'idModelo', cm.id_modelo, 'modelo', cm.nombre, 'marca', cb.nombre,
                 'observaciones', co.observaciones
               ) ORDER BY cb.nombre, cm.nombre)
        FROM electronica_az.compatibilidad co
        JOIN electronica_az.modelo cm ON cm.id_modelo = co.id_modelo
        JOIN electronica_az.marca cb ON cb.id_marca = cm.id_marca
        WHERE co.id_producto = p.id_producto
      ), '[]'::json) AS compatibles
    FROM electronica_az.producto p
    JOIN electronica_az.categoria c ON c.id_categoria = p.id_categoria
    LEFT JOIN electronica_az.marca m ON m.id_marca = p.id_marca
    LEFT JOIN electronica_az.modelo mo ON mo.id_modelo = p.id_modelo
    LEFT JOIN electronica_az.ubicacion u ON u.id_ubicacion = p.id_ubicacion
    JOIN electronica_az.existencia e ON e.id_producto = p.id_producto
    WHERE p.activo AND p.id_producto = $1
  `, [idProducto, DEFAULT_LOCATION_CODE]);
  return result.rows;
};
