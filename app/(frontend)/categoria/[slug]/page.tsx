import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryStorefront } from '@/components/category-storefront';
import { getCategories, getCategoryBySlug, listProducts } from '@/lib/products';
import { SITE_NAME } from '@/lib/site';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pagina?: string }>;
};

/**
 * Esta página se arma en cada pedido, a propósito.
 *
 * Tuvo `generateStaticParams`, que la convertía en una página fija armada
 * durante el build. Dos cosas la rompían:
 *
 *  1. Lee `searchParams` para paginar (`?pagina=2`). Una página fija no tiene
 *     pedido del que sacarlos, así que Next abortaba el render y la categoría
 *     entera devolvía **500**. Pasaba con cualquier categoría que no se hubiera
 *     armado durante el build: las creadas después desde el panel, y todas si el
 *     build corría antes de cargar el catálogo (que es lo que hace el CI).
 *  2. Aun armándose bien, quedaba congelada: los precios que actualiza el
 *     asistente cada 20 días y lo que se toca en el panel no se veían hasta el
 *     próximo despliegue.
 *
 * El catálogo vive en la base y cambia; la página tiene que leerlo cada vez.
 */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  const description = `${category.description} Comprá online en Uruguay con envíos en hasta 48 horas en Maldonado y Punta del Este.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: `/categoria/${slug}` },
    openGraph: { title: `${category.name} | ${SITE_NAME}`, description, url: `/categoria/${slug}` },
    twitter: { card: 'summary_large_image', title: `${category.name} | ${SITE_NAME}`, description },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { pagina } = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const page = Math.max(1, Number(pagina) || 1);
  const [{ products, total, totalPages }, categories] = await Promise.all([
    listProducts({ categorySlug: slug, page }),
    getCategories(),
  ]);

  return (
    <CategoryStorefront
      category={category}
      otherCategories={categories.filter((item) => item.slug !== slug)}
      products={products}
      total={total}
      page={page}
      totalPages={totalPages}
    />
  );
}
