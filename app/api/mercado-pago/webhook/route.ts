import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env.server';
import { logError, logInfo, logWarning } from '@/lib/logger';
import { getMercadoPagoMerchantOrder, getMercadoPagoPayment } from '@/lib/mercado-pago';
import { syncOrderPayment } from '@/lib/orders';
import { verifyWebhookSignature } from '@/lib/webhook-signature';

export const runtime = 'nodejs';

type WebhookBody = { data?: { id?: string | number }; type?: string; topic?: string };

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as WebhookBody;
  const dataId = String(url.searchParams.get('data.id') || body.data?.id || '');
  const type = url.searchParams.get('type') || body.type || '';
  const signatureHeader = request.headers.get('x-signature');

  // Avisos del formato IPN antiguo (?topic=...&id=...): Mercado Pago no los
  // firma, así que no se procesan; el mismo evento llega como webhook firmado y
  // la conciliación cubre lo que se pierda. Se contesta 200 para cortar los
  // reintentos.
  if (!signatureHeader && (url.searchParams.has('topic') || body.topic)) {
    return NextResponse.json({ received: true, ignored: 'ipn' });
  }

  const valid = verifyWebhookSignature({
    secret: serverEnv().MERCADOPAGO_WEBHOOK_SECRET,
    signatureHeader,
    requestId: request.headers.get('x-request-id'),
    dataId,
  });

  if (!valid) {
    // Una firma inválida puede ser un error de configuración o un intento de
    // falsificar un pago: conviene que quede registrado.
    logWarning('webhook de Mercado Pago con firma inválida', {
      dataId,
      type,
      hasSignature: Boolean(signatureHeader),
    });
    return NextResponse.json({ received: false }, { status: 401 });
  }

  try {
    // Consultar a Mercado Pago evita confiar en el contenido del webhook: el
    // payload sólo dice *qué* mirar, no qué pasó.
    let externalReference: string | undefined;
    let payment;

    if (type === 'payment') {
      payment = await getMercadoPagoPayment(dataId);
      externalReference = payment.external_reference;
    } else if (type === 'merchant_order' || type === 'topic_merchant_order_wh') {
      externalReference = (await getMercadoPagoMerchantOrder(dataId)).external_reference;
    } else {
      return NextResponse.json({ received: true, ignored: type || 'sin tipo' });
    }

    if (!externalReference) {
      logWarning('webhook de Mercado Pago sin referencia externa', { dataId, type });
      return NextResponse.json({ received: true });
    }

    // Es idempotente: Mercado Pago reintenta, y recibir dos veces la misma
    // notificación no debe duplicar eventos ni pisar el estado.
    const result = await syncOrderPayment(externalReference, payment);
    logInfo('webhook de Mercado Pago procesado', { dataId, type, externalReference, ...result });

    return NextResponse.json({ received: true });
  } catch (error) {
    // Una firma válida debe recibir 200 para evitar reintentos infinitos; la
    // conciliación vuelve a mirar las órdenes que quedaron pendientes. Pero el
    // fallo tiene que quedar registrado, no desaparecer.
    logError('no se pudo procesar el webhook de Mercado Pago', error, { dataId, type });
    return NextResponse.json({ received: true });
  }
}
