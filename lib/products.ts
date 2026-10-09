import 'server-only';
import configPromise from '@payload-config';
import { sql } from '@payloadcms/db-postgres';
import { getPayload, type Where } from 'payload';
import { type ProductSort } from '@/lib/product-sort';
import type { Category as PayloadCategory, Product as PayloadProduct } from '@/payload-types';

export type { ProductSort } from '@/lib/product-sort';
export { PRODUCT_SORTS } from '@/lib/product-sort';

/**
 * Lectura del catálogo desde la base, para Server Components.
 *
 * Devuelve la misma forma que exponía `lib/catalog.ts` cuando el catálogo era un
 * archivo, así que los componentes de presentación no cambian: `code` ocupa el
 * lugar del viejo `id`/`sku`, que es lo que usan las URLs y los carritos ya
 * guardados en el navegador de los clientes.
 *
 * Se usa la Local API: corre en el mismo proceso, sin dar una vuelta por HTTP.
 */

export type StoreProduct = {
  code: number;
  brand: string;
  name: string;
  category: string;
  categorySlug: string;
  price: number;
  oldPrice?: number;
  discount?: number;
  image: string;
  tag?: string;
  description: string;
  details: string[];
  status: 'available' | 'out-of-stock' | 'on-request';
};

export type StoreCategory = {
  name: string;
  slug: string;
  icon: string;
  tone: string;
  description: string;
  /** Sólo en subcategorías: la categoría principal a la que pertenecen. */
  parent?: { name: string; slug: string };
};

const payloadClient = () => getPayload({ config: configPromise });

function isCategory(value: number | PayloadCategory | null | undefined): value is PayloadCategory {
  return typeof value === 'object' && value !== null;
}

function toStoreProduct(doc: PayloadProduct): StoreProduct {
  const category = doc.category;

  return {
    code: doc.code,
    brand: doc.brand,
    name: doc.name,
    // `depth: 1` resuelve la relación; si viniera sin resolver, es preferible un
    // hueco visible a inventar un nombre de categoría.
    category: isCategory(category) ? category.name : '',
    categorySlug: isCategory(category) ? category.slug : '',
    price: doc.price,
    oldPrice: doc.oldPrice ?? undefined,
    discount: doc.discount ?? undefined,
    image: (typeof doc.media === 'object' && doc.media?.url) || doc.image,
    tag: doc.tag ?? undefined,
    description: doc.description,
    details: (doc.details ?? []).map((detail) => detail.text),
    status: doc.status,
  };
}

function toStoreCategory(doc: PayloadCategory): StoreCategory {
  return {
    name: doc.name,
    slug: doc.slug,
    icon: doc.icon,
    tone: doc.tone,
    description: doc.description,
    // Con depth 0 el padre llega como id; sólo se expone cuando vino poblado.
    parent: isCategory(doc.parent) ? { name: doc.parent.name, slug: doc.parent.slug } : undefined,
  };
}

export const PAGE_SIZE = 24;

/**
 * Categorías de la tienda en el orden del panel. Con `topLevelOnly` deja afuera
 * las subcategorías, para los listados que navegan por las secciones principales.
 */
export async function getCategories({ topLevelOnly = false } = {}): Promise<StoreCategory[]> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'categories',
    where: topLevelOnly ? { parent: { exists: false } } : undefined,
    sort: 'order',
    limit: 100,
    depth: 0,
  });

  return result.docs.map(toStoreCategory);
}

export async function getCategoryBySlug(slug: string): Promise<StoreCategory | null> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  });

  const doc = result.docs[0];
  return doc ? toStoreCategory(doc) : null;
}

/** Subcategorías de una categoría principal, en el orden del panel. */
export async function getSubcategories(parentSlug: string): Promise<StoreCategory[]> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'categories',
    where: { 'parent.slug': { equals: parentSlug } },
    sort: 'order',
    limit: 100,
    depth: 0,
  });

  return result.docs.map(toStoreCategory);
}

export async function getProductByCode(code: number): Promise<StoreProduct | null> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'products',
    where: { code: { equals: code } },
    limit: 1,
    depth: 1,
  });

  const doc = result.docs[0];
  return doc ? toStoreProduct(doc) : null;
}

const SORT_FIELDS: Record<ProductSort, string> = {
  relevance: 'code',
  'price-asc': 'price',
  'price-desc': '-price',
  'best-selling': '-soldCount',
  'most-viewed': '-viewCount',
};

