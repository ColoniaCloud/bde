import 'server-only';
import type { ProductLookup } from '@/lib/mercado-pago';
import { getProductsByCodes } from '@/lib/products';

/**
 * Implementación real de `ProductLookup`: lee los precios de la base.
 * Es lo que hace que un precio corregido en el panel se cobre de inmediato.
 */
export const databaseProductLookup: ProductLookup = async (codes) => {
  const found = await getProductsByCodes(codes);
  return new Map(
    [...found].map(([code, product]) => [
      code,
      { brand: product.brand, name: product.name, price: product.price },
    ]),
  );
};
