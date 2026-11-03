import { createApp } from './src/app.js';
import { env } from './src/config/env.js';
import { logger } from './src/lib/logger.js';

const app = createApp();

// Express 5 pasa el error de listen al callback (p. ej. EADDRINUSE); sin esto el
// proceso termina en silencio despues de registrar server_started.
app.listen(env.PORT, (error) => {
  if (error) {
    logger.error('server_start_failed', { port: env.PORT, code: error.code, message: error.message });
    process.exit(1);
  }
  logger.info('server_started', { port: env.PORT });
});
