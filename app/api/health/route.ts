import { NextResponse } from 'next/server';
import configPromise from '@payload-config';
import { getPayload } from 'payload';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Estado del servicio, para el monitoreo externo.
 *
 * Comprueba lo que realmente hace falta para vender: que la base responda y
 * que el catálogo tenga productos. Una aplicación que arranca pero no puede
 * consultar la base no está «arriba».
 *
 * No expone versiones, rutas ni configuración: es una ruta pública.
 */
export async function GET() {
  const started = Date.now();

  try {
    const payload = await getPayload({ config: configPromise });
    const products = await payload.count({ collection: 'products' });

    const healthy = products.totalDocs > 0;

    return NextResponse.json(
      {
        status: healthy ? 'ok' : 'degraded',
        database: 'ok',
        products: products.totalDocs,
        checkedInMs: Date.now() - started,
      },
      { status: healthy ? 200 : 503 },
    );
  } catch (error) {
    // El detalle va al log, no a la respuesta: el mensaje de una excepción de
    // base puede revelar el host o el usuario de conexión.
    logError('health check: la base no responde', error);
    return NextResponse.json(
      { status: 'error', database: 'unreachable', checkedInMs: Date.now() - started },
      { status: 503 },
    );
  }
}
