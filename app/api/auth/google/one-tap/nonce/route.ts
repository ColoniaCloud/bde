import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { googleConfigured } from '@/lib/google-oauth';
import { createState } from '@/lib/oauth-state';
import { NONCE_COOKIE, NONCE_COOKIE_PATH, NONCE_MAX_AGE_MS } from '@/lib/one-tap-nonce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Entrega el ID de cliente y un nonce firmado para «Continuar como…», y deja el
 * mismo nonce en una cookie httpOnly.
 *
 * Es POST a propósito: una caché delante del sitio (CDN, LiteSpeed) puede
 * guardar una respuesta GET y servirle a otro navegador el nonce de alguien
 * más, que ya no coincide con su cookie. Un POST no se cachea nunca.
 */
export async function POST() {
  if (!googleConfigured()) {
    return NextResponse.json({ enabled: false });
  }

  const env = serverEnv();
  const nonce = createState(env.PAYLOAD_SECRET);
  const response = NextResponse.json(
    { enabled: true, clientId: env.GOOGLE_CLIENT_ID, nonce },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );

  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: NONCE_COOKIE_PATH,
    maxAge: NONCE_MAX_AGE_MS / 1000,
  });

  return response;
}
