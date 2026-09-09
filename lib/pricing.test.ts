import { describe, expect, it } from 'vitest';
import { MERCADO_PAGO_SURCHARGE_PERCENT, MERCADO_PAGO_SURCHARGE_RATE, mercadoPagoSurcharge } from '@/lib/pricing';

describe('recargo de Mercado Pago', () => {
  it('el porcentaje y la tasa no se desincronizan', () => {
    expect(MERCADO_PAGO_SURCHARGE_PERCENT).toBe(6);
    expect(MERCADO_PAGO_SURCHARGE_RATE).toBeCloseTo(0.06, 10);
  });

  it('aplica el 6 % sobre el subtotal', () => {
    expect(mercadoPagoSurcharge(1000)).toBe(60);
    expect(mercadoPagoSurcharge(3299)).toBe(197.94);
  });

  it('redondea a dos decimales, que es lo que acepta la API de Mercado Pago', () => {
    // 1234.56 * 0.06 = 74.0736 en coma flotante.
    expect(mercadoPagoSurcharge(1234.56)).toBe(74.07);
    expect(String(mercadoPagoSurcharge(1234.56))).not.toContain('0000');
  });

  it('un carrito vacío no genera recargo', () => {
    expect(mercadoPagoSurcharge(0)).toBe(0);
  });

  it('nunca devuelve más que el subtotal', () => {
    for (const subtotal of [1, 99, 1000, 250_000]) {
      expect(mercadoPagoSurcharge(subtotal)).toBeLessThan(subtotal);
    }
  });
});
