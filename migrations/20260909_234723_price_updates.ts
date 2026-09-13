import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_price_updates_rows_action" AS ENUM('update', 'create', 'missing', 'discarded');
  CREATE TYPE "public"."enum_price_updates_status" AS ENUM('pending', 'analyzing', 'review', 'apply', 'applied', 'failed');
  CREATE TABLE "price_updates_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"approved" boolean,
  	"code" numeric,
  	"name" varchar,
  	"action" "enum_price_updates_rows_action",
  	"current_price" numeric,
  	"new_price" numeric,
  	"change_percent" numeric,
  	"requires_attention" boolean,
  	"note" varchar
  );
  
  CREATE TABLE "price_updates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_price_updates_status" DEFAULT 'pending' NOT NULL,
  	"summary" varchar,
  	"error" varchar,
  	"applied_at" timestamp(3) with time zone,
  	"applied_count" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "price_updates_id" integer;
  ALTER TABLE "price_updates_rows" ADD CONSTRAINT "price_updates_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."price_updates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "price_updates_rows_order_idx" ON "price_updates_rows" USING btree ("_order");
  CREATE INDEX "price_updates_rows_parent_id_idx" ON "price_updates_rows" USING btree ("_parent_id");
  CREATE INDEX "price_updates_updated_at_idx" ON "price_updates" USING btree ("updated_at");
  CREATE INDEX "price_updates_created_at_idx" ON "price_updates" USING btree ("created_at");
  CREATE UNIQUE INDEX "price_updates_filename_idx" ON "price_updates" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_price_updates_fk" FOREIGN KEY ("price_updates_id") REFERENCES "public"."price_updates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_price_updates_id_idx" ON "payload_locked_documents_rels" USING btree ("price_updates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "price_updates_rows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "price_updates" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "price_updates_rows" CASCADE;
  DROP TABLE "price_updates" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_price_updates_fk";
  
  DROP INDEX "payload_locked_documents_rels_price_updates_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "price_updates_id";
  DROP TYPE "public"."enum_price_updates_rows_action";
  DROP TYPE "public"."enum_price_updates_status";`)
}
