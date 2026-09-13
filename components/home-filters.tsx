'use client';

import Link from 'next/link';
import type { StoreCategory } from '@/lib/products';

type Props = {
  categories: StoreCategory[];
  selected?: string;
  query?: string;
};

/**
 * Los filtros son enlaces, no botones con estado: cada combinación tiene su
 * propia URL, así que se puede compartir, marcar y volver con el botón atrás.
 */
export function HomeFilters({ categories, selected, query }: Props) {
  function href(categorySlug?: string) {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (categorySlug) search.set('categoria', categorySlug);
    const suffix = search.toString();
    return `/${suffix ? `?${suffix}` : ''}#productos`;
  }

  return (
    <div className="filter-pills" aria-label="Filtrar productos">
      <Link className={selected ? '' : 'active'} href={href()}>Todos</Link>
      {categories.map((category) => (
        <Link
          key={category.slug}
          className={selected === category.slug ? 'active' : ''}
          href={href(category.slug)}
          aria-current={selected === category.slug ? 'true' : undefined}
        >
          {category.name}
        </Link>
      ))}
    </div>
  );
}
