import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { signInWithGoogleProfile } from '@/lib/customers';
import { serverEnv } from '@/lib/env.server';
import { GoogleIdTokenError, googleKeys, verifyGoogleIdToken } from '@/lib/google-id-token';
import { googleConfigured } from '@/lib/google-oauth';
import { logError, logWarning } from '@/lib/logger';
import { createState, verifyState } from '@/lib/oauth-state';
import { hitRateLimit, requestKey } from '@/lib/rate-limit';
import { setSessionCookie } from '@/lib/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ingreso con «Continuar como…» (Google One Tap).
 *
 * GET entrega al navegador el ID de cliente y un nonce firmado, que también
 * queda en una cookie. Google copia ese nonce dentro del token que firma, y el
 * POST exige que coincidan: un token capturado en otro navegador, o que un
 * sitio ajeno intente enviarnos para iniciar sesión con *su* cuenta (CSRF de
 * login), no trae el nonce de la cookie de este navegador.
 */

const NONCE_COOKIE = 'google_nonce';
// One Tap puede quedar abierto mientras la persona mira la tienda: más margen
// que los diez minutos del flujo por redirección.
const NONCE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.json({ enabled: false });
  }

  const env = serverEnv();
  const nonce = createState(env.PAYLOAD_SECRET);
  const response = NextResponse.json(
    { enabled: true, clientId: env.GOOGLE_CLIENT_ID, nonce },
    { headers: { 'Cache-Control': 'no-store' } },
  );

  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/api/auth/google',
    maxAge: NONCE_MAX_AGE_MS / 1000,
  });

  return response;
}

export async function POST(request: Request) {
  if (!googleConfigured()) {
    return NextResponse.json({ message: 'El ingreso con Google no está configurado.' }, { status: 503 });
  }

  const limit = await hitRateLimit(requestKey(request, 'google-one-tap'), 10, 10);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: 'Realizaste varios intentos. Esperá unos minutos y volvé a probar.' },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null) as { credential?: unknown } | null;
  const credential = typeof body?.credential === 'string' ? body.credential : '';
  if (!credential || credential.length > 4096) {
    return NextResponse.json({ message: 'Falta la credencial de Google.' }, { status: 400 });
  }

  const env = serverEnv();
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value ?? null;
  if (!verifyState(env.PAYLOAD_SECRET, nonce, Date.now(), NONCE_MAX_AGE_MS) || !nonce) {
    logWarning('One Tap sin nonce válido');
    return NextResponse.json(
      { message: 'La sesión de ingreso venció. Recargá la página y probá de nuevo.' },
      { status: 400 },
    );
  }

  try {
    const profile = await verifyGoogleIdToken(credential, {
      clientId: env.GOOGLE_CLIENT_ID!,
      nonce,
      keys: googleKeys(env.GOOGLE_BASE_URL),
    });
    const { customer, token } = await signInWithGoogleProfile(profile);

    const response = NextResponse.json({
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name ?? null,
        picture: customer.picture ?? null,
      },
    });
    setSessionCookie(response, token);
    // El nonce es de un solo uso.
    response.cookies.set(NONCE_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });

    return response;
  } catch (error) {
    if (error instanceof GoogleIdTokenError) {
      logWarning('One Tap con token rechazado', { reason: error.message });
      return NextResponse.json({ message: 'No pudimos verificar tu cuenta de Google.' }, { status: 401 });
    }

    logError('no se pudo completar el ingreso con One Tap', error);
    return NextResponse.json(
      { message: 'No pudimos completar el ingreso. Probá de nuevo en unos minutos.' },
      { status: 502 },
    );
  }
}
