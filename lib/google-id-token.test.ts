import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GoogleIdTokenError,
  googleKeys,
  verifyGoogleIdToken,
  verifyGoogleIdTokenWithTokenInfo,
} from '@/lib/google-id-token';

const CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';
const NONCE = 'nonce-de-este-navegador';

type Signer = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let googleKey: Signer;
let foreignKey: Signer;
let keys: JWTVerifyGetKey;
let publicJwk: Record<string, unknown>;

beforeAll(async () => {
  const google = await generateKeyPair('RS256');
  googleKey = google.privateKey;
  foreignKey = (await generateKeyPair('RS256')).privateKey;

  const jwk = await exportJWK(google.publicKey);
  publicJwk = { ...jwk, kid: 'google', alg: 'RS256' };
  keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'google', alg: 'RS256' }] });
});

const baseClaims = {
  email: 'ana@ejemplo.com',
  email_verified: true,
  name: 'Ana Pérez',
  picture: 'https://lh3.googleusercontent.com/a/foto',
  nonce: NONCE,
};

function sign(
  claims: Record<string, unknown> = {},
  { key = googleKey, issuer = 'https://accounts.google.com', audience = CLIENT_ID, expiresIn = '1h' }: {
    key?: Signer;
    issuer?: string;
    audience?: string;
    expiresIn?: string;
  } = {},
) {
  return new SignJWT({ ...baseClaims, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'google' })
    .setSubject('1234567890')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

const verify = (credential: string) => verifyGoogleIdToken(credential, { clientId: CLIENT_ID, nonce: NONCE, keys });

/** El motivo del rechazo, que es lo que se registra en el log. */
async function rejection(credential: string, verifyKeys: JWTVerifyGetKey = keys) {
  try {
    await verifyGoogleIdToken(credential, { clientId: CLIENT_ID, nonce: NONCE, keys: verifyKeys });
  } catch (error) {
    if (error instanceof GoogleIdTokenError) return { reason: error.reason, detail: error.detail, tokenNonce: error.tokenNonce };
    throw error;
  }
  throw new Error('se esperaba un rechazo');
}

describe('ID token de Google (One Tap)', () => {
  it('acepta uno válido y devuelve el perfil', async () => {
    await expect(verify(await sign())).resolves.toEqual({
      sub: '1234567890',
      email: 'ana@ejemplo.com',
      name: 'Ana Pérez',
      picture: 'https://lh3.googleusercontent.com/a/foto',
    });
  });

  it('acepta el emisor sin https, que Google también usa', async () => {
    await expect(verify(await sign({}, { issuer: 'accounts.google.com' }))).resolves.toMatchObject({
      email: 'ana@ejemplo.com',
    });
  });

  it('la foto es opcional', async () => {
    const profile = await verify(await sign({ picture: undefined }));
    expect(profile.picture).toBeUndefined();
  });

  describe('rechaza', () => {
    it('uno firmado con una clave que no es de Google', async () => {
      await expect(verify(await sign({}, { key: foreignKey }))).rejects.toBeInstanceOf(GoogleIdTokenError);
    });

    it('uno emitido para otra aplicación', async () => {
      await expect(verify(await sign({}, { audience: 'otra-app.apps.googleusercontent.com' })))
        .rejects.toBeInstanceOf(GoogleIdTokenError);
    });

    it('uno de otro emisor', async () => {
      await expect(verify(await sign({}, { issuer: 'https://evil.example.com' })))
        .rejects.toBeInstanceOf(GoogleIdTokenError);
    });

    it('uno vencido', async () => {
      await expect(verify(await sign({}, { expiresIn: '-10m' }))).rejects.toBeInstanceOf(GoogleIdTokenError);
    });

    it('uno con el nonce de otro navegador', async () => {
      await expect(verify(await sign({ nonce: 'otro-nonce' }))).rejects.toThrow('no corresponde a este navegador');
    });

    it('uno sin nonce', async () => {
      await expect(verify(await sign({ nonce: undefined }))).rejects.toBeInstanceOf(GoogleIdTokenError);
    });

    it('uno con el correo sin verificar', async () => {
      await expect(verify(await sign({ email_verified: false }))).rejects.toThrow('correo verificado');
    });

    it('uno que no dice si el correo está verificado', async () => {
      await expect(verify(await sign({ email_verified: undefined }))).rejects.toBeInstanceOf(GoogleIdTokenError);
    });

    it('uno con la firma alterada', async () => {
      const token = await sign();
      const [header, payload] = token.split('.');
      const forged = Buffer.from(JSON.stringify({ ...baseClaims, email: 'otra@ejemplo.com' })).toString('base64url');
      expect(payload).not.toBe(forged);
      await expect(verify(`${header}.${forged}.${token.split('.')[2]}`)).rejects.toBeInstanceOf(GoogleIdTokenError);
    });

    it('algo que no es un token', async () => {
      await expect(verify('no-es-un-jwt')).rejects.toBeInstanceOf(GoogleIdTokenError);
    });
  });

  describe('dice por qué lo rechaza', () => {
    it('firma', async () => {
      expect((await rejection(await sign({}, { key: foreignKey }))).reason).toBe('firma');
    });

    it('audiencia, con el campo en el detalle', async () => {
      expect(await rejection(await sign({}, { audience: 'otra' }))).toMatchObject({ reason: 'audiencia', detail: expect.stringContaining('aud') });
    });

    it('emisor', async () => {
      expect((await rejection(await sign({}, { issuer: 'https://evil.example.com' }))).reason).toBe('emisor');
    });

    it('vencido', async () => {
      expect((await rejection(await sign({}, { expiresIn: '-10m' }))).reason).toBe('vencido');
    });

    it('nonce distinto, con el nonce del token para diagnosticarlo', async () => {
      expect(await rejection(await sign({ nonce: 'otro' }))).toMatchObject({ reason: 'nonce-distinto', tokenNonce: 'otro' });
    });

    it('sin nonce', async () => {
      expect((await rejection(await sign({ nonce: undefined }))).reason).toBe('sin-nonce');
    });

    it('correo sin verificar', async () => {
      expect((await rejection(await sign({ email_verified: false }))).reason).toBe('correo-sin-verificar');
    });

    it('forma, nombrando el campo', async () => {
      expect(await rejection(await sign({ email: 'no-es-un-correo' }))).toMatchObject({ reason: 'forma', detail: 'email' });
    });

    it('mal formado', async () => {
      expect((await rejection('no-es-un-jwt')).reason).toBe('mal-formado');
    });

    it('claves de Google inaccesibles (red caída)', async () => {
      const unreachable: JWTVerifyGetKey = async () => { throw new TypeError('fetch failed'); };
      expect(await rejection(await sign(), unreachable)).toMatchObject({ reason: 'claves-inaccesibles', detail: 'TypeError' });
    });
  });
});

/** Un fetch falso que anota cuántas veces lo llamaron. */
function fakeFetch(respond: (url: string) => Response) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return respond(url);
  }) as typeof fetch;
  return { impl, calls };
}

