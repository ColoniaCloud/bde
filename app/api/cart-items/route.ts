import { NextResponse } from 'next/server';
import { getProductsByCodes } from '@/lib/products';

export const runtime = 'nodejs';

/**
 * Datos de los productos que el cliente tiene en la bolsa.
 *
 * El navegador guarda sólo códigos y cantidades, así que el cajón del carrito
 * pide acá el nombre y el precio actuales. De paso, el precio que ve el cliente
 * es el de la base y no una copia vieja guardada en su teléfono.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('codes') ?? '';
  const codes = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (codes.length === 0) return NextResponse.json({ products: [] });
  if (codes.length > 50) {
    return NextResponse.json({ message: 'Demasiados productos.' }, { status: 400 });
  }

  const found = await getProductsByCodes(codes);

  return NextResponse.json({
    products: [...found.values()].map((product) => ({
      code: product.code,
      brand: product.brand,
      name: product.name,
      price: product.price,
      image: product.image,
      status: product.status,
    })),
  });
}
