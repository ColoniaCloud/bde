import { headers as nextHeaders } from 'next/headers';
import { NextResponse } from 'next/server';
import configPromise from '@payload-config';
import { getPayload } from 'payload';
import { DeliveryError, normalizeDelivery, storedDelivery } from '@/lib/delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Nombre y datos de entrega del cliente con sesión, para que el checkout se
 * complete solo. Siempre sobre la cuenta de quien tiene la sesión: el id no
 * viene del navegador.
 */
export async function PUT(request: Request) {
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'customers') {
    return NextResponse.json({ message: 'Ingresá a tu cuenta.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { name?: unknown; delivery?: unknown } | null;
  if (!body) return NextResponse.json({ message: 'Faltan los datos.' }, { status: 400 });

  let name: string | undefined;
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return NextResponse.json({ message: 'El nombre no es válido.' }, { status: 400 });
    name = body.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ message: 'Ingresá tu nombre y apellido.' }, { status: 400 });
    }
  }

  let delivery;
  try {
    delivery = normalizeDelivery(body.delivery);
  } catch (error) {
    if (error instanceof DeliveryError) return NextResponse.json({ message: error.message }, { status: 400 });
    throw error;
  }

  const updated = await payload.update({
    collection: 'customers',
    id: user.id,
    data: {
      ...(name ? { name } : {}),
      // Se reemplaza el grupo entero: un campo que la persona borró queda vacío.
      delivery: {
        phone: delivery.phone ?? null,
        address: delivery.address ?? null,
        city: delivery.city ?? null,
        notes: delivery.notes ?? null,
      },
    },
    overrideAccess: true,
  });

  return NextResponse.json({
    customer: { name: updated.name ?? null, delivery: storedDelivery(updated.delivery) },
  });
}
