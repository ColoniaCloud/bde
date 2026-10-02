import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ADD COLUMN "sold_count" numeric DEFAULT 0;
  ALTER TABLE "products" ADD COLUMN "view_count" numeric DEFAULT 0;
  CREATE INDEX "products_sold_count_idx" ON "products" USING btree ("sold_count");
  CREATE INDEX "products_view_count_idx" ON "products" USING btree ("view_count");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "products_sold_count_idx";
  DROP INDEX "products_view_count_idx";
  ALTER TABLE "products" DROP COLUMN "sold_count";
  ALTER TABLE "products" DROP COLUMN "view_count";`)
}
