import { createHmac, timingSafeEqual } from 'node:crypto';

type VerifyInput = {
  secret: string | undefined;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string;
};

/**
 * Verifica la firma que Mercado Pago envía en la cabecera `x-signature`.
 *
 * El manifiesto que se firma es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * y se compara en tiempo constante para no filtrar información por el tiempo
 * de respuesta. Cualquier dato faltante o malformado se trata como firma
 * inválida: nunca se asume válida por omisión.
 */
export function verifyWebhookSignature({ secret, signatureHeader, requestId, dataId }: VerifyInput) {
  if (!secret || !signatureHeader || !requestId || !dataId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => part.trim().split('=', 2)),
  );
  const timestamp = parts.ts;
  const receivedHash = parts.v1;
  if (!timestamp || !receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const expectedHash = createHmac('sha256', secret).update(manifest).digest('hex');
  return timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(receivedHash, 'hex'));
}
