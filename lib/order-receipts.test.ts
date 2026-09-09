import { describe, expect, it } from 'vitest';
import { products } from '@/lib/catalog';
import type { ProductLookup } from '@/lib/mercado-pago';
import { getOrderLines, OrderReceiptError } from '@/lib/order-receipts';

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

const [first] = products;

describe('getOrderLines', () => {
  it('rechaza una bolsa vacía con 400', async () => {
    await expect(getOrderLines([], lookup)).rejects.toMatchObject({
      status: 400,
      constructor: OrderReceiptError,
    });
  });

  it.each([
    ['más de 50 líneas', Array.from({ length: 51 }, () => ({ id: 1, quantity: 1 }))],
    ['cantidad cero', [{ id: 1, quantity: 0 }]],
    ['cantidad mayor a 20', [{ id: 1, quantity: 21 }]],
  ])('rechaza %s', async (_label, items) => {
    await expect(getOrderLines(items, lookup)).rejects.toThrow(OrderReceiptError);
  });

  it('rechaza un producto que ya no está en el catálogo', async () => {
    await expect(getOrderLines([{ id: first.id, quantity: 1 }], emptyLookup))
      .rejects.toThrow(OrderReceiptError);
  });

  it('calcula el total de cada línea con el precio del servidor', async () => {
    const [line] = await getOrderLines([{ id: first.id, quantity: 4 }], lookup);
    expect(line.unitPrice).toBe(first.price);
    expect(line.total).toBe(first.price * 4);
    expect(line.title).toBe(`${first.brand} ${first.name}`);
  });

  it('el subtotal de la orden es la suma de las líneas', async () => {
    const sample = products.slice(0, 5);
    const items = sample.map((product, index) => ({ id: product.id, quantity: index + 1 }));
    const lines = await getOrderLines(items, lookup);
    const expected = sample.reduce((sum, product, index) => sum + product.price * (index + 1), 0);

    expect(lines).toHaveLength(5);
    expect(lines.reduce((sum, line) => sum + line.total, 0)).toBe(expected);
  });

  it('no trunca el título: el correo no tiene el límite de 120 de Mercado Pago', async () => {
    const longest = products.reduce((a, b) =>
      `${a.brand} ${a.name}`.length > `${b.brand} ${b.name}`.length ? a : b
    );
    const [line] = await getOrderLines([{ id: longest.id, quantity: 1 }], lookup);
    expect(line.title).toBe(`${longest.brand} ${longest.name}`);
  });
});