type ListOptions = {
  categorySlug?: string;
  query?: string;
  page?: number;
  limit?: number;
  sort?: ProductSort;
};

export type ProductPage = {
  products: StoreProduct[];
  total: number;
  page: number;
  totalPages: number;
};

const ACCENTED = 'áàâãäéèêëíìîïóòôõöúùûüñçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ';
const PLAIN = 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC';

/** Minúsculas y sin tildes, para que "jabon" encuentre "Jabón". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function escapeLike(word: string): string {
  return word.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Ids de los productos que contienen todas las palabras buscadas, en cualquier
 * orden, en el nombre, la marca, la etiqueta o la categoría. Payload no ofrece
 * comparar sin tildes, así que el filtro se arma en SQL y después Payload
 * pagina y ordena sobre esos ids.
 */
async function matchingProductIds(query: string): Promise<number[]> {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) return [];

  const haystack = sql`lower(translate(concat_ws(' ', p.name, p.brand, p.tag, c.name), ${ACCENTED}, ${PLAIN}))`;
  const clauses = words.map((word) => sql`${haystack} LIKE ${`%${escapeLike(word)}%`}`);

  const payload = await payloadClient();
  const result = await payload.db.drizzle.execute(sql`
    SELECT p.id FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${sql.join(clauses, sql` AND `)}
  `);
  return result.rows.map((row) => Number(row.id));
}

/**
 * La búsqueda y el filtrado ocurren en Postgres, no en el navegador: es lo que
 * permite que el catálogo entero deje de viajar al cliente.
 */
export async function listProducts({
  categorySlug,
  query,
  page = 1,
  limit = PAGE_SIZE,
  sort = 'relevance',
}: ListOptions = {}): Promise<ProductPage> {
  const payload = await payloadClient();
  const conditions: Where[] = [];

  if (categorySlug) {
    // Una categoría principal incluye los productos de sus subcategorías.
    conditions.push({
      or: [
        { 'category.slug': { equals: categorySlug } },
        { 'category.parent.slug': { equals: categorySlug } },
      ],
    });
  }

  const text = query?.trim();
  if (text) {
    const ids = await matchingProductIds(text);
    if (ids.length === 0) return { products: [], total: 0, page: 1, totalPages: 0 };
    conditions.push({ id: { in: ids } });
  }

  const result = await payload.find({
    collection: 'products',
    where: conditions.length > 0 ? { and: conditions } : undefined,
    sort: SORT_FIELDS[sort] ?? 'code',
    page,
    limit,
    depth: 1,
  });

  return {
    products: result.docs.map(toStoreProduct),
    total: result.totalDocs,
    page: result.page ?? 1,
    totalPages: result.totalPages,
  };
}

/**
 * Suma una vista a la ficha del producto. Se llama desde `after()`, una vez que
 * la página ya se envió, para no demorar la respuesta por esta escritura.
 */
export async function incrementViewCount(code: number): Promise<void> {
  const payload = await payloadClient();
  await payload.db.drizzle.execute(
    sql`UPDATE products SET view_count = COALESCE(view_count, 0) + 1 WHERE code = ${code}`,
  );
}

/** Otras opciones de la misma categoría, para el pie de la ficha de producto. */
export async function getRelatedProducts(product: StoreProduct, limit = 4): Promise<StoreProduct[]> {
  if (!product.categorySlug) return [];

  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'products',
    where: {
      and: [
        { 'category.slug': { equals: product.categorySlug } },
        { code: { not_equals: product.code } },
      ],
    },
    limit,
    depth: 1,
  });

  return result.docs.map(toStoreProduct);
}

/** Todos los códigos, para generar el sitemap y las rutas estáticas. */
export async function getAllProductCodes(): Promise<number[]> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'products',
    limit: 0,
    depth: 0,
    select: { code: true },
    pagination: false,
  });

  return result.docs.map((doc) => doc.code);
}

/**
 * Resumen de varios productos por código. Lo usan el carrito (para mostrar lo
 * que el cliente guardó sin bajarse el catálogo) y el checkout (para recalcular
 * los precios contra la base en lugar de confiar en lo que manda el navegador).
 */
export async function getProductsByCodes(codes: number[]): Promise<Map<number, StoreProduct>> {
  const unique = [...new Set(codes)];
  if (unique.length === 0) return new Map();

  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'products',
    where: { code: { in: unique } },
    limit: unique.length,
    depth: 1,
  });

  return new Map(result.docs.map((doc) => [doc.code, toStoreProduct(doc)]));
}