let baseCounter = 0;
/** Cada prueba usa otra dirección, para no compartir la caché de claves. */
const freshBase = () => `https://google-falso-${++baseCounter}.test`;

describe('descarga de las claves de Google', () => {
  it('las descarga una vez y las reutiliza', async () => {
    const { impl, calls } = fakeFetch(() => Response.json({ keys: [publicJwk] }, { headers: { 'cache-control': 'public, max-age=20000' } }));
    const getKeys = googleKeys(freshBase(), impl);
    const verifyWith = (credential: string) => verifyGoogleIdToken(credential, { clientId: CLIENT_ID, nonce: NONCE, keys: getKeys });

    await expect(verifyWith(await sign())).resolves.toMatchObject({ email: 'ana@ejemplo.com' });
    await expect(verifyWith(await sign())).resolves.toMatchObject({ email: 'ana@ejemplo.com' });
    expect(calls).toHaveLength(1);
  });

  it('si Google no responde 200, el motivo dice qué respondió', async () => {
    const { impl } = fakeFetch(() => new Response('<html>bloqueado</html>', { status: 403, headers: { 'content-type': 'text/html' } }));
    expect(await rejection(await sign(), googleKeys(freshBase(), impl))).toMatchObject({
      reason: 'claves-inaccesibles',
      detail: 'HTTP 403 text/html',
    });
  });

  it('si la red falla, también lo dice', async () => {
    const impl = (async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); }) as typeof fetch;
    expect(await rejection(await sign(), googleKeys(freshBase(), impl))).toMatchObject({
      reason: 'claves-inaccesibles',
      detail: 'ENOTFOUND',
    });
  });
});

describe('plan B: verificación con tokeninfo', () => {
  const claims = {
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    exp: String(Math.floor(Date.now() / 1000) + 3600),
    sub: '1234567890',
    email: 'ana@ejemplo.com',
    email_verified: 'true',
    name: 'Ana Pérez',
    nonce: NONCE,
  };

  const viaTokenInfo = (body: unknown, status = 200) => {
    const { impl, calls } = fakeFetch(() => Response.json(body, { status }));
    return {
      calls,
      result: verifyGoogleIdTokenWithTokenInfo('token', { clientId: CLIENT_ID, nonce: NONCE, baseUrl: 'https://g.test', fetchImpl: impl }),
    };
  };

  it('acepta lo que Google confirma y le pasa el token', async () => {
    const { result, calls } = viaTokenInfo(claims);
    await expect(result).resolves.toEqual({ sub: '1234567890', email: 'ana@ejemplo.com', name: 'Ana Pérez', picture: undefined });
    expect(calls[0]).toBe('https://g.test/tokeninfo?id_token=token');
  });

  it.each([
    ['otra aplicación', { aud: 'otra' }, 'audiencia'],
    ['otro emisor', { iss: 'https://evil.example.com' }, 'emisor'],
    ['vencido', { exp: '1000' }, 'vencido'],
    ['otro nonce', { nonce: 'otro' }, 'nonce-distinto'],
    ['correo sin verificar', { email_verified: 'false' }, 'correo-sin-verificar'],
  ])('rechaza %s', async (_label, change, reason) => {
    await expect(viaTokenInfo({ ...claims, ...change }).result).rejects.toMatchObject({ reason });
  });

  it('si Google dice que el token no vale (400), lo rechaza', async () => {
    await expect(viaTokenInfo({ error: 'invalid_token' }, 400).result).rejects.toMatchObject({ reason: 'firma' });
  });

  it('si tokeninfo tampoco responde, lo dice', async () => {
    await expect(viaTokenInfo({}, 503).result).rejects.toMatchObject({ reason: 'claves-inaccesibles', detail: 'tokeninfo HTTP 503' });
  });
});

