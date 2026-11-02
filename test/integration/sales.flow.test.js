import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { query } from '../../src/lib/database.js';

const app = createApp();
const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;

const ensureSalesPermission = async () => {
  await query(`
    INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
      ('VENTAS_GESTIONAR', 'Gestionar ventas')
    ON CONFLICT (codigo) DO NOTHING
  `);
  await query(`
    INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
    SELECT r.id_rol, p.id_permiso
    FROM electronica_az.rol r
    CROSS JOIN electronica_az.permiso p
    WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR', 'VENDEDOR')
      AND p.codigo = 'VENTAS_GESTIONAR'
    ON CONFLICT DO NOTHING
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_detalle_venta_producto
      ON electronica_az.detalle_venta (id_venta, id_producto)
  `);
};

const login = async (identificador, contrasena) => {
  const response = await request(app).post('/api/auth/login').send({ identificador, contrasena });
  expect(response.status).toBe(200);
  return response.body.data.token;
};

const seedProductWithStock = async (token, label, stock) => {
  const authorize = { Authorization: `Bearer ${token}` };
  const category = await request(app).post('/api/categorias').set(authorize).send({ nombre: `Cat Sale ${label}` });
  const brand = await request(app).post('/api/marcas').set(authorize).send({ nombre: `Marca Sale ${label}` });
  const unit = await request(app).post('/api/unidades').set(authorize).send({
    nombre: `Unidad Sale ${label}`,
    simbolo: `us${label}`,
    permiteFraccion: false,
  });
  const location = await request(app).post('/api/ubicaciones').set(authorize).send({
    codigo: `SALE-${label}`,
    pasillo: 'S',
    estante: '1',
  });
  const product = await request(app).post('/api/productos').set(authorize).send({
    codigo: `SALE-SKU-${label}`,
    nombre: `Producto Sale ${label}`,
    precioVenta: 10,
    idCategoria: category.body.data.id_categoria,
    idUnidadMedida: unit.body.data.id_unidad_medida,
    idUbicacion: location.body.data.id_ubicacion,
    idMarca: brand.body.data.id_marca,
    stockMinimo: 0,
  });
  expect(product.status).toBe(201);
  const productId = product.body.data.id_producto;

  if (stock > 0) {
    const ajuste = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'ENTRADA',
      cantidad: stock,
      motivo: 'Stock para venta',
      costoUnitario: 4,
      claveIdempotencia: `sale-stock-${label}`,
    });
    expect(ajuste.status).toBe(201);
  }
  return productId;
};

// CU-16 antes de CU-15: el pago se registra y confirma con la venta en BORRADOR.
const payAndConfirm = async (authorize, idVenta, monto, key, extra = {}) => {
  const pay = await request(app).post(`/api/ventas/${idVenta}/pagos`).set(authorize).send({
    monto,
    metodo: 'EFECTIVO',
    ...extra,
  });
  expect(pay.status).toBe(201);
  const confirmed = await request(app)
    .post(`/api/pagos/${pay.body.data.idPago}/confirmar`)
    .set(authorize)
    .send({ claveIdempotencia: key });
  expect(confirmed.status).toBe(200);
  return pay.body.data;
};

