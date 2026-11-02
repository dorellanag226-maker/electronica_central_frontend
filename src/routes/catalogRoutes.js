import { Router } from 'express';
import {
  assignLocationController,
  createBrandController,
  createCategoryController,
  createCompatibilityController,
  createLocationController,
  createModelController,
  createProductController,
  createUnitController,
  deleteCompatibilityController,
  getCatalogFiltersController,
  getPublicProductByIdController,
  getPublicProductsController,
  listBrandsController,
  listCategoriesController,
  listLocationsController,
  listModelsController,
  listProductsController,
  listUnitsController,
  setCategoryStateController,
  setUnitStateController,
  updateBrandController,
  updateCategoryController,
  updateLocationController,
  updateModelController,
  updateProductController,
  updateUnitController,
} from '../controllers/catalogController.js';
import {
  assignLocationDto,
  compatibilityParamsDto,
  createBrandDto,
  createCategoryDto,
  createCompatibilityDto,
  createLocationDto,
  createModelDto,
  createProductDto,
  createUnitDto,
  idParamsDto,
  listModelsQueryDto,
  productIdParamsDto,
  publicProductsQueryDto,
  stateDto,
  updateBrandDto,
  updateCategoryDto,
  updateLocationDto,
  updateModelDto,
  updateProductDto,
  updateUnitDto,
} from '../dto/catalog.dto.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requireAnyPermission, requirePermissions } from '../middlewares/authorizationMiddleware.js';
import { validateBody, validateParams, validateQuery } from '../middlewares/validateDto.js';

const catalogRouter = Router();
// Solo administrador: crear, editar, activar/desactivar.
const manageCatalog = [authenticate, requirePermissions('CATALOGO_GESTIONAR')];
// Administrador y empleado (vendedor): solo lectura / búsqueda.
const consultCatalog = [authenticate, requireAnyPermission('CATALOGO_CONSULTAR', 'CATALOGO_GESTIONAR')];

catalogRouter.get('/catalogo/productos', validateQuery(publicProductsQueryDto), getPublicProductsController);
catalogRouter.get('/catalogo/productos/:id', validateParams(productIdParamsDto), getPublicProductByIdController);
catalogRouter.get('/catalogo/filtros', getCatalogFiltersController);

// Categorias
catalogRouter.get('/categorias', ...consultCatalog, listCategoriesController);
catalogRouter.post('/categorias', ...manageCatalog, validateBody(createCategoryDto), createCategoryController);
catalogRouter.patch(
  '/categorias/:id',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(updateCategoryDto),
  updateCategoryController,
);
catalogRouter.put(
  '/categorias/:id',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(updateCategoryDto),
  updateCategoryController,
);
catalogRouter.patch(
  '/categorias/:id/estado',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(stateDto),
  setCategoryStateController,
);

// Unidades de medida
catalogRouter.get('/unidades', ...consultCatalog, listUnitsController);
catalogRouter.post('/unidades', ...manageCatalog, validateBody(createUnitDto), createUnitController);
catalogRouter.patch(
  '/unidades/:id',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(updateUnitDto),
  updateUnitController,
);
catalogRouter.put(
  '/unidades/:id',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(updateUnitDto),
  updateUnitController,
);
catalogRouter.patch(
  '/unidades/:id/estado',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(stateDto),
  setUnitStateController,
);

// Marcas (CU-6)
catalogRouter.get('/marcas', ...consultCatalog, listBrandsController);
catalogRouter.post('/marcas', ...manageCatalog, validateBody(createBrandDto), createBrandController);
catalogRouter.patch(
  '/marcas/:id',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(updateBrandDto),
  updateBrandController,
);

// Modelos (CU-7)
catalogRouter.get('/modelos', ...consultCatalog, validateQuery(listModelsQueryDto), listModelsController);
catalogRouter.post('/modelos', ...manageCatalog, validateBody(createModelDto), createModelController);
catalogRouter.patch(
  '/modelos/:id',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(updateModelDto),
  updateModelController,
);

// Ubicaciones (CU-21)
catalogRouter.get('/ubicaciones', ...consultCatalog, listLocationsController);
catalogRouter.post('/ubicaciones', ...manageCatalog, validateBody(createLocationDto), createLocationController);
catalogRouter.patch(
  '/ubicaciones/:id',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(updateLocationDto),
  updateLocationController,
);
catalogRouter.patch(
  '/ubicaciones/:id/productos',
  ...manageCatalog,
  validateParams(idParamsDto),
  validateBody(assignLocationDto),
  assignLocationController,
);

// Productos
catalogRouter.get('/productos', ...consultCatalog, listProductsController);
catalogRouter.post('/productos', ...manageCatalog, validateBody(createProductDto), createProductController);
catalogRouter.patch(
  '/productos/:id',
  ...manageCatalog,
  validateParams(productIdParamsDto),
  validateBody(updateProductDto),
  updateProductController,
);
catalogRouter.post(
  '/productos/:id/compatibilidades',
  ...manageCatalog,
  validateParams(productIdParamsDto),
  validateBody(createCompatibilityDto),
  createCompatibilityController,
);
catalogRouter.delete(
  '/productos/:id/compatibilidades/:idModelo',
  ...manageCatalog,
  validateParams(compatibilityParamsDto),
  deleteCompatibilityController,
);

export default catalogRouter;