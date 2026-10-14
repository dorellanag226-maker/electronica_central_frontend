import { errorCodes } from '../config/errorCodes.js';
import {
  categoryById,
  createBrand,
  createCategory,
  createCompatibility,
  createLocation,
  createModel,
  createProduct,
  createUnit,
  deleteCompatibility,
  getCatalogFilters,
  getPublicProductById,
  getPublicProducts,
  listAdminProducts,
  listCategories,
  listUnits,
  setCategoryActive,
  setUnitActive,
  unitById,
  updateCategory,
  updateProduct,
  updateUnit,
} from '../repositories/catalogRepository.js';
import { AppError } from '../utils/AppError.js';
import { businessRule, conflict, normalizeText, notFound } from '../utils/errors.js';

const translateDatabaseError = (error) => {
  if (error.code === '23505') throw new AppError(errorCodes.CONFLICT);
  if (error.code === '23503') throw new AppError(errorCodes.NOT_FOUND);
  if (error.code === 'PRODUCT_DUPLICATED') {
    throw conflict('Ya existe un producto con ese nombre y esa marca.', 'nombre');
  }
  if (error.code === 'MODEL_WITHOUT_BRAND') {
    throw businessRule('Para indicar un modelo debe indicar la marca.', 'marca');
  }
  if (error.code === 'MODEL_BRAND_MISMATCH') {
    throw new AppError(errorCodes.BUSINESS_RULE, 422, {
      reason: 'MODEL_BRAND_MISMATCH',
      ...(error.details ?? {}),
    });
  }
  throw error;
};

const getCreatedRow = async (repository, parameters) => {
  try {
    return (await repository(...parameters)).rows[0];
  } catch (error) {
    return translateDatabaseError(error);
  }
};

// ---------- Categorias ----------

// Jerarquia de maximo dos niveles, sin ciclos (las mismas reglas que valida el panel).
const validateCategory = async ({ nombre, idCategoriaPadre }, idActual) => {
  const all = await listCategories();
  if (all.some((c) => c.id_categoria !== idActual && normalizeText(c.nombre) === normalizeText(nombre))) {
    throw conflict('Ya existe una categoría con ese nombre.', 'nombre');
  }
  if (!idCategoriaPadre) return;

  const campo = 'categoriaPadreId';
  const padre = all.find((c) => c.id_categoria === idCategoriaPadre);
  if (!padre) throw businessRule('La categoría padre seleccionada no existe.', campo);
  if (idActual === undefined) {
    if (padre.id_categoria_padre) {
      throw businessRule('La categoría padre debe ser una categoría principal.', campo, 'PARENT_MUST_BE_ROOT');
    }
    return;
  }
  if (padre.id_categoria === idActual) {
    throw businessRule('Una categoría no puede ser su propia categoría padre.', campo, 'CATEGORY_SELF_PARENT');
  }
  if (padre.id_categoria_padre === idActual) {
    throw businessRule('Relación circular: la categoría seleccionada es subcategoría de esta.', campo, 'CATEGORY_CIRCULAR');
  }
  if (all.some((c) => c.id_categoria_padre === idActual)) {
    throw businessRule(
      'Esta categoría tiene subcategorías, por lo que no puede depender de otra (máximo dos niveles).',
      campo,
      'CATEGORY_HAS_SUBCATEGORIES',
    );
  }
  if (padre.id_categoria_padre) {
    throw businessRule('La categoría padre debe ser una categoría principal.', campo, 'PARENT_MUST_BE_ROOT');
  }
};

export const listCategoriesService = listCategories;

export const createCategoryService = async (data) => {
  await validateCategory(data);
  return getCreatedRow(createCategory, [data.nombre, data.descripcion ?? '', data.idCategoriaPadre, data.activo]);
};

export const updateCategoryService = async (idCategoria, data) => {
  if (!(await categoryById(idCategoria))) throw notFound('La categoría no existe.');
  await validateCategory(data, idCategoria);
  return getCreatedRow(updateCategory, [idCategoria, data.nombre, data.descripcion, data.idCategoriaPadre, data.activo]);
};

