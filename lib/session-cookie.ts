import 'server-only';
import type { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';

/** Deja en la respuesta la cookie de sesión del cliente, con la misma vida que el token. */
export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('payload-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: serverEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}
