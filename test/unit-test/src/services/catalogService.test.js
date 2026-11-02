import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../../src/repositories/catalogRepository.js', () => ({
  adminProductById: vi.fn(),
  assignLocationToProducts: vi.fn(),
  categoryById: vi.fn(),
  createBrand: vi.fn(),
  createCategory: vi.fn(),
  createCompatibility: vi.fn(),
  createLocation: vi.fn(),
  createModel: vi.fn(),
  createProduct: vi.fn(),
  createUnit: vi.fn(),
  deleteCompatibility: vi.fn(),
  getCatalogFilters: vi.fn(),
  getPublicProductById: vi.fn(),
  getPublicProducts: vi.fn(),
  listAdminProducts: vi.fn(),
  listBrands: vi.fn(),
  listCategories: vi.fn(),
  listLocations: vi.fn(),
  listModels: vi.fn(),
  listUnits: vi.fn(),
  locationById: vi.fn(),
  modelById: vi.fn(),
  setCategoryActive: vi.fn(),
  setUnitActive: vi.fn(),
  unitById: vi.fn(),
  updateBrand: vi.fn(),
  updateCategory: vi.fn(),
  updateLocation: vi.fn(),
  updateModel: vi.fn(),
  updateProduct: vi.fn(),
  updateUnit: vi.fn(),
}));

import {
  assignLocationToProducts,
  getPublicProductById,
  getPublicProducts,
  locationById,
  modelById,
  updateBrand,
  updateLocation,
  updateModel,
  updateProduct,
} from '../../../../src/repositories/catalogRepository.js';
import {
  assignLocationService,
  getPublicProductByIdService,
  getPublicProductsService,
  updateBrandService,
  updateLocationService,
  updateModelService,
  updateProductService,
} from '../../../../src/services/catalogService.js';

const uniqueViolation = () => Object.assign(new Error('duplicate'), { code: '23505' });

describe('catalogService', () => {
  beforeEach(() => vi.clearAllMocks());

  test('calculates the database offset and omits internal pagination helper fields', async () => {
    getPublicProducts.mockResolvedValue([{
      id_producto: 'product-id',
      nombre: 'Cable HDMI',
      disponibilidad: 'DISPONIBLE',
      total: '1',
    }]);

    const result = await getPublicProductsService({ pagina: 2, limite: 10 });

    expect(getPublicProducts).toHaveBeenCalledWith(undefined, undefined, undefined, undefined, 10, 10);
    expect(result).toEqual({
      products: [{ id_producto: 'product-id', nombre: 'Cable HDMI', disponibilidad: 'DISPONIBLE' }],
      total: 1,
      pagina: 2,
      limite: 10,
    });
  });

  test('reports a duplicated brand name as a conflict on the nombre field', async () => {
    updateBrand.mockRejectedValue(uniqueViolation());
    await expect(updateBrandService('b1', { nombre: 'Samsung' }))
      .rejects.toMatchObject({ code: 'CF001', details: { campo: 'nombre' } });
  });

  test('returns not found when the brand to edit does not exist', async () => {
    updateBrand.mockResolvedValue({ rows: [] });
    await expect(updateBrandService('b1', { nombre: 'Samsung' })).rejects.toMatchObject({ code: 'NF001' });
  });

  test('refuses to move a model with products to another brand', async () => {
    modelById.mockResolvedValue({ id_modelo: 'm1', id_marca: 'b1', total_productos: 3 });
    await expect(updateModelService('m1', { idMarca: 'b2' }))
      .rejects.toMatchObject({ code: 'UE001', details: { reason: 'MODEL_HAS_PRODUCTS' } });
    expect(updateModel).not.toHaveBeenCalled();
  });

  test('renames a model without touching its brand', async () => {
    modelById.mockResolvedValue({ id_modelo: 'm1', id_marca: 'b1', total_productos: 3 });
    updateModel.mockResolvedValue({ rows: [{ id_modelo: 'm1', nombre: 'A10s' }] });
    await expect(updateModelService('m1', { nombre: 'A10s' })).resolves.toEqual({ id_modelo: 'm1', nombre: 'A10s' });
  });

  test('does not allow editing the system SIN-UBICACION location', async () => {
    locationById.mockResolvedValue({ id_ubicacion: 'l0', codigo: 'SIN-UBICACION', es_predeterminada: true });
    await expect(updateLocationService('l0', { pasillo: '3' })).rejects.toMatchObject({ code: 'UE001' });
    expect(updateLocation).not.toHaveBeenCalled();
  });

  test('assigns a location to several products, ignoring repeated ids', async () => {
    locationById.mockResolvedValue({ id_ubicacion: 'l1', codigo: 'A-01', es_predeterminada: false });
    assignLocationToProducts.mockResolvedValue({ missing: [], actualizados: 2 });
    await expect(assignLocationService('l1', { idProductos: ['p1', 'p2', 'p1'] }))
      .resolves.toEqual({ idUbicacion: 'l1', codigo: 'A-01', actualizados: 2 });
    expect(assignLocationToProducts).toHaveBeenCalledWith('l1', ['p1', 'p2']);
  });

  test('reports which products do not exist when assigning a location', async () => {
    locationById.mockResolvedValue({ id_ubicacion: 'l1', codigo: 'A-01', es_predeterminada: false });
    assignLocationToProducts.mockResolvedValue({ missing: ['p9'], actualizados: 0 });
    await expect(assignLocationService('l1', { idProductos: ['p1', 'p9'] }))
      .rejects.toMatchObject({ code: 'NF001', details: { idProductos: ['p9'] } });
  });

  test('rejects editing a product with a location that does not exist', async () => {
    locationById.mockResolvedValue(undefined);
    await expect(updateProductService('p1', { idUbicacion: 'l404' }))
      .rejects.toMatchObject({ code: 'UE001', details: { campo: 'idUbicacion' } });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  test('returns the product detail with its location and compatible models', async () => {
    const detail = {
      id_producto: 'p1',
      ubicacion: { codigo: 'A-01', pasillo: '1', estante: '2' },
      compatibles: [{ idModelo: 'm1', modelo: 'A10', marca: 'Samsung', observaciones: null }],
    };
    getPublicProductById.mockResolvedValue([detail]);
    await expect(getPublicProductByIdService('p1')).resolves.toEqual(detail);
  });
});
