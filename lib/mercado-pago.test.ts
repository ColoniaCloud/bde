import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { products } from '@/lib/catalog';
import { buildOrderItems, describeFailure, getMercadoPagoOrder, MercadoPagoError, type ProductLookup } from '@/lib/mercado-pago';

// El lookup real consulta Postgres. Acá se inyecta uno falso alimentado con el
// catálogo semilla: la lógica de validación y de precio se prueba pura, sin base.
const catalogue = new Map(
  products.map((product) => [
    product.id,
    { brand: product.brand, name: product.name, price: product.price },
  ]),
);

const lookup: ProductLookup = (codes) =>
  Promise.resolve(new Map(codes.flatMap((code) => {
    const found = catalogue.get(code);
    return found ? [[code, found] as const] : [];
  })));

const emptyLookup: ProductLookup = () => Promise.resolve(new Map());

const [first, second] = products;

describe('buildOrderItems', () => {
  describe('rechaza entradas inválidas', () => {
    it('una bolsa vacía', async () => {
      await expect(buildOrderItems([], lookup)).rejects.toThrow(MercadoPagoError);
    });

    it('algo que no es un arreglo', async () => {
      await expect(buildOrderItems(null as never, lookup)).rejects.toThrow(MercadoPagoError);
    });

    it('más de 50 líneas', async () => {
      const items = Array.from({ length: 51 }, () => ({ id: first.id, quantity: 1 }));
      await expect(buildOrderItems(items, lookup)).rejects.toThrow(MercadoPagoError);
    });

    it.each([
      ['cantidad cero', 0],
      ['cantidad negativa', -1],
      ['cantidad mayor a 20', 21],
      ['cantidad fraccionaria', 1.5],
    ])('%s', async (_label, quantity) => {
      await expect(buildOrderItems([{ id: first.id, quantity }], lookup)).rejects.toThrow(MercadoPagoError);
    });

    it('un id que no es entero', async () => {
      await expect(buildOrderItems([{ id: 1.5, quantity: 1 }], lookup)).rejects.toThrow(MercadoPagoError);
    });

    it('un producto que ya no está en el catálogo', async () => {
      await expect(buildOrderItems([{ id: first.id, quantity: 1 }], emptyLookup))
        .rejects.toThrow(MercadoPagoError);
    });

    it('valida las cantidades antes de consultar la base', async () => {
      // Una bolsa mal formada no debería costar una consulta.
      const spy = vi.fn(lookup);
      await expect(buildOrderItems([{ id: first.id, quantity: 999 }], spy)).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
    });

    it('responde 400 y no 500: es culpa del pedido, no del servidor', async () => {
      await expect(buildOrderItems([], lookup)).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('el precio sale del servidor, nunca del cliente', () => {
    it('ignora el precio que venga en el request', async () => {
      const items = await buildOrderItems(
        [{ id: first.id, quantity: 2, unit_price: 1, total_amount: 1 } as never],
        lookup,
      );

      expect(items[0].unit_price).toBe(first.price.toFixed(2));
      expect(items[0].total_amount).toBe((first.price * 2).toFixed(2));
    });

    it('usa el precio que devuelve la base, no el del catálogo semilla', async () => {
      const raised: ProductLookup = () =>
        Promise.resolve(new Map([[first.id, { brand: 'X', name: 'Y', price: 12345 }]]));
      const items = await buildOrderItems([{ id: first.id, quantity: 1 }], raised);

      expect(items[0].unit_price).toBe('12345.00');
    });

    it('el total de cada línea es precio × cantidad', async () => {
      const items = await buildOrderItems([{ id: second.id, quantity: 3 }], lookup);
      expect(Number(items[0].total_amount)).toBe(second.price * 3);
      expect(items[0].quantity).toBe(3);
    });

    it('arma el título con marca y nombre, y declara la unidad', async () => {
      const [item] = await buildOrderItems([{ id: first.id, quantity: 1 }], lookup);
      expect(item.title).toBe(`${first.brand} ${first.name}`.slice(0, 120));
      expect(item.unit_measure).toBe('unit');
    });

    it('ningún producto del catálogo genera un título mayor a 120 caracteres', async () => {
      // Mercado Pago rechaza títulos más largos; el .slice() tiene que alcanzar
      // para los 698 productos, no sólo para el que probamos arriba.
      const items = await buildOrderItems(
        products.slice(0, 50).map((product) => ({ id: product.id, quantity: 1 })),
        lookup,
      );
      for (const item of items) expect(item.title.length).toBeLessThanOrEqual(120);

      const longest = products.reduce((a, b) =>
        `${a.brand} ${a.name}`.length > `${b.brand} ${b.name}`.length ? a : b
      );
      const [worst] = await buildOrderItems([{ id: longest.id, quantity: 1 }], lookup);
      expect(worst.title.length).toBeLessThanOrEqual(120);
    });

    it('acepta el máximo permitido: 50 líneas de 20 unidades', async () => {
      const items = Array.from({ length: 50 }, () => ({ id: first.id, quantity: 20 }));
      await expect(buildOrderItems(items, lookup)).resolves.toHaveLength(50);
    });

    it('consulta la base una sola vez para toda la bolsa', async () => {
      const spy = vi.fn(lookup);
      await buildOrderItems(products.slice(0, 10).map((p) => ({ id: p.id, quantity: 1 })), spy);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('describeFailure', () => {
  // Mercado Pago no usa una sola forma para informar errores. Cada caso de acá
  // es una respuesta real que antes se perdía detrás de un texto genérico.
  it('lee los errores de la API de órdenes, que vienen en errors[]', () => {
    const body = JSON.stringify({
      errors: [{ code: 'payer_email_invalid', message: 'payer.email must differ from collector' }],
    });
    expect(describeFailure(body, 400)).toBe(
      'HTTP 400: payer_email_invalid: payer.email must differ from collector',
    );
  });

  it('lee los errores antiguos, que vienen en cause[]', () => {
    const body = JSON.stringify({ cause: [{ code: 2034, description: 'invalid back_urls' }] });
    expect(describeFailure(body, 400)).toBe('HTTP 400: 2034: invalid back_urls');
  });

  it('usa message cuando es lo único que hay', () => {
    expect(describeFailure(JSON.stringify({ message: 'invalid token' }), 401))
      .toBe('HTTP 401: invalid token');
  });

  it('junta varios motivos sin repetirlos', () => {
    const body = JSON.stringify({
      errors: [{ message: 'uno' }, { message: 'dos' }, { message: 'uno' }],
    });
    expect(describeFailure(body, 400)).toBe('HTTP 400: uno · dos');
  });

  it('conserva el cuerpo cuando la respuesta no es JSON', () => {
    // Mercado Pago contesta HTML cuando algo va muy mal; antes se descartaba.
    expect(describeFailure('<html>Bad Gateway</html>', 502))
      .toBe('HTTP 502: <html>Bad Gateway</html>');
  });

  it('dice algo útil incluso con el cuerpo vacío', () => {
    expect(describeFailure('', 500)).toBe('HTTP 500: respuesta vacía');
  });

  it('no se queda sin motivo con un JSON que no reconoce', () => {
    expect(describeFailure(JSON.stringify({ raro: true }), 400)).toContain('HTTP 400');
  });

  it('recorta un cuerpo enorme para que no inunde el registro', () => {
    const body = JSON.stringify({ message: 'x'.repeat(2000) });
    expect(describeFailure(body, 400).length).toBeLessThanOrEqual(500);
  });
});

describe('MercadoPagoError', () => {
  it('separa lo que ve quien compra de lo que necesita la tienda', () => {
    const error = new MercadoPagoError('No pudimos iniciar el pago.', 400, 'HTTP 400: payer_email_invalid');
    expect(error.message).not.toContain('payer_email');
    expect(error.detail).toContain('payer_email_invalid');
  });
});

describe('el camino real: lo que Mercado Pago contesta llega hasta el error', () => {
  // Estas pruebas atraviesan mercadoPagoRequest de verdad, con fetch
  // interceptado: cubren el paso de leer el cuerpo, parsearlo y armar el error,
  // que es donde antes se perdía el motivo.
  //
  // El entorno mínimo que exige serverEnv(), más el token: sin él la petición
  // fallaría antes de llegar a lo que se quiere probar.
  beforeAll(() => {
    vi.stubEnv('DATABASE_URI', 'postgres://user@localhost:5432/db');
    vi.stubEnv('PAYLOAD_SECRET', 'x'.repeat(32));
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-token-de-prueba');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function respondWith(body: string, status: number) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status, headers: { 'content-type': 'application/json' } }),
    );
  }

  it('el rechazo llega con el motivo en detail y el texto neutro en message', async () => {
    respondWith(
      JSON.stringify({ errors: [{ code: 'payer_email_invalid', message: 'payer.email must differ from collector' }] }),
      400,
    );

    await expect(getMercadoPagoOrder('ORD123')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('No pudimos iniciar el pago'),
      detail: expect.stringContaining('payer_email_invalid'),
    });
  });

  it('un 500 de Mercado Pago se traduce a 502, no a 400', async () => {
    respondWith(JSON.stringify({ message: 'internal error' }), 500);
    await expect(getMercadoPagoOrder('ORD123')).rejects.toMatchObject({ status: 502 });
  });

  it('una respuesta que no es JSON no pierde el cuerpo', async () => {
    respondWith('<html>502 Bad Gateway</html>', 502);
    await expect(getMercadoPagoOrder('ORD123')).rejects.toMatchObject({
      detail: expect.stringContaining('Bad Gateway'),
    });
  });

  it('un 200 con cuerpo ilegible tampoco pasa como éxito', async () => {
    respondWith('no es json', 200);
    await expect(getMercadoPagoOrder('ORD123')).rejects.toBeInstanceOf(MercadoPagoError);
  });

  it('una respuesta válida sigue funcionando', async () => {
    respondWith(JSON.stringify({ id: 'ORD123', status: 'processed', status_detail: 'accredited' }), 200);
    await expect(getMercadoPagoOrder('ORD123')).resolves.toMatchObject({ id: 'ORD123' });
  });
});
