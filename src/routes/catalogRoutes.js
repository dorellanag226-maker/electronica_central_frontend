import { Router } from 'express';
import {
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
  listCategoriesController,
  listProductsController,
  listUnitsController,
  setCategoryStateController,
  setUnitStateController,
  updateCategoryController,
  updateProductController,
  updateUnitController,
} from '../controllers/catalogController.js';
import {
  compatibilityParamsDto,
  createBrandDto,
  createCategoryDto,
  createCompatibilityDto,
  createLocationDto,
  createModelDto,
  createProductDto,
  createUnitDto,
  idParamsDto,
  productIdParamsDto,
  publicProductsQueryDto,
  stateDto,
  updateCategoryDto,
  updateProductDto,
  updateUnitDto,
} from '../dto/catalog.dto.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { requirePermissions } from '../middlewares/authorizationMiddleware.js';
import { validateBody, validateParams, validateQuery } from '../middlewares/validateDto.js';

const catalogRouter = Router();
const manageCatalog = [authenticate, requirePermissions('CATALOGO_GESTIONAR')];

catalogRouter.get('/catalogo/productos', validateQuery(publicProductsQueryDto), getPublicProductsController);
catalogRouter.get('/catalogo/productos/:id', validateParams(productIdParamsDto), getPublicProductByIdController);
catalogRouter.get('/catalogo/filtros', getCatalogFiltersController);

// Categorias
catalogRouter.get('/categorias', ...manageCatalog, listCategoriesController);
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
catalogRouter.get('/unidades', ...manageCatalog, listUnitsController);
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

catalogRouter.post('/marcas', ...manageCatalog, validateBody(createBrandDto), createBrandController);
catalogRouter.post('/ubicaciones', ...manageCatalog, validateBody(createLocationDto), createLocationController);
catalogRouter.post('/modelos', ...manageCatalog, validateBody(createModelDto), createModelController);

// Productos
catalogRouter.get('/productos', ...manageCatalog, listProductsController);
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
