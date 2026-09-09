import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '@/lib/webhook-signature';

const SECRET = 'secreto-de-prueba';
const REQUEST_ID = 'req-abc-123';
const DATA_ID = 'ORD01ABCDEF';
const TS = '1757000000';

function sign(secret = SECRET, requestId = REQUEST_ID, dataId = DATA_ID, ts = TS) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

function header(hash: string, ts = TS) {
  return `ts=${ts},v1=${hash}`;
}

const valid = {
  secret: SECRET,
  signatureHeader: header(sign()),
  requestId: REQUEST_ID,
  dataId: DATA_ID,
};

describe('verifyWebhookSignature', () => {
  it('acepta una firma legítima', () => {
    expect(verifyWebhookSignature(valid)).toBe(true);
  });

  it('tolera espacios alrededor de las partes de la cabecera', () => {
    expect(verifyWebhookSignature({ ...valid, signatureHeader: ` ts=${TS} , v1=${sign()} ` })).toBe(true);
  });

  describe('rechaza', () => {
    it('una firma calculada con otro secreto', () => {
      expect(verifyWebhookSignature({ ...valid, signatureHeader: header(sign('otro-secreto')) })).toBe(false);
    });

    it('una firma de otro data.id — el ataque de reusar una notificación ajena', () => {
      expect(verifyWebhookSignature({ ...valid, dataId: 'ORD99OTHER' })).toBe(false);
    });

    it('una firma de otro request-id', () => {
      expect(verifyWebhookSignature({ ...valid, requestId: 'req-distinto' })).toBe(false);
    });

    it('un timestamp cambiado después de firmar', () => {
      expect(verifyWebhookSignature({ ...valid, signatureHeader: header(sign(), '1757000001') })).toBe(false);
    });

    it.each([
      ['sin secreto configurado', { secret: undefined }],
      ['sin cabecera de firma', { signatureHeader: null }],
      ['sin request id', { requestId: null }],
      ['sin data id', { dataId: '' }],
    ])('%s', (_label, override) => {
      expect(verifyWebhookSignature({ ...valid, ...override })).toBe(false);
    });

    it.each([
      ['cabecera vacía', ''],
      ['cabecera sin v1', `ts=${TS}`],
      ['cabecera sin ts', `v1=${sign()}`],
      ['hash demasiado corto', `ts=${TS},v1=abc123`],
      ['hash con caracteres no hexadecimales', `ts=${TS},v1=${'z'.repeat(64)}`],
      ['basura', 'no-es-una-firma'],
    ])('%s', (_label, signatureHeader) => {
      expect(verifyWebhookSignature({ ...valid, signatureHeader })).toBe(false);
    });

    it('un hash del largo correcto pero equivocado, sin explotar', () => {
      expect(verifyWebhookSignature({ ...valid, signatureHeader: header('a'.repeat(64)) })).toBe(false);
    });
  });
});
