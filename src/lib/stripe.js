import Stripe from 'stripe';
import { env } from '../config/env.js';

let client = null;

// Cliente de la pasarela de pago; null si no hay clave configurada (el cobro en linea queda deshabilitado).
export const getStripe = () => {
  if (!env.STRIPE_SECRET_KEY) return null;
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
};
