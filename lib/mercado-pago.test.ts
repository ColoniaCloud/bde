import { describe, expect, it } from 'vitest';
import { products } from '@/lib/catalog';
import { buildOrderItems, MercadoPagoError } from '@/lib/mercado-pago';

// Las fixtures salen del catálogo real en vez de estar escritas a mano, para que
// estos tests sigan valiendo cuando el catálogo se mude a la base de datos.
const [first, second] = products;

describe('buildOrderItems', () => {
  describe('rechaza entradas inválidas', () => {
    it('una bolsa vacía', () => {
      expect(() => buildOrderItems([])).toThrow(MercadoPagoError);
    });

    it('algo que no es un arreglo', () => {
      expect(() => buildOrderItems(null as never)).toThrow(MercadoPagoError);
    });

    it('más de 50 líneas', () => {
      const items = Array.from({ length: 51 }, () => ({ id: first.id, quantity: 1 }));
      expect(() => buildOrderItems(items)).toThrow(MercadoPagoError);
    });

    it.each([
      ['cantidad cero', 0],
      ['cantidad negativa', -1],
      ['cantidad mayor a 20', 21],
      ['cantidad fraccionaria', 1.5],
    ])('%s', (_label, quantity) => {
      expect(() => buildOrderItems([{ id: first.id, quantity }])).toThrow(MercadoPagoError);
    });

    it('un id que no es entero', () => {
      expect(() => buildOrderItems([{ id: 1.5, quantity: 1 }])).toThrow(MercadoPagoError);
    });

    it('un producto que no existe en el catálogo', () => {
      expect(() => buildOrderItems([{ id: -999, quantity: 1 }])).toThrow(MercadoPagoError);
    });

    it('responde 400 y no 500: es culpa del pedido, no del servidor', () => {
      try {
        buildOrderItems([]);
        expect.unreachable('debería haber lanzado');
      } catch (error) {
        expect(error).toBeInstanceOf(MercadoPagoError);
        expect((error as MercadoPagoError).status).toBe(400);
      }
    });
  });

  describe('el precio sale del catálogo, nunca del cliente', () => {
    it('usa el precio del servidor aunque el cliente mande otra cosa', () => {
      const items = buildOrderItems([
        { id: first.id, quantity: 2, unit_price: 1, total_amount: 1 } as never,
      ]);

      expect(items[0].unit_price).toBe(first.price.toFixed(2));
      expect(items[0].total_amount).toBe((first.price * 2).toFixed(2));
    });

    it('el total de cada línea es precio × cantidad', () => {
      const items = buildOrderItems([{ id: second.id, quantity: 3 }]);
      expect(Number(items[0].total_amount)).toBe(second.price * 3);
      expect(items[0].quantity).toBe(3);
    });

    it('arma el título con marca y nombre, y declara la unidad', () => {
      const [item] = buildOrderItems([{ id: first.id, quantity: 1 }]);
      expect(item.title).toBe(`${first.brand} ${first.name}`.slice(0, 120));
      expect(item.unit_measure).toBe('unit');
    });

    it('ningún producto del catálogo genera un título mayor a 120 caracteres', () => {
      // Mercado Pago rechaza títulos más largos; el .slice() tiene que alcanzar
      // para los 698 productos, no solo para el que probamos arriba.
      for (const product of products) {
        const [item] = buildOrderItems([{ id: product.id, quantity: 1 }]);
        expect(item.title.length).toBeLessThanOrEqual(120);
      }
    });

    it('acepta el máximo permitido: 50 líneas de 20 unidades', () => {
      const items = Array.from({ length: 50 }, () => ({ id: first.id, quantity: 20 }));
      expect(buildOrderItems(items)).toHaveLength(50);
    });
  });
});
