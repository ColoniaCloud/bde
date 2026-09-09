import { NextResponse } from 'next/server';
import { normalizeCustomer, OrderError } from '@/lib/order-lines';
import { createOrder } from '@/lib/orders';
import { databaseProductLookup } from '@/lib/product-lookup';
import { hitRateLimit, requestKey } from '@/lib/rate-limit';
import type { CheckoutItemInput } from '@/lib/mercado-pago';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limit = await hitRateLimit(requestKey(request, 'orders'), 6, 10);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: 'Realizaste varios intentos. Esperá unos minutos y volvé a probar.' },
      { status: 429 },
    );
  }

  try {
    const body = await request.json() as {
      customerName?: string;
      customerEmail?: string;
      items?: CheckoutItemInput[];
    };
    const { customerName, customerEmail } = normalizeCustomer(
      body.customerName ?? '',
      body.customerEmail ?? '',
    );

    const order = await createOrder({
      customerName,
      customerEmail,
      items: body.items || [],
      paymentMethod: 'whatsapp',
      lookup: databaseProductLookup,
    });

    return NextResponse.json({ orderNumber: order.number });
  } catch (error) {
    const status = error instanceof OrderError ? error.status : 500;
    const message = error instanceof OrderError
      ? error.message
      : 'No pudimos generar la orden de compra. Intentá nuevamente.';
    return NextResponse.json({ message }, { status });
  }
}
