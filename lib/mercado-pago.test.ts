import { describe, expect, it, vi } from 'vitest';
import { products } from '@/lib/catalog';
import { buildOrderItems, MercadoPagoError, type ProductLookup } from '@/lib/mercado-pago';

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
