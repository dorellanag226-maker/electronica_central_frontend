import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { query } from '../../src/lib/database.js';
import { formatLaPazDate } from '../../src/services/reportHelpers.js';

const app = createApp();
const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;

const ensureReportsPermission = async () => {
  await query(`
    INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
      ('REPORTES_CONSULTAR', 'Consultar reportes')
    ON CONFLICT (codigo) DO NOTHING
  `);
  await query(`
    INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
    SELECT r.id_rol, p.id_permiso
    FROM electronica_az.rol r
    CROSS JOIN electronica_az.permiso p
    WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR')
      AND p.codigo = 'REPORTES_CONSULTAR'
    ON CONFLICT DO NOTHING
  `);
  await query(`
    INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
      ('VENTAS_GESTIONAR', 'Gestionar ventas'),
      ('SOLICITUDES_GESTIONAR', 'Gestionar solicitudes')
    ON CONFLICT (codigo) DO NOTHING
  `);
  await query(`
    INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
    SELECT r.id_rol, p.id_permiso
    FROM electronica_az.rol r
    CROSS JOIN electronica_az.permiso p
    WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR', 'VENDEDOR')
      AND p.codigo IN ('VENTAS_GESTIONAR', 'SOLICITUDES_GESTIONAR')
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
  const category = await request(app).post('/api/categorias').set(authorize).send({ nombre: `Cat Rep ${label}` });
  const brand = await request(app).post('/api/marcas').set(authorize).send({ nombre: `Marca Rep ${label}` });
  const unit = await request(app).post('/api/unidades').set(authorize).send({
    nombre: `Unidad Rep ${label}`,
    simbolo: `ur${label}`.slice(0, 10),
    permiteFraccion: false,
  });
  const location = await request(app).post('/api/ubicaciones').set(authorize).send({
    codigo: `REP-${label}`.slice(0, 20),
    pasillo: 'R',
    estante: '1',
  });
  const product = await request(app).post('/api/productos').set(authorize).send({
    codigo: `REP-SKU-${label}`,
    nombre: `Producto Rep ${label}`,
    precioVenta: precio,
    idCategoria: category.body.data.id_categoria,
    idUnidadMedida: unit.body.data.id_unidad_medida,
    idUbicacion: location.body.data.id_ubicacion,
    idMarca: brand.body.data.id_marca,
    stockMinimo: 1,
  });
  expect(product.status).toBe(201);
  const productId = product.body.data.id_producto;
  if (stock > 0) {
    const ajuste = await request(app).post('/api/inventario/ajustes').set(authorize).send({
      idProducto: productId,
      tipo: 'ENTRADA',
      cantidad: stock,
      motivo: 'Stock reportes',
      costoUnitario: costo,
      claveIdempotencia: `rep-stock-${label}`,
    });
    expect(ajuste.status).toBe(201);
  }
  return productId;
};

describe('reports flow with PostgreSQL', () => {
  let adminToken;
  let vendedorToken;
  let clientId;
  let productId;
  let saleId;
  let today;

  beforeAll(async () => {
    await ensureReportsPermission();
    today = formatLaPazDate(new Date());
    adminToken = await login(process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD);

    const vendor = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${adminToken}`).send({
      nombreUsuario: `vend.rep.${suffix}`,
      correo: `vend.rep.${suffix}@example.test`,
      contrasena: 'ClaveVendedorSegura123',
      roles: ['VENDEDOR'],
    });
    expect(vendor.status).toBe(201);
    vendedorToken = await login(`vend.rep.${suffix}@example.test`, 'ClaveVendedorSegura123');

    const client = await request(app).post('/api/clientes').set('Authorization', `Bearer ${adminToken}`).send({
      nombre: `Cliente Rep ${suffix}`,
      documento: `CLI-REP-${suffix}`,
    });
    expect(client.status).toBe(201);
    clientId = client.body.data.id_cliente;

    productId = await seedProductWithStock(adminToken, suffix, 20, 4, 10);

    const authorize = { Authorization: `Bearer ${vendedorToken}` };
    const draft = await request(app).post('/api/ventas').set(authorize).send({
      idCliente: clientId,
      detalles: [{ idProducto: productId, cantidad: 2, precioUnitario: 10 }],
    });
    expect(draft.status).toBe(201);
    saleId = draft.body.data.idVenta;

    const pay = await request(app).post(`/api/ventas/${saleId}/pagos`).set(authorize).send({
      monto: 20,
      metodo: 'EFECTIVO',
    });
    expect(pay.status).toBe(201);
    const payConfirm = await request(app)
      .post(`/api/pagos/${pay.body.data.idPago}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `rep-pay-${suffix}` });
    expect(payConfirm.status).toBe(200);

    const confirm = await request(app)
      .post(`/api/ventas/${saleId}/confirmar`)
      .set(authorize)
      .send({ claveIdempotencia: `rep-confirm-${suffix}` });
    expect(confirm.status).toBe(200);

    const sol = await request(app).post('/api/solicitudes').set(authorize).send({
      idCliente: clientId,
      descripcionProducto: `Solicitud reporte ${suffix}`,
      cantidad: 3,
    });
    expect(sol.status).toBe(201);
  });

  test('vendor denied REPORTES; admin gets ventas/ganancias JSON with formulas', async () => {
    const denied = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: today, hasta: today })
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(denied.status).toBe(403);

    const ventas = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: today, hasta: today })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ventas.status).toBe(200);
    expect(ventas.body.data.resumen.vendido).toBeGreaterThanOrEqual(20);
    expect(ventas.body.data.periodo.zona).toBe('America/La_Paz');
    expect(ventas.body.data.items.some((i) => i.idVenta === saleId)).toBe(true);

    const ganancias = await request(app)
      .get('/api/reportes/ganancias')
      .query({ desde: today, hasta: today })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ganancias.status).toBe(200);
    // 2 × (10 − 4) = 12
    expect(ganancias.body.data.resumen.gananciaBruta).toBeGreaterThanOrEqual(12);
  });

  test('inventario corte + rotacion-demanda; Excel and PDF exports', async () => {
    const inv = await request(app)
      .get('/api/reportes/inventario')
      .query({ fechaCorte: today })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(inv.status).toBe(200);
    const row = inv.body.data.items.find((i) => i.idProducto === productId);
    expect(row).toBeTruthy();
    expect(row.stockCorte).toBe(18);
    expect(row.valoracion).toBe(72);

    const rot = await request(app)
      .get('/api/reportes/rotacion-demanda')
      .query({ desde: today, hasta: today })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(rot.status).toBe(200);
    expect(rot.body.data.demanda.ventasUnidades).toBeGreaterThanOrEqual(2);
    expect(rot.body.data.demanda.solicitudesUnidades).toBeGreaterThanOrEqual(3);
    expect(rot.body.data.rotacion).toHaveProperty('cogs');

    const xlsx = await request(app)
      .get('/api/reportes/ventas')
      .query({ desde: today, hasta: today, formato: 'xlsx' })
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const data = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(data)));
      });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect(Buffer.isBuffer(xlsx.body)).toBe(true);
    expect(xlsx.body.length).toBeGreaterThan(100);

    const pdf = await request(app)
      .get('/api/reportes/ganancias')
      .query({ desde: today, hasta: today, formato: 'pdf' })
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const data = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(data)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect(pdf.body.toString('utf8', 0, 4)).toBe('%PDF');

    const comprobantePdf = await request(app)
      .get(`/api/ventas/${saleId}/comprobante`)
      .query({ formato: 'pdf' })
      .set('Authorization', `Bearer ${vendedorToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const data = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(data)));
      });
    expect(comprobantePdf.status).toBe(200);
    expect(comprobantePdf.headers['content-type']).toMatch(/pdf/);
    expect(comprobantePdf.body.toString('utf8', 0, 4)).toBe('%PDF');
  });
});
