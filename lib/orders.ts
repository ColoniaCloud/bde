import 'server-only';
import configPromise from '@payload-config';
import { sql } from '@payloadcms/db-postgres';
import { getPayload } from 'payload';
import type { CheckoutItemInput, ProductLookup } from '@/lib/mercado-pago';
import { sendPurchaseOrderEmail, smtpConfiguration } from '@/lib/order-email';
import { getOrderLines, nextOrderStatus, normalizeCustomer, OrderError, type OrderLine } from '@/lib/order-lines';
import type { Order } from '@/payload-types';

type PaymentMethod = 'whatsapp' | 'mercado-pago';

type CreateOrderInput = {
  customerName: string;
  customerEmail: string;
  items: CheckoutItemInput[];
  paymentMethod: PaymentMethod;
  surcharge?: number;
  lookup: ProductLookup;
  /** Sólo si el cliente estaba con sesión iniciada. */
  customerId?: number;
};

const payloadClient = () => getPayload({ config: configPromise });

/**
 * Reserva el próximo número correlativo.
 *
 * `nextval` es atómico dentro de Postgres: dos pedidos simultáneos no pueden
 * recibir el mismo número, ni siquiera con varias instancias de la aplicación.
 * Sustituye al archivo JSON con lockfile, que dependía de un disco persistente
 * y de que hubiera un único proceso escribiendo.
 */
async function reserveOrderNumber(): Promise<string> {
  const payload = await payloadClient();
  const result = await payload.db.drizzle.execute(sql`SELECT nextval('order_number_seq') AS value`);
  const rows = (result as { rows?: { value?: string | number }[] }).rows ?? [];
  const value = Number(rows[0]?.value);

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OrderError('No pudimos asignar el número de orden. Intentá nuevamente.', 503);
  }

  return String(value).padStart(4, '0');
}

/**
 * Crea el pedido y después intenta enviar el comprobante.
 *
 * El orden importa: antes el correo *era* el registro, así que un SMTP caído
 * significaba una venta perdida. Ahora la orden queda guardada aunque el envío
 * falle, y el panel muestra cuáles quedaron sin comprobante.
 */
export async function createOrder(input: CreateOrderInput) {
  const { customerName, customerEmail } = normalizeCustomer(input.customerName, input.customerEmail);
  const lines = await getOrderLines(input.items, input.lookup);
  const subtotal = lines.reduce((total, line) => total + line.total, 0);
  const surcharge = Math.max(0, input.surcharge || 0);

  const payload = await payloadClient();
  const number = await reserveOrderNumber();
  const createdAt = new Date();

  const order = await payload.create({
    collection: 'orders',
    data: {
      number,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      customerName,
      customerEmail,
      lines,
      subtotal,
      surcharge,
      total: subtotal + surcharge,
      customer: input.customerId ?? null,
      emailSent: false,
      events: [{ at: createdAt.toISOString(), type: 'created', detail: `Pedido por ${input.paymentMethod}` }],
    },
  });

  await deliverReceipt(order.id, {
    number,
    customerName,
    customerEmail,
    createdAt,
    paymentMethod: input.paymentMethod,
    lines,
    subtotal,
    surcharge,
    total: subtotal + surcharge,
  });

  return { id: order.id, number, lines, subtotal, surcharge, total: subtotal + surcharge };
}

async function deliverReceipt(
  orderId: number,
  order: Parameters<typeof sendPurchaseOrderEmail>[0],
) {
  const payload = await payloadClient();

  try {
    await sendPurchaseOrderEmail(order, smtpConfiguration());
    await payload.update({
      collection: 'orders',
      id: orderId,
      data: { emailSent: true },
    });
  } catch (error) {
    // El comprobante puede reintentarse desde el panel; la venta ya está a salvo.
    const detail = error instanceof Error ? error.message : 'error desconocido';
    payload.logger.error({ err: error, orderId }, 'No se pudo enviar el comprobante');
    await appendEvent(orderId, 'email-failed', detail);
  }
}

export async function appendEvent(orderId: number, type: string, detail?: string) {
  const payload = await payloadClient();
  const current = await payload.findByID({ collection: 'orders', id: orderId, depth: 0 });

  await payload.update({
    collection: 'orders',
    id: orderId,
    data: {
      events: [...(current.events ?? []), { at: new Date().toISOString(), type, detail: detail ?? null }],
    },
  });
}

/** Vincula la orden con la de Mercado Pago, para poder conciliarlas después. */
export async function attachMercadoPagoOrder(
  orderId: number,
  mercadoPagoOrderId: string,
  externalReference?: string,
) {
  const payload = await payloadClient();
  await payload.update({
    collection: 'orders',
    id: orderId,
    data: { mercadoPagoOrderId, externalReference: externalReference ?? null },
  });
}

export async function findOrderByMercadoPagoId(mercadoPagoOrderId: string): Promise<Order | null> {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'orders',
    where: { mercadoPagoOrderId: { equals: mercadoPagoOrderId } },
    limit: 1,
    depth: 0,
  });

  return result.docs[0] ?? null;
}

/**
 * Registra el resultado de un pago.
 *
 * Es idempotente: Mercado Pago reintenta sus notificaciones, y volver a recibir
 * la misma no debe duplicar eventos ni pisar un estado ya resuelto.
 */
export async function recordPaymentResult(
  mercadoPagoOrderId: string,
  status: 'paid' | 'cancelled' | 'pending',
  detail: string,
) {
  const order = await findOrderByMercadoPagoId(mercadoPagoOrderId);
  if (!order) return { updated: false, reason: 'sin orden asociada' as const };

  const next = nextOrderStatus(order.status, status);
  if (!next) return { updated: false, reason: 'sin cambios' as const };

  const payload = await payloadClient();
  await payload.update({
    collection: 'orders',
    id: order.id,
    data: {
      status: next,
      events: [
        ...(order.events ?? []),
        { at: new Date().toISOString(), type: `payment-${next}`, detail },
      ],
    },
  });

  return { updated: true, number: order.number };
}

export type { OrderLine };
export { OrderError };
