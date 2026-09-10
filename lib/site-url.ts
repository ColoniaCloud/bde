import 'server-only';
import { serverEnv } from '@/lib/env.server';

export class SiteUrlError extends Error {
  constructor() {
    super('Falta configurar SITE_URL, la dirección pública de la tienda.');
  }
}

/**
 * Dirección pública de la tienda.
 *
 * La usan Mercado Pago (URLs de retorno y webhook) y el ingreso con Google
 * (URL de callback), así que vive en su propio módulo y no dentro de uno de
 * los dos.
 */
export function getSiteUrl() {
  const configured = serverEnv().SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (serverEnv().NODE_ENV !== 'production') return 'http://localhost:3000';
  throw new SiteUrlError();
}
