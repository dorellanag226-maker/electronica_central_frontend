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
};

const login = async (identificador, contrasena) => {
  const response = await request(app).post('/api/auth/login').send({ identificador, contrasena });
  expect(response.status).toBe(200);
  return response.body.data.token;
};

const seedProductWithStock = async (token, label, stock, costo = 4, precio = 10) => {
  const authorize = { Authorization: `Bearer ${token}` };
  const short = String(label).replace(/\W/g, '').slice(-8);
  const category = await request(app).post('/api/categorias').set(authorize).send({ nombre: `Cat Conc ${label}` });
  expect(category.status).toBe(201);
  const brand = await request(app).post('/api/marcas').set(authorize).send({ nombre: `Marca Conc ${label}` });
  expect(brand.status).toBe(201);
  const unit = await request(app).post('/api/unidades').set(authorize).send({
    nombre: `Unidad Conc ${label}`,
    simbolo: `c${short}`,
    permiteFraccion: false,
  });
  expect(unit.status).toBe(201);
  const location = await request(app).post('/api/ubicaciones').set(authorize).send({
    codigo: `CONC-${short}`,
    pasillo: 'C',
    estante: '1',
  });
  expect(location.status).toBe(201);
  const product = await request(app).post('/api/productos').set(authorize).send({
    codigo: `CONC-SKU-${label}`,
    nombre: `Producto Conc ${label}`,
    precioVenta: precio,
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
      motivo: 'Stock concurrencia',
      costoUnitario: costo,
      claveIdempotencia: `conc-stock-${label}`,
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

describe('sales concurrency with PostgreSQL', () => {
  let adminToken;
  let vendedorToken;
  let clientId;

  beforeAll(async () => {
    await ensureSalesPermission();
    adminToken = await login(process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);

    const vendor = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${adminToken}`).send({
      nombreUsuario: `vend.conc.${suffix}`,
      correo: `vend.conc.${suffix}@example.test`,
      contrasena: 'ClaveVendedorSegura123',
      roles: ['VENDEDOR'],
    });
    expect(vendor.status).toBe(201);
    vendedorToken = await login(`vend.conc.${suffix}@example.test`, 'ClaveVendedorSegura123');

    const client = await request(app).post('/api/clientes').set('Authorization', `Bearer ${adminToken}`).send({
      nombre: `Cliente Conc ${suffix}`,
      documento: `CLI-CONC-${suffix}`,
    });
    expect(client.status).toBe(201);
    clientId = client.body.data.id_cliente;
  });

  test('two concurrent confirms on last unit: one succeeds, one fails, stock stays non-negative', async () => {
    const productId = await seedProductWithStock(adminToken, `${suffix}-u`, 1);
    const authorize = { Authorization: `Bearer ${vendedorToken}` };

    const draftA = await request(app).post('/api/ventas').set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: productId, cantidad: 1, precioUnitario: 10 }],
    });
    const draftB = await request(app).post('/api/ventas').set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: productId, cantidad: 1, precioUnitario: 10 }],
    });
    expect(draftA.status).toBe(201);
    expect(draftB.status).toBe(201);
    await payAndConfirm(authorize, draftA.body.data.idVenta, 10, `conc-pay-sale-a-${suffix}`);
    await payAndConfirm(authorize, draftB.body.data.idVenta, 10, `conc-pay-sale-b-${suffix}`);

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/ventas/${draftA.body.data.idVenta}/confirmar`)
        .set(authorize)
        .send({ claveIdempotencia: `conc-conf-a-${suffix}` }),
      request(app)
        .post(`/api/ventas/${draftB.body.data.idVenta}/confirmar`)
        .set(authorize)
        .send({ claveIdempotencia: `conc-conf-b-${suffix}` }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 422]);
    const failed = [resA, resB].find((r) => r.status === 422);
    expect(failed.body.error.code).toBe('UE001');
    expect(failed.body.error.details?.reason ?? failed.body.error.reason).toBeTruthy();

    const stock = await query(
      'SELECT stock_actual FROM electronica_az.existencia WHERE id_producto = $1',
      [productId],
    );
    expect(Number(stock.rows[0].stock_actual)).toBe(0);
  });

  test('two concurrent payment confirms cannot exceed sale total', async () => {
    const productId = await seedProductWithStock(adminToken, `${suffix}-p`, 5);
    const authorize = { Authorization: `Bearer ${vendedorToken}` };

    const draft = await request(app).post('/api/ventas').set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: productId, cantidad: 2, precioUnitario: 10 }],
    });
    expect(draft.status).toBe(201);
    const saleId = draft.body.data.idVenta;
    expect(draft.body.data.total).toBe(20);

    const payA = await request(app).post(`/api/ventas/${saleId}/pagos`).set(authorize).send({
      monto: 15,
      metodo: 'EFECTIVO',
    });
    const payB = await request(app).post(`/api/ventas/${saleId}/pagos`).set(authorize).send({
      monto: 15,
      metodo: 'QR',
      referenciaExterna: `QR-CONC-${suffix}`,
    });
    expect(payA.status).toBe(201);
    expect(payB.status).toBe(201);

    const [confA, confB] = await Promise.all([
      request(app)
        .post(`/api/pagos/${payA.body.data.idPago}/confirmar`)
        .set(authorize)
        .send({ claveIdempotencia: `conc-pay-a-${suffix}` }),
      request(app)
        .post(`/api/pagos/${payB.body.data.idPago}/confirmar`)
        .set(authorize)
        .send({ claveIdempotencia: `conc-pay-b-${suffix}` }),
    ]);

    const statuses = [confA.status, confB.status].sort();
    expect(statuses).toEqual([200, 422]);
    const failed = [confA, confB].find((r) => r.status === 422);
    expect(failed.body.error.code).toBe('UE001');

    const sum = await query(
      `SELECT coalesce(sum(monto), 0)::numeric AS total
       FROM electronica_az.pago WHERE id_venta = $1 AND estado = 'CONFIRMADO'`,
      [saleId],
    );
    expect(Number(sum.rows[0].total)).toBeLessThanOrEqual(20);
    expect(Number(sum.rows[0].total)).toBe(15);
  });
});
