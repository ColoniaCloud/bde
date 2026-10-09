'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PRODUCT_SORTS, type ProductSort } from '@/lib/product-sort';

type Props = { value: ProductSort };

/**
 * Cambia el orden navegando a la misma URL con `?orden=...`, igual que los
 * demás filtros: queda en el historial y se puede compartir o recargar.
 */
export function SortSelect({ value }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    const next = event.target.value;

    if (next === 'relevance') params.delete('orden');
    else params.set('orden', next);
    params.delete('pagina');

    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}#productos`);
  }

  return (
    <label className="sort-select">
      <span>Ordenar por</span>
      <select value={value} onChange={handleChange} aria-label="Ordenar productos">
        {PRODUCT_SORTS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
