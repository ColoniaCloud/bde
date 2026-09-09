import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail } from '@/components/product-detail';
import { getProductByCode, getRelatedProducts } from '@/lib/products';
import { SITE_NAME, SITE_URL } from '@/lib/site';

type Props = { params: Promise<{ slug: string }> };

function parseCode(slug: string) {
  const code = Number(slug);
  return Number.isInteger(code) && code > 0 ? code : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const code = parseCode(slug);
  const product = code ? await getProductByCode(code) : null;
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
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | ${SITE_NAME}`,
      description: product.description,
      images: [product.image],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const code = parseCode(slug);
  const product = code ? await getProductByCode(code) : null;
  if (!product) notFound();

  const related = await getRelatedProducts(product);
  const image = product.image.startsWith('http')
    ? product.image
    : new URL(product.image, SITE_URL).toString();

  // Ahora que hay disponibilidad en la base, la ficha puede declarar precio y
  // stock: es lo que habilita los resultados enriquecidos de Google.
  const availability = {
    available: 'https://schema.org/InStock',
    'out-of-stock': 'https://schema.org/OutOfStock',
    'on-request': 'https://schema.org/PreOrder',
  }[product.status];

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: String(product.code),
    image: [image],
    description: product.description,
    brand: { '@type': 'Brand', name: product.brand },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/productos/${product.code}`,
      priceCurrency: 'UYU',
      price: product.price,
      availability,
    },
  };

  return <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
    />
    <ProductDetail product={product} related={related} />
  </>;
}
