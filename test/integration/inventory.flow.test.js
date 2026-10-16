import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { query } from '../../src/lib/database.js';

const app = createApp();
const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;

const ensureInventoryPermissions = async () => {
  await query(`
    INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
      ('INVENTARIO_CONSULTAR', 'Consultar inventarios'),
      ('INVENTARIO_GESTIONAR', 'Gestionar inventarios')
    ON CONFLICT (codigo) DO NOTHING
  `);
  await query(`
    INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
    SELECT r.id_rol, p.id_permiso
    FROM electronica_az.rol r
    CROSS JOIN electronica_az.permiso p
    WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR')
      AND p.codigo IN ('INVENTARIO_CONSULTAR', 'INVENTARIO_GESTIONAR')
    ON CONFLICT DO NOTHING
  `);
  await query(`
    INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
    SELECT r.id_rol, p.id_permiso
    FROM electronica_az.rol r
    JOIN electronica_az.permiso p ON p.codigo = 'INVENTARIO_CONSULTAR'
    WHERE r.nombre = 'VENDEDOR'
    ON CONFLICT DO NOTHING
  `);
};

const login = async (identificador, contrasena) => {
  const response = await request(app).post('/api/auth/login').send({ identificador, contrasena });
  expect(response.status).toBe(200);
  return response.body.data.token;
};

const createCatalogProduct = async (token, label) => {
  const authorize = { Authorization: `Bearer ${token}` };
  const category = await request(app).post('/api/categorias').set(authorize).send({ nombre: `Cat Inv ${label}` });
  const brand = await request(app).post('/api/marcas').set(authorize).send({ nombre: `Marca Inv ${label}` });
  const unit = await request(app).post('/api/unidades').set(authorize).send({
    nombre: `Unidad Inv ${label}`,
    simbolo: `ui${label}`,
    permiteFraccion: false,
  });
  const unitFrac = await request(app).post('/api/unidades').set(authorize).send({
    nombre: `Unidad Frac ${label}`,
    simbolo: `uf${label}`,
    permiteFraccion: true,
  });
  const location = await request(app).post('/api/ubicaciones').set(authorize).send({
    codigo: `INV-${label}`,
    pasillo: 'I',
    estante: '1',
  });
  expect([category, brand, unit, unitFrac, location].every((r) => r.status === 201)).toBe(true);

  const product = await request(app).post('/api/productos').set(authorize).send({
    codigo: `INV-SKU-${label}`,
    nombre: `Producto Inv ${label}`,
    precioVenta: 20,
    idCategoria: category.body.data.id_categoria,
    idUnidadMedida: unit.body.data.id_unidad_medida,
    idUbicacion: location.body.data.id_ubicacion,
    idMarca: brand.body.data.id_marca,
    stockMinimo: 5,
  });
  expect(product.status).toBe(201);

  const productFrac = await request(app).post('/api/productos').set(authorize).send({
    codigo: `INV-FRAC-${label}`,
    nombre: `Producto Frac ${label}`,
    precioVenta: 10,
    idCategoria: category.body.data.id_categoria,
    idUnidadMedida: unitFrac.body.data.id_unidad_medida,
    idUbicacion: location.body.data.id_ubicacion,
    idMarca: brand.body.data.id_marca,
    stockMinimo: 1,
  });
  expect(productFrac.status).toBe(201);

  return {
    productId: product.body.data.id_producto,
    productFracId: productFrac.body.data.id_producto,
    codigo: `INV-SKU-${label}`,
  };
};

