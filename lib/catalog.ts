/**
 * Catálogo semilla, leído del archivo.
 *
 * Ya NO lo usa la tienda: desde la fase 2 el storefront lee de la base a través
 * de lib/products.ts. Esto queda como fuente de la carga inicial
 * (scripts/seed-catalog.ts) y como datos realistas para los tests.
 */
import { products, type Product } from '@/app/catalog-data';

export type { Product };
export { products };

export const categories = [
  { name: 'Perfumería', slug: 'perfumeria', icon: '✦', tone: 'peach', description: 'Fragancias para expresar tu personalidad y acompañar cada momento.' },
  { name: 'Cuerpo y baño', slug: 'cuerpo-y-bano', icon: '◌', tone: 'rose', description: 'Hidratación, limpieza y aromas para transformar tu rutina diaria.' },
  { name: 'Rostro', slug: 'rostro', icon: '☼', tone: 'sand', description: 'Cuidado facial para proteger, hidratar y acompañar las necesidades de tu piel.' },
  { name: 'Cabello', slug: 'cabello', icon: '〰', tone: 'green', description: 'Tratamientos para un cabello saludable, suave y lleno de movimiento.' },
  { name: 'Maquillaje', slug: 'maquillaje', icon: '◐', tone: 'berry', description: 'Color, tratamiento y expresión en fórmulas que cuidan tu piel.' },
  { name: 'Infantil', slug: 'infantil', icon: '⌑', tone: 'orange', description: 'Cuidado suave y delicado para los más pequeños.' },
  { name: 'Luz roja', slug: 'luz-roja', icon: '◉', tone: 'orange', description: 'Lámparas de luz roja. Consultanos por modelos, disponibilidad y precios.' },
  { name: 'Hogar', slug: 'hogar', icon: '⌂', tone: 'green', description: 'Aromas y bienestar para crear espacios más agradables.' },
  { name: 'Regalos', slug: 'regalos', icon: '◇', tone: 'peach', description: 'Selecciones especiales para regalar bienestar en cualquier ocasión.' },
] as const;

export const currency = new Intl.NumberFormat('es-UY', {
  style: 'currency',
  currency: 'UYU',
  maximumFractionDigits: 0,
});

export function getProduct(sku: string) {
  return products.find((product) => product.sku === sku);
}

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function categorySlug(categoryName: string) {
  return categories.find((category) => category.name === categoryName)?.slug ?? 'catalogo';
}
