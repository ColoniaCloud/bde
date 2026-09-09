import { describe, expect, it } from 'vitest';
import { products } from '@/lib/catalog';
import { getOrderLines, OrderReceiptError } from '@/lib/order-receipts';

const [first] = products;

describe('getOrderLines', () => {
  it('rechaza una bolsa vacía con 400', () => {
    try {
      getOrderLines([]);
      expect.unreachable('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(OrderReceiptError);
      expect((error as OrderReceiptError).status).toBe(400);
    }
  });

  it.each([
    ['más de 50 líneas', Array.from({ length: 51 }, () => ({ id: first.id, quantity: 1 }))],
    ['cantidad cero', [{ id: first.id, quantity: 0 }]],
    ['cantidad mayor a 20', [{ id: first.id, quantity: 21 }]],
    ['producto inexistente', [{ id: -1, quantity: 1 }]],
  ])('rechaza %s', (_label, items) => {
    expect(() => getOrderLines(items)).toThrow(OrderReceiptError);
  });

  it('calcula el total de cada línea con el precio del catálogo', () => {
    const [line] = getOrderLines([{ id: first.id, quantity: 4 }]);
    expect(line.unitPrice).toBe(first.price);
    expect(line.total).toBe(first.price * 4);
    expect(line.title).toBe(`${first.brand} ${first.name}`);
  });

  it('el subtotal de la orden es la suma de las líneas', () => {
    const items = products.slice(0, 5).map((product, index) => ({ id: product.id, quantity: index + 1 }));
    const lines = getOrderLines(items);
    const expected = products.slice(0, 5).reduce((sum, product, index) => sum + product.price * (index + 1), 0);

    expect(lines).toHaveLength(5);
    expect(lines.reduce((sum, line) => sum + line.total, 0)).toBe(expected);
  });

  it('no trunca el título: el correo no tiene el límite de 120 de Mercado Pago', () => {
    const longest = products.reduce((a, b) =>
      `${a.brand} ${a.name}`.length > `${b.brand} ${b.name}`.length ? a : b
    );
    const [line] = getOrderLines([{ id: longest.id, quantity: 1 }]);
    expect(line.title).toBe(`${longest.brand} ${longest.name}`);
  });
});
