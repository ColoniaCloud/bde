import 'server-only';
import { z } from 'zod';

/**
 * Configuración privada del servidor.
 *
 * Criterio deliberado: los grupos de Mercado Pago y de correo son opcionales,
 * porque la tienda tiene que poder levantar sin ellos y responder 503 con un
 * mensaje entendible (así funciona hoy). Lo que sí se valida es la *forma* de
 * lo que esté presente: un SMTP_PORT que no sea un puerto o un ORDER_COPY_EMAIL
 * que no sea un correo son errores de configuración y conviene que revienten al
 * arrancar, no en medio de una compra.
 */

/**
 * En un archivo .env, `SMTP_HOST=` es la forma habitual de dejar algo sin
 * configurar. Sin esto, la cadena vacía cuenta como "presente" y hace fallar el
 * arranque por una variable que el operador quiso justamente dejar vacía.
 */
const blankAsAbsent = <T extends z.ZodType>(inner: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), inner);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  SITE_URL: blankAsAbsent(z.url().optional()),

  MERCADOPAGO_ACCESS_TOKEN: blankAsAbsent(z.string().min(1).optional()),
  MERCADOPAGO_WEBHOOK_SECRET: blankAsAbsent(z.string().min(1).optional()),

  SMTP_HOST: blankAsAbsent(z.string().min(1).optional()),
  SMTP_PORT: blankAsAbsent(z.coerce.number().int().min(1).max(65535).default(587)),
  SMTP_SECURE: z.preprocess((value) => value === 'true', z.boolean()),
  SMTP_USER: blankAsAbsent(z.string().min(1).optional()),
  SMTP_PASS: blankAsAbsent(z.string().min(1).optional()),
  ORDER_FROM_EMAIL: blankAsAbsent(z.email().optional()),
  ORDER_COPY_EMAIL: blankAsAbsent(z.email().optional()),

  ORDER_DATA_DIR: blankAsAbsent(z.string().min(1).optional()),
});

function load() {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración del servidor inválida:\n${detail}`);
  }

  return result.data;
}

let cached: z.infer<typeof schema> | undefined;

/** Valida en el primer uso y memoriza el resultado. */
export function serverEnv() {
  cached ??= load();
  return cached;
}
