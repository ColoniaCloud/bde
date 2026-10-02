'use client';

import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ProductImage } from '@/components/product-image';
import { currency } from '@/lib/format';

type Suggestion = { code: number; brand: string; name: string; price: number; image: string };

const MIN_LENGTH = 3;
const DEBOUNCE_MS = 200;

function resultsHref(query: string) {
  const search = query.trim();
  return search ? `/?q=${encodeURIComponent(search)}#productos` : '/#productos';
}

/** Buscador del encabezado: sugiere productos desde la tercera letra. */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);

  function fetchSuggestions(value: string) {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();

    const term = value.trim();
    if (term.length < MIN_LENGTH) {
      setSuggestions([]);
      setSearched('');
      setOpen(false);
      return;
    }

    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      request.current = controller;
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { products: Suggestion[]; total: number };
        setSuggestions(data.products);
        setTotal(data.total);
        setSearched(term);
        setActive(-1);
        setOpen(true);
      } catch {
        // Una búsqueda cancelada por otra más nueva no es un error.
      }
    }, DEBOUNCE_MS);
  }

  function submit() {
    // Navegación completa: la home es un componente de servidor y el ancla
    // #productos tiene que posicionarse después de cargar los resultados.
    window.location.href = resultsHref(query);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      setOpen(false);
      router.push(`/productos/${suggestions[active].code}`);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  const showList = open && searched.length >= MIN_LENGTH;

  return (
    <div className="search-box" onBlur={handleBlur}>
      <form className="search" onSubmit={(event) => { event.preventDefault(); submit(); }} role="search">
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); fetchSuggestions(event.target.value); }}
          onFocus={() => { if (suggestions.length > 0 || searched) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="¿qué estás buscando hoy?"
          aria-label="Buscar productos"
          aria-controls={listId}
          autoComplete="off"
        />
        <button aria-label="Buscar"><Search className="icon" /></button>
      </form>

      {showList && (
        <ul className="search-suggestions" id={listId} aria-label="Productos sugeridos">
          {suggestions.length === 0 ? (
            <li className="suggestion-empty">No encontramos productos para “{searched}”.</li>
          ) : (
            <>
              {suggestions.map((product, index) => (
                <li key={product.code}>
                  <Link
                    href={`/productos/${product.code}`}
                    className={index === active ? 'active' : undefined}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => setOpen(false)}
                  >
                    <ProductImage src={product.image} alt="" loading="lazy" />
                    <span>
                      <small>{product.brand}</small>
                      <strong>{product.name}</strong>
                    </span>
                    <span className="suggestion-price">{currency.format(product.price)}</span>
                  </Link>
                </li>
              ))}
              <li>
                <a className="suggestion-footer" href={resultsHref(searched)}>
                  Ver {total === 1 ? 'el resultado' : `los ${total} resultados`}
                </a>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
