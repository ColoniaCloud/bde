import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { getMercadoPagoOrder } from '@/lib/mercado-pago';
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
    // Consultar la order evita confiar en el contenido del webhook para tomar decisiones comerciales.
    await getMercadoPagoOrder(dataId);
    return NextResponse.json({ received: true });
  } catch {
    // Una firma válida debe recibir 200 para evitar reintentos infinitos; la order puede consultarse luego.
    return NextResponse.json({ received: true });
  }
}
