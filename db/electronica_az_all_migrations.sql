-- =============================================================================
-- Electrónica Central AZ — esquema completo (migraciones 001 → 010)
-- =============================================================================
-- Generado automáticamente. No editar a mano: regenerar con:
--   cd backend && npm run db:bundle
--
-- Origen: backend/scripts/migrations/001_schema_reference.sql … 012_admin_panel.sql
--
-- Uso (BD vacía / nueva):
--   1. CREATE DATABASE … (si aplica; en Supabase no crear DB)
--   2. Ejecutar ESTE archivo completo en DBeaver / psql / SQL Editor
--   3. npm run bootstrap:security
--   4. (opcional) seed Excel: 01_cleanup + 02_seed_from_excel
--
-- NO incluye datos de negocio ni usuarios (salvo lo que cree bootstrap después).
-- NO ejecutar docs/datos_Electronica_CentralAZ.sql completo.
-- =============================================================================

-- #############################################################################
-- >>> 001_schema_reference.sql
-- #############################################################################

-- ELECTRONICA CENTRAL AZ - CREACION DE TABLAS Y RELACIONES
-- PostgreSQL 14+ / Supabase. Basado en las 24 tablas del Excel aprobado.
-- Nombres en minusculas sin comillas: mismos identificadores del mapeo.
--
-- EJECUCION EN SUPABASE:
-- 1. Abrir el proyecto, SQL Editor > New query.
-- 2. Pegar este archivo completo y ejecutar como propietario de la BD.
-- 3. En Table Editor seleccionar el esquema electronica_az.
-- Supabase ya proporciona una base de datos: NO ejecutar CREATE DATABASE alli.
--
-- POSTGRESQL INDEPENDIENTE (opcional, ejecutar por separado):
-- CREATE DATABASE electronica_az WITH ENCODING = 'UTF8';
-- Conectarse a esa base y luego ejecutar este archivo.
--
-- Ejecutar UNA SOLA VEZ en una instalacion nueva.
-- No contiene DROP, no modifica tablas existentes y no crea usuarios de acceso.
-- Si el esquema ya existe, se detiene; no oculta discrepancias con IF NOT EXISTS.
-- Toda la creacion es atomica: ante un error, ejecutar ROLLBACK.
--
-- Alcance: estructura, PK, FK, UNIQUE, CHECK e indices.
-- No implementa automaticamente ventas, stock, pagos ni calculos de reportes.
-- Todos los importes representan BOB; sin USD, tipo de cambio ni pasarela.
--
-- ACCESO DESDE NODE.JS:
-- Usar nombres calificados: SELECT * FROM electronica_az.producto;
-- Mantener la conexion y sus credenciales exclusivamente en el backend.
-- Este esquema no se agrega a la lista de esquemas expuestos de la Data API.
-- No se conceden permisos a anon, authenticated ni PUBLIC.
-- El usuario PostgreSQL del backend y sus privilegios se configuran al desplegar.
--
BEGIN;

CREATE SCHEMA electronica_az;
REVOKE ALL ON SCHEMA electronica_az FROM PUBLIC;

-- Seguridad / ROL
CREATE TABLE electronica_az.rol (
    id_rol uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre varchar(120) NOT NULL,
    descripcion text,
    CONSTRAINT pk_rol PRIMARY KEY (id_rol),
    CONSTRAINT uq_rol_nombre UNIQUE (nombre)
);

-- Seguridad / PERMISO
CREATE TABLE electronica_az.permiso (
    id_permiso uuid NOT NULL DEFAULT gen_random_uuid(),
    codigo varchar(120) NOT NULL,
    descripcion text,
    CONSTRAINT pk_permiso PRIMARY KEY (id_permiso),
    CONSTRAINT uq_permiso_codigo UNIQUE (codigo)
);

-- Seguridad / USUARIO
CREATE TABLE electronica_az.usuario (
    id_usuario uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre_usuario varchar(120) NOT NULL,
    correo varchar(254) NOT NULL,
    hash_contrasena text NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    CONSTRAINT pk_usuario PRIMARY KEY (id_usuario),
    CONSTRAINT uq_usuario_nombre_usuario UNIQUE (nombre_usuario),
    CONSTRAINT uq_usuario_correo UNIQUE (correo),
    CONSTRAINT ck_usuario_correo CHECK (btrim(correo) <> ''),
    CONSTRAINT ck_usuario_nombre CHECK (btrim(nombre_usuario) <> ''),
    CONSTRAINT ck_usuario_hash CHECK (btrim(hash_contrasena) <> '')
);

-- Seguridad / USUARIO_ROL
CREATE TABLE electronica_az.usuario_rol (
    id_usuario uuid NOT NULL,
    id_rol uuid NOT NULL,
    CONSTRAINT pk_usuario_rol PRIMARY KEY (id_usuario, id_rol)
);

