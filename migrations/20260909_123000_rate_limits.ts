import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * Contador de intentos por clave.
 *
 * Reemplaza al `Map` en memoria que había en /api/orders, que se perdía en cada
 * reinicio y sólo contaba dentro de una instancia. El conteo se hace con un
 * UPSERT atómico, así que varias instancias comparten el mismo límite.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "rate_limits" (
      "key" varchar(200) PRIMARY KEY,
      "count" integer NOT NULL DEFAULT 0,
      "expires_at" timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "rate_limits_expires_at_idx" ON "rate_limits" ("expires_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "rate_limits";`);
}