export const setCategoryStateService = async (idCategoria, activo) => {
  const result = await setCategoryActive(idCategoria, activo);
  if (!result.rows[0]) throw notFound('La categoría no existe.');
  return result.rows[0];
};

// ---------- Unidades de medida ----------

const validateUnit = async ({ nombre, simbolo }, idActual) => {
  const all = await listUnits();
  const others = all.filter((u) => u.id_unidad_medida !== idActual);
  if (others.some((u) => normalizeText(u.nombre) === normalizeText(nombre))) {
    throw conflict('Ya existe una unidad con ese nombre.', 'nombre');
  }
  if (others.some((u) => normalizeText(u.simbolo) === normalizeText(simbolo))) {
    throw conflict('Ya existe una unidad con esa abreviatura.', 'abreviatura');
  }
};

export const listUnitsService = listUnits;

export const createUnitService = async (data) => {
  await validateUnit(data);
  return getCreatedRow(createUnit, [data.nombre, data.simbolo, data.permiteFraccion, data.activo]);
};

export const updateUnitService = async (idUnidad, data) => {
  if (!(await unitById(idUnidad))) throw notFound('La unidad de medida no existe.');
  await validateUnit(data, idUnidad);
  return getCreatedRow(updateUnit, [idUnidad, data.nombre, data.simbolo, data.activo, data.permiteFraccion]);
};

export const setUnitStateService = async (idUnidad, activo) => {
  const result = await setUnitActive(idUnidad, activo);
  if (!result.rows[0]) throw notFound('La unidad de medida no existe.');
  return result.rows[0];
};

export const createBrandService = ({ nombre }) => getCreatedRow(createBrand, [nombre]);
export const createLocationService = ({ codigo, pasillo, estante }) => (
  getCreatedRow(createLocation, [codigo, pasillo, estante])
);
export const createModelService = ({ nombre, descripcion, idMarca }) => (
  getCreatedRow(createModel, [nombre, descripcion, idMarca])
);

// ---------- Productos ----------

export const listProductsService = listAdminProducts;

const assertReferences = async ({ idCategoria, idUnidadMedida }) => {
  if (idCategoria && !(await categoryById(idCategoria))) {
    throw businessRule('La categoría seleccionada no existe.', 'categoriaId');
  }
  if (idUnidadMedida && !(await unitById(idUnidadMedida))) {
    throw businessRule('La unidad de medida seleccionada no existe.', 'unidadId');
  }
};

export const createProductService = async (data) => {
  await assertReferences(data);
  try {
    return await createProduct(data);
  } catch (error) {
    return translateDatabaseError(error);
  }
};

export const updateProductService = async (idProducto, data) => {
  await assertReferences(data);
  try {
    const product = await updateProduct(idProducto, data);
    if (!product) throw notFound('El producto no existe.');
    return product;
  } catch (error) {
    if (error instanceof AppError) throw error;
    return translateDatabaseError(error);
  }
};

export const createCompatibilityService = ({ idProducto, idModelo, observaciones }) => (
  getCreatedRow(createCompatibility, [idProducto, idModelo, observaciones])
);

export const deleteCompatibilityService = async (idProducto, idModelo) => {
  const result = await deleteCompatibility(idProducto, idModelo);
  if (!result.rows[0]) throw new AppError(errorCodes.NOT_FOUND);
  return result.rows[0];
};

export const getCatalogFiltersService = () => getCatalogFilters();

export const getPublicProductsService = async ({ buscar, idCategoria, idMarca, idModelo, pagina, limite }) => {
  const rows = await getPublicProducts(
    buscar, idCategoria, idMarca, idModelo, limite, (pagina - 1) * limite,
  );
  const total = Number(rows[0]?.total ?? 0);
  const products = rows.map((row) => {
    const product = { ...row };
    delete product.total;
    return product;
  });
  return { products, total, pagina, limite };
};

export const getPublicProductByIdService = async (idProducto) => {
  const result = await getPublicProductById(idProducto);
  if (!result[0]) throw new AppError(errorCodes.NOT_FOUND);
  return result[0];
};
