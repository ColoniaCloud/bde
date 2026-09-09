import 'server-only';
import configPromise from '@payload-config';
import { sql } from '@payloadcms/db-postgres';
import { getPayload } from 'payload';

/**
 * Límite de intentos por clave, contado en Postgres.
 *
 * El UPSERT resuelve el conteo y la expiración en una sola sentencia atómica:
 * dos pedidos simultáneos no pueden saltarse el límite, y el conteo sobrevive a
 * los reinicios y se comparte entre instancias.
 */
export async function hitRateLimit(key: string, max: number, windowMinutes: number) {
  const payload = await getPayload({ config: configPromise });

  const result = await payload.db.drizzle.execute(sql`
    INSERT INTO rate_limits ("key", "count", "expires_at")
    VALUES (${key}, 1, now() + (${windowMinutes} || ' minutes')::interval)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limits."expires_at" <= now() THEN 1 ELSE rate_limits."count" + 1 END,
      "expires_at" = CASE WHEN rate_limits."expires_at" <= now()
        THEN now() + (${windowMinutes} || ' minutes')::interval
        ELSE rate_limits."expires_at" END
    RETURNING "count"
  `);

  const rows = (result as { rows?: { count?: number | string }[] }).rows ?? [];
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= max, count };
}

/** Identifica al solicitante. Detrás de Nginx, la IP real llega en x-forwarded-for. */
export function requestKey(request: Request, scope: string) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`.slice(0, 200);
}
