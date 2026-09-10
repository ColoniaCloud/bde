'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { ProductImage } from '@/components/product-image';
import { useStore } from '@/components/store-provider';
import { currency } from '@/lib/format';

type Suggestion = {
  code: number;
  brand: string;
  name: string;
  price: number;
  image: string;
};

/**
 * Sugerencias a partir de la bolsa y los favoritos, que sólo existen en el
 * navegador. Se piden al servidor en lugar de recorrer un catálogo embebido.
 */
export function SuggestionsPanel() {
  const { customer } = useAuth();
  const { cart, favorites } = useStore();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const codes = [...new Set([...favorites, ...Object.keys(cart).map(Number)])].join(',');

  useEffect(() => {
    if (!codes) return;
    const controller = new AbortController();

    fetch(`/api/suggestions?codes=${codes}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no disponible'))))
      .then((data: { products: Suggestion[] }) => setSuggestions(data.products))
      .catch(() => setSuggestions([]));

    return () => controller.abort();
  }, [codes]);

  const accountName = customer?.email?.split('@')[0] || 'tu cuenta';

  return (
    <section className="story-banner section-shell">
      <div className="story-art"><span>boutique del este</span><b>Originales</b></div>
      <div className="story-copy suggestions-copy">
        <p>{customer ? `para ${accountName}` : 'sugerencias para vos'}</p>
        <h2>{customer ? 'Elegidos según tu recorrida.' : 'Entrá y descubrí ideas para tu próxima compra.'}</h2>
        <span>
          {customer
            ? 'Tomamos como referencia tus favoritos y tu bolsa para acercarte productos de la misma línea.'
            : 'Si entrás a tu cuenta, Boutique recuerda tus pedidos y tus favoritos entre dispositivos.'}
        </span>
        {suggestions.length > 0 && (
          <div className="suggestion-grid" aria-label="Sugerencias de productos">
            {suggestions.map((product) => (
              <article key={product.code}>
                <ProductImage src={product.image} alt={product.name} loading="lazy" />
                <div>
                  <span>{product.brand}</span>
                  <strong>{product.name}</strong>
                  <small>{currency.format(product.price)}</small>
                </div>
                <Link href={`/productos/${product.code}`}>ver</Link>
              </article>
            ))}
          </div>
        )}
        {customer
          ? <Link href="/#productos">seguir viendo productos</Link>
          : <Link href="/cuenta">ingresar a mi cuenta</Link>}
      </div>
    </section>
  );
}
