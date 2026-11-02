import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Recuperacion de contrasena (CU-22). El enlace del correo es `${PASSWORD_RESET_URL}?token=...`.
  PASSWORD_RESET_URL: z.string().url().default('http://localhost:5173/restablecer-contrasena'),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().max(24 * 60).default(30),
  // Sin SMTP_HOST no se envian correos: fuera de produccion el enlace se escribe en el log.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Electrónica Central AZ <no-reply@example.test>'),
  // Pasarela de pago (CU-16). Sin STRIPE_SECRET_KEY el cobro en linea responde 503 y lo demas sigue igual.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CURRENCY: z.string().trim().toLowerCase().length(3).default('bob'),
  // Stripe exige que la sesion de pago dure entre 30 minutos y 24 horas.
  STRIPE_CHECKOUT_EXPIRES_MINUTES: z.coerce.number().int().min(30).max(24 * 60).default(30),
  PAYMENT_SUCCESS_URL: z.string().url().default('http://localhost:5173/pagos/exito'),
  PAYMENT_CANCEL_URL: z.string().url().default('http://localhost:5173/pagos/cancelado'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
