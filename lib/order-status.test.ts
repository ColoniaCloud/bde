import { describe, expect, it } from 'vitest';
import { nextOrderStatus, paymentStatusFrom, resolvePaymentStatus } from '@/lib/order-lines';

describe('paymentStatusFrom', () => {
  it('sólo acredita un pago approved', () => {
    expect(paymentStatusFrom('approved')).toBe('paid');
  });

  it.each([['rejected'], ['cancelled'], ['refunded'], ['charged_back']])('cancela con %s', (status) => {
    expect(paymentStatusFrom(status)).toBe('cancelled');
  });

  it.each([['pending'], ['in_process'], ['authorized'], ['in_mediation'], [undefined], ['inventado']])(
    'deja pendiente lo que no está resuelto: %s',
    (status) => {
      expect(paymentStatusFrom(status)).toBe('pending');
    },
  );
});

describe('resolvePaymentStatus', () => {
  it('sin pagos todavía, el pedido sigue pendiente', () => {
    expect(resolvePaymentStatus([])).toBe('pending');
  });

  it('un rechazo seguido de un reintento aprobado deja el pedido pagado', () => {
    expect(resolvePaymentStatus([{ status: 'rejected' }, { status: 'approved' }])).toBe('paid');
  });

  it('un rechazo que llega tarde no pisa un pago aprobado', () => {
    expect(resolvePaymentStatus([{ status: 'approved' }, { status: 'rejected' }])).toBe('paid');
  });

  it('un rechazo con otro intento en curso sigue pendiente', () => {
    expect(resolvePaymentStatus([{ status: 'rejected' }, { status: 'in_process' }])).toBe('pending');
  });

  it('si todos los intentos fallaron, se cancela', () => {
    expect(resolvePaymentStatus([{ status: 'rejected' }, { status: 'cancelled' }])).toBe('cancelled');
  });

  it('un pago devuelto ya no cuenta como pagado', () => {
    expect(resolvePaymentStatus([{ status: 'refunded' }])).toBe('cancelled');
  });
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
