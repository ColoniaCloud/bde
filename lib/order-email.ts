import 'server-only';
import nodemailer from 'nodemailer';
import { serverEnv } from '@/lib/env.server';
import { OrderError } from '@/lib/order-lines';

/**
 * Envío del comprobante por correo.
 *
 * Separado de la persistencia a propósito: desde la fase 3 la orden se guarda
 * primero y el correo se intenta después, así un fallo de SMTP ya no hace
 * perder la venta.
 */

export type EmailableOrder = {
  number: string;
  customerName: string;
  customerEmail: string;
  createdAt: Date;
  paymentMethod: 'whatsapp' | 'mercado-pago';
  lines: { title: string; quantity: number; total: number }[];
  subtotal: number;
  surcharge: number;
  total: number;
};

const currency = new Intl.NumberFormat('es-UY', {
  style: 'currency',
  currency: 'UYU',
  maximumFractionDigits: 0,
});

const orderDate = new Intl.DateTimeFormat('es-UY', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Montevideo',
});

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character);
}

/** Casilla de la tienda: recibe la copia de cada correo y las respuestas de los clientes. */
export const STORE_EMAIL = 'contacto@boutiquedeleste.com';

export function smtpConfiguration() {
  const env = serverEnv();
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const from = env.ORDER_FROM_EMAIL?.trim() || user;
  const copy = STORE_EMAIL;
  const port = env.SMTP_PORT;

  if (!host || !user || !pass || !from) {
    throw new OrderError('El envío de comprobantes por correo todavía no está configurado.', 503);
  }

  return {
    host,
    port,
    secure: env.SMTP_SECURE || port === 465,
    auth: { user, pass },
    from,
    copy,
  };
}

type SmtpConfiguration = ReturnType<typeof smtpConfiguration>;

function createTransport(smtp: SmtpConfiguration) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });
}

function orderRowsHtml(order: Pick<EmailableOrder, 'lines' | 'subtotal' | 'surcharge' | 'total'>) {
  const rows = order.lines.map((line) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eadfcd">${line.quantity} × ${escapeHtml(line.title)}</td><td style="padding:10px 0;border-bottom:1px solid #eadfcd;text-align:right;white-space:nowrap">${currency.format(line.total)}</td></tr>`).join('');
  const surchargeRow = order.surcharge > 0 ? `<tr><td style="padding:8px 0">Recargo Mercado Pago</td><td style="padding:8px 0;text-align:right">${currency.format(order.surcharge)}</td></tr>` : '';
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}<tr><td style="padding:12px 0 4px">Subtotal</td><td style="padding:12px 0 4px;text-align:right">${currency.format(order.subtotal)}</td></tr>${surchargeRow}<tr><td style="padding:12px 0;border-top:2px solid #24231d"><strong>Total</strong></td><td style="padding:12px 0;border-top:2px solid #24231d;text-align:right"><strong>${currency.format(order.total)}</strong></td></tr></table>`;
}

function orderLinesText(order: Pick<EmailableOrder, 'lines' | 'subtotal' | 'surcharge' | 'total'>) {
  const lineText = order.lines.map((line) => `${line.quantity} × ${line.title} — ${currency.format(line.total)}`).join('\n');
  const surchargeText = order.surcharge > 0 ? `\nRecargo Mercado Pago: ${currency.format(order.surcharge)}` : '';
  return `${lineText}\n\nSubtotal: ${currency.format(order.subtotal)}${surchargeText}\nTotal: ${currency.format(order.total)}`;
}

function emailLayout(eyebrow: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f7f3eb;color:#24231d;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="background:#f2c230;padding:22px 26px"><strong style="font-size:22px">boutique del este</strong></div><div style="background:#fff;padding:28px 26px"><p style="margin-top:0;color:#6c645d;font-size:13px">${eyebrow}</p>${body}<p style="margin-bottom:0;color:#777;font-size:11px;line-height:1.5">Este comprobante registra tu pedido y no sustituye una factura electrónica fiscal.</p></div></div></body></html>`;
}

export async function sendPurchaseOrderEmail(order: EmailableOrder, smtp: SmtpConfiguration) {
  const transporter = createTransport(smtp);
  const paymentLabel = order.paymentMethod === 'mercado-pago' ? 'Mercado Pago (pendiente de acreditación)' : 'A coordinar por WhatsApp';
  const subject = `Orden/boleta de compra N.º ${order.number} · Boutique del Este`;
  const text = `Hola ${order.customerName},\n\nRecibimos tu orden/boleta de compra N.º ${order.number}.\n\n${orderLinesText(order)}\nForma de pago: ${paymentLabel}\nFecha: ${orderDate.format(order.createdAt)}\n\nConfirmaremos disponibilidad y entrega.\n\nEste comprobante registra tu pedido y no sustituye una factura electrónica fiscal.`;
  const html = emailLayout('ORDEN/BOLETA DE COMPRA', `<h1 style="margin:0 0 8px;font-size:26px">N.º ${order.number}</h1><p>Hola ${escapeHtml(order.customerName)}, recibimos tu pedido.</p>${orderRowsHtml(order)}<p style="font-size:13px;line-height:1.6"><strong>Forma de pago:</strong> ${paymentLabel}<br><strong>Fecha:</strong> ${orderDate.format(order.createdAt)}</p><p style="font-size:13px;line-height:1.6">Confirmaremos disponibilidad y coordinaremos la entrega.</p>`);

  await transporter.sendMail({
    from: `Boutique del Este <${smtp.from}>`,
    to: order.customerEmail,
    bcc: smtp.copy,
    replyTo: smtp.copy,
    subject,
    text,
    html,
  });
}

export type PaidOrder = Omit<EmailableOrder, 'createdAt' | 'paymentMethod'> & { paidAt: Date };

/**
 * Aviso de pago acreditado.
 *
 * Se envía una sola vez, cuando la orden pasa a «pagado»: el webhook, la
 * página de retorno y la conciliación pueden informar el mismo pago, pero sólo
 * quien hace la transición dispara el correo.
 */
export async function sendPaymentConfirmedEmail(order: PaidOrder, smtp: SmtpConfiguration) {
  const transporter = createTransport(smtp);
  const subject = `Pago acreditado · Orden N.º ${order.number} · Boutique del Este`;
  const text = `Hola ${order.customerName},\n\nMercado Pago acreditó el pago de tu orden N.º ${order.number}.\n\n${orderLinesText(order)}\nFecha de acreditación: ${orderDate.format(order.paidAt)}\n\nNos comunicaremos para coordinar la entrega.\n\nEste comprobante registra tu pedido y no sustituye una factura electrónica fiscal.`;
  const html = emailLayout('PAGO ACREDITADO', `<h1 style="margin:0 0 8px;font-size:26px">N.º ${order.number}</h1><p>Hola ${escapeHtml(order.customerName)}, Mercado Pago acreditó el pago de tu pedido.</p>${orderRowsHtml(order)}<p style="font-size:13px;line-height:1.6"><strong>Fecha de acreditación:</strong> ${orderDate.format(order.paidAt)}</p><p style="font-size:13px;line-height:1.6">Nos comunicaremos para coordinar la entrega.</p>`);

  await transporter.sendMail({
    from: `Boutique del Este <${smtp.from}>`,
    to: order.customerEmail,
    bcc: smtp.copy,
    replyTo: smtp.copy,
    subject,
    text,
    html,
  });
}