-- Seguridad / ROL_PERMISO
CREATE TABLE electronica_az.rol_permiso (
    id_rol uuid NOT NULL,
    id_permiso uuid NOT NULL,
    CONSTRAINT pk_rol_permiso PRIMARY KEY (id_rol, id_permiso)
);

-- Seguridad / CLIENTE
CREATE TABLE electronica_az.cliente (
    id_cliente uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre varchar(120) NOT NULL,
    documento varchar(120),
    telefono varchar(120),
    correo varchar(254),
    id_usuario uuid,
    CONSTRAINT pk_cliente PRIMARY KEY (id_cliente),
    CONSTRAINT uq_cliente_id_usuario UNIQUE (id_usuario)
);

-- Seguridad / REGISTRO_BITACORA
CREATE TABLE electronica_az.registro_bitacora (
    id_registro uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha_hora timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accion varchar(120) NOT NULL,
    objeto_afectado text NOT NULL,
    resultado text NOT NULL,
    direccion_ip inet,
    id_usuario uuid,
    CONSTRAINT pk_registro_bitacora PRIMARY KEY (id_registro)
);

-- Catalogo / CATEGORIA
CREATE TABLE electronica_az.categoria (
    id_categoria uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre varchar(120) NOT NULL,
    descripcion text,
    CONSTRAINT pk_categoria PRIMARY KEY (id_categoria)
);

-- Catalogo / MARCA
CREATE TABLE electronica_az.marca (
    id_marca uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre varchar(120) NOT NULL,
    CONSTRAINT pk_marca PRIMARY KEY (id_marca)
);

-- Catalogo / MODELO
CREATE TABLE electronica_az.modelo (
    id_modelo uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre varchar(120) NOT NULL,
    descripcion text,
    id_marca uuid NOT NULL,
    CONSTRAINT pk_modelo PRIMARY KEY (id_modelo)
);

-- Catalogo / UNIDAD_MEDIDA
CREATE TABLE electronica_az.unidad_medida (
    id_unidad_medida uuid NOT NULL DEFAULT gen_random_uuid(),
    nombre varchar(120) NOT NULL,
    simbolo varchar(120) NOT NULL,
    permite_fraccion boolean NOT NULL DEFAULT false,
    CONSTRAINT pk_unidad_medida PRIMARY KEY (id_unidad_medida)
);

-- Catalogo / UBICACION
CREATE TABLE electronica_az.ubicacion (
    id_ubicacion uuid NOT NULL DEFAULT gen_random_uuid(),
    codigo varchar(120) NOT NULL,
    pasillo varchar(120) NOT NULL,
    estante varchar(120) NOT NULL,
    CONSTRAINT pk_ubicacion PRIMARY KEY (id_ubicacion)
);

-- Catalogo / PRODUCTO
CREATE TABLE electronica_az.producto (
    id_producto uuid NOT NULL DEFAULT gen_random_uuid(),
    codigo varchar(120) NOT NULL,
    nombre varchar(120) NOT NULL,
    descripcion text,
    precio_venta numeric(18,4) NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    id_categoria uuid NOT NULL,
    id_unidad_medida uuid NOT NULL,
    id_ubicacion uuid NOT NULL,
    id_marca uuid,
    id_modelo uuid,
    CONSTRAINT pk_producto PRIMARY KEY (id_producto),
    CONSTRAINT uq_producto_codigo UNIQUE (codigo),
    CONSTRAINT ck_producto_precio_venta CHECK (precio_venta >= 0 AND precio_venta <> 'NaN'::numeric)
);

-- Catalogo / COMPATIBILIDAD
CREATE TABLE electronica_az.compatibilidad (
    id_producto uuid NOT NULL,
    id_modelo uuid NOT NULL,
    observaciones text,
    CONSTRAINT pk_compatibilidad PRIMARY KEY (id_producto, id_modelo)
);

-- Inventario / EXISTENCIA
CREATE TABLE electronica_az.existencia (
    id_producto uuid NOT NULL,
    stock_actual numeric(18,4) NOT NULL DEFAULT 0,
    stock_minimo numeric(18,4) NOT NULL DEFAULT 0,
    costo_promedio numeric(18,4) NOT NULL DEFAULT 0,
    CONSTRAINT pk_existencia PRIMARY KEY (id_producto),
    CONSTRAINT ck_existencia_stock_actual CHECK (stock_actual >= 0 AND stock_actual <> 'NaN'::numeric),
    CONSTRAINT ck_existencia_stock_minimo CHECK (stock_minimo >= 0 AND stock_minimo <> 'NaN'::numeric),
    CONSTRAINT ck_existencia_costo_promedio CHECK (costo_promedio >= 0 AND costo_promedio <> 'NaN'::numeric)
);

