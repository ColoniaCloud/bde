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
};

const payloadClient = () => getPayload({ config: configPromise });

function isCategory(value: PayloadProduct['category']): value is PayloadCategory {
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
  };
}

export const PAGE_SIZE = 24;

export async function getCategories(): Promise<StoreCategory[]> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'categories',
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
    depth: 0,
  });

  const doc = result.docs[0];
  return doc ? toStoreCategory(doc) : null;
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
    conditions.push({ 'category.slug': { equals: categorySlug } });
  }

  const text = query?.trim();
  if (text) {
    // Se busca por palabra en vez de por la frase completa: así "perfume
    // floral" encuentra "Floral Perfume X" aunque el orden no coincida.
    // Cada palabra debe aparecer en al menos uno de los campos (nombre,
    // marca, categoría o etiqueta); las palabras se combinan con "y".
    const words = text.split(/\s+/).filter(Boolean);
    for (const word of words) {
      conditions.push({
        or: [
          { name: { like: word } },
          { brand: { like: word } },
          { 'category.name': { like: word } },
          { tag: { like: word } },
        ],
      });
    }
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
