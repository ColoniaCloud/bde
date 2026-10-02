import type { PostgresAdapter } from '@payloadcms/db-postgres';
import type { Migration, Payload } from 'payload';
import { migrations } from '../migrations';

// Número fijo y arbitrario: identifica este lock entre todos los de la base.
const MIGRATION_LOCK_ID = 718_202_610;

/**
 * Aplica las migraciones pendientes al arrancar, de a un proceso por vez.
 *
 * `prodMigrations` de Payload no se coordina entre procesos: cada uno lee qué
 * migraciones faltan y las corre, así que dos arranques simultáneos pueden
 * aplicar la misma migración dos veces y el segundo falla a mitad de camino.
 * Con el advisory lock, el segundo espera a que termine el primero y, cuando
 * le toca, lee la tabla de migraciones ya actualizada y no encuentra nada que
 * hacer.
 */
export async function migrateWithLock(payload: Payload, list = migrations): Promise<void> {
  const db = payload.db as unknown as PostgresAdapter;
  const client = await db.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    // Los archivos generados tipan sus argumentos como MigrateUpArgs y Payload
    // los declara como unknown; es el mismo arreglo que recibía prodMigrations.
    await db.migrate({ migrations: list as unknown as Migration[] });
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}
