import { Check, CircleHelp, Clock3, X } from 'lucide-react';
import { ClearPaidCart } from '@/components/clear-paid-cart';
import { getMercadoPagoOrder } from '@/lib/mercado-pago';
import { findOrderByMercadoPagoId, recordPaymentResult } from '@/lib/orders';
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

function verifiedResult(status?: string, detail?: string): ResultType {
  if (status === 'processed' && detail === 'accredited') return 'aprobado';
  if (status === 'failed' || status === 'canceled') return 'rechazado';
  if (status === 'created' || status === 'processing' || status === 'action_required') return 'pendiente';
  return 'desconocido';
}

export default async function PaymentResultPage({ params, searchParams }: PaymentPageProps) {
  const routeResult = (await params).resultado;
  const query = await searchParams;
  const orderId = first(query.order_id);
  let result: ResultType = 'desconocido';
  let reference = first(query.external_reference) || '';
  let amount = '';

  let orderNumber = '';

  if (orderId) {
    try {
      const order = await getMercadoPagoOrder(orderId);
      result = verifiedResult(order.status, order.status_detail);
      reference = order.external_reference || reference;
      amount = order.total_amount || '';

      // El cliente suele volver antes de que llegue el webhook. Aprovechamos la
      // consulta que ya hicimos para dejar el pedido con su estado real.
      if (result === 'aprobado' || result === 'rechazado') {
        await recordPaymentResult(
          orderId,
          result === 'aprobado' ? 'paid' : 'cancelled',
          `retorno del cliente · ${order.status}`,
        );
      }

      orderNumber = (await findOrderByMercadoPagoId(orderId))?.number ?? '';
    } catch {
      result = 'desconocido';
    }
  }

  // La ruta solo se usa como orientación visual; el estado real proviene de la API autenticada.
  if (!orderId && ['aprobado', 'pendiente', 'rechazado'].includes(routeResult)) result = 'desconocido';

  const content = resultContent[result];
  const ResultIcon = content.icon;
  const message = `Hola, consulto por mi pago de Boutique del Este${reference ? `, referencia ${reference}` : ''}${orderId ? `, orden ${orderId}` : ''}.`;
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
        {(reference || orderId || amount || orderNumber) && <dl>
          {orderNumber && <><dt>Orden de compra</dt><dd>N.º {orderNumber}</dd></>}
          {reference && <><dt>Referencia</dt><dd>{reference}</dd></>}
          {orderId && <><dt>Orden Mercado Pago</dt><dd>{orderId}</dd></>}
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
