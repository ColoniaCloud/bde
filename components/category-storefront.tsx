'use client';

import { useState } from 'react';
import Link from 'next/link';
import { categories, products } from '@/lib/catalog';
import { ProductCard } from '@/components/product-card';
import { StoreFooter } from '@/components/store-footer';
import { StoreHeader } from '@/components/store-header';

export function CategoryStorefront({ categorySlug }: { categorySlug: string }) {
  // El hook va antes de cualquier salida temprana: si no, la cantidad de hooks
  // cambia entre renders y React pierde el hilo del estado.
  const [visibleCount, setVisibleCount] = useState(24);
  const category = categories.find((item) => item.slug === categorySlug);
  if (!category) return null;
  const categoryProducts = products.filter((product) => product.category === category.name);
  const visibleProducts = categoryProducts.slice(0, visibleCount);
  return <main><StoreHeader /><div className="breadcrumbs section-shell"><Link href="/">Inicio</Link><span>›</span><strong>{category.name}</strong></div><section className={`category-hero ${category.tone}`}><div className="section-shell"><span className="category-hero-icon" aria-hidden="true">{category.icon}</span><p>explorá la colección</p><h1>{category.name}</h1><div>{category.description}</div></div></section><section className="products-section section-shell category-products"><div className="section-heading"><div><p>{categoryProducts.length} productos</p><h2>Catálogo {category.name}</h2></div></div>{categoryProducts.length ? <><div className="product-grid">{visibleProducts.map((product) => <ProductCard product={product} key={product.id} />)}</div>{visibleCount < categoryProducts.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 24)}>ver más productos</button>}</> : <div className="empty-state category-empty"><span>{category.icon}</span><h3>Estamos preparando esta colección</h3><p>Mientras tanto, podés descubrir nuestras otras categorías.</p><Link href="/#productos">ver productos disponibles</Link></div>}</section><section className="section-shell more-categories"><p>seguí explorando</p><div>{categories.filter((item) => item.slug !== category.slug).map((item) => <Link key={item.slug} href={`/categoria/${item.slug}`}>{item.name}<span>→</span></Link>)}</div></section><StoreFooter /></main>;
}
