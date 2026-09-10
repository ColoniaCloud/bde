import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Parámetro `state` del flujo OAuth.
 *
 * Sin esto, cualquiera puede hacerle completar a un visitante un inicio de
 * sesión con *otra* cuenta (CSRF de login). El valor se firma con el secreto de
 * la aplicación y lleva marca de tiempo, así que no se puede fabricar ni
 * reutilizar más tarde.
 *
 * Es lógica pura para poder probarla sin red ni base.
 */

const MAX_AGE_MS = 10 * 60 * 1000;

export function createState(secret: string, now = Date.now()): string {
  const nonce = randomBytes(16).toString('hex');
  const payload = `${nonce}.${now}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifyState(secret: string, state: string | null, now = Date.now()): boolean {
  if (!state) return false;

  const parts = state.split('.');
  if (parts.length !== 3) return false;

  const [nonce, timestamp, signature] = parts;
  if (!/^[a-f0-9]{32}$/.test(nonce)) return false;
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;

  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt)) return false;
  // Un state viejo no sirve, y uno del futuro es señal de manipulación.
  if (now - issuedAt > MAX_AGE_MS || issuedAt > now + 60_000) return false;

  const expected = createHmac('sha256', secret).update(`${nonce}.${timestamp}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
