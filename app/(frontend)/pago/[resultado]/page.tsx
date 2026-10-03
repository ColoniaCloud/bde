import { Check, CircleHelp, Clock3, X } from 'lucide-react';
import { ClearPaidCart } from '@/components/clear-paid-cart';
import { logError } from '@/lib/logger';
import { getMercadoPagoPayment } from '@/lib/mercado-pago';
import { findOrderByReference, syncOrderPayment } from '@/lib/orders';
import Link from 'next/link';

type PaymentPageProps = {
  params: Promise<{ resultado: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ResultType = 'aprobado' | 'pendiente' | 'rechazado' | 'desconocido';

const resultContent: Record<ResultType, { icon: typeof Check; eyebrow: string; title: string; description: string }> = {
  aprobado: {
    icon: Check,
    eyebrow: 'pago confirmado',
    title: '¡Gracias por tu compra!',
    description: 'Mercado Pago confirmó y acreditó el pago. Nos comunicaremos para coordinar la entrega.',
  },
  pendiente: {
    icon: Clock3,
    eyebrow: 'pago pendiente',
    title: 'Estamos esperando la confirmación',
    description: 'Mercado Pago todavía está procesando el pago. No vuelvas a pagar; te avisaremos cuando se confirme.',
  },
  rechazado: {
    icon: X,
    eyebrow: 'pago no completado',
    title: 'No pudimos completar el pago',
    description: 'La operación fue rechazada o cancelada. Podés regresar a la tienda e intentar con otro medio de pago.',
  },
  desconocido: {
    icon: CircleHelp,
    eyebrow: 'verificación pendiente',
    title: 'No pudimos verificar el resultado',
    description: 'Tu pedido no se marcará como pagado hasta recibir la confirmación segura de Mercado Pago.',
  },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const resultByStatus = { paid: 'aprobado', cancelled: 'rechazado', pending: 'pendiente' } as const;

/** Checkout Pro manda `payment_id` y `collection_id`, y el texto "null" si no hubo pago. */
function paymentIdFrom(query: Record<string, string | string[] | undefined>) {
  const id = first(query.payment_id) || first(query.collection_id);
  return id && /^\d+$/.test(id) ? id : undefined;
}

export default async function PaymentResultPage({ searchParams }: PaymentPageProps) {
  // La ruta (/pago/aprobado, etc.) no se usa: cualquiera puede escribirla. El
  // estado sale siempre de consultar a Mercado Pago con el token de la tienda.
  const query = await searchParams;
  const paymentId = paymentIdFrom(query);
  let result: ResultType = 'desconocido';
  let reference = first(query.external_reference) || '';
  let amount = '';
  let orderNumber = '';

  try {
    let payment;
    if (paymentId) {
      payment = await getMercadoPagoPayment(paymentId);
      reference = payment.external_reference || reference;
      amount = payment.transaction_amount ? String(payment.transaction_amount) : '';
    }

    if (reference) {
      // El cliente suele volver antes de que llegue el webhook: esta misma
      // consulta deja el pedido con su estado real.
      const synced = await syncOrderPayment(reference, payment);
      result = resultByStatus[synced.status];
      orderNumber = (await findOrderByReference(reference))?.number ?? '';
    }
  } catch (error) {
    logError('no se pudo verificar el retorno de Mercado Pago', error, { paymentId, reference });
    result = 'desconocido';
  }

  const content = resultContent[result];
  const ResultIcon = content.icon;
  const message = `Hola, consulto por mi pago de Boutique del Este${reference ? `, referencia ${reference}` : ''}${paymentId ? `, pago ${paymentId}` : ''}.`;
  const whatsappUrl = `https://wa.me/59892143420?text=${encodeURIComponent(message)}`;

  return (
    <main className={`payment-result payment-result-${result}`}>
      {result === 'aprobado' && <ClearPaidCart />}
      <Link className="payment-wordmark" href="/" aria-label="Volver a Boutique del Este">boutique<small>del este</small></Link>
      <section className="payment-result-card">
        <span className="payment-result-icon" aria-hidden="true"><ResultIcon /></span>
        <p>{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <div>{content.description}</div>
        {(reference || paymentId || amount || orderNumber) && <dl>
          {orderNumber && <><dt>Orden de compra</dt><dd>N.º {orderNumber}</dd></>}
          {reference && <><dt>Referencia</dt><dd>{reference}</dd></>}
          {paymentId && <><dt>Pago Mercado Pago</dt><dd>{paymentId}</dd></>}
          {amount && <><dt>Total</dt><dd>$ {Number(amount).toLocaleString('es-UY')} UYU</dd></>}
        </dl>}
        <div className="payment-result-actions">
          <Link href="/">volver a la tienda</Link>
          <a href={whatsappUrl} target="_blank" rel="noreferrer">consultar por WhatsApp</a>
        </div>
        <small>No coordinaremos la entrega basándonos únicamente en esta pantalla: verificamos cada pago directamente con Mercado Pago.</small>
      </section>
    </main>
  );
}
