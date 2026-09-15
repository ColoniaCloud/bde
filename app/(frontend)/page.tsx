import Link from 'next/link';
import { ArrowRight, House, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { CategoryIcon } from '@/components/category-icon';
import { HomeFilters } from '@/components/home-filters';
import { ProductCard } from '@/components/product-card';
import { StoreFooter } from '@/components/store-footer';
import { StoreHeader } from '@/components/store-header';
import { SuggestionsPanel } from '@/components/suggestions-panel';
import { getCategories, listProducts, PAGE_SIZE } from '@/lib/products';

type Props = {
  searchParams: Promise<{ q?: string; categoria?: string; pagina?: string }>;
};

/** Conserva el filtro y la búsqueda al cambiar de página. */
function productsHref(params: { q?: string; categoria?: string; pagina?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.categoria) search.set('categoria', params.categoria);
  if (params.pagina && params.pagina > 1) search.set('pagina', String(params.pagina));
  const query = search.toString();
  return `/${query ? `?${query}` : ''}#productos`;
}

export default async function Home({ searchParams }: Props) {
  const { q, categoria, pagina } = await searchParams;
  const page = Math.max(1, Number(pagina) || 1);

  const [categories, { products, total, totalPages }] = await Promise.all([
    getCategories(),
    listProducts({ query: q, categorySlug: categoria, page }),
  ]);

  const selected = categoria ? categories.find((item) => item.slug === categoria) : undefined;
  const heading = q
    ? `Resultados para “${q}”`
    : selected
      ? selected.name
      : 'Catálogo completo';

  return (
    <main>
      <StoreHeader />

      <section id="inicio" className="hero catalog-hero" aria-label="Selección de belleza de Boutique del Este">
        <div className="hero-scrim" />
        <div className="hero-copy">
          <p>perfumería y cuidado personal · Uruguay</p>
          <h1 aria-label="Productos originales, cerca de vos.">
            <span className="hero-word">Productos</span>{' '}
            <span className="hero-word">originales,</span><br />
            <em><span className="hero-word">cerca</span>{' '}<span className="hero-word">de</span>{' '}<span className="hero-word">vos.</span></em>
          </h1>
          <span>Perfumes, cuidado personal y regalos con precios en pesos uruguayos. Enviamos en un máximo de 48 horas en Maldonado y Punta del Este.</span>
          <Link href="/#productos">Ver Catálogo</Link>
        </div>
        <div className="hero-stamp" aria-hidden="true">
          <svg className="hero-stamp-type" viewBox="0 0 128 128" focusable="false">
            <defs>
              <path id="hero-stamp-arc-top" d="M 8,64 A 56,56 0 0 0 120,64" />
            </defs>
            <g className="hero-stamp-ring hero-stamp-ring-one">
              <text><textPath href="#hero-stamp-arc-top" startOffset="50%" textLength="48" lengthAdjust="spacingAndGlyphs">BOUTIQUE ·</textPath></text>
            </g>
            <g className="hero-stamp-ring hero-stamp-ring-two">
              <text><textPath href="#hero-stamp-arc-top" startOffset="50%" textLength="48" lengthAdjust="spacingAndGlyphs">BOUTIQUE ·</textPath></text>
            </g>
            <g className="hero-stamp-ring hero-stamp-ring-three">
              <text><textPath href="#hero-stamp-arc-top" startOffset="50%" textLength="48" lengthAdjust="spacingAndGlyphs">BOUTIQUE</textPath></text>
            </g>
            <g className="hero-stamp-ring hero-stamp-ring-four">
              <text><textPath href="#hero-stamp-arc-top" startOffset="50%" textLength="48" lengthAdjust="spacingAndGlyphs">BOUTIQUE</textPath></text>
            </g>
            <g className="hero-stamp-ring hero-stamp-ring-five">
              <text><textPath href="#hero-stamp-arc-top" startOffset="50%" textLength="48" lengthAdjust="spacingAndGlyphs">BOUTIQUE</textPath></text>
            </g>
          </svg>
          <div className="hero-stamp-center"><span>DEL</span><strong>ESTE</strong></div>
        </div>
      </section>

      <section className="benefits" aria-label="Beneficios de compra">
        <article><span className="icon"><Truck /></span><div><strong>Envíos en hasta 48 horas</strong><span>Maldonado y Punta del Este</span></div></article>
        <article><span className="icon"><ShieldCheck /></span><div><strong>Precios claros</strong><span>expresados en pesos uruguayos</span></div></article>
        <article><span className="icon"><Sparkles /></span><div><strong>Selección cuidada</strong><span>productos originales de marcas elegidas</span></div></article>
        <article><span className="icon"><House /></span><div><strong>Atención cercana</strong><span>confirmamos disponibilidad al pedir</span></div></article>
      </section>

      <section className="category-section section-shell">
        <div className="section-heading">
          <div><p>comprá por categoría</p><h2>¿Qué estás buscando?</h2></div>
          <Link href="/#productos">ver todo <ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <Link className={`category-card ${category.tone}`} key={category.slug} href={`/categoria/${category.slug}`}>
              <span className="category-art"><CategoryIcon name={category.icon} /></span>
              <strong>{category.name}</strong>
              <small>abrir sección <ArrowRight aria-hidden="true" /></small>
            </Link>
          ))}
        </div>
      </section>

      <section id="productos" className="products-section section-shell">
        <div className="section-heading products-heading">
          <div><p>{total} productos</p><h2>{heading}</h2></div>
          <HomeFilters categories={categories} selected={categoria} query={q} />
        </div>

        {products.length ? (
          <div className="product-grid">
            {products.map((product) => <ProductCard product={product} key={product.code} />)}
          </div>
        ) : (
          <div className="empty-state">
            <span>⌕</span>
            <h3>No encontramos productos</h3>
            <p>Probá con otra búsqueda o mirá todas las categorías.</p>
            <Link href="/#productos">ver todos</Link>
          </div>
        )}

        {total > PAGE_SIZE && (
          <nav className="catalog-pagination" aria-label="Páginas del catálogo">
            {page > 1
              ? <Link href={productsHref({ q, categoria, pagina: page - 1 })}>← anterior</Link>
              : <span className="disabled">← anterior</span>}
            <span>Página {page} de {totalPages}</span>
            {page < totalPages
              ? <Link href={productsHref({ q, categoria, pagina: page + 1 })}>siguiente →</Link>
              : <span className="disabled">siguiente →</span>}
          </nav>
        )}
        <p className="demo-prices">Precios en pesos uruguayos. Stock y precio final sujetos a confirmación.</p>
      </section>

      <SuggestionsPanel />

      <section id="ekos-info" className="ekos-info section-shell" aria-labelledby="ekos-title">
        <div className="ekos-intro">
          <p>Natura Ekos</p>
          <h2 id="ekos-title">Productos Ekos para el cuerpo y el cabello</h2>
          <span>Ekos reúne productos para el cuerpo y el cabello elaborados con bioactivos de la biodiversidad amazónica. Cada línea aprovecha las propiedades de ingredientes como castaña, maracuyá, açaí, andiroba, cupuaçu, tukumá y murumuru.</span>
        </div>
        <div className="ekos-benefits">
          <article><b>01</b><h3>Cuidado para la piel</h3><p>Opciones que ayudan a hidratar, nutrir, perfumar y recuperar la sensación de suavidad.</p></article>
          <article><b>02</b><h3>Tratamiento para el cabello</h3><p>Líneas pensadas para nutrir, fortalecer, reparar y acompañar distintas necesidades capilares.</p></article>
          <article><b>03</b><h3>Repuestos y consumo consciente</h3><p>Muchos productos cuentan con repuesto, una alternativa que utiliza menos envase y permite continuar la rutina.</p></article>
        </div>
        <Link href={productsHref({ q: 'Ekos' })}>ver productos Ekos del catálogo</Link>
      </section>

      <StoreFooter />
    </main>
  );
}
