import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';
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
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
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

/** No se pudieron traer las claves de Google; `detail` dice qué respondió el servidor. */
export class GoogleKeysError extends Error {
  constructor(public detail: string) {
    super(`No se pudieron obtener las claves públicas de Google: ${detail}`);
  }
}

function rejectionOf(error: unknown): GoogleIdTokenRejection {
  if (error instanceof GoogleKeysError) return 'claves-inaccesibles';
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

type CachedKeys = { url: string; keys: JWTVerifyGetKey; expiresAt: number };
let cachedKeys: CachedKeys | undefined;

/**
 * Claves públicas de Google, guardadas en memoria el tiempo que indica su
 * Cache-Control (Google las rota cada tanto y avisa con ese encabezado).
 *
 * Se descargan con un fetch propio en lugar del de jose para poder seguir
 * redirecciones, esperar más y, sobre todo, registrar qué respondió el servidor
 * cuando falla: en Hostinger la descarga devolvía algo distinto de 200 y jose
 * sólo decía «error genérico».
 */
export function googleKeys(baseUrl?: string, fetchImpl: typeof fetch = fetch): JWTVerifyGetKey {
  const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/certs` : GOOGLE_CERTS_URL;

  return async (header, token) => {
    if (!cachedKeys || cachedKeys.url !== url || cachedKeys.expiresAt <= Date.now()) {
      cachedKeys = { url, ...(await downloadKeys(url, fetchImpl)) };
    }

    try {
      return await cachedKeys.keys(header, token);
    } catch (error) {
      // Si Google rotó las claves antes de tiempo, se baja el juego nuevo una vez.
      if (!(error instanceof errors.JWKSNoMatchingKey)) throw error;
      cachedKeys = { url, ...(await downloadKeys(url, fetchImpl)) };
      return cachedKeys.keys(header, token);
    }
  };
}

async function downloadKeys(url: string, fetchImpl: typeof fetch) {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    throw new GoogleKeysError(cause ?? (error instanceof Error ? error.name : 'sin respuesta'));
  }

  const type = response.headers.get('content-type') ?? 'sin tipo';
  if (!response.ok) throw new GoogleKeysError(`HTTP ${response.status} ${type}`);

  const body = await response.json().catch(() => null) as JSONWebKeySet | null;
  if (!body || !Array.isArray(body.keys)) throw new GoogleKeysError(`respuesta sin claves (${type})`);

  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  return { keys: createLocalJWKSet(body), expiresAt: Date.now() + Math.min(Math.max(maxAge, 60), 86_400) * 1000 };
}

/** Los mismos controles para los dos caminos de verificación. */
function checkClaims(payload: unknown, nonce: string): GoogleIdTokenProfile {
  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(',');
    throw new GoogleIdTokenError('El token de Google no tiene la forma esperada.', 'forma', fields);
  }

  const claims = parsed.data;
  if (!claims.nonce) throw new GoogleIdTokenError('El token de Google no corresponde a este navegador.', 'sin-nonce');
  if (claims.nonce !== nonce) {
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
    const detail = error instanceof GoogleKeysError
      ? error.detail
      : error instanceof errors.JOSEError
        ? [error.code, error instanceof errors.JWTClaimValidationFailed ? error.claim : ''].filter(Boolean).join(' ')
        : error instanceof Error ? error.name : undefined;
    throw new GoogleIdTokenError('El token de Google no es válido.', rejectionOf(error), detail);
  }

  return checkClaims(payload, options.nonce);
}

const tokenInfoSchema = z.object({
  aud: z.string(),
  iss: z.string(),
  exp: z.coerce.number(),
}).loose();

/**
 * Plan B cuando no se pueden descargar las claves: se le pide a Google que
 * verifique la firma (endpoint tokeninfo, en oauth2.googleapis.com, el mismo
 * servidor que usa el ingreso por redirección) y acá se controla igual todo lo
 * demás: destinatario, emisor, vencimiento, nonce y correo verificado.
 */
export async function verifyGoogleIdTokenWithTokenInfo(
  credential: string,
  options: { clientId: string; nonce: string; baseUrl?: string; fetchImpl?: typeof fetch; now?: Date },
): Promise<GoogleIdTokenProfile> {
  const base = options.baseUrl ? `${options.baseUrl.replace(/\/$/, '')}/tokeninfo` : GOOGLE_TOKENINFO_URL;
  const url = `${base}?id_token=${encodeURIComponent(credential)}`;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    throw new GoogleIdTokenError('No se pudo verificar con Google.', 'claves-inaccesibles', `tokeninfo ${cause ?? 'sin respuesta'}`);
  }

  // Google responde 400 cuando el token no es válido (firma, formato, vencido).
  if (response.status === 400) throw new GoogleIdTokenError('El token de Google no es válido.', 'firma', 'tokeninfo 400');
  if (!response.ok) {
    throw new GoogleIdTokenError('No se pudo verificar con Google.', 'claves-inaccesibles', `tokeninfo HTTP ${response.status}`);
  }

  const info = tokenInfoSchema.safeParse(await response.json().catch(() => null));
  if (!info.success) throw new GoogleIdTokenError('El token de Google no tiene la forma esperada.', 'forma', 'tokeninfo');

  if (info.data.aud !== options.clientId) throw new GoogleIdTokenError('El token de Google no es válido.', 'audiencia', 'tokeninfo');
  if (!GOOGLE_ISSUERS.includes(info.data.iss)) throw new GoogleIdTokenError('El token de Google no es válido.', 'emisor', 'tokeninfo');
  const now = (options.now ?? new Date()).getTime() / 1000;
  if (info.data.exp + 60 < now) throw new GoogleIdTokenError('El token de Google no es válido.', 'vencido', 'tokeninfo');

  return checkClaims(info.data, options.nonce);
}
