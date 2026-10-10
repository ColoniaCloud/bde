import { headers as nextHeaders } from 'next/headers';
import { NextResponse } from 'next/server';
import configPromise from '@payload-config';
import { getPayload } from 'payload';
import { normalizeFavorites } from '@/lib/favorites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Favoritos guardados en la cuenta del cliente con sesión.
 *
 * El navegador manda la lista completa (ya fusionada con la del dispositivo) y
 * acá se reemplaza: es una lista corta y así no hay que coordinar altas y bajas
 * sueltas entre dos pestañas.
 */

async function currentCustomer() {
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  return { payload, customer: user?.collection === 'customers' ? user : null };
}

export async function GET() {
  const { customer } = await currentCustomer();
  if (!customer) return NextResponse.json({ message: 'Ingresá a tu cuenta.' }, { status: 401 });

  return NextResponse.json(
    { favorites: normalizeFavorites(customer.favorites) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PUT(request: Request) {
  const { payload, customer } = await currentCustomer();
  if (!customer) return NextResponse.json({ message: 'Ingresá a tu cuenta.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { favorites?: unknown } | null;
  if (!body || !Array.isArray(body.favorites)) {
    return NextResponse.json({ message: 'Falta la lista de favoritos.' }, { status: 400 });
  }

  const favorites = normalizeFavorites(body.favorites);
  await payload.update({
    collection: 'customers',
    id: customer.id,
    data: { favorites },
    // El campo es de sólo lectura en el panel; lo escribe únicamente esta ruta,
    // y siempre sobre la cuenta de quien tiene la sesión.
    overrideAccess: true,
  });

  return NextResponse.json({ favorites });
}
