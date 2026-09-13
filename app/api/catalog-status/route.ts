import { NextResponse } from 'next/server';
import configPromise from '@payload-config';
import { getPayload } from 'payload';

export const runtime = 'nodejs';

/**
 * Fecha del último precio actualizado. Vive en su propia ruta para que el pie
 * de página no tenga que importar el catálogo entero sólo para mostrar una fecha.
 */
export async function GET() {
  const payload = await getPayload({ config: configPromise });
  const result = await payload.find({
    collection: 'products',
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
    select: { updatedAt: true },
  });

  return NextResponse.json({ updatedAt: result.docs[0]?.updatedAt ?? null });
}
