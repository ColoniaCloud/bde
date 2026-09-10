import 'server-only';
import pino from 'pino';

/**
 * Registro estructurado de errores del servidor.
 *
 * Escribe JSON a stdout, que es lo que espera cualquier recolector de logs
 * (journald, PM2, Datadog, Sentry vía transporte). Payload ya usa pino para lo
 * suyo; esto cubre el código propio, donde hasta ahora los errores se perdían.
 *
 * Para enviar a un servicio externo alcanza con agregar un transporte acá; el
 * resto del código no cambia.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { app: 'boutiquedeleste' },
  redact: {
    // Nunca escribir credenciales en el log, ni siquiera por accidente.
    paths: [
      'password',
      '*.password',
      'authorization',
      '*.authorization',
      'headers.authorization',
      'headers.cookie',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    censor: '[oculto]',
  },
});

type Context = Record<string, unknown>;

/**
 * Registra un error con su contexto.
 *
 * `where` identifica el punto del código; el contexto debería alcanzar para
 * reproducirlo, sin datos personales de más.
 */
export function logError(where: string, error: unknown, context: Context = {}) {
  logger.error({ err: error, ...context }, where);
}

export function logWarning(where: string, context: Context = {}) {
  logger.warn(context, where);
}

export function logInfo(where: string, context: Context = {}) {
  logger.info(context, where);
}
