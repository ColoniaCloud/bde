'use client';

import { createContext, useContext } from 'react';
import type { StoreCategory } from '@/lib/products';

const NavCategoriesContext = createContext<StoreCategory[]>([]);

/**
 * Las categorías principales que muestran el menú y el pie. Las lee el layout
 * una vez por pedido, así una categoría nueva del panel aparece sin desplegar.
 */
export function NavCategoriesProvider({ categories, children }: { categories: StoreCategory[]; children: React.ReactNode }) {
  return <NavCategoriesContext.Provider value={categories}>{children}</NavCategoriesContext.Provider>;
}

export function useNavCategories() {
  return useContext(NavCategoriesContext);
}
