import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { exchangeCodeForProfile, googleConfigured } from '@/lib/google-oauth';
import { logError, logWarning } from '@/lib/logger';
import { getSiteUrl } from '@/lib/site-url';
import { verifyState } from '@/lib/oauth-state';
import { signInWithGoogleProfile } from '@/lib/customers';

export const runtime = 'nodejs';

function back(reason: string) {
  return NextResponse.redirect(`${getSiteUrl()}/cuenta?error=${reason}`);
}

export async function GET(request: Request) {
  if (!googleConfigured()) return back('no-configurado');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('oauth_state='))
    ?.slice('oauth_state='.length);

  const env = serverEnv();

  // Tres comprobaciones, no una: la firma del state, que no haya expirado, y
  // que sea el mismo navegador que lo pidió.
  if (!verifyState(env.PAYLOAD_SECRET, state) || !state || state !== cookieState) {
    logWarning('callback de Google con state inválido');
    return back('state-invalido');
  }

  if (!code) return back('sin-codigo');

  try {
    const profile = await exchangeCodeForProfile(code, getSiteUrl());
    const { token } = await signInWithGoogleProfile(profile);

    const response = NextResponse.redirect(`${getSiteUrl()}/cuenta`);
    response.cookies.set('payload-token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.delete('oauth_state');

    return response;
  } catch (error) {
    logError('no se pudo completar el ingreso con Google', error);
    return back('fallo');
  }
}
