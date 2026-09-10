import 'server-only';
import { z } from 'zod';
import { serverEnv } from '@/lib/env.server';

/**
 * Ingreso con Google.
 *
 * Es aditivo: si no hay credenciales configuradas, la tienda no ofrece el botón
 * y el ingreso con correo y contraseña sigue funcionando.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export class GoogleAuthError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function googleConfigured() {
  const env = serverEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(siteUrl: string) {
  return `${siteUrl.replace(/\/$/, '')}/api/auth/google/callback`;
}

export function googleAuthorizeUrl(siteUrl: string, state: string) {
  const env = serverEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(siteUrl),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Sin esto Google devuelve la sesión ya elegida sin dejar cambiar de cuenta.
    prompt: 'select_account',
  });

  return `${AUTH_URL}?${params.toString()}`;
}

const profileSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
  name: z.string().optional(),
});

export type GoogleProfile = z.infer<typeof profileSchema>;

/** Canjea el código por un token y devuelve el perfil. */
export async function exchangeCodeForProfile(code: string, siteUrl: string): Promise<GoogleProfile> {
  const env = serverEnv();
  const base = env.GOOGLE_BASE_URL?.replace(/\/$/, '');

  const tokenResponse = await fetch(base ? `${base}/token` : TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(siteUrl),
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  if (!tokenResponse.ok) {
    throw new GoogleAuthError('Google rechazó el código de autorización.');
  }

  const tokens = await tokenResponse.json().catch(() => null) as { access_token?: string } | null;
  if (!tokens?.access_token) throw new GoogleAuthError('Google no devolvió un token.');

  const profileResponse = await fetch(base ? `${base}/userinfo` : USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: 'no-store',
  });

  if (!profileResponse.ok) throw new GoogleAuthError('No se pudo leer el perfil de Google.');

  const parsed = profileSchema.safeParse(await profileResponse.json().catch(() => null));
  if (!parsed.success) throw new GoogleAuthError('El perfil de Google no tiene la forma esperada.');

  // Un correo sin verificar permitiría reclamar la cuenta de otra persona.
  const verified = parsed.data.email_verified;
  if (verified === false || verified === 'false') {
    throw new GoogleAuthError('La cuenta de Google no tiene el correo verificado.', 400);
  }

  return parsed.data;
}
