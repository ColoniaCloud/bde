import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

/**
 * Verificación del ID token que entrega «Continuar como…» (Google One Tap).
 *
 * A diferencia del flujo por redirección, acá el navegador recibe de Google un
 * JWT firmado y nos lo pasa. Nada de lo que trae vale hasta comprobar:
 *
 * - la firma, con las claves públicas de Google;
 * - el emisor (`iss`) y el destinatario (`aud` = nuestro ID de cliente), para
 *   que no sirva un token emitido para otra aplicación;
 * - el vencimiento;
 * - el `nonce`, que tiene que ser el que emitimos para este navegador: así un
 *   token capturado no se puede reenviar desde otro lado;
 * - que el correo esté verificado, igual que en el flujo por redirección.
 *
 * Es lógica pura (el juego de claves se inyecta) para poder probarla sin red.
 */

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export class GoogleIdTokenError extends Error {}

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
  name: z.string().optional(),
  picture: z.url().optional(),
  nonce: z.string().optional(),
});

export type GoogleIdTokenProfile = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

let remoteKeys: JWTVerifyGetKey | undefined;

/** Claves públicas de Google. jose las cachea y las renueva cuando rotan. */
export function googleKeys(baseUrl?: string): JWTVerifyGetKey {
  if (baseUrl) return createRemoteJWKSet(new URL(`${baseUrl.replace(/\/$/, '')}/certs`));
  remoteKeys ??= createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));
  return remoteKeys;
}

export async function verifyGoogleIdToken(
  credential: string,
  options: { clientId: string; nonce: string; keys: JWTVerifyGetKey; now?: Date },
): Promise<GoogleIdTokenProfile> {
  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(credential, options.keys, {
      issuer: GOOGLE_ISSUERS,
      audience: options.clientId,
      algorithms: ['RS256'],
      currentDate: options.now,
      // Margen para relojes un poco desfasados entre Google y el servidor.
      clockTolerance: 60,
    }));
  } catch {
    throw new GoogleIdTokenError('El token de Google no es válido.');
  }

  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) throw new GoogleIdTokenError('El token de Google no tiene la forma esperada.');

  const claims = parsed.data;
  if (!claims.nonce || claims.nonce !== options.nonce) {
    throw new GoogleIdTokenError('El token de Google no corresponde a este navegador.');
  }

  // Un correo sin verificar permitiría reclamar la cuenta de otra persona.
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new GoogleIdTokenError('La cuenta de Google no tiene el correo verificado.');
  }

  return { sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture };
}
