import type { MetadataRoute } from 'next';
import { getAllProductCodes, getCategories } from '@/lib/products';
import { SITE_URL } from '@/lib/site';

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
