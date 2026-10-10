import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { GoogleIdTokenError, verifyGoogleIdToken } from '@/lib/google-id-token';

const CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';
const NONCE = 'nonce-de-este-navegador';

type Signer = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let googleKey: Signer;
let foreignKey: Signer;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const google = await generateKeyPair('RS256');
  googleKey = google.privateKey;
  foreignKey = (await generateKeyPair('RS256')).privateKey;

  const jwk = await exportJWK(google.publicKey);
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