describe('sales flow with PostgreSQL', () => {
  let adminToken;
  let vendedorToken;
  let otherVendorToken;
  let clientId;
  let productId;
  let saleId;

  beforeAll(async () => {
    await ensureSalesPermission();
    adminToken = await login(process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);

    const vendor = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${adminToken}`).send({
      nombreUsuario: `vend.sale.${suffix}`,
      correo: `vend.sale.${suffix}@example.test`,
      contrasena: 'ClaveVendedorSegura123',
      roles: ['VENDEDOR'],
    });
    expect(vendor.status).toBe(201);
    vendedorToken = await login(`vend.sale.${suffix}@example.test`, 'ClaveVendedorSegura123');

    const other = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${adminToken}`).send({
      nombreUsuario: `vend2.sale.${suffix}`,
      correo: `vend2.sale.${suffix}@example.test`,
      contrasena: 'ClaveVendedorSegura123',
      roles: ['VENDEDOR'],
    });
    expect(other.status).toBe(201);
    otherVendorToken = await login(`vend2.sale.${suffix}@example.test`, 'ClaveVendedorSegura123');

    const client = await request(app).post('/api/clientes').set('Authorization', `Bearer ${adminToken}`).send({
      nombre: `Cliente Sale ${suffix}`,
      documento: `CLI-SALE-${suffix}`,
      telefono: '71111111',
    });
    expect(client.status).toBe(201);
    clientId = client.body.data.id_cliente;

    productId = await seedProductWithStock(adminToken, suffix, 10);
  });

  test('customer denied; confirm requires full payment; confirm creates comprobante', async () => {
    const customer = await request(app).post('/api/auth/registro').send({
      nombreUsuario: `cli.sale.${suffix}`,
      correo: `cli.sale.${suffix}@example.test`,
      contrasena: 'ClaveDePruebaSegura123',
      nombre: 'Cliente Auth',
    });
    expect(customer.status).toBe(201);
    const customerToken = await login(`cli.sale.${suffix}@example.test`, 'ClaveDePruebaSegura123');
    const denied = await request(app)
      .get('/api/ventas')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(denied.status).toBe(403);

    const authorize = { Authorization: `Bearer ${vendedorToken}` };
    const stockBefore = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    const base = Number(stockBefore.rows[0].stock_actual);

    const draft = await request(app).post('/api/ventas').set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: productId, cantidad: 2, precioUnitario: 10 }],
    });
    expect(draft.status).toBe(201);
    expect(draft.body.data.estado).toBe('BORRADOR');
    expect(draft.body.data.total).toBe(20);
    expect(draft.body.data.detalles[0]).not.toHaveProperty('costoUnitarioHistorico');
    saleId = draft.body.data.idVenta;

    const unpaid = await request(app)
      .post(`/api/ventas/${saleId}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `conf-unpaid-${suffix}` });
    expect(unpaid.status).toBe(422);
    expect(unpaid.body.error.details.reason).toBe('SALE_BALANCE_NOT_ZERO');

    const pay = await request(app).post(`/api/ventas/${saleId}/pagos`).set(authorize).send({
      monto: 5.2,
      metodo: 'EFECTIVO',
    });
    expect(pay.status).toBe(201);
    expect(pay.body.data.monto).toBe(5.5);
    expect(pay.body.data.estado).toBe('PENDIENTE');

    const editWithPayment = await request(app).patch(`/api/ventas/${saleId}`).set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: productId, cantidad: 3, precioUnitario: 10 }],
    });
    expect(editWithPayment.status).toBe(422);
    expect(editWithPayment.body.error.details.reason).toBe('SALE_HAS_PAYMENTS');

    const confirmPay = await request(app)
      .post(`/api/pagos/${pay.body.data.idPago}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `pay-${suffix}` });
    expect(confirmPay.status).toBe(200);

    const partial = await request(app)
      .post(`/api/ventas/${saleId}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `conf-partial-${suffix}` });
    expect(partial.status).toBe(422);
    expect(partial.body.error.details.saldo).toBe(14.5);

    await payAndConfirm(authorize, saleId, 14.5, `pay2-${suffix}`, {
      metodo: 'QR',
      referenciaExterna: `QR-${suffix}`,
    });

    const stockDraft = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    expect(Number(stockDraft.rows[0].stock_actual)).toBe(base);

    const confirm = await request(app)
      .post(`/api/ventas/${saleId}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `conf-${suffix}` });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.estado).toBe('CONFIRMADA');
    expect(confirm.body.data.saldo).toBe(0);
    expect(confirm.body.data.comprobante.numero).toMatch(/^V-\d{8}-\d{4}$/);

    const confirmAgain = await request(app)
      .post(`/api/ventas/${saleId}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `conf-${suffix}` });
    expect(confirmAgain.status).toBe(200);

    const stockAfter = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    expect(Number(stockAfter.rows[0].stock_actual)).toBe(base - 2);

    const movement = await query(
      `SELECT tipo, id_detalle_venta FROM electronica_az.movimiento_inventario
       WHERE id_producto = $1 AND motivo = 'VENTA_CONFIRMAR'
       ORDER BY fecha_hora DESC LIMIT 1`,
      [productId],
    );
    expect(movement.rows[0].tipo).toBe('SALIDA');
    expect(movement.rows[0].id_detalle_venta).toBeTruthy();
  });

  test('final payment settles a total that is not a multiple of 0.50', async () => {
    const authorize = { Authorization: `Bearer ${vendedorToken}` };
    const product = await seedProductWithStock(adminToken, `${suffix}c`, 5);
    const draft = await request(app).post('/api/ventas').set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: product, cantidad: 1, precioUnitario: 10.3 }],
    });
    expect(draft.status).toBe(201);

    const paid = await payAndConfirm(authorize, draft.body.data.idVenta, 10.3, `pay-exact-${suffix}`);
    expect(paid.monto).toBe(10.3);

    const confirm = await request(app)
      .post(`/api/ventas/${draft.body.data.idVenta}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `conf-exact-${suffix}` });
    expect(confirm.status).toBe(200);
  });

  test('delivery after full payment; anular needs reason, ownership, returns stock and payments', async () => {
    const authorize = { Authorization: `Bearer ${vendedorToken}` };

    const deliver = await request(app)
      .post(`/api/ventas/${saleId}/entrega`)
      .set(authorize)
      .send({ claveIdempotencia: `ent-${suffix}` });
    expect(deliver.status).toBe(201);

    const productB = await seedProductWithStock(adminToken, `${suffix}b`, 5);
    const otherAuth = { Authorization: `Bearer ${otherVendorToken}` };
    const otherSale = await request(app).post('/api/ventas').set(otherAuth).send({
      idCliente: clientId,
      detalles: [{ idProducto: productB, cantidad: 1, precioUnitario: 8 }],
    });
    expect(otherSale.status).toBe(201);
    const otherId = otherSale.body.data.idVenta;
    await payAndConfirm(otherAuth, otherId, 8, `pay-other-${suffix}`);
    const otherConfirm = await request(app)
      .post(`/api/ventas/${otherId}/confirmar`)
      .set(otherAuth)
      .send({ claveIdempotencia: `conf-other-${suffix}` });
    expect(otherConfirm.status).toBe(200);

    const sinMotivo = await request(app)
      .post(`/api/ventas/${otherId}/anular`)
      .set(otherAuth)
      .send({ claveIdempotencia: `anul-sin-${suffix}` });
    expect(sinMotivo.status).toBe(400);

    const anularAjena = await request(app)
      .post(`/api/ventas/${otherId}/anular`)
      .set(authorize)
      .send({ claveIdempotencia: `anul-ajena-${suffix}`, observacion: 'Producto equivocado' });
    expect(anularAjena.status).toBe(403);

    const stockBeforeAnul = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productB],
    );
    const anularOwn = await request(app)
      .post(`/api/ventas/${otherId}/anular`)
      .set(otherAuth)
      .send({ claveIdempotencia: `anul-own-${suffix}`, observacion: 'Se registro el producto equivocado' });
    expect(anularOwn.status).toBe(200);
    expect(anularOwn.body.data.estado).toBe('ANULADA');
    expect(anularOwn.body.data.observacionAnulacion).toBe('Se registro el producto equivocado');
    expect(anularOwn.body.data.pagos.map((p) => p.estado)).toEqual(['ANULADO']);
    expect(anularOwn.body.data.cobrado).toBe(0);

    const stockAfterAnul = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productB],
    );
    expect(Number(stockAfterAnul.rows[0].stock_actual))
      .toBe(Number(stockBeforeAnul.rows[0].stock_actual) + 1);

    const comprobante = await request(app)
      .get(`/api/ventas/${saleId}/comprobante`)
      .set(authorize);
    expect(comprobante.status).toBe(200);
    expect(comprobante.body.data.numero).toBeTruthy();
    expect(comprobante.body.data.total).toBe(20);
  });

  test('defect return: exchange while there is stock, refund when there is none', async () => {
    const authorize = { Authorization: `Bearer ${vendedorToken}` };
    const productD = await seedProductWithStock(adminToken, `${suffix}d`, 3);
    const draft = await request(app).post('/api/ventas').set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: productD, cantidad: 2, precioUnitario: 15 }],
    });
    expect(draft.status).toBe(201);
    const idVenta = draft.body.data.idVenta;
    await payAndConfirm(authorize, idVenta, 30, `pay-dev-${suffix}`);
    const confirm = await request(app)
      .post(`/api/ventas/${idVenta}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `conf-dev-${suffix}` });
    expect(confirm.status).toBe(200);

    const cambio = await request(app).post(`/api/ventas/${idVenta}/devoluciones`).set(authorize).send({
      claveIdempotencia: `dev-1-${suffix}`,
      idProducto: productD,
      cantidad: 1,
      observacion: 'No enciende',
    });
    expect(cambio.status).toBe(201);
    expect(cambio.body.data).toMatchObject({ tipo: 'CAMBIO', montoReembolso: 0, stockRestante: 0 });

    const reembolso = await request(app).post(`/api/ventas/${idVenta}/devoluciones`).set(authorize).send({
      claveIdempotencia: `dev-2-${suffix}`,
      idProducto: productD,
      cantidad: 1,
      observacion: 'Pantalla rota',
    });
    expect(reembolso.status).toBe(201);
    expect(reembolso.body.data).toMatchObject({ tipo: 'REEMBOLSO', montoReembolso: 15, stockRestante: 0 });

    const excedido = await request(app).post(`/api/ventas/${idVenta}/devoluciones`).set(authorize).send({
      claveIdempotencia: `dev-3-${suffix}`,
      idProducto: productD,
      cantidad: 2,
      observacion: 'Pantalla rota',
    });
    expect(excedido.status).toBe(422);
    expect(excedido.body.error.details).toMatchObject({ reason: 'RETURN_QUANTITY_EXCEEDED', disponible: 1 });

    const anular = await request(app)
      .post(`/api/ventas/${idVenta}/anular`)
      .set(authorize)
      .send({ claveIdempotencia: `anul-dev-${suffix}`, observacion: 'Error al registrar' });
    expect(anular.status).toBe(422);
    expect(anular.body.error.details.reason).toBe('SALE_HAS_RETURNS');

    const venta = await request(app).get(`/api/ventas/${idVenta}`).set(authorize);
    expect(venta.body.data.devoluciones.map((d) => d.tipo)).toEqual(['CAMBIO', 'REEMBOLSO']);
    expect(venta.body.data.reembolsado).toBe(15);

    const stock = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productD],
    );
    expect(Number(stock.rows[0].stock_actual)).toBe(0);
  });
});
