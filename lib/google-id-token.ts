import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
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

/**
 * Por qué se rechazó el token. Va al log tal cual: sin esto, «no es válido» no
 * alcanza para saber si falló la firma, el ID de cliente, el reloj o el nonce.
 */
export type GoogleIdTokenRejection =
  | 'firma'
  | 'audiencia'
  | 'emisor'
  | 'vencido'
  | 'todavia-no-vigente'
  | 'claves-sin-coincidencia'
  | 'claves-sin-respuesta'
  | 'claves-inaccesibles'
  | 'mal-formado'
  | 'forma'
  | 'sin-nonce'
  | 'nonce-distinto'
  | 'correo-sin-verificar';

export class GoogleIdTokenError extends Error {
  /** `detail` es técnico y sin datos personales: un código de error o el nombre de un campo. */
  constructor(
    message: string,
    public reason: GoogleIdTokenRejection,
    public detail?: string,
    /** El nonce que traía el token, para diagnosticar un nonce distinto. No se registra tal cual. */
    public tokenNonce?: string,
  ) {
    super(message);
  }
}

function rejectionOf(error: unknown): GoogleIdTokenRejection {
  if (error instanceof errors.JWTExpired) return 'vencido';
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === 'aud') return 'audiencia';
    if (error.claim === 'iss') return 'emisor';
    if (error.claim === 'nbf' || error.claim === 'iat') return 'todavia-no-vigente';
    return 'forma';
  }
  if (error instanceof errors.JWSSignatureVerificationFailed) return 'firma';
  if (error instanceof errors.JWKSNoMatchingKey) return 'claves-sin-coincidencia';
  if (error instanceof errors.JWKSTimeout) return 'claves-sin-respuesta';
  if (error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid) return 'mal-formado';
  // Cualquier otra cosa es no haber podido traer las claves de Google (red, DNS).
  return 'claves-inaccesibles';
}

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
  } catch (error) {
    const detail = error instanceof errors.JOSEError
      ? [error.code, error instanceof errors.JWTClaimValidationFailed ? error.claim : ''].filter(Boolean).join(' ')
      : error instanceof Error ? error.name : undefined;
    throw new GoogleIdTokenError('El token de Google no es válido.', rejectionOf(error), detail);
  }

  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(',');
    throw new GoogleIdTokenError('El token de Google no tiene la forma esperada.', 'forma', fields);
  }

  const claims = parsed.data;
  if (!claims.nonce) throw new GoogleIdTokenError('El token de Google no corresponde a este navegador.', 'sin-nonce');
  if (claims.nonce !== options.nonce) {
    throw new GoogleIdTokenError(
      'El token de Google no corresponde a este navegador.',
      'nonce-distinto',
      undefined,
      claims.nonce,
    );
  }

  // Un correo sin verificar permitiría reclamar la cuenta de otra persona.
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new GoogleIdTokenError('La cuenta de Google no tiene el correo verificado.', 'correo-sin-verificar');
  }

  return { sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture };
}
