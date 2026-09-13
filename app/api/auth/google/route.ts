import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { googleAuthorizeUrl, googleConfigured } from '@/lib/google-oauth';
import { getSiteUrl } from '@/lib/site-url';
import { createState } from '@/lib/oauth-state';

export const runtime = 'nodejs';

/** Arranca el ingreso con Google. */
export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.json({ message: 'El ingreso con Google no está configurado.' }, { status: 503 });
  }

  let siteUrl: string;
  try {
    siteUrl = getSiteUrl();
  } catch {
    return NextResponse.json(
      { message: 'Falta configurar la dirección pública de la tienda.' },
      { status: 503 },
    );
  }

  const env = serverEnv();
  const state = createState(env.PAYLOAD_SECRET);
  const response = NextResponse.redirect(googleAuthorizeUrl(siteUrl, state));

  // El state viaja también en una cookie: al volver se comparan y así una
  // respuesta de Google dirigida a otro navegador no sirve.
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  return response;
}
