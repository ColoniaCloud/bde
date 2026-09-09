import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { getMercadoPagoOrder } from '@/lib/mercado-pago';
import { orderStatusFrom } from '@/lib/order-lines';
import { recordPaymentResult } from '@/lib/orders';
import { verifyWebhookSignature } from '@/lib/webhook-signature';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as { data?: { id?: string }; type?: string };
  const dataId = url.searchParams.get('data.id') || body.data?.id || '';

  const valid = verifyWebhookSignature({
    secret: serverEnv().MERCADOPAGO_WEBHOOK_SECRET,
    signatureHeader: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
  });

  if (!valid) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  try {
    // Consultar la order evita confiar en el contenido del webhook para tomar
    // decisiones comerciales: el payload sólo dice *qué* mirar, no qué pasó.
    const order = await getMercadoPagoOrder(dataId);
    const status = orderStatusFrom(order.status, order.status_detail);

    // recordPaymentResult es idempotente: Mercado Pago reintenta, y recibir dos
    // veces la misma notificación no debe duplicar eventos ni pisar el estado.
    await recordPaymentResult(dataId, status, `${order.status} · ${order.status_detail}`);

    return NextResponse.json({ received: true });
  } catch {
    // Una firma válida debe recibir 200 para evitar reintentos infinitos; la
    // conciliación diaria vuelve a mirar las órdenes que quedaron pendientes.
    return NextResponse.json({ received: true });
  }
}
