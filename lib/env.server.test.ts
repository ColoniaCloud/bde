import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// serverEnv() memoriza el resultado, así que cada caso necesita el módulo fresco.
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value);
  }
  const { serverEnv } = await import('@/lib/env.server');
  return serverEnv;
}

// Payload exige estas dos, así que todo caso parte de valores válidos.
const required = {
  DATABASE_URI: 'postgres://user@localhost:5432/db',
  PAYLOAD_SECRET: 'x'.repeat(32),
};

const clean = {
  ...required,
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_USER: undefined,
  SMTP_PASS: undefined,
  ORDER_FROM_EMAIL: undefined,
  ORDER_COPY_EMAIL: undefined,
  SITE_URL: undefined,
  MERCADOPAGO_ACCESS_TOKEN: undefined,
  MERCADOPAGO_WEBHOOK_SECRET: undefined,
  ORDER_DATA_DIR: undefined,
};

beforeEach(() => vi.stubEnv('NODE_ENV', 'test'));
afterEach(() => vi.unstubAllEnvs());

describe('serverEnv', () => {
  it('arranca sin Mercado Pago ni SMTP: la tienda tiene que levantar igual', async () => {
    const serverEnv = await loadEnv(clean);
    expect(() => serverEnv()).not.toThrow();
    expect(serverEnv().MERCADOPAGO_ACCESS_TOKEN).toBeUndefined();
    expect(serverEnv().SMTP_HOST).toBeUndefined();
  });

  it('trata una variable vacía como ausente, no como error', async () => {
    // `SMTP_HOST=` en un .env es la forma habitual de dejar algo sin configurar.
    const serverEnv = await loadEnv({ ...clean, SMTP_HOST: '', ORDER_COPY_EMAIL: '', SMTP_PORT: '' });
    expect(() => serverEnv()).not.toThrow();
    expect(serverEnv().SMTP_HOST).toBeUndefined();
    expect(serverEnv().SMTP_PORT).toBe(587);
  });

  it('usa 587 como puerto SMTP por defecto', async () => {
    const serverEnv = await loadEnv(clean);
    expect(serverEnv().SMTP_PORT).toBe(587);
  });

  it('convierte SMTP_PORT a número', async () => {
    const serverEnv = await loadEnv({ ...clean, SMTP_PORT: '465' });
    expect(serverEnv().SMTP_PORT).toBe(465);
  });

  it('SMTP_SECURE es booleano y solo "true" lo activa', async () => {
    expect((await loadEnv({ ...clean, SMTP_SECURE: 'true' }))().SMTP_SECURE).toBe(true);
    expect((await loadEnv({ ...clean, SMTP_SECURE: 'false' }))().SMTP_SECURE).toBe(false);
    expect((await loadEnv({ ...clean, SMTP_SECURE: '1' }))().SMTP_SECURE).toBe(false);
  });

  describe('exige lo que Payload necesita para arrancar', () => {
    it('sin DATABASE_URI no arranca', async () => {
      const serverEnv = await loadEnv({ ...clean, DATABASE_URI: undefined });
      expect(() => serverEnv()).toThrow(/DATABASE_URI/);
    });

    it('sin PAYLOAD_SECRET no arranca', async () => {
      const serverEnv = await loadEnv({ ...clean, PAYLOAD_SECRET: undefined });
      expect(() => serverEnv()).toThrow(/PAYLOAD_SECRET/);
    });

    it('rechaza un PAYLOAD_SECRET corto: firma las sesiones del panel', async () => {
      const serverEnv = await loadEnv({ ...clean, PAYLOAD_SECRET: 'corto' });
      expect(() => serverEnv()).toThrow(/PAYLOAD_SECRET/);
    });
  });

  describe('falla al arrancar si algo está presente pero malformado', () => {
    it('un puerto que no es un puerto', async () => {
      const serverEnv = await loadEnv({ ...clean, SMTP_PORT: 'no-es-un-puerto' });
      expect(() => serverEnv()).toThrow(/SMTP_PORT/);
    });

    it('un puerto fuera de rango', async () => {
      const serverEnv = await loadEnv({ ...clean, SMTP_PORT: '99999' });
      expect(() => serverEnv()).toThrow(/SMTP_PORT/);
    });

    it('un correo de copia que no es un correo', async () => {
      const serverEnv = await loadEnv({ ...clean, ORDER_COPY_EMAIL: 'freddy-arroba-ejemplo' });
      expect(() => serverEnv()).toThrow(/ORDER_COPY_EMAIL/);
    });

    it('un SITE_URL que no es una URL', async () => {
      const serverEnv = await loadEnv({ ...clean, SITE_URL: 'boutiquedeleste.com' });
      expect(() => serverEnv()).toThrow(/SITE_URL/);
    });

    it('el mensaje nombra la variable, para que el error sea accionable', async () => {
      const serverEnv = await loadEnv({ ...clean, ORDER_FROM_EMAIL: 'x' });
      expect(() => serverEnv()).toThrow(/Configuración del servidor inválida/);
    });
  });
});
