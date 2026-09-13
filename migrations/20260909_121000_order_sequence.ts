import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * Secuencia para la numeración correlativa de órdenes.
 *
 * Reemplaza el archivo JSON con lockfile que usaba lib/order-receipts.ts, que
 * dependía de un disco persistente y de que hubiera un solo proceso escribiendo.
 * `nextval` es atómico: dos pedidos simultáneos no pueden recibir el mismo
 * número, ni siquiera con varias instancias de la aplicación.
 *
 * En una tienda que ya emitió órdenes hay que adelantar la secuencia al último
 * número usado ANTES de recibir pedidos nuevos:
 *
 *   SELECT setval('order_number_seq', 123);
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS order_number_seq AS bigint START WITH 1 INCREMENT BY 1;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP SEQUENCE IF EXISTS order_number_seq;`);
}
