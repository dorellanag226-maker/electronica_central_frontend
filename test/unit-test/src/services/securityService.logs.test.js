import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../../src/repositories/securityRepository.js', async (importOriginal) => {
  const original = await importOriginal();
  return Object.fromEntries(Object.keys(original).map((name) => [name, vi.fn()]));
});
vi.mock('../../../../src/repositories/authRepository.js', () => ({
  clearLoginFailures: vi.fn(),
  setPasswordChangeRequired: vi.fn(),
}));

import { listLogDto } from '../../../../src/dto/security.dto.js';
import {
  listLogFilterValues,
  listLogs,
  logById,
} from '../../../../src/repositories/securityRepository.js';
import {
  getLogService,
  listLogFiltersService,
  listLogsService,
} from '../../../../src/services/securityService.js';

describe('securityService bitacora (CU-3)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('converts La Paz days to an inclusive UTC range and paginates', async () => {
    listLogs.mockResolvedValue([{ id_registro: 'r1', accion: 'INICIO_SESION', total: '41' }]);

    const result = await listLogsService({
      desde: '2026-11-01', hasta: '2026-11-01', accion: 'INICIO_SESION', pagina: 3, limite: 20,
    });

    const [filtros, limite, desplazamiento] = listLogs.mock.calls[0];
    expect(filtros.inicio.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(filtros.finExclusivo.toISOString()).toBe('2026-11-02T04:00:00.000Z');
    expect(filtros).toMatchObject({ accion: 'INICIO_SESION', idUsuario: null, resultado: null });
    expect([limite, desplazamiento]).toEqual([20, 40]);
    expect(result).toEqual({
      items: [{ id_registro: 'r1', accion: 'INICIO_SESION' }],
      meta: { pagina: 3, limite: 20, total: 41 },
    });
  });

  test('without filters it sends nulls and reports zero when there are no rows', async () => {
    listLogs.mockResolvedValue([]);
    const result = await listLogsService({ pagina: 1, limite: 100 });
    expect(listLogs.mock.calls[0][0]).toEqual({
      inicio: null, finExclusivo: null, idUsuario: null, accion: null, resultado: null,
    });
    expect(result.meta.total).toBe(0);
  });

  test('returns not found for an unknown log id', async () => {
    logById.mockResolvedValue(undefined);
    await expect(getLogService('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({ code: 'NF001' });
  });

  test('splits filter values into actions and results', async () => {
    listLogFilterValues.mockResolvedValue([
      { tipo: 'ACCION', valor: 'INICIO_SESION' },
      { tipo: 'ACCION', valor: 'PRODUCTO_CREADO' },
      { tipo: 'RESULTADO', valor: 'OK' },
    ]);
    await expect(listLogFiltersService()).resolves.toEqual({
      acciones: ['INICIO_SESION', 'PRODUCTO_CREADO'],
      resultados: ['OK'],
    });
  });

  test('query validation rejects a start date after the end date and applies defaults', () => {
    expect(listLogDto.safeParse({ desde: '2026-11-05', hasta: '2026-11-01' }).success).toBe(false);
    expect(listLogDto.parse({})).toEqual({ pagina: 1, limite: 100 });
    expect(listLogDto.safeParse({ limite: '5000' }).success).toBe(false);
  });
});
