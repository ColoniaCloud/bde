import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { signInWithGoogleProfile } from '@/lib/customers';
import { serverEnv } from '@/lib/env.server';
import {
  GoogleIdTokenError,
  googleKeys,
  verifyGoogleIdToken,
  verifyGoogleIdTokenWithTokenInfo,
} from '@/lib/google-id-token';
import { googleConfigured } from '@/lib/google-oauth';
import { logError, logWarning } from '@/lib/logger';
import { verifyState } from '@/lib/oauth-state';
import { NONCE_COOKIE, NONCE_COOKIE_PATH, NONCE_MAX_AGE_MS } from '@/lib/one-tap-nonce';
import { hitRateLimit, requestKey } from '@/lib/rate-limit';
import { setSessionCookie } from '@/lib/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ingreso con «Continuar como…» (Google One Tap).
 *
 * /api/auth/google/one-tap/nonce entrega al navegador el ID de cliente y un
 * nonce firmado, que también queda en una cookie. Google copia ese nonce dentro
 * del token que firma, y este POST exige que coincidan: un token capturado en otro navegador, o que un
 * sitio ajeno intente enviarnos para iniciar sesión con *su* cuenta (CSRF de
 * login), no trae el nonce de la cookie de este navegador.
 */

/**
 * Verifica con las claves públicas de Google y, si no se pueden descargar, con
 * el endpoint tokeninfo de Google. En Hostinger la descarga de las claves llegó
 * a fallar; así el ingreso no depende de un único servidor de Google.
 */
async function verifyCredential(credential: string, clientId: string, nonce: string, baseUrl?: string) {
  try {
    return await verifyGoogleIdToken(credential, { clientId, nonce, keys: googleKeys(baseUrl) });
  } catch (error) {
    if (!(error instanceof GoogleIdTokenError) || error.reason !== 'claves-inaccesibles') throw error;
    logWarning(`One Tap sin claves de Google, se verifica con tokeninfo: ${error.detail ?? 'sin detalle'}`, {
      detail: error.detail,
    });
    return verifyGoogleIdTokenWithTokenInfo(credential, { clientId, nonce, baseUrl });
  }
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
    const profile = await verifyCredential(credential, env.GOOGLE_CLIENT_ID!, nonce, env.GOOGLE_BASE_URL);
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
    response.cookies.set(NONCE_COOKIE, '', { path: NONCE_COOKIE_PATH, maxAge: 0 });

    return response;
  } catch (error) {
    if (error instanceof GoogleIdTokenError) {
      // El motivo va en el mensaje: el visor de logs de Hostinger muestra sólo eso.
      // Si el nonce no coincide, saber si igual lo firmó la tienda distingue una
      // respuesta cacheada (nonce nuestro pero de otro momento) de un token ajeno.
      const detail = error.reason === 'nonce-distinto'
        ? (verifyState(env.PAYLOAD_SECRET, error.tokenNonce ?? null, Date.now(), 24 * 60 * 60 * 1000)
          ? 'firmado por la tienda'
          : 'no firmado por la tienda')
        : error.detail;
      // El motivo va en el mensaje: el visor de logs de Hostinger muestra sólo eso.
      logWarning(`One Tap con token rechazado: ${error.reason}${detail ? ` (${detail})` : ''}`, {
        reason: error.reason,
        detail,
      });
      return NextResponse.json({ message: 'No pudimos verificar tu cuenta de Google.' }, { status: 401 });
    }

    logError('no se pudo completar el ingreso con One Tap', error);
    return NextResponse.json(
      { message: 'No pudimos completar el ingreso. Probá de nuevo en unos minutos.' },
      { status: 502 },
    );
  }
}
