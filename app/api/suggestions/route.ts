import { NextResponse } from 'next/server';
import { getProductsByCodes, listProducts } from '@/lib/products';

export const runtime = 'nodejs';

/**
 * Sugerencias por categoría a partir de lo que el cliente tiene en la bolsa o
 * en favoritos. La referencia vive en su navegador, así que llega por query.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('codes') ?? '';
  const codes = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 50);

  if (codes.length === 0) return NextResponse.json({ products: [] });

  const reference = await getProductsByCodes(codes);
  const slugs = [...new Set([...reference.values()].map((product) => product.categorySlug))].filter(Boolean);
  if (slugs.length === 0) return NextResponse.json({ products: [] });

  const seen = new Set(codes);
  const suggestions = [];

  for (const slug of slugs) {
    const { products } = await listProducts({ categorySlug: slug, limit: 8 });
    for (const product of products) {
      if (seen.has(product.code) || product.status !== 'available') continue;
      seen.add(product.code);
      suggestions.push({
        code: product.code,
        brand: product.brand,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (suggestions.length === 3) break;
    }
    if (suggestions.length === 3) break;
  }

  return NextResponse.json({ products: suggestions });
}
