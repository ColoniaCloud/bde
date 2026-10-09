import { NextResponse } from 'next/server';
import { listProducts } from '@/lib/products';

export const runtime = 'nodejs';

const MIN_LENGTH = 3;
const LIMIT = 6;

/** Sugerencias del buscador del encabezado, mientras el cliente escribe. */
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (query.length < MIN_LENGTH) return NextResponse.json({ products: [], total: 0 });

  const { products, total } = await listProducts({ query, limit: LIMIT });

  return NextResponse.json({
    total,
    products: products.map((product) => ({
      code: product.code,
      brand: product.brand,
      name: product.name,
      price: product.price,
      image: product.image,
    })),
  });
}
