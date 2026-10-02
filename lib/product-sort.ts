export type ProductSort = 'relevance' | 'price-asc' | 'price-desc' | 'best-selling' | 'most-viewed';

export const PRODUCT_SORTS: { value: ProductSort; label: string }[] = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'best-selling', label: 'Más vendidos' },
  { value: 'most-viewed', label: 'Más vistos' },
];

export function isProductSort(value: string | undefined): value is ProductSort {
  return !!value && PRODUCT_SORTS.some((option) => option.value === value);
}
