import { serverEnv } from '@/lib/env.server';
import { getSiteUrl as resolveSiteUrl, SiteUrlError } from '@/lib/site-url';
import { MERCADO_PAGO_SURCHARGE_PERCENT, mercadoPagoSurcharge } from '@/lib/pricing';

const MERCADO_PAGO_DEFAULT_API = 'https://api.mercadopago.com';

/**
 * Permite apuntar a un servidor de reemplazo para probar.
 *
 * Mismo recurso que `GROQ_BASE_URL` y `GOOGLE_BASE_URL`: sin esto no hay manera
 * de ejercitar el manejo de errores contra respuestas concretas, porque la API
 * de Mercado Pago no se puede hacer fallar a pedido. En producción no se define
 * y se usa la API real.
 */
function mercadoPagoApi() {
  return serverEnv().MERCADOPAGO_BASE_URL?.replace(/\/$/, '') || MERCADO_PAGO_DEFAULT_API;
}

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
  status?: string;
  status_detail?: string;
  checkout_url?: string;
  init_point?: string;
  sandbox_init_point?: string;
  external_reference?: string;
  total_amount?: string | number;
  items?: Array<{ title: string; quantity: number; unit_price: number | string }>;
};

export class MercadoPagoError extends Error {
  /**
   * `message` es lo que ve quien compra; `detail` es el motivo técnico.
   *
   * Se separan porque no sirven para lo mismo: al cliente no le dice nada que
   * el correo del comprador coincida con el de la cuenta vendedora, y a quien
   * atiende la tienda es exactamente lo que necesita saber. El detalle queda en
   * el registro del servidor y en el historial del pedido, no en el navegador.
   */
  constructor(message: string, public status = 500, public detail?: string) {
    super(message);
  }
}

/** Forma de los errores que devuelve Mercado Pago, que varía según el endpoint. */
type MercadoPagoFailure = {
  message?: string;
  error?: string;
  errors?: Array<{ code?: string; message?: string; description?: string; details?: unknown }>;
  cause?: Array<{ code?: string | number; description?: string }>;
  details?: unknown;
};

/**
 * Saca de la respuesta de error el motivo más concreto que haya.
 *
 * Antes se leía sólo `payload.message` y se caía a un texto genérico. Mercado
 * Pago casi nunca usa ese campo: los rechazos de la API de órdenes vienen en
 * `errors[]` y los antiguos en `cause[]`, así que el motivo real —el único dato
 * con el que se puede arreglar algo— se perdía siempre.
 */
export function describeFailure(body: string, status: number): string {
  let parsed: MercadoPagoFailure | null = null;
  try {
    parsed = JSON.parse(body) as MercadoPagoFailure;
  } catch {
    // Mercado Pago también contesta HTML cuando algo va muy mal; el cuerpo en
    // crudo sigue siendo más útil que nada.
    return `HTTP ${status}: ${body.slice(0, 300) || 'respuesta vacía'}`;
  }

  const formatDetails = (d: unknown): string | null => {
    if (!d) return null;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d
        .map((item) =>
          typeof item === 'object' && item !== null
            ? (item as { message?: string; field?: string; description?: string }).message ||
              (item as { field?: string }).field ||
              JSON.stringify(item)
            : String(item),
        )
        .join('; ');
    }
    if (typeof d === 'object') return JSON.stringify(d);
    return String(d);
  };

  const reasons = [
    ...(parsed.errors ?? []).map((item) =>
      [item.code, item.message || item.description, formatDetails(item.details)].filter(Boolean).join(': '),
    ),
    ...(parsed.cause ?? []).map((item) =>
      [item.code, item.description].filter(Boolean).join(': '),
    ),
    formatDetails(parsed.details),
    parsed.message,
    parsed.error,
  ].filter((reason): reason is string => Boolean(reason && reason.trim()));

  if (reasons.length === 0) return `HTTP ${status}: ${body.slice(0, 300)}`;
  return `HTTP ${status}: ${[...new Set(reasons)].join(' · ')}`.slice(0, 500);
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

  const response = await fetch(`${mercadoPagoApi()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  // Se lee como texto y después se parsea: si la respuesta no es JSON, con
  // `response.json()` se perdía el cuerpo entero y no quedaba nada que mirar.
  const body = await response.text().catch(() => '');
  let payload: MercadoPagoOrder | null = null;
  try {
    payload = JSON.parse(body) as MercadoPagoOrder;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload) {
    throw new MercadoPagoError(
      'No pudimos iniciar el pago. Podés enviar el pedido por WhatsApp.',
      response.status >= 400 && response.status < 500 ? 400 : 502,
      describeFailure(body, response.status),
    );
  }
  return payload;
}

export async function createMercadoPagoOrder(
  itemsInput: CheckoutItemInput[],
  payerEmail: string,
  lookup: ProductLookup,
) {
  const productItems = await buildOrderItems(itemsInput, lookup);
  const subtotal = productItems.reduce(
    (total, item) => total + Number(item.unit_price) * item.quantity,
    0,
  );
  const surcharge = mercadoPagoSurcharge(subtotal);
  const items = [
    ...productItems.map((item) => ({
      title: item.title,
      unit_price: Number(item.unit_price),
      quantity: item.quantity,
    })),
    ...(surcharge > 0
      ? [
          {
            title: `Recargo por pago con Mercado Pago (${MERCADO_PAGO_SURCHARGE_PERCENT}%)`,
            unit_price: Number(surcharge.toFixed(2)),
            quantity: 1,
          },
        ]
      : []),
  ];
  const siteUrl = getSiteUrl();
  const externalReference = `BDE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const preference = await mercadoPagoRequest('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items,
      payer: { email: payerEmail },
      external_reference: externalReference,
      back_urls: {
        success: `${siteUrl}/pago/aprobado`,
        failure: `${siteUrl}/pago/rechazado`,
        pending: `${siteUrl}/pago/pendiente`,
      },
      auto_return: 'approved',
      notification_url: `${siteUrl}/api/mercado-pago/webhook`,
    }),
  });

  const checkoutUrl = preference.init_point || preference.sandbox_init_point || preference.checkout_url;
  if (!checkoutUrl) throw new MercadoPagoError('Mercado Pago no devolvió un enlace de pago.', 502);

  return {
    id: preference.id,
    checkout_url: checkoutUrl,
    external_reference: externalReference,
  };
}

export async function getMercadoPagoOrder(orderId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(orderId)) throw new MercadoPagoError('Identificador de pago inválido.', 400);

  try {
    return await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(orderId)}`);
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status === 404) {
      try {
        return await mercadoPagoRequest(`/merchant_orders/${encodeURIComponent(orderId)}`);
      } catch {
        return await mercadoPagoRequest(`/checkout/preferences/${encodeURIComponent(orderId)}`);
      }
    }
    throw error;
  }
}
