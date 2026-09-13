import { serverEnv } from '@/lib/env.server';
import { getSiteUrl as resolveSiteUrl, SiteUrlError } from '@/lib/site-url';
import { MERCADO_PAGO_SURCHARGE_PERCENT, mercadoPagoSurcharge } from '@/lib/pricing';

const MERCADO_PAGO_API = 'https://api.mercadopago.com';

export type CheckoutItemInput = {
  id: number;
  quantity: number;
};

/**
 * Busca los productos del pedido. Se inyecta en lugar de importarse para que la
 * validación siga siendo una función pura y testeable sin base de datos; las
 * rutas le pasan la implementación que consulta Postgres.
 */
export type PricedProduct = { brand: string; name: string; price: number };
export type ProductLookup = (codes: number[]) => Promise<Map<number, PricedProduct>>;

type MercadoPagoOrder = {
  id: string;
  status: string;
  status_detail: string;
  checkout_url?: string;
  external_reference?: string;
  total_amount?: string;
  items?: Array<{ title: string; quantity: number; unit_price: string; total_amount: string }>;
};

export class MercadoPagoError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export function getAccessToken() {
  const token = serverEnv().MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new MercadoPagoError('Mercado Pago todavía no está habilitado. Podés enviar el pedido por WhatsApp.', 503);
  }
  return token;
}

export function getSiteUrl() {
  try {
    return resolveSiteUrl();
  } catch (error) {
    if (error instanceof SiteUrlError) throw new MercadoPagoError(error.message, 503);
    throw error;
  }
}

export function assertMercadoPagoReady() {
  getAccessToken();
  getSiteUrl();
}

export async function buildOrderItems(input: CheckoutItemInput[], lookup: ProductLookup) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) {
    throw new MercadoPagoError('La bolsa está vacía o contiene demasiados productos.', 400);
  }

  for (const { id, quantity } of input) {
    if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new MercadoPagoError('La cantidad de uno de los productos no es válida.', 400);
    }
  }

  // Los precios salen siempre del servidor: lo que manda el navegador es
  // únicamente qué producto y cuántas unidades.
  const found = await lookup(input.map((item) => item.id));

  return input.map(({ id, quantity }) => {
    const product = found.get(id);
    if (!product) throw new MercadoPagoError('Uno de los productos ya no está disponible.', 400);

    return {
      title: `${product.brand} ${product.name}`.slice(0, 120),
      unit_price: product.price.toFixed(2),
      quantity,
      unit_measure: 'unit',
      total_amount: (product.price * quantity).toFixed(2),
    };
  });
}

async function mercadoPagoRequest(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  headers.set('Authorization', `Bearer ${getAccessToken()}`);
  if (init?.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null) as (MercadoPagoOrder & { message?: string }) | null;
  if (!response.ok || !payload) {
    const message = payload?.message || 'Mercado Pago no pudo procesar la solicitud.';
    throw new MercadoPagoError(message, response.status >= 400 && response.status < 500 ? 400 : 502);
  }
  return payload;
}

export async function createMercadoPagoOrder(
  itemsInput: CheckoutItemInput[],
  payerEmail: string,
  lookup: ProductLookup,
) {
  const productItems = await buildOrderItems(itemsInput, lookup);
  const subtotal = productItems.reduce((total, item) => total + Number(item.total_amount), 0);
  const surcharge = mercadoPagoSurcharge(subtotal);
  const items = [
    ...productItems,
    {
      title: `Recargo por pago con Mercado Pago (${MERCADO_PAGO_SURCHARGE_PERCENT}%)`,
      unit_price: surcharge.toFixed(2),
      quantity: 1,
      unit_measure: 'unit',
      total_amount: surcharge.toFixed(2),
    },
  ];
  const totalAmount = (subtotal + surcharge).toFixed(2);
  const siteUrl = getSiteUrl();
  const externalReference = `BDE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const order = await mercadoPagoRequest('/v1/orders', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'manual',
      capture_mode: 'automatic_async',
      total_amount: totalAmount,
      external_reference: externalReference,
      description: 'Pedido Boutique del Este',
      payer: { email: payerEmail },
      items,
      config: {
        notification_url: `${siteUrl}/api/mercado-pago/webhook`,
        online: {
          success_url: `${siteUrl}/pago/aprobado`,
          failure_url: `${siteUrl}/pago/rechazado`,
          pending_url: `${siteUrl}/pago/pendiente`,
          auto_return: 'all',
        },
      },
    }),
  });

  if (!order.checkout_url) throw new MercadoPagoError('Mercado Pago no devolvió un enlace de pago.', 502);
  return order;
}

export async function getMercadoPagoOrder(orderId: string) {
  if (!/^ORD[A-Za-z0-9_-]+$/.test(orderId)) throw new MercadoPagoError('Identificador de pago inválido.', 400);
  return mercadoPagoRequest(`/v1/orders/${encodeURIComponent(orderId)}`);
}
