import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// IF NOT EXISTS: con prodMigrations puede correr en más de un proceso a la vez
// al arrancar, y la segunda ejecución no debe fallar.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sold_count" numeric DEFAULT 0;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "view_count" numeric DEFAULT 0;
  CREATE INDEX IF NOT EXISTS "products_sold_count_idx" ON "products" USING btree ("sold_count");
  CREATE INDEX IF NOT EXISTS "products_view_count_idx" ON "products" USING btree ("view_count");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "products_sold_count_idx";
  DROP INDEX IF EXISTS "products_view_count_idx";
  ALTER TABLE "products" DROP COLUMN IF EXISTS "sold_count";
  ALTER TABLE "products" DROP COLUMN IF EXISTS "view_count";`)
}
