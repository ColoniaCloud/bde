import type { MetadataRoute } from 'next';
import { getAllProductCodes, getCategories } from '@/lib/products';
import { SITE_URL } from '@/lib/site';

/**
 * Se arma en cada pedido, no durante el build.
 *
 * Si no, el mapa del sitio queda siendo una foto del catálogo al momento de
 * desplegar: lo que se dé de alta después no llega nunca a Google. Peor todavía,
 * la foto se saca con la base que haya al compilar, que puede estar vacía.
 *
 * Se consulta un puñado de veces por día —lo leen los buscadores, no los
 * clientes—, así que leer la base cada vez no cuesta nada y nunca miente.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, codes] = await Promise.all([getCategories(), getAllProductCodes()]);
  const lastModified = new Date();

  return [
    { url: SITE_URL, lastModified, changeFrequency: 'daily', priority: 1 },
    ...['terminos-y-condiciones', 'politica-de-privacidad', 'cambios-y-devoluciones', 'envios-y-entregas'].map((slug) => ({
      url: `${SITE_URL}/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...categories.map((category) => ({
      url: `${SITE_URL}/categoria/${category.slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...codes.map((code) => ({
      url: `${SITE_URL}/productos/${code}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
