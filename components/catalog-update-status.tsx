'use client';

import { useEffect, useState } from 'react';

const formatter = new Intl.DateTimeFormat('es-UY', {
  dateStyle: 'short',
  timeStyle: 'short',
  hour12: false,
  timeZone: 'America/Montevideo',
});

/**
 * Antes leía una constante de app/catalog-data.ts, lo que arrastraba el catálogo
 * entero al bundle del navegador para mostrar una sola fecha. Ahora la consulta.
 */
export function CatalogUpdateStatus() {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/catalog-status', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no disponible'))))
      .then((data: { updatedAt: string | null }) => setUpdatedAt(data.updatedAt))
      .catch(() => setUpdatedAt(null));

    return () => controller.abort();
  }, []);

  if (!updatedAt) return null;

  return (
    <span className="catalog-update-status">
      Última actualización de precios:{' '}
      <time dateTime={updatedAt}>{formatter.format(new Date(updatedAt))} h</time>
    </span>
  );
}
