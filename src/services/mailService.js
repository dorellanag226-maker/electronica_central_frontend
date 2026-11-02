import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

let transporter = null;

const getTransporter = () => {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
};

export const sendPasswordResetMail = async ({ correo, nombreUsuario, enlace, minutos }) => {
  const smtp = getTransporter();
  if (!smtp) {
    // Sin SMTP configurado solo se permite en desarrollo/pruebas: el enlace queda en el log.
    if (env.NODE_ENV === 'production') {
      logger.error('mail.smtp_not_configured', { tipo: 'RECUPERACION_CONTRASENA' });
      return { enviado: false };
    }
    logger.warn('mail.dev_password_reset_link', { correo, enlace });
    return { enviado: false };
  }

  await smtp.sendMail({
    from: env.SMTP_FROM,
    to: correo,
    subject: 'Recupera tu contraseña - Electrónica Central AZ',
    text: [
      `Hola ${nombreUsuario},`,
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
      `Abre este enlace para definir una nueva (válido por ${minutos} minutos):`,
      enlace,
      '',
      'Si no solicitaste el cambio, ignora este correo; tu contraseña actual sigue vigente.',
    ].join('\n'),
  });
  return { enviado: true };
};
