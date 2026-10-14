import { z } from 'zod';

const nameDto = z.string().trim().min(1).max(120);
const optionalDescriptionDto = z.string().trim().max(2_000).optional();
const optionalTextDto = z.string().trim().max(120).optional();
const uuidDto = z.string().uuid();

export const idParamsDto = z.object({
  id: uuidDto,
});

export const productIdParamsDto = idParamsDto;

export const compatibilityParamsDto = z.object({
  id: uuidDto,
  idModelo: uuidDto,
});

export const stateDto = z.object({ activo: z.boolean() });

export const createCategoryDto = z.object({
  nombre: nameDto,
  descripcion: optionalDescriptionDto,
  idCategoriaPadre: uuidDto.nullable().optional(),
  activo: z.boolean().default(true),
});

export const updateCategoryDto = z.object({
  nombre: nameDto,
  descripcion: z.string().trim().max(2_000).default(''),
  idCategoriaPadre: uuidDto.nullable().default(null),
  activo: z.boolean().optional(),
});

export const createBrandDto = z.object({
  nombre: nameDto,
});

export const createUnitDto = z.object({
  nombre: nameDto,
  simbolo: nameDto,
  permiteFraccion: z.boolean().default(false),
  activo: z.boolean().default(true),
});

export const updateUnitDto = z.object({
  nombre: nameDto,
  simbolo: nameDto,
  permiteFraccion: z.boolean().optional(),
  activo: z.boolean().optional(),
});

export const createLocationDto = z.object({
  codigo: nameDto,
  pasillo: nameDto,
  estante: nameDto,
});

export const createModelDto = z.object({
  nombre: nameDto,
  descripcion: optionalDescriptionDto,
  idMarca: uuidDto,
});

// El panel de administracion envia `marca` y `modelo` como texto y no indica codigo ni ubicacion:
// el codigo se genera (PRD-00001) y la ubicacion queda como SIN-UBICACION hasta que se asigne.
export const createProductDto = z.object({
  codigo: nameDto.optional(),
  nombre: nameDto,
  descripcion: optionalDescriptionDto,
  precioVenta: z.coerce.number().finite().nonnegative(),
  idCategoria: uuidDto,
  idUnidadMedida: uuidDto,
  idUbicacion: uuidDto.optional(),
  idMarca: uuidDto.optional(),
  idModelo: uuidDto.optional(),
  marca: optionalTextDto,
  modelo: optionalTextDto,
  stockMinimo: z.coerce.number().finite().nonnegative().default(0),
  activo: z.boolean().default(true),
});

export const updateProductDto = z.object({
  nombre: nameDto.optional(),
  descripcion: z.string().trim().max(2_000).optional(),
  precioVenta: z.coerce.number().finite().nonnegative().optional(),
  idCategoria: uuidDto.optional(),
  idUnidadMedida: uuidDto.optional(),
  idMarca: uuidDto.nullable().optional(),
  marca: optionalTextDto,
  modelo: optionalTextDto,
  activo: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'Indique al menos un campo' });

export const createCompatibilityDto = z.object({ idModelo: uuidDto, observaciones: optionalDescriptionDto });
export const publicProductsQueryDto = z.object({
  buscar: z.string().trim().min(1).max(120).optional(),
  idCategoria: uuidDto.optional(),
  idMarca: uuidDto.optional(),
  idModelo: uuidDto.optional(),
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().positive().max(100).default(20),
});
