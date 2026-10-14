import {
  createBrandService,
  createCategoryService,
  createCompatibilityService,
  createLocationService,
  createModelService,
  createProductService,
  createUnitService,
  deleteCompatibilityService,
  getCatalogFiltersService,
  getPublicProductByIdService,
  getPublicProductsService,
  listCategoriesService,
  listProductsService,
  listUnitsService,
  setCategoryStateService,
  setUnitStateService,
  updateCategoryService,
  updateProductService,
  updateUnitService,
} from '../services/catalogService.js';
import { addLog } from '../repositories/securityRepository.js';
import { sendError } from '../utils/sendError.js';

const createCatalogController = (service, audit = null) => async (req, res) => {
  try {
    const data = await service(req.validated.body);
    if (audit) {
      const { accion, objeto } = audit(data);
      await addLog(accion, objeto, 'OK', req.auth.usuario.id, req.ip ?? null).catch(() => undefined);
    }
    return res.status(201).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const createCategoryController = createCatalogController(
  createCategoryService,
  (data) => ({ accion: 'CATEGORIA_CREADA', objeto: `Categoría ${data.nombre}` }),
);
export const createBrandController = createCatalogController(createBrandService);
export const createUnitController = createCatalogController(
  createUnitService,
  (data) => ({ accion: 'UNIDAD_CREADA', objeto: `Unidad ${data.nombre} (${data.simbolo})` }),
);
export const createLocationController = createCatalogController(createLocationService);
export const createModelController = createCatalogController(createModelService);
export const createProductController = createCatalogController(
  createProductService,
  (data) => ({ accion: 'PRODUCTO_CREADO', objeto: `Producto ${data.nombre}` }),
);

// `audit` devuelve la accion y el objeto que se anotan en la bitacora cuando la operacion tiene exito.
// La bitacora es auxiliar: si falla el registro, la respuesta al usuario no cambia.
const respond = (fn, status = 200, audit = null) => async (req, res) => {
  try {
    const data = await fn(req);
    if (audit) {
      const { accion, objeto } = audit(req, data);
      await addLog(accion, objeto, 'OK', req.auth.usuario.id, req.ip ?? null).catch(() => undefined);
    }
    return res.status(status).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

const stateAction = (activo, activada, desactivada) => (activo ? activada : desactivada);
const onlyState = (body) => Object.keys(body).length === 1 && 'activo' in body;

export const listCategoriesController = respond(() => listCategoriesService());
export const updateCategoryController = respond(
  (req) => updateCategoryService(req.validated.params.id, req.validated.body),
  200,
  (_req, data) => ({ accion: 'CATEGORIA_ACTUALIZADA', objeto: `Categoría ${data.nombre}` }),
);
export const setCategoryStateController = respond(
  (req) => setCategoryStateService(req.validated.params.id, req.validated.body.activo),
  200,
  (req, data) => ({
    accion: stateAction(req.validated.body.activo, 'CATEGORIA_ACTIVADA', 'CATEGORIA_DESACTIVADA'),
    objeto: `Categoría ${data.nombre}`,
  }),
);

export const listUnitsController = respond(() => listUnitsService());
export const updateUnitController = respond(
  (req) => updateUnitService(req.validated.params.id, req.validated.body),
  200,
  (_req, data) => ({ accion: 'UNIDAD_ACTUALIZADA', objeto: `Unidad ${data.nombre} (${data.simbolo})` }),
);
export const setUnitStateController = respond(
  (req) => setUnitStateService(req.validated.params.id, req.validated.body.activo),
  200,
  (req, data) => ({
    accion: stateAction(req.validated.body.activo, 'UNIDAD_ACTIVADA', 'UNIDAD_DESACTIVADA'),
    objeto: `Unidad ${data.nombre} (${data.simbolo})`,
  }),
);

export const listProductsController = respond(() => listProductsService());
export const updateProductController = respond(
  (req) => updateProductService(req.validated.params.id, req.validated.body),
  200,
  (req, data) => ({
    accion: onlyState(req.validated.body)
      ? stateAction(req.validated.body.activo, 'PRODUCTO_ACTIVADO', 'PRODUCTO_DESACTIVADO')
      : 'PRODUCTO_ACTUALIZADO',
    objeto: `Producto ${data.nombre}`,
  }),
);

export const createCompatibilityController = async (req, res) => {
  try {
    const data = await createCompatibilityService({
      idProducto: req.validated.params.id,
      ...req.validated.body,
    });
    return res.status(201).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const deleteCompatibilityController = async (req, res) => {
  try {
    const data = await deleteCompatibilityService(req.validated.params.id, req.validated.params.idModelo);
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getPublicProductsController = async (req, res) => {
  try {
    const result = await getPublicProductsService(req.validated.query);
    return res.status(200).json({
      data: result.products,
      meta: { pagina: result.pagina, limite: result.limite, total: result.total },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getPublicProductByIdController = async (req, res) => {
  try {
    return res.status(200).json({ data: await getPublicProductByIdService(req.validated.params.id) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const getCatalogFiltersController = async (_req, res) => {
  try {
    const rows = await getCatalogFiltersService();
    const data = { categorias: [], marcas: [], modelos: [] };
    for (const row of rows) data[`${row.tipo.toLowerCase()}s`].push({ id: row.id, nombre: row.nombre });
    return res.status(200).json({ data });
  } catch (error) {
    return sendError(res, error);
  }
};
