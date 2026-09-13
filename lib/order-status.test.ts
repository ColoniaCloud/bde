import { describe, expect, it } from 'vitest';
import { nextOrderStatus, orderStatusFrom } from '@/lib/order-lines';

describe('orderStatusFrom', () => {
  it('sólo acredita con processed + accredited', () => {
    expect(orderStatusFrom('processed', 'accredited')).toBe('paid');
  });

  it.each([
    ['processed', 'pending_capture'],
    ['processed', undefined],
    ['action_required', 'accredited'],
  ])('no acredita con %s / %s', (status, detail) => {
    expect(orderStatusFrom(status, detail)).not.toBe('paid');
  });

  it.each([['failed'], ['canceled']])('cancela con %s', (status) => {
    expect(orderStatusFrom(status, 'x')).toBe('cancelled');
  });

  it.each([['created'], ['processing'], ['action_required'], [undefined], ['inventado']])(
    'deja pendiente lo que no reconoce: %s',
    (status) => {
      expect(orderStatusFrom(status, 'x')).toBe('pending');
    },
  );
});

describe('nextOrderStatus', () => {
  it('marca como pagado un pedido pendiente', () => {
    expect(nextOrderStatus('pending', 'paid')).toBe('paid');
  });

  it('cancela un pedido pendiente', () => {
    expect(nextOrderStatus('pending', 'cancelled')).toBe('cancelled');
  });

  describe('es idempotente: Mercado Pago reintenta sus avisos', () => {
    it('recibir de nuevo el mismo estado no cambia nada', () => {
      expect(nextOrderStatus('paid', 'paid')).toBeNull();
      expect(nextOrderStatus('cancelled', 'cancelled')).toBeNull();
    });

    it('una notificación pendiente nunca revierte un estado ya resuelto', () => {
      expect(nextOrderStatus('paid', 'pending')).toBeNull();
      expect(nextOrderStatus('cancelled', 'pending')).toBeNull();
      expect(nextOrderStatus('pending', 'pending')).toBeNull();
    });

    it('un pedido ya entregado no vuelve atrás por un aviso tardío', () => {
      expect(nextOrderStatus('delivered', 'paid')).toBeNull();
      expect(nextOrderStatus('delivered', 'cancelled')).toBeNull();
    });
  });

  it('un pago que después se cancela sí actualiza: es un contracargo', () => {
    expect(nextOrderStatus('paid', 'cancelled')).toBe('cancelled');
  });
});
