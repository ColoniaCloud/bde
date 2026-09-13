import 'server-only';
import configPromise from '@payload-config';
import { getPayload, type Where } from 'payload';
import type { Category as PayloadCategory, Product as PayloadProduct } from '@/payload-types';

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

type ListOptions = {
  categorySlug?: string;
  query?: string;
  page?: number;
  limit?: number;
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
}: ListOptions = {}): Promise<ProductPage> {
  const payload = await payloadClient();
  const conditions: Where[] = [];

  if (categorySlug) {
    conditions.push({ 'category.slug': { equals: categorySlug } });
  }

  const text = query?.trim();
  if (text) {
    // El filtro anterior, que corría en el navegador, concatenaba marca, nombre
    // y categoría; se mantiene el mismo alcance para no perder resultados que
    // los clientes ya encontraban (buscar «Perfumería», por ejemplo).
    conditions.push({
      or: [
        { name: { like: text } },
        { brand: { like: text } },
        { 'category.name': { like: text } },
      ],
    });
  }

  const result = await payload.find({
    collection: 'products',
    where: conditions.length > 0 ? { and: conditions } : undefined,
    sort: 'code',
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
