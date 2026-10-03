import type { CheckoutItemInput, ProductLookup } from '@/lib/mercado-pago';

/**
 * Validación y armado de las líneas de un pedido.
 *
 * Vive en su propio módulo, sin tocar Payload ni el entorno, para que siga
 * siendo puro y testeable sin base de datos.
 */

export class OrderError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export type OrderLine = {
  code: number;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export async function getOrderLines(
  items: CheckoutItemInput[],
  lookup: ProductLookup,
): Promise<OrderLine[]> {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new OrderError('La bolsa está vacía o contiene demasiados productos.', 400);
  }

  for (const { id, quantity } of items) {
    if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new OrderError('La cantidad de uno de los productos no es válida.', 400);
    }
  }

  const found = await lookup(items.map((item) => item.id));

  return items.map(({ id, quantity }) => {
    const product = found.get(id);
    if (!product) throw new OrderError('Uno de los productos ya no está disponible.', 400);

    return {
      code: id,
      title: `${product.brand} ${product.name}`,
      quantity,
      unitPrice: product.price,
      total: product.price * quantity,
    };
  });
}

/** Normaliza y valida los datos del cliente. */
export function normalizeCustomer(name: string, email: string) {
  const customerName = name.trim().replace(/\s+/g, ' ');
  const customerEmail = email.trim().toLowerCase();

  if (customerName.length < 2 || customerName.length > 100) {
    throw new OrderError('Ingresá tu nombre para emitir la orden de compra.', 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 150) {
    throw new OrderError('Ingresá un correo válido para recibir la orden de compra.', 400);
  }

  return { customerName, customerEmail };
}

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'delivered';

/**
 * Decide si una notificación de pago debe cambiar el estado del pedido.
 *
 * Mercado Pago reintenta sus avisos, así que recibir dos veces lo mismo no
 * puede duplicar eventos. Y un pedido ya entregado no vuelve atrás por una
 * notificación tardía.
 *
 * Devuelve el estado nuevo, o null si no corresponde tocar nada.
 */
export function nextOrderStatus(
  current: OrderStatus,
  incoming: 'paid' | 'cancelled' | 'pending',
): 'paid' | 'cancelled' | null {
  if (incoming === 'pending') return null;
  if (current === incoming) return null;
  if (current === 'delivered') return null;
  return incoming;
}

/** Traduce el estado de un pago de Mercado Pago (Checkout Pro) al del pedido. */
export function paymentStatusFrom(status?: string) {
  if (status === 'approved') return 'paid' as const;
  if (status === 'rejected' || status === 'cancelled' || status === 'refunded' || status === 'charged_back') {
    return 'cancelled' as const;
  }
  return 'pending' as const;
}

/**
 * Estado del pedido a partir de todos los pagos con su referencia.
 *
 * En Checkout Pro el comprador puede reintentar con otra tarjeta, así que una
 * misma referencia puede tener un pago rechazado y otro aprobado, y los avisos
 * llegan en cualquier orden. Mirar el conjunto evita que un rechazo tardío
 * pise un pago aprobado.
 */
export function resolvePaymentStatus(payments: Array<{ status?: string }>) {
  const statuses = payments.map((payment) => paymentStatusFrom(payment.status));
  if (statuses.includes('paid')) return 'paid' as const;
  if (statuses.length === 0 || statuses.includes('pending')) return 'pending' as const;
  return 'cancelled' as const;
}
