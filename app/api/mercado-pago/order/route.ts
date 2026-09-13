import { headers as nextHeaders } from 'next/headers';
import { NextResponse } from 'next/server';
import configPromise from '@payload-config';
import { getPayload } from 'payload';
import { logError } from '@/lib/logger';
import { assertMercadoPagoReady, buildOrderItems, createMercadoPagoOrder, MercadoPagoError, type CheckoutItemInput } from '@/lib/mercado-pago';
import { normalizeCustomer, OrderError } from '@/lib/order-lines';
import { appendEvent, attachMercadoPagoOrder, createOrder } from '@/lib/orders';
import { databaseProductLookup } from '@/lib/product-lookup';
import { mercadoPagoSurcharge } from '@/lib/pricing';
import { hitRateLimit, requestKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  // Esta ruta no tenía límite y sin embargo consume un número de orden y manda
  // un correo en cada llamada.
  const limit = await hitRateLimit(requestKey(request, 'mercado-pago'), 6, 10);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: 'Realizaste varios intentos. Esperá unos minutos y volvé a probar.' },
      { status: 429 },
    );
  }

  try {
    // Falla antes de reservar un número si el pago no está configurado.
    assertMercadoPagoReady();

    const body = await request.json() as {
      customerName?: string;
      payerEmail?: string;
      items?: CheckoutItemInput[];
    };
    const { customerName, customerEmail } = normalizeCustomer(
      body.customerName ?? '',
      body.payerEmail ?? '',
    );

    const items = body.items || [];
    const productItems = await buildOrderItems(items, databaseProductLookup);
    const subtotal = productItems.reduce((total, item) => total + Number(item.total_amount), 0);

    // El pedido se registra antes de ir a Mercado Pago. Si el pago no llega a
    // iniciarse, queda una orden pendiente visible en el panel en lugar de nada.
    const purchaseOrder = await createOrder({
      customerName,
      customerEmail,
      items,
      paymentMethod: 'mercado-pago',
      surcharge: mercadoPagoSurcharge(subtotal),
      lookup: databaseProductLookup,
      customerId: await signedInCustomerId(),
    });

    try {
      const order = await createMercadoPagoOrder(items, customerEmail, databaseProductLookup);
      await attachMercadoPagoOrder(purchaseOrder.id, order.id, order.external_reference);

      return NextResponse.json({
        checkoutUrl: order.checkout_url,
        orderId: order.id,
        orderNumber: purchaseOrder.number,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'error desconocido';
      await appendEvent(purchaseOrder.id, 'mercado-pago-failed', detail);
      throw error;
    }
  } catch (error) {
    const known = error instanceof MercadoPagoError || error instanceof OrderError;
    if (!known) logError('no se pudo iniciar el pago con Mercado Pago', error);
    const status = known ? error.status : 500;
    const message = known ? error.message : 'No pudimos iniciar el pago. Intentá nuevamente.';
    return NextResponse.json({ message }, { status });
  }
}

/** Vincula el pedido a la cuenta si hay sesión. Comprar sin cuenta sigue siendo válido. */
async function signedInCustomerId() {
  try {
    const payload = await getPayload({ config: configPromise });
    const { user } = await payload.auth({ headers: await nextHeaders() });
    return user?.collection === 'customers' ? user.id : undefined;
  } catch {
    return undefined;
  }
}
