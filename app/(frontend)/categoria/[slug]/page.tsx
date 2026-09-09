import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryStorefront } from '@/components/category-storefront';
import { getCategories, getCategoryBySlug, listProducts } from '@/lib/products';
import { SITE_NAME } from '@/lib/site';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pagina?: string }>;
};

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

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