-- Inventario / MOVIMIENTO_INVENTARIO
CREATE TABLE electronica_az.movimiento_inventario (
    id_movimiento uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha_hora timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo varchar(120) NOT NULL,
    cantidad numeric(18,4) NOT NULL,
    motivo text NOT NULL,
    costo_unitario numeric(18,4) NOT NULL,
    id_producto uuid NOT NULL,
    id_usuario uuid NOT NULL,
    id_detalle_compra uuid,
    id_detalle_venta uuid,
    CONSTRAINT pk_movimiento_inventario PRIMARY KEY (id_movimiento),
    CONSTRAINT ck_movimiento_inventario_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
    CONSTRAINT ck_movimiento_inventario_costo_unitario CHECK (costo_unitario >= 0 AND costo_unitario <> 'NaN'::numeric),
    CONSTRAINT ck_movimiento_tipo CHECK (tipo IN ('ENTRADA', 'SALIDA')),
    CONSTRAINT ck_movimiento_origen CHECK (id_detalle_compra IS NULL OR id_detalle_venta IS NULL)
);

-- Compras / PROVEEDOR
CREATE TABLE electronica_az.proveedor (
    id_proveedor uuid NOT NULL DEFAULT gen_random_uuid(),
    razon_social varchar(120) NOT NULL,
    documento varchar(120),
    telefono varchar(120),
    correo varchar(254),
    direccion varchar(300),
    activo boolean NOT NULL DEFAULT true,
    CONSTRAINT pk_proveedor PRIMARY KEY (id_proveedor)
);

-- Compras / COMPRA
CREATE TABLE electronica_az.compra (
    id_compra uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado varchar(120) NOT NULL DEFAULT 'PENDIENTE',
    id_proveedor uuid NOT NULL,
    id_usuario uuid NOT NULL,
    CONSTRAINT pk_compra PRIMARY KEY (id_compra),
    CONSTRAINT ck_compra_estado CHECK (estado IN ('PENDIENTE', 'RECIBIDA', 'CANCELADA'))
);

-- Compras / DETALLE_COMPRA
CREATE TABLE electronica_az.detalle_compra (
    id_detalle_compra uuid NOT NULL DEFAULT gen_random_uuid(),
    id_compra uuid NOT NULL,
    id_producto uuid NOT NULL,
    cantidad numeric(18,4) NOT NULL,
    costo_unitario numeric(18,4) NOT NULL,
    CONSTRAINT pk_detalle_compra PRIMARY KEY (id_detalle_compra),
    CONSTRAINT ck_detalle_compra_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
    CONSTRAINT ck_detalle_compra_costo_unitario CHECK (costo_unitario >= 0 AND costo_unitario <> 'NaN'::numeric)
);

-- Ventas / VENTA
CREATE TABLE electronica_az.venta (
    id_venta uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha_hora timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado varchar(120) NOT NULL DEFAULT 'BORRADOR',
    id_cliente uuid NOT NULL,
    id_usuario uuid NOT NULL,
    CONSTRAINT pk_venta PRIMARY KEY (id_venta),
    CONSTRAINT ck_venta_estado CHECK (estado IN ('BORRADOR', 'CONFIRMADA', 'ANULADA'))
);

-- Ventas / DETALLE_VENTA
CREATE TABLE electronica_az.detalle_venta (
    id_detalle_venta uuid NOT NULL DEFAULT gen_random_uuid(),
    id_venta uuid NOT NULL,
    id_producto uuid NOT NULL,
    cantidad numeric(18,4) NOT NULL,
    precio_unitario numeric(18,4) NOT NULL,
    costo_unitario_historico numeric(18,4) NOT NULL,
    CONSTRAINT pk_detalle_venta PRIMARY KEY (id_detalle_venta),
    CONSTRAINT ck_detalle_venta_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
    CONSTRAINT ck_detalle_venta_precio_unitario CHECK (precio_unitario >= 0 AND precio_unitario <> 'NaN'::numeric),
    CONSTRAINT ck_detalle_venta_costo_unitario_historico CHECK (costo_unitario_historico >= 0 AND costo_unitario_historico <> 'NaN'::numeric)
);

