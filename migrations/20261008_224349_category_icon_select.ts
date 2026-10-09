import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres';

/**
 * El ícono de categoría pasa de texto libre a una lista cerrada.
 *
 * Antes de cambiar el tipo se normalizan los valores: los símbolos que usaba la
 * primera versión del catálogo pasan a su nombre, y cualquier otro valor
 * desconocido a 'sparkles', que es lo que la tienda ya dibujaba para él. Así
 * ninguna categoría cambia de aspecto y la conversión al enum no falla.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "categories" SET "icon" = CASE "icon"
      WHEN '✦' THEN 'sparkles'
      WHEN '◌' THEN 'bath'
      WHEN '☼' THEN 'sun'
      WHEN '〰' THEN 'waves'
      WHEN '◐' THEN 'palette'
      WHEN '⌑' THEN 'baby'
      WHEN '◉' THEN 'lightbulb'
      WHEN '⌂' THEN 'house'
      WHEN '◇' THEN 'gift'
      ELSE "icon"
    END;
    UPDATE "categories" SET "icon" = 'sparkles'
      WHERE "icon" NOT IN ('sparkles', 'bath', 'sun', 'waves', 'palette', 'baby', 'lightbulb', 'house', 'gift');

    CREATE TYPE "public"."enum_categories_icon" AS ENUM('sparkles', 'bath', 'sun', 'waves', 'palette', 'baby', 'lightbulb', 'house', 'gift');
    ALTER TABLE "categories" ALTER COLUMN "icon" SET DATA TYPE "public"."enum_categories_icon" USING "icon"::"public"."enum_categories_icon";
    ALTER TABLE "categories" ALTER COLUMN "icon" SET DEFAULT 'sparkles'::"public"."enum_categories_icon";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "categories" ALTER COLUMN "icon" DROP DEFAULT;
    ALTER TABLE "categories" ALTER COLUMN "icon" SET DATA TYPE varchar;
    DROP TYPE "public"."enum_categories_icon";
  `);
}
