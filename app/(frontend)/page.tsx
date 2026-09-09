'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { ProductCard } from '@/components/product-card';
import { ProductImage } from '@/components/product-image';
import { StoreFooter } from '@/components/store-footer';
import { Icon, StoreHeader } from '@/components/store-header';
import { useStore } from '@/components/store-provider';
import { categories, currency, products } from '@/lib/catalog';

const PAGE_SIZE = 24;

// «Luz roja» es una categoría de consulta: tiene ficha propia pero ningún
// producto cargado, así que no corresponde ofrecerla como filtro del catálogo.
const filterableCategories = categories.filter((category) =>
  products.some((product) => product.category === category.name),
);

function scrollToProducts() {
  document.querySelector('#productos')?.scrollIntoView({ behavior: 'smooth' });
}

export default function Home() {
  const { user, signInWithGoogle } = useAuth();
  const { cart, favorites, cartCount, openCart } = useStore();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search).get('q');
    if (search) setQuery(search);
  }, []);

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('es');
    return products.filter((product) => {
      const categoryMatch = selectedCategory === 'Todos' || product.category === selectedCategory;
      const textMatch = !text
        || `${product.brand} ${product.name} ${product.category}`.toLocaleLowerCase('es').includes(text);
      return categoryMatch && textMatch;
    });
  }, [query, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleProducts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const suggestionProducts = useMemo(() => {
    const referenceIds = [...favorites, ...Object.keys(cart).map(Number)];
    const referenceCategories = products
      .filter((product) => referenceIds.includes(product.id))
      .map((product) => product.category);
    const personalized = products.filter(
      (product) => referenceCategories.includes(product.category) && !referenceIds.includes(product.id),
    );
    const fallback = products.filter((product) => product.discount || product.tag);

    return (personalized.length ? personalized : fallback).slice(0, 3);
  }, [cart, favorites]);

  const accountName = user?.email?.split('@')[0] || 'tu cuenta';

  function chooseCategory(category: string) {
    setSelectedCategory(category);
    setPage(1);
    window.setTimeout(scrollToProducts, 20);
  }

  function changePage(next: number) {
    setPage(next);
    scrollToProducts();
  }

  function showEkosProducts() {
    setQuery('Ekos');
    setSelectedCategory('Todos');
    setPage(1);
    window.setTimeout(scrollToProducts, 20);
  }

  return (
    <main>
      <StoreHeader />

      <aside className="brand-disclaimer" aria-label="Información de la tienda">
        <strong>Tienda independiente</strong>
        <span>Comercializamos productos originales de marcas seleccionadas. No somos el sitio oficial de Natura.</span>
      </aside>
      <div className="shipping-notice">Maldonado y Punta del Este: entrega en hasta 48 h · Interior: despachamos en hasta 48 h por UES o Correo Uruguayo</div>

      <section id="inicio" className="hero catalog-hero" aria-label="Selección de belleza de Boutique del Este">
        <div className="hero-scrim" />
        <div className="hero-copy">
          <p>perfumería y cuidado personal · Uruguay</p>
          <h1>Productos originales,<br /><em>cerca de vos.</em></h1>
          <span>Perfumes, cuidado personal y regalos con precios en pesos uruguayos. Enviamos en un máximo de 48 horas en Maldonado y Punta del Este.</span>
          <button onClick={scrollToProducts}>ver catálogo</button>
        </div>
        <div className="hero-stamp" aria-hidden="true"><span>DEL</span><strong>ESTE</strong></div>
      </section>

      <section className="benefits" aria-label="Beneficios de compra">
        <article><Icon>◇</Icon><div><strong>Envíos en hasta 48 horas</strong><span>Maldonado y Punta del Este</span></div></article>
        <article><Icon>◎</Icon><div><strong>Precios claros</strong><span>expresados en pesos uruguayos</span></div></article>
        <article><Icon>✦</Icon><div><strong>Selección cuidada</strong><span>productos originales de marcas elegidas</span></div></article>
        <article><Icon>⌂</Icon><div><strong>Atención cercana</strong><span>confirmamos disponibilidad al pedir</span></div></article>
      </section>

      <section className="category-section section-shell">
        <div className="section-heading">
          <div><p>comprá por categoría</p><h2>¿Qué estás buscando?</h2></div>
          <button onClick={() => chooseCategory('Todos')}>ver todo <span>→</span></button>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <Link className={`category-card ${category.tone}`} key={category.slug} href={`/categoria/${category.slug}`}>
              <span className="category-art">{category.icon}</span>
              <strong>{category.name}</strong>
              <small>abrir sección <b>→</b></small>
            </Link>
          ))}
        </div>
      </section>

      <section id="productos" className="products-section section-shell">
        <div className="section-heading products-heading">
          <div>
            <p>{filtered.length} productos</p>
            <h2>{query ? `Resultados para “${query}”` : selectedCategory === 'Todos' ? 'Catálogo completo' : selectedCategory}</h2>
          </div>
          <div className="filter-pills" aria-label="Filtrar productos">
            {['Todos', ...filterableCategories.map((category) => category.name)].map((category) => (
              <button
                key={category}
                className={selectedCategory === category ? 'active' : ''}
                onClick={() => { setSelectedCategory(category); setPage(1); }}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {filtered.length ? (
          <div className="product-grid">
            {visibleProducts.map((product) => <ProductCard product={product} key={product.id} />)}
          </div>
        ) : (
          <div className="empty-state">
            <span>⌕</span>
            <h3>No encontramos productos</h3>
            <p>Probá con otra búsqueda o mirá todas las categorías.</p>
            <button onClick={() => { setQuery(''); setSelectedCategory('Todos'); setPage(1); }}>ver todos</button>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <nav className="catalog-pagination" aria-label="Páginas del catálogo">
            <button disabled={page === 1} onClick={() => changePage(Math.max(1, page - 1))}>← anterior</button>
            <span>Página {page} de {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => changePage(Math.min(totalPages, page + 1))}>siguiente →</button>
          </nav>
        )}
        <p className="demo-prices">Precios en pesos uruguayos. Stock y precio final sujetos a confirmación.</p>
      </section>

      <section className="story-banner section-shell">
        <div className="story-art"><span>boutique del este</span><b>Originales</b></div>
        <div className="story-copy suggestions-copy">
          <p>{user ? `para ${accountName}` : 'sugerencias para vos'}</p>
          <h2>{user ? 'Elegidos según tu recorrida.' : 'Entrá y descubrí ideas para tu próxima compra.'}</h2>
          <span>
            {user
              ? 'Tomamos como referencia tus favoritos y tu bolsa para acercarte productos de la misma línea.'
              : 'Podés entrar con Google para que Boutique recuerde tu cuenta y te muestre una selección más cercana a lo que mirás.'}
          </span>
          <div className="suggestion-grid" aria-label="Sugerencias de productos">
            {suggestionProducts.map((product) => (
              <article key={product.id}>
                <ProductImage src={product.image} alt={product.name} loading="lazy" />
                <div>
                  <span>{product.brand}</span>
                  <strong>{product.name}</strong>
                  <small>{currency.format(product.price)}</small>
                </div>
                <Link href={`/productos/${product.sku}`}>ver</Link>
              </article>
            ))}
          </div>
          {user
            ? <a href="#productos">seguir viendo productos</a>
            : <button onClick={() => void signInWithGoogle()}>ingresar con Google</button>}
        </div>
      </section>

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
        <button onClick={showEkosProducts}>ver productos Ekos del catálogo</button>
      </section>

      <section className="newsletter service-callout">
        <div>
          <p>pedido por WhatsApp</p>
          <h2>Armá tu bolsa y envianos el pedido</h2>
          <span>Confirmamos la disponibilidad y coordinamos el envío en un máximo de 48 horas en Maldonado o Punta del Este.</span>
        </div>
        <button onClick={openCart}>ver mi bolsa ({cartCount})</button>
      </section>

      <StoreFooter />
    </main>
  );
}
