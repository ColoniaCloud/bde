import { describe, expect, it } from 'vitest';
import { DeliveryError, describeDelivery, normalizeDelivery, storedDelivery } from '@/lib/delivery';

describe('normalizeDelivery', () => {
  it('sin datos devuelve un objeto vacío: todo es opcional', () => {
    expect(normalizeDelivery(undefined)).toEqual({});
    expect(normalizeDelivery(null)).toEqual({});
    expect(normalizeDelivery({})).toEqual({});
  });

  it('recorta espacios y deja lo vacío como ausente', () => {
    expect(normalizeDelivery({ phone: '  099 123 456 ', address: '  Av.   Gorlero 1020 ', city: '', notes: '   ' }))
      .toEqual({ phone: '099 123 456', address: 'Av. Gorlero 1020' });
  });

  it.each(['099123456', '+598 99 123 456', '(042) 22-1234', '+54 11 5555 5555'])('acepta el teléfono %s', (phone) => {
    expect(normalizeDelivery({ phone }).phone).toBe(phone);
  });

  it.each(['12345', 'llamame', '099-abc-123', '+598 99 123 456 789 012'])('rechaza el teléfono %s', (phone) => {
    expect(() => normalizeDelivery({ phone })).toThrow(DeliveryError);
  });

  it('rechaza textos demasiado largos', () => {
    expect(() => normalizeDelivery({ notes: 'x'.repeat(301) })).toThrow(/referencias/);
  });

  it('rechaza tipos que no son texto', () => {
    expect(() => normalizeDelivery({ city: 42 })).toThrow(DeliveryError);
    expect(() => normalizeDelivery('Maldonado')).toThrow(DeliveryError);
    expect(() => normalizeDelivery(['a'])).toThrow(DeliveryError);
  });

  it('ignora campos que no conoce', () => {
    expect(normalizeDelivery({ city: 'Maldonado', admin: true })).toEqual({ city: 'Maldonado' });
  });
});

describe('describeDelivery', () => {
  it('arma las líneas con lo que haya', () => {
    expect(describeDelivery({ phone: '099 123 456', address: 'Gorlero 1020', city: 'Punta del Este', notes: 'apto 3' }))
      .toEqual(['Teléfono: 099 123 456', 'Entrega: Gorlero 1020, Punta del Este', 'Referencias: apto 3']);
    expect(describeDelivery({ city: 'Maldonado' })).toEqual(['Entrega: Maldonado']);
    expect(describeDelivery({})).toEqual([]);
  });
});

describe('storedDelivery', () => {
  it('lee lo guardado sin validar ni fallar', () => {
    expect(storedDelivery({ phone: 'llamar a Juan', address: ' Gorlero 1020 ', city: null, notes: '' }))
      .toEqual({ phone: 'llamar a Juan', address: 'Gorlero 1020' });
    expect(storedDelivery(null)).toEqual({});
    expect(storedDelivery('roto')).toEqual({});
  });
});
