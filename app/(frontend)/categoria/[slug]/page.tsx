import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryStorefront } from '@/components/category-storefront';
import { categories, getCategory } from '@/lib/catalog';
import { SITE_NAME } from '@/lib/site';

export function generateStaticParams() { return categories.map((category) => ({ slug: category.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
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
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!getCategory(slug)) notFound(); return <CategoryStorefront categorySlug={slug} />; }
