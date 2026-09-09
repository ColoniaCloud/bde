import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail } from '@/components/product-detail';
import { getProduct } from '@/lib/catalog';
import { SITE_NAME, SITE_URL } from '@/lib/site';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/productos/${slug}` },
    openGraph: {
      title: `${product.name} | ${SITE_NAME}`,
      description: product.description,
      url: `/productos/${slug}`,
      images: [{ url: product.image, alt: product.name }],
    },
    twitter: { card: 'summary_large_image', title: `${product.name} | ${SITE_NAME}`, description: product.description, images: [product.image] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  const image = product.image.startsWith('http') ? product.image : new URL(product.image, SITE_URL).toString();
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    image: [image],
    description: product.description,
    brand: { '@type': 'Brand', name: product.brand },
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <ProductDetail product={product} />
  </>;
}