describe('inventory flow with PostgreSQL', () => {
  let adminToken;
  let vendedorToken;
  let productId;
  let productFracId;
  let codigo;

  beforeAll(async () => {
    await ensureInventoryPermissions();
    adminToken = await login(process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);

    const createdUser = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombreUsuario: `vend.inv.${suffix}`,
        correo: `vend.inv.${suffix}@example.test`,
        contrasena: 'ClaveVendedorSegura123',
        roles: ['VENDEDOR'],
      });
    expect(createdUser.status).toBe(201);
    vendedorToken = await login(`vend.inv.${suffix}@example.test`, 'ClaveVendedorSegura123');

    const catalog = await createCatalogProduct(adminToken, suffix);
    productId = catalog.productId;
    productFracId = catalog.productFracId;
    codigo = catalog.codigo;
  });

  test('Admin lists inventory with cost; Vendedor without cost; customer denied', async () => {
    const adminList = await request(app)
      .get(`/api/inventario?buscar=${encodeURIComponent(codigo)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data[0]).toMatchObject({
      idProducto: productId,
      codigo,
      stockActual: 0,
      stockMinimo: 5,
    });
    expect(adminList.body.data[0]).toHaveProperty('costoPromedio');
    expect(adminList.body.data[0].alerta).toBe('AGOTADO');

    const vendorList = await request(app)
      .get(`/api/inventario?buscar=${encodeURIComponent(codigo)}`)
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(vendorList.status).toBe(200);
    expect(vendorList.body.data[0]).not.toHaveProperty('costoPromedio');

    const customer = await request(app).post('/api/auth/registro').send({
      nombreUsuario: `cli.inv.${suffix}`,
      correo: `cli.inv.${suffix}@example.test`,
      contrasena: 'ClaveDePruebaSegura123',
      nombre: 'Cliente Inv',
    });
    expect(customer.status).toBe(201);
    const customerLogin = await login(`cli.inv.${suffix}@example.test`, 'ClaveDePruebaSegura123');
    const denied = await request(app)
      .get('/api/inventario')
      .set('Authorization', `Bearer ${customerLogin}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FB001');
  });

  test('alerts, PATCH minimo, adjustments, movements, and insufficient stock', async () => {
    const authorize = { Authorization: `Bearer ${adminToken}` };

    const alertsBefore = await request(app).get('/api/inventario/alertas?limite=100').set(authorize);
    expect(alertsBefore.status).toBe(200);
    const agotado = alertsBefore.body.data.find((row) => row.idProducto === productId);
    expect(agotado).toBeTruthy();
    expect(agotado.alerta).toBe('AGOTADO');
    expect(agotado).toHaveProperty('costoPromedio');

    const vendorAlerts = await request(app)
      .get('/api/inventario/alertas?limite=100')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(vendorAlerts.status).toBe(200);
    const vendorAlertRow = vendorAlerts.body.data.find((row) => row.idProducto === productId);
    expect(vendorAlertRow).toBeTruthy();
    expect(vendorAlertRow).not.toHaveProperty('costoPromedio');

    const patched = await request(app)
      .patch(`/api/inventario/${productId}`)
      .set(authorize)
      .send({ stockMinimo: 2 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.stockMinimo).toBe(2);
    expect(patched.body.data.stockActual).toBe(0);

    const rejectedFields = await request(app)
      .patch(`/api/inventario/${productId}`)
      .set(authorize)
      .send({ stockMinimo: 2, stockActual: 99 });
    expect(rejectedFields.status).toBe(400);
    expect(rejectedFields.body.error.code).toBe('BR001');

    const vendorPatch = await request(app)
      .patch(`/api/inventario/${productId}`)
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ stockMinimo: 1 });
    expect(vendorPatch.status).toBe(403);

    const entrada = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'ENTRADA',
      cantidad: 10,
      motivo: 'Ajuste inicial prueba',
      costoUnitario: 4,
      claveIdempotencia: `ajuste-in-${suffix}`,
    });
    expect(entrada.status).toBe(201);
    expect(entrada.body.data.existencia.stockActual).toBe(10);
    expect(entrada.body.data.existencia.costoPromedio).toBe(4);

    const bitacoraEntrada = await request(app).get('/api/bitacora').set(authorize);
    expect(bitacoraEntrada.status).toBe(200);
    const logEntrada = bitacoraEntrada.body.data.find(
      (row) => row.accion === 'INVENTARIO_AJUSTE' && row.objeto_afectado.includes(codigo),
    );
    expect(logEntrada).toBeTruthy();
    expect(logEntrada.resultado).toBe('OK');

    const bajoMinimoPatch = await request(app)
      .patch(`/api/inventario/${productId}`)
      .set(authorize)
      .send({ stockMinimo: 15 });
    expect(bajoMinimoPatch.status).toBe(200);

    const alertsBajo = await request(app).get('/api/inventario/alertas?limite=100').set(authorize);
    expect(alertsBajo.status).toBe(200);
    const bajo = alertsBajo.body.data.find((row) => row.idProducto === productId);
    expect(bajo).toBeTruthy();
    expect(bajo.alerta).toBe('BAJO_MINIMO');

    const restoreMinimo = await request(app)
      .patch(`/api/inventario/${productId}`)
      .set(authorize)
      .send({ stockMinimo: 2 });
    expect(restoreMinimo.status).toBe(200);

    const alertsOutside = await request(app).get('/api/inventario/alertas?limite=100').set(authorize);
    expect(alertsOutside.status).toBe(200);
    expect(alertsOutside.body.data.some((row) => row.idProducto === productId)).toBe(false);

    const listOutside = await request(app)
      .get(`/api/inventario?buscar=${encodeURIComponent(codigo)}`)
      .set(authorize);
    expect(listOutside.status).toBe(200);
    expect(listOutside.body.data[0].alerta).toBeNull();

    const entradaIdem = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'ENTRADA',
      cantidad: 10,
      motivo: 'Ajuste inicial prueba',
      costoUnitario: 4,
      claveIdempotencia: `ajuste-in-${suffix}`,
    });
    expect(entradaIdem.status).toBe(201);
    expect(entradaIdem.body.data.movimiento.idMovimiento).toBe(entrada.body.data.movimiento.idMovimiento);

    const bitacoraIdem = await request(app).get('/api/bitacora').set(authorize);
    const logsAjusteEntrada = bitacoraIdem.body.data.filter(
      (row) => row.accion === 'INVENTARIO_AJUSTE' && row.objeto_afectado.includes(codigo) && row.objeto_afectado.includes('ENTRADA'),
    );
    expect(logsAjusteEntrada.length).toBe(1);

    const conflict = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'ENTRADA',
      cantidad: 1,
      motivo: 'Otro cuerpo',
      costoUnitario: 4,
      claveIdempotencia: `ajuste-in-${suffix}`,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('CF001');

    const salida = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'SALIDA',
      cantidad: 3,
      motivo: 'Salida prueba',
      claveIdempotencia: `ajuste-out-${suffix}`,
    });
    expect(salida.status).toBe(201);
    expect(salida.body.data.existencia.stockActual).toBe(7);

    const movementsBeforeFail = await query(
      'SELECT count(*)::int AS total FROM electronica_az.movimiento_inventario WHERE id_producto = $1',
      [productId],
    );
    const movCountBeforeFail = movementsBeforeFail.rows[0].total;

    const insufficient = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'SALIDA',
      cantidad: 100,
      motivo: 'Demasiado',
      claveIdempotencia: `ajuste-bad-${suffix}`,
    });
    expect(insufficient.status).toBe(422);
    expect(insufficient.body.error.code).toBe('UE001');

    const isolated = await createCatalogProduct(adminToken, `fail-${suffix}`);
    const insufficientIsolated = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: isolated.productId,
      tipo: 'SALIDA',
      cantidad: 50,
      motivo: 'Salida sin stock aislado',
      claveIdempotencia: `ajuste-fail-${suffix}`,
    });
    expect(insufficientIsolated.status).toBe(422);
    expect(insufficientIsolated.body.error.code).toBe('UE001');

    const bitacoraFail = await request(app).get('/api/bitacora').set(authorize);
    const logIsolated = bitacoraFail.body.data.find(
      (row) => row.accion === 'INVENTARIO_AJUSTE' && row.objeto_afectado.includes(isolated.codigo),
    );
    expect(logIsolated).toBeUndefined();

    const stockAfterFail = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    expect(Number(stockAfterFail.rows[0].stock_actual)).toBe(7);

    const movementsAfterFail = await query(
      'SELECT count(*)::int AS total FROM electronica_az.movimiento_inventario WHERE id_producto = $1',
      [productId],
    );
    expect(movementsAfterFail.rows[0].total).toBe(movCountBeforeFail);

    const [concurrentA, concurrentB] = await Promise.all([
      request(app).post('/api/inventario/ajustes').set(authorize).send({
        idProducto: productId,
        tipo: 'SALIDA',
        cantidad: 5,
        motivo: 'Concurrente A',
        claveIdempotencia: `ajuste-conc-a-${suffix}`,
      }),
      request(app).post('/api/inventario/ajustes').set(authorize).send({
        idProducto: productId,
        tipo: 'SALIDA',
        cantidad: 5,
        motivo: 'Concurrente B',
        claveIdempotencia: `ajuste-conc-b-${suffix}`,
      }),
    ]);
    const concurrentStatuses = [concurrentA.status, concurrentB.status].sort();
    expect(concurrentStatuses).toEqual([201, 422]);
    const concurrentFail = [concurrentA, concurrentB].find((r) => r.status === 422);
    expect(concurrentFail.body.error.code).toBe('UE001');

    const stockAfterConcurrent = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    expect(Number(stockAfterConcurrent.rows[0].stock_actual)).toBe(2);
    expect(Number(stockAfterConcurrent.rows[0].stock_actual)).toBeGreaterThanOrEqual(0);

    const fractionRejected = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'ENTRADA',
      cantidad: 1.25,
      motivo: 'Fraccion invalida',
      costoUnitario: 1,
      claveIdempotencia: `ajuste-frac-${suffix}`,
    });
    expect(fractionRejected.status).toBe(400);

    const fractionOk = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productFracId,
      tipo: 'ENTRADA',
      cantidad: 1.25,
      motivo: 'Fraccion valida',
      costoUnitario: 2,
      claveIdempotencia: `ajuste-frac-ok-${suffix}`,
    });
    expect(fractionOk.status).toBe(201);

    const movements = await request(app)
      .get(`/api/inventario/${productId}/movimientos`)
      .set(authorize);
    expect(movements.status).toBe(200);
    expect(movements.body.data.length).toBeGreaterThanOrEqual(2);
    expect(movements.body.data[0].fechaHora <= movements.body.data[1].fechaHora).toBe(true);

    const missing = await request(app)
      .get('/api/inventario/00000000-0000-4000-8000-000000000000/movimientos')
      .set(authorize);
    expect(missing.status).toBe(404);
  });

  test('opening preview does not mutate; confirm is idempotent', async () => {
    const authorize = { Authorization: `Bearer ${adminToken}` };
    const before = await query(
      'SELECT stock_actual, costo_promedio FROM electronica_az.existencia WHERE id_producto = $1',
      [productFracId],
    );
    const stockBefore = Number(before.rows[0].stock_actual);

    const preview = await request(app).post('/api/inventario/aperturas/preview').set(authorize).send({
      items: [
        { codigo, cantidad: 4, precioExcel: 100 },
        { codigo: 'NO-EXISTE-XYZ', cantidad: 2, precioExcel: 10 },
        { idProducto: productFracId, cantidad: 0, precioExcel: 20 },
        { codigo: `INV-FRAC-${suffix}`, cantidad: 2, precioExcel: 0 },
      ],
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.ok.some((item) => item.codigo === codigo && item.costoUnitario === 65)).toBe(true);
    expect(preview.body.data.pendientes.length).toBeGreaterThanOrEqual(2);

    const afterPreview = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productFracId],
    );
    expect(Number(afterPreview.rows[0].stock_actual)).toBe(stockBefore);

    const okItems = preview.body.data.ok
      .filter((item) => item.cantidad > 0 && item.idProducto === productId)
      .map((item) => ({
        idProducto: item.idProducto,
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario,
      }));

    // Use a dedicated zero-stock product path: create opening on product that still has stock from adjustments.
    // Confirm only OK lines for productId with qty 4.
    const confirmBody = {
      claveIdempotencia: `apertura-${suffix}`,
      items: okItems.length
        ? okItems
        : [{ idProducto: productId, cantidad: 4, costoUnitario: 65 }],
    };

    const stockBeforeConfirm = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    const baseStock = Number(stockBeforeConfirm.rows[0].stock_actual);

    const confirm = await request(app)
      .post('/api/inventario/aperturas/confirm')
      .set(authorize)
      .send(confirmBody);
    expect(confirm.status).toBe(201);
    expect(confirm.body.data.abiertos.length).toBe(1);
    expect(confirm.body.data.abiertos[0].cantidad).toBe(4);

    const stockAfterConfirm = await query(
      'SELECT stock_actual, costo_promedio FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    expect(Number(stockAfterConfirm.rows[0].stock_actual)).toBe(baseStock + 4);

    const opened = confirm.body.data.abiertos[0];
    const pairedMovement = await query(
      `SELECT id_movimiento, cantidad, tipo
       FROM electronica_az.movimiento_inventario
       WHERE id_movimiento = $1 AND id_producto = $2`,
      [opened.idMovimiento, productId],
    );
    expect(pairedMovement.rows).toHaveLength(1);
    expect(Number(pairedMovement.rows[0].cantidad)).toBe(4);
    expect(pairedMovement.rows[0].tipo).toBe('ENTRADA');

    const zeroQtyConfirm = await request(app)
      .post('/api/inventario/aperturas/confirm')
      .set(authorize)
      .send({
        claveIdempotencia: `apertura-zero-${suffix}`,
        items: [{ idProducto: productFracId, cantidad: 0, costoUnitario: 13 }],
      });
    expect(zeroQtyConfirm.status).toBe(201);
    expect(zeroQtyConfirm.body.data.abiertos).toHaveLength(0);
    expect(zeroQtyConfirm.body.data.omitidos.some(
      (item) => item.idProducto === productFracId && item.reason === 'ZERO_QUANTITY',
    )).toBe(true);

    const zeroMovements = await query(
      `SELECT count(*)::int AS total
       FROM electronica_az.movimiento_inventario
       WHERE id_producto = $1 AND cantidad = 0`,
      [productFracId],
    );
    expect(zeroMovements.rows[0].total).toBe(0);

    const confirmAgain = await request(app)
      .post('/api/inventario/aperturas/confirm')
      .set(authorize)
      .send(confirmBody);
    expect(confirmAgain.status).toBe(201);
    expect(confirmAgain.body.data.abiertos[0].idMovimiento)
      .toBe(confirm.body.data.abiertos[0].idMovimiento);

    const stockAfterIdem = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    expect(Number(stockAfterIdem.rows[0].stock_actual)).toBe(baseStock + 4);

    const confirmConflict = await request(app)
      .post('/api/inventario/aperturas/confirm')
      .set(authorize)
      .send({
        claveIdempotencia: `apertura-${suffix}`,
        items: [{ idProducto: productId, cantidad: 1, costoUnitario: 1 }],
      });
    expect(confirmConflict.status).toBe(409);

    const vendorPreview = await request(app)
      .post('/api/inventario/aperturas/preview')
      .set('Authorization', `Bearer ${vendedorToken}`)
      .send({ items: [{ codigo, cantidad: 1, precioExcel: 10 }] });
    expect(vendorPreview.status).toBe(403);
  });
});
