import { NextResponse } from 'next/server';
import { createPurchaseOrder, OrderReceiptError } from '@/lib/order-receipts';
import { databaseProductLookup } from '@/lib/product-lookup';
import type { CheckoutItemInput } from '@/lib/mercado-pago';

export const runtime = 'nodejs';

const attempts = new Map<string, { count: number; expiresAt: number }>();

function isRateLimited(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const key = forwarded || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.expiresAt <= now) {
    attempts.set(key, { count: 1, expiresAt: now + 10 * 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 6;
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ message: 'Realizaste varios intentos. Esperá unos minutos y volvé a probar.' }, { status: 429 });
  }

  try {
    const body = await request.json() as {
      customerName?: string;
      customerEmail?: string;
      items?: CheckoutItemInput[];
    };
    const order = await createPurchaseOrder({
      customerName: body.customerName || '',
      customerEmail: body.customerEmail || '',
      items: body.items || [],
      paymentMethod: 'whatsapp',
      lookup: databaseProductLookup,
    });

    return NextResponse.json({ orderNumber: order.number });
  } catch (error) {
    const status = error instanceof OrderReceiptError ? error.status : 500;
    const message = error instanceof OrderReceiptError ? error.message : 'No pudimos generar la orden de compra. Intentá nuevamente.';
    return NextResponse.json({ message }, { status });
  }
}
