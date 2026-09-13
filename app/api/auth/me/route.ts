import { headers as nextHeaders } from 'next/headers';
import { NextResponse } from 'next/server';
import configPromise from '@payload-config';
import { getPayload } from 'payload';
import { googleConfigured } from '@/lib/google-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quién está con sesión iniciada, verificado en el servidor. */
export async function GET() {
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: await nextHeaders() });

  const customer = user?.collection === 'customers'
    ? { id: user.id, email: user.email, name: user.name ?? null }
    : null;

  return NextResponse.json({ customer, googleEnabled: googleConfigured() });
}
