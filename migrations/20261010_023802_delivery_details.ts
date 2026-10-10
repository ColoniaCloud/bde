import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_phone" varchar;
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_address" varchar;
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_city" varchar;
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_notes" varchar;
  ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "delivery_phone" varchar;
  ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "delivery_address" varchar;
  ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "delivery_city" varchar;
  ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "delivery_notes" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_phone";
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_address";
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_city";
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_notes";
  ALTER TABLE "customers" DROP COLUMN IF EXISTS "delivery_phone";
  ALTER TABLE "customers" DROP COLUMN IF EXISTS "delivery_address";
  ALTER TABLE "customers" DROP COLUMN IF EXISTS "delivery_city";
  ALTER TABLE "customers" DROP COLUMN IF EXISTS "delivery_notes";`)
}
