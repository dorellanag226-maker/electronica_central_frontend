import { URL } from 'node:url';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../../../src/repositories/authRepository.js', () => ({
  clearLoginFailures: vi.fn(),
  createClientAccount: vi.fn(),
  createPasswordResetToken: vi.fn(),
  createSession: vi.fn(),
  findActiveUserByEmail: vi.fn(),
  findSession: vi.fn(),
  findUserById: vi.fn(),
  findUserForLogin: vi.fn(),
  registerFailedLogin: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  revokeOtherSessions: vi.fn(),
  revokeSession: vi.fn(),
  setPasswordChangeRequired: vi.fn(),
  touchSession: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock('../../../../src/repositories/securityRepository.js', () => ({ addLog: vi.fn() }));
vi.mock('../../../../src/services/mailService.js', () => ({ sendPasswordResetMail: vi.fn() }));

import {
  createPasswordResetToken,
  findActiveUserByEmail,
  findUserById,
  resetPasswordWithToken,
  revokeOtherSessions,
} from '../../../../src/repositories/authRepository.js';
import {
  changePasswordAuthService,
  requestPasswordResetService,
  resetPasswordService,
} from '../../../../src/services/authService.js';
import { sendPasswordResetMail } from '../../../../src/services/mailService.js';
import { hashPassword } from '../../../../src/utils/password.js';
import { hashToken } from '../../../../src/utils/token.js';

const user = { id_usuario: 'u1', nombre_usuario: 'ana', correo: 'ana@example.test' };

describe('authService password reset (CU-22)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('answers the same and sends nothing when the email is not registered', async () => {
    findActiveUserByEmail.mockResolvedValue(undefined);
    await expect(requestPasswordResetService({ correo: 'nadie@example.test' })).resolves.toEqual({ solicitado: true });
    expect(createPasswordResetToken).not.toHaveBeenCalled();
    expect(sendPasswordResetMail).not.toHaveBeenCalled();
  });

  test('stores only the token hash and mails the plain token in the link', async () => {
    findActiveUserByEmail.mockResolvedValue(user);
    createPasswordResetToken.mockResolvedValue({ id_token: 't1' });

    await expect(requestPasswordResetService({ correo: user.correo })).resolves.toEqual({ solicitado: true });

    const storedHash = createPasswordResetToken.mock.calls[0][1];
    const { enlace } = sendPasswordResetMail.mock.calls[0][0];
    const plainToken = new URL(enlace).searchParams.get('token');
    expect(plainToken).not.toBe(storedHash);
    expect(hashToken(plainToken)).toBe(storedHash);
  });

  test('does not send a second mail during the cooldown', async () => {
    findActiveUserByEmail.mockResolvedValue(user);
    createPasswordResetToken.mockResolvedValue(null);
    await expect(requestPasswordResetService({ correo: user.correo })).resolves.toEqual({ solicitado: true });
    expect(sendPasswordResetMail).not.toHaveBeenCalled();
  });

  test('hides SMTP failures behind the generic answer', async () => {
    findActiveUserByEmail.mockResolvedValue(user);
    createPasswordResetToken.mockResolvedValue({ id_token: 't1' });
    sendPasswordResetMail.mockRejectedValue(new Error('smtp down'));
    await expect(requestPasswordResetService({ correo: user.correo })).resolves.toEqual({ solicitado: true });
  });

  test('rejects an expired, used or unknown token', async () => {
    resetPasswordWithToken.mockResolvedValue(null);
    await expect(resetPasswordService({ token: 'x'.repeat(43), contrasenaNueva: 'NuevaClave123' }))
      .rejects.toMatchObject({ code: 'UE001', details: { reason: 'RESET_TOKEN_INVALID' } });
  });

  test('resets the password looking the token up by its hash', async () => {
    resetPasswordWithToken.mockResolvedValue(user);
    const token = 'y'.repeat(43);
    await expect(resetPasswordService({ token, contrasenaNueva: 'NuevaClave123' })).resolves.toEqual({ restablecido: true });
    expect(resetPasswordWithToken.mock.calls[0][0]).toBe(hashToken(token));
  });

  test('changing the password revokes the other sessions but keeps the current one', async () => {
    findUserById.mockResolvedValue({ ...user, activo: true, hash_contrasena: await hashPassword('ActualClave123') });
    await changePasswordAuthService(
      { token: 'sesion-actual', usuario: { id: 'u1' } },
      { contrasenaActual: 'ActualClave123', contrasenaNueva: 'NuevaClave123' },
    );
    expect(revokeOtherSessions).toHaveBeenCalledWith('u1', hashToken('sesion-actual'));
  });
});
