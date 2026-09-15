'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { CategoryIcon } from '@/components/category-icon';
import { ProductCard } from '@/components/product-card';
import { StoreFooter } from '@/components/store-footer';
import { StoreHeader } from '@/components/store-header';
import type { StoreCategory, StoreProduct } from '@/lib/products';

type Props = {
  category: StoreCategory;
  otherCategories: StoreCategory[];
  products: StoreProduct[];
  total: number;
  page: number;
  totalPages: number;
};

export function CategoryStorefront({ category, otherCategories, products, total, page, totalPages }: Props) {
  return <main>
    <StoreHeader />
    <div className="breadcrumbs section-shell">
      <Link href="/">Inicio</Link><span>›</span><strong>{category.name}</strong>
    </div>

    <section className={`category-hero ${category.tone}`}>
      <div className="section-shell">
        <span className="category-hero-icon" aria-hidden="true"><CategoryIcon name={category.icon} /></span>
        <p>explorá la colección</p>
        <h1>{category.name}</h1>
        <div>{category.description}</div>
      </div>
    </section>

    <section className="products-section section-shell category-products">
      <div className="section-heading">
        <div><p>{total} productos</p><h2>Catálogo {category.name}</h2></div>
      </div>
      {products.length ? <>
        <div className="product-grid">
          {products.map((product) => <ProductCard product={product} key={product.code} />)}
        </div>
        {totalPages > 1 && (
          <nav className="catalog-pagination" aria-label="Páginas de la categoría">
            {page > 1
              ? <Link href={`/categoria/${category.slug}?pagina=${page - 1}`}><ArrowLeft aria-hidden="true" /> anterior</Link>
              : <span className="disabled"><ArrowLeft aria-hidden="true" /> anterior</span>}
            <span>Página {page} de {totalPages}</span>
            {page < totalPages
              ? <Link href={`/categoria/${category.slug}?pagina=${page + 1}`}>siguiente <ArrowRight aria-hidden="true" /></Link>
              : <span className="disabled">siguiente <ArrowRight aria-hidden="true" /></span>}
          </nav>
        )}
      </> : (
        <div className="empty-state category-empty">
          <span><CategoryIcon name={category.icon} /></span>
          <h3>Estamos preparando esta colección</h3>
          <p>Mientras tanto, podés descubrir nuestras otras categorías.</p>
          <Link href="/#productos">ver productos disponibles</Link>
        </div>
      )}
    </section>

    <section className="section-shell more-categories">
      <p>seguí explorando</p>
      <div>
        {otherCategories.map((item) => (
          <Link key={item.slug} href={`/categoria/${item.slug}`}>{item.name}<ArrowRight aria-hidden="true" /></Link>
        ))}
      </div>
    </section>

    <StoreFooter />
  </main>;
}