-- Ventas / PAGO
CREATE TABLE electronica_az.pago (
    id_pago uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha_hora timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    monto numeric(18,2) NOT NULL,
    metodo varchar(120) NOT NULL,
    estado varchar(120) NOT NULL DEFAULT 'PENDIENTE',
    referencia_externa varchar(200),
    id_venta uuid NOT NULL,
    id_usuario uuid NOT NULL,
    CONSTRAINT pk_pago PRIMARY KEY (id_pago),
    CONSTRAINT uq_pago_referencia_externa UNIQUE (referencia_externa),
    CONSTRAINT ck_pago_monto CHECK (monto > 0 AND monto <> 'NaN'::numeric),
    CONSTRAINT ck_pago_estado CHECK (estado IN ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO')),
    CONSTRAINT ck_pago_metodo CHECK (metodo IN ('EFECTIVO', 'QR'))
);

-- Ventas / COMPROBANTE
CREATE TABLE electronica_az.comprobante (
    id_venta uuid NOT NULL,
    numero varchar(120) NOT NULL,
    fecha_emision timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_comprobante PRIMARY KEY (id_venta),
    CONSTRAINT uq_comprobante_numero UNIQUE (numero)
);

-- Solicitudes / SOLICITUD_PRODUCTO
CREATE TABLE electronica_az.solicitud_producto (
    id_solicitud uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha_hora timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    descripcion_producto text NOT NULL,
    cantidad numeric(18,4) NOT NULL,
    estado varchar(120) NOT NULL DEFAULT 'PENDIENTE',
    observaciones text,
    id_cliente uuid NOT NULL,
    id_usuario uuid NOT NULL,
    id_producto uuid,
    id_modelo uuid,
    CONSTRAINT pk_solicitud_producto PRIMARY KEY (id_solicitud),
    CONSTRAINT ck_solicitud_producto_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
    CONSTRAINT ck_solicitud_producto_estado CHECK (estado IN ('PENDIENTE', 'ATENDIDA', 'CANCELADA'))
);

-- CLAVES FORANEAS
-- Se agregan despues de todas las tablas para resolver referencias adelantadas.
-- RESTRICT protege el historial; no se borran ventas, compras ni movimientos en cascada.
ALTER TABLE electronica_az.usuario_rol
    ADD CONSTRAINT fk_usuario_rol_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.usuario_rol
    ADD CONSTRAINT fk_usuario_rol_id_rol
    FOREIGN KEY (id_rol) REFERENCES electronica_az.rol (id_rol)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.rol_permiso
    ADD CONSTRAINT fk_rol_permiso_id_rol
    FOREIGN KEY (id_rol) REFERENCES electronica_az.rol (id_rol)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.rol_permiso
    ADD CONSTRAINT fk_rol_permiso_id_permiso
    FOREIGN KEY (id_permiso) REFERENCES electronica_az.permiso (id_permiso)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.cliente
    ADD CONSTRAINT fk_cliente_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.registro_bitacora
    ADD CONSTRAINT fk_registro_bitacora_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.modelo
    ADD CONSTRAINT fk_modelo_id_marca
    FOREIGN KEY (id_marca) REFERENCES electronica_az.marca (id_marca)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.producto
    ADD CONSTRAINT fk_producto_id_categoria
    FOREIGN KEY (id_categoria) REFERENCES electronica_az.categoria (id_categoria)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.producto
    ADD CONSTRAINT fk_producto_id_unidad_medida
    FOREIGN KEY (id_unidad_medida) REFERENCES electronica_az.unidad_medida (id_unidad_medida)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.producto
    ADD CONSTRAINT fk_producto_id_ubicacion
    FOREIGN KEY (id_ubicacion) REFERENCES electronica_az.ubicacion (id_ubicacion)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.producto
    ADD CONSTRAINT fk_producto_id_marca
    FOREIGN KEY (id_marca) REFERENCES electronica_az.marca (id_marca)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.producto
    ADD CONSTRAINT fk_producto_id_modelo
    FOREIGN KEY (id_modelo) REFERENCES electronica_az.modelo (id_modelo)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.compatibilidad
    ADD CONSTRAINT fk_compatibilidad_id_producto
    FOREIGN KEY (id_producto) REFERENCES electronica_az.producto (id_producto)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.compatibilidad
    ADD CONSTRAINT fk_compatibilidad_id_modelo
    FOREIGN KEY (id_modelo) REFERENCES electronica_az.modelo (id_modelo)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.existencia
    ADD CONSTRAINT fk_existencia_id_producto
    FOREIGN KEY (id_producto) REFERENCES electronica_az.producto (id_producto)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_producto
    FOREIGN KEY (id_producto) REFERENCES electronica_az.existencia (id_producto)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_detalle_compra
    FOREIGN KEY (id_detalle_compra) REFERENCES electronica_az.detalle_compra (id_detalle_compra)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.movimiento_inventario
    ADD CONSTRAINT fk_movimiento_inventario_id_detalle_venta
    FOREIGN KEY (id_detalle_venta) REFERENCES electronica_az.detalle_venta (id_detalle_venta)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.compra
    ADD CONSTRAINT fk_compra_id_proveedor
    FOREIGN KEY (id_proveedor) REFERENCES electronica_az.proveedor (id_proveedor)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.compra
    ADD CONSTRAINT fk_compra_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.detalle_compra
    ADD CONSTRAINT fk_detalle_compra_id_compra
    FOREIGN KEY (id_compra) REFERENCES electronica_az.compra (id_compra)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.detalle_compra
    ADD CONSTRAINT fk_detalle_compra_id_producto
    FOREIGN KEY (id_producto) REFERENCES electronica_az.producto (id_producto)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.venta
    ADD CONSTRAINT fk_venta_id_cliente
    FOREIGN KEY (id_cliente) REFERENCES electronica_az.cliente (id_cliente)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.venta
    ADD CONSTRAINT fk_venta_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.detalle_venta
    ADD CONSTRAINT fk_detalle_venta_id_venta
    FOREIGN KEY (id_venta) REFERENCES electronica_az.venta (id_venta)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.detalle_venta
    ADD CONSTRAINT fk_detalle_venta_id_producto
    FOREIGN KEY (id_producto) REFERENCES electronica_az.producto (id_producto)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.pago
    ADD CONSTRAINT fk_pago_id_venta
    FOREIGN KEY (id_venta) REFERENCES electronica_az.venta (id_venta)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.pago
    ADD CONSTRAINT fk_pago_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.comprobante
    ADD CONSTRAINT fk_comprobante_id_venta
    FOREIGN KEY (id_venta) REFERENCES electronica_az.venta (id_venta)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.solicitud_producto
    ADD CONSTRAINT fk_solicitud_producto_id_cliente
    FOREIGN KEY (id_cliente) REFERENCES electronica_az.cliente (id_cliente)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.solicitud_producto
    ADD CONSTRAINT fk_solicitud_producto_id_usuario
    FOREIGN KEY (id_usuario) REFERENCES electronica_az.usuario (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.solicitud_producto
    ADD CONSTRAINT fk_solicitud_producto_id_producto
    FOREIGN KEY (id_producto) REFERENCES electronica_az.producto (id_producto)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE electronica_az.solicitud_producto
    ADD CONSTRAINT fk_solicitud_producto_id_modelo
    FOREIGN KEY (id_modelo) REFERENCES electronica_az.modelo (id_modelo)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

-- INDICES DE APOYO PARA FK
-- Las PK y UNIQUE ya crean sus propios indices.
CREATE INDEX ix_usuario_rol_id_rol ON electronica_az.usuario_rol (id_rol);
CREATE INDEX ix_rol_permiso_id_permiso ON electronica_az.rol_permiso (id_permiso);
CREATE INDEX ix_registro_bitacora_id_usuario ON electronica_az.registro_bitacora (id_usuario);
CREATE INDEX ix_modelo_id_marca ON electronica_az.modelo (id_marca);
CREATE INDEX ix_producto_id_categoria ON electronica_az.producto (id_categoria);
CREATE INDEX ix_producto_id_unidad_medida ON electronica_az.producto (id_unidad_medida);
CREATE INDEX ix_producto_id_ubicacion ON electronica_az.producto (id_ubicacion);
CREATE INDEX ix_producto_id_marca ON electronica_az.producto (id_marca);
CREATE INDEX ix_producto_id_modelo ON electronica_az.producto (id_modelo);
CREATE INDEX ix_compatibilidad_id_modelo ON electronica_az.compatibilidad (id_modelo);
CREATE INDEX ix_movimiento_inventario_id_producto ON electronica_az.movimiento_inventario (id_producto);
CREATE INDEX ix_movimiento_inventario_id_usuario ON electronica_az.movimiento_inventario (id_usuario);
CREATE INDEX ix_movimiento_inventario_id_detalle_compra ON electronica_az.movimiento_inventario (id_detalle_compra);
CREATE INDEX ix_movimiento_inventario_id_detalle_venta ON electronica_az.movimiento_inventario (id_detalle_venta);
CREATE INDEX ix_compra_id_proveedor ON electronica_az.compra (id_proveedor);
CREATE INDEX ix_compra_id_usuario ON electronica_az.compra (id_usuario);
CREATE INDEX ix_detalle_compra_id_compra ON electronica_az.detalle_compra (id_compra);
CREATE INDEX ix_detalle_compra_id_producto ON electronica_az.detalle_compra (id_producto);
CREATE INDEX ix_venta_id_cliente ON electronica_az.venta (id_cliente);
CREATE INDEX ix_venta_id_usuario ON electronica_az.venta (id_usuario);
CREATE INDEX ix_detalle_venta_id_venta ON electronica_az.detalle_venta (id_venta);
CREATE INDEX ix_detalle_venta_id_producto ON electronica_az.detalle_venta (id_producto);
CREATE INDEX ix_pago_id_venta ON electronica_az.pago (id_venta);
CREATE INDEX ix_pago_id_usuario ON electronica_az.pago (id_usuario);
CREATE INDEX ix_solicitud_producto_id_cliente ON electronica_az.solicitud_producto (id_cliente);
CREATE INDEX ix_solicitud_producto_id_usuario ON electronica_az.solicitud_producto (id_usuario);
CREATE INDEX ix_solicitud_producto_id_producto ON electronica_az.solicitud_producto (id_producto);
CREATE INDEX ix_solicitud_producto_id_modelo ON electronica_az.solicitud_producto (id_modelo);

-- Historiales y filtros habituales.
CREATE INDEX ix_venta_fecha_hora ON electronica_az.venta (fecha_hora);
CREATE INDEX ix_compra_fecha ON electronica_az.compra (fecha);
CREATE INDEX ix_movimiento_producto_fecha ON electronica_az.movimiento_inventario (id_producto, fecha_hora);
CREATE INDEX ix_bitacora_fecha_hora ON electronica_az.registro_bitacora (fecha_hora);
CREATE INDEX ix_solicitud_estado_fecha ON electronica_az.solicitud_producto (estado, fecha_hora);

-- Comentarios del modelo.
COMMENT ON SCHEMA electronica_az IS 'Electronica Central AZ: tablas del modelo original, importes en BOB';
COMMENT ON COLUMN electronica_az.usuario.hash_contrasena IS 'Hash generado por el backend; nunca una contrasena en texto plano';
COMMENT ON COLUMN electronica_az.existencia.id_producto IS 'PK/FK compartida: una existencia por producto';
COMMENT ON COLUMN electronica_az.comprobante.id_venta IS 'PK/FK compartida: como maximo un comprobante por venta';
COMMENT ON COLUMN electronica_az.detalle_venta.costo_unitario_historico IS 'Costo promedio en BOB copiado al confirmar la venta; no recalcular con costos actuales';
COMMENT ON COLUMN electronica_az.pago.referencia_externa IS 'Referencia opcional de comprobacion manual; no implica conexion con pasarela';
COMMENT ON COLUMN electronica_az.solicitud_producto.id_producto IS 'Opcional: se puede solicitar un producto aun no incorporado al catalogo';
COMMENT ON TABLE electronica_az.compatibilidad IS 'Relacion del producto con modelos compatibles; pareja unica por PK compuesta';

COMMIT;

-- Verificacion informativa: debe devolver 24 tablas.
SELECT count(*) AS total_tablas
FROM information_schema.tables
WHERE table_schema = 'electronica_az' AND table_type = 'BASE TABLE';

-- REGLAS A IMPLEMENTAR EN LOS SERVICIOS NODE.JS (no las impone este DDL):
-- 1. Crear Producto y Existencia en una misma transaccion.
-- 2. Asignar al menos un rol a cada usuario y restringir operaciones por permisos.
--    Correo y nombre de usuario deben normalizarse antes de registrarse.
-- 3. Registrar al menos un detalle por compra/venta; no editar documentos confirmados.
-- 4. Confirmar venta: bloquear existencia, verificar stock, guardar costo historico,
--    descontar stock y generar movimiento/comprobante atomicamente. Evitar reintentos duplicados.
-- 5. Recibir compra una sola vez: incrementar stock y actualizar costo promedio
--    junto con movimientos en una transaccion. No hay trigger automatico de stock.
-- 6. Validar cantidades enteras si la unidad no permite fracciones.
-- 7. Validar que modelo propio y marca coincidan; no inferir compatibilidad tecnica.
-- 8. En movimientos con origen, el producto debe coincidir con el detalle indicado.
--    Ambos origenes NULL corresponden a ajustes; conservar motivo y responsable.
-- 9. Validar suma de pagos confirmados <= total de venta, con control de concurrencia.
--    No anular una venta pagada sin definir el flujo de reembolso.
-- 10. Controlar transiciones de estado, registrar auditoria y proteger su inmutabilidad.
-- 11. Totales, subtotales, saldo y ganancia son calculados; no se almacenan como columnas.
--     Reporte y las clases Servicio no requieren tablas.
--
-- Fuentes de sintaxis / ejecucion:
-- https://www.postgresql.org/docs/current/functions-uuid.html
-- https://supabase.com/docs/guides/database/tables

-- #############################################################################
-- >>> 002_phase0_extensions.sql
-- #############################################################################

-- Extensiones aprobadas durante Fase 0.
-- Ejecutar solamente después de 001_schema_reference.sql y solo en una base de prueba revisada.
-- Esta migración no se ejecuta desde la API.

BEGIN;

CREATE TABLE electronica_az.sesion_usuario (
    id_sesion uuid NOT NULL DEFAULT gen_random_uuid(),
    token_hash text NOT NULL,
    creada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en timestamptz NOT NULL,
    ultima_actividad_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revocada_en timestamptz,
    id_usuario uuid NOT NULL,
    CONSTRAINT pk_sesion_usuario PRIMARY KEY (id_sesion),
    CONSTRAINT uq_sesion_usuario_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_sesion_usuario_usuario FOREIGN KEY (id_usuario)
        REFERENCES electronica_az.usuario (id_usuario)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE electronica_az.restablecimiento_acceso (
    id_restablecimiento uuid NOT NULL DEFAULT gen_random_uuid(),
    hash_contrasena_temporal text NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en timestamptz NOT NULL,
    usado_en timestamptz,
    id_usuario_objetivo uuid NOT NULL,
    id_usuario_responsable uuid NOT NULL,
    CONSTRAINT pk_restablecimiento_acceso PRIMARY KEY (id_restablecimiento),
    CONSTRAINT fk_restablecimiento_objetivo FOREIGN KEY (id_usuario_objetivo)
        REFERENCES electronica_az.usuario (id_usuario)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_restablecimiento_responsable FOREIGN KEY (id_usuario_responsable)
        REFERENCES electronica_az.usuario (id_usuario)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE electronica_az.idempotencia_operacion (
    id_idempotencia uuid NOT NULL DEFAULT gen_random_uuid(),
    clave varchar(255) NOT NULL,
    operacion varchar(120) NOT NULL,
    hash_solicitud text NOT NULL,
    estado_http integer NOT NULL,
    respuesta jsonb NOT NULL,
    creada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario uuid NOT NULL,
    CONSTRAINT pk_idempotencia_operacion PRIMARY KEY (id_idempotencia),
    CONSTRAINT uq_idempotencia_operacion UNIQUE (id_usuario, operacion, clave),
    CONSTRAINT fk_idempotencia_usuario FOREIGN KEY (id_usuario)
        REFERENCES electronica_az.usuario (id_usuario)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE electronica_az.entrega (
    id_entrega uuid NOT NULL DEFAULT gen_random_uuid(),
    fecha_hora timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_venta uuid NOT NULL,
    id_usuario uuid NOT NULL,
    CONSTRAINT pk_entrega PRIMARY KEY (id_entrega),
    CONSTRAINT uq_entrega_venta UNIQUE (id_venta),
    CONSTRAINT fk_entrega_venta FOREIGN KEY (id_venta)
        REFERENCES electronica_az.venta (id_venta)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_entrega_usuario FOREIGN KEY (id_usuario)
        REFERENCES electronica_az.usuario (id_usuario)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX ix_sesion_usuario_activa
    ON electronica_az.sesion_usuario (id_usuario, expira_en)
    WHERE revocada_en IS NULL;
CREATE INDEX ix_restablecimiento_acceso_objetivo
    ON electronica_az.restablecimiento_acceso (id_usuario_objetivo, expira_en)
    WHERE usado_en IS NULL;

COMMENT ON TABLE electronica_az.entrega IS
    'Una entrega completa por venta; el backend validará venta confirmada y saldo cero.';
COMMENT ON TABLE electronica_az.idempotencia_operacion IS
    'Protección persistida para operaciones críticas; un cambio de contenido con la misma clave se rechaza en el backend.';

COMMIT;

-- #############################################################################
-- >>> 003_security_constraints.sql
-- #############################################################################

BEGIN;

CREATE UNIQUE INDEX uq_cliente_documento_normalizado
    ON electronica_az.cliente (lower(btrim(documento)))
    WHERE documento IS NOT NULL AND btrim(documento) <> '';

CREATE INDEX ix_registro_bitacora_fecha_usuario
    ON electronica_az.registro_bitacora (fecha_hora DESC, id_usuario);

COMMIT;

-- #############################################################################
-- >>> 004_password_change_required.sql
-- #############################################################################

BEGIN;
ALTER TABLE electronica_az.usuario
  ADD COLUMN cambio_contrasena_obligatorio boolean NOT NULL DEFAULT false;
COMMIT;

-- #############################################################################
-- >>> 005_catalog_permissions.sql
-- #############################################################################

BEGIN;

INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
  ('CATALOGO_GESTIONAR', 'Gestionar catálogos, productos y compatibilidades')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM electronica_az.rol r CROSS JOIN electronica_az.permiso p
WHERE r.nombre = 'ADMINISTRADOR' AND p.codigo = 'CATALOGO_GESTIONAR'
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX uq_categoria_nombre_normalizado ON electronica_az.categoria(lower(btrim(nombre)));
CREATE UNIQUE INDEX uq_marca_nombre_normalizado ON electronica_az.marca(lower(btrim(nombre)));
CREATE UNIQUE INDEX uq_unidad_simbolo_normalizado ON electronica_az.unidad_medida(lower(btrim(simbolo)));
CREATE UNIQUE INDEX uq_ubicacion_codigo_normalizado ON electronica_az.ubicacion(lower(btrim(codigo)));
CREATE UNIQUE INDEX uq_modelo_marca_nombre_normalizado ON electronica_az.modelo(id_marca, lower(btrim(nombre)));
CREATE INDEX ix_producto_busqueda_publica ON electronica_az.producto(activo, codigo, nombre);

COMMIT;

-- #############################################################################
-- >>> 006_inventory_permissions.sql
-- #############################################################################

BEGIN;

INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
  ('INVENTARIO_CONSULTAR', 'Consultar existencias, alertas y movimientos de inventario'),
  ('INVENTARIO_GESTIONAR', 'Ajustar stock, mínimos y aperturas de inventario')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM electronica_az.rol r
CROSS JOIN electronica_az.permiso p
WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR')
  AND p.codigo IN ('INVENTARIO_CONSULTAR', 'INVENTARIO_GESTIONAR')
ON CONFLICT DO NOTHING;

INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM electronica_az.rol r
JOIN electronica_az.permiso p ON p.codigo = 'INVENTARIO_CONSULTAR'
WHERE r.nombre = 'VENDEDOR'
ON CONFLICT DO NOTHING;

COMMIT;

-- #############################################################################
-- >>> 007_purchases_permissions.sql
-- #############################################################################

BEGIN;

INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
  ('COMPRAS_GESTIONAR', 'Gestionar proveedores, compras, recepción y cancelación')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM electronica_az.rol r
CROSS JOIN electronica_az.permiso p
WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR')
  AND p.codigo = 'COMPRAS_GESTIONAR'
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedor_documento_normalizado
  ON electronica_az.proveedor (lower(btrim(documento)))
  WHERE documento IS NOT NULL AND btrim(documento) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_detalle_compra_producto
  ON electronica_az.detalle_compra (id_compra, id_producto);

COMMIT;

-- #############################################################################
-- >>> 008_sales_permissions.sql
-- #############################################################################

BEGIN;

INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
  ('VENTAS_GESTIONAR', 'Gestionar ventas, pagos, comprobante y entrega')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM electronica_az.rol r
CROSS JOIN electronica_az.permiso p
WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR', 'VENDEDOR')
  AND p.codigo = 'VENTAS_GESTIONAR'
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_detalle_venta_producto
  ON electronica_az.detalle_venta (id_venta, id_producto);

COMMIT;

-- #############################################################################
-- >>> 009_requests_permissions.sql
-- #############################################################################

BEGIN;

INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
  ('SOLICITUDES_GESTIONAR', 'Registrar y consultar solicitudes de producto (personal)')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM electronica_az.rol r
CROSS JOIN electronica_az.permiso p
WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR', 'VENDEDOR')
  AND p.codigo = 'SOLICITUDES_GESTIONAR'
ON CONFLICT DO NOTHING;

COMMIT;

-- #############################################################################
-- >>> 010_reports_permissions.sql
-- #############################################################################

BEGIN;

INSERT INTO electronica_az.permiso(codigo, descripcion) VALUES
  ('REPORTES_CONSULTAR', 'Consultar y exportar reportes de ventas, ganancias, inventario y rotación')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO electronica_az.rol_permiso(id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM electronica_az.rol r
CROSS JOIN electronica_az.permiso p
WHERE r.nombre IN ('ADMINISTRADOR', 'DESARROLLADOR')
  AND p.codigo = 'REPORTES_CONSULTAR'
ON CONFLICT DO NOTHING;

COMMIT;

-- #############################################################################
-- >>> 011_login_lockout.sql
-- #############################################################################

-- Bloqueo de cuenta: 3 intentos fallidos => bloqueo de 3 minutos (la logica esta en authService.js).
BEGIN;

ALTER TABLE electronica_az.usuario
  ADD COLUMN IF NOT EXISTS intentos_fallidos integer NOT NULL DEFAULT 0
    CONSTRAINT ck_usuario_intentos_fallidos CHECK (intentos_fallidos >= 0),
  ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz;

COMMIT;

-- #############################################################################
-- >>> 012_admin_panel.sql
-- #############################################################################

-- Soporte del panel de administracion (frontend): nombre y fecha de alta de usuarios,
-- jerarquia/estado de categorias y estado de unidades de medida.
BEGIN;

ALTER TABLE electronica_az.usuario
  ADD COLUMN IF NOT EXISTS nombre varchar(120),
  ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE electronica_az.usuario SET nombre = nombre_usuario WHERE nombre IS NULL;

ALTER TABLE electronica_az.categoria
  ADD COLUMN IF NOT EXISTS id_categoria_padre uuid,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_categoria_padre'
  ) THEN
    ALTER TABLE electronica_az.categoria
      ADD CONSTRAINT fk_categoria_padre FOREIGN KEY (id_categoria_padre)
        REFERENCES electronica_az.categoria (id_categoria)
        ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_categoria_no_propia_padre'
  ) THEN
    ALTER TABLE electronica_az.categoria
      ADD CONSTRAINT ck_categoria_no_propia_padre CHECK (id_categoria_padre IS NULL OR id_categoria_padre <> id_categoria);
  END IF;
END $$;

ALTER TABLE electronica_az.unidad_medida
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

COMMIT;

-- =============================================================================
-- Fin bundle. Verificar:
--   SELECT nspname FROM pg_namespace WHERE nspname = 'electronica_az';
--   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'electronica_az';
-- Siguiente paso: npm run bootstrap:security
-- =============================================================================
