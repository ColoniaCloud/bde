import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { products } from '@/lib/catalog';
import type { CheckoutItemInput } from '@/lib/mercado-pago';

type PaymentMethod = 'whatsapp' | 'mercado-pago';

type CreatePurchaseOrderInput = {
  customerName: string;
  customerEmail: string;
  items: CheckoutItemInput[];
  paymentMethod: PaymentMethod;
  surcharge?: number;
};

type OrderLine = {
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type PurchaseOrder = {
  number: string;
  customerName: string;
  customerEmail: string;
  createdAt: Date;
  paymentMethod: PaymentMethod;
  lines: OrderLine[];
  subtotal: number;
  surcharge: number;
  total: number;
};

export class OrderReceiptError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

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

export function getOrderLines(items: CheckoutItemInput[]) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new OrderReceiptError('La bolsa está vacía o contiene demasiados productos.', 400);
  }

  return items.map(({ id, quantity }) => {
    if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new OrderReceiptError('La cantidad de uno de los productos no es válida.', 400);
    }

    const product = products.find((item) => item.id === id);
    if (!product) throw new OrderReceiptError('Uno de los productos ya no está disponible.', 400);

    return {
      title: `${product.brand} ${product.name}`,
      quantity,
      unitPrice: product.price,
      total: product.price * quantity,
    };
  });
}

function orderDataDirectory() {
  return process.env.ORDER_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
}

async function reserveOrderNumber() {
  const directory = orderDataDirectory();
  const sequencePath = path.join(directory, 'order-sequence.json');
  const lockPath = path.join(directory, 'order-sequence.lock');
  await fs.mkdir(directory, { recursive: true });

  let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      lock = await fs.open(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const lockAge = await fs.stat(lockPath).then((stat) => Date.now() - stat.mtimeMs).catch(() => 0);
      if (lockAge > 30_000) {
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  if (!lock) throw new OrderReceiptError('No pudimos asignar el número de orden. Intentá nuevamente.', 503);

  try {
    let lastNumber = 0;
    try {
      const stored = JSON.parse(await fs.readFile(sequencePath, 'utf8')) as { lastNumber?: number };
      if (Number.isSafeInteger(stored.lastNumber) && Number(stored.lastNumber) >= 0) {
        lastNumber = Number(stored.lastNumber);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const nextNumber = lastNumber + 1;
    const temporaryPath = `${sequencePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify({ lastNumber: nextNumber }), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, sequencePath);
    return String(nextNumber).padStart(4, '0');
  } finally {
    await lock.close();
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.ORDER_FROM_EMAIL?.trim() || user;
  const copy = process.env.ORDER_COPY_EMAIL?.trim();
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !pass || !from || !copy || !Number.isInteger(port)) {
    throw new OrderReceiptError('El envío de comprobantes por correo todavía no está configurado.', 503);
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
    from,
    copy,
  };
}

async function sendPurchaseOrderEmail(order: PurchaseOrder, smtp: ReturnType<typeof smtpConfiguration>) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });
  const paymentLabel = order.paymentMethod === 'mercado-pago' ? 'Mercado Pago (pendiente de acreditación)' : 'A coordinar por WhatsApp';
  const subject = `Orden/boleta de compra N.º ${order.number} · Boutique del Este`;
  const lineText = order.lines.map((line) => `${line.quantity} × ${line.title} — ${currency.format(line.total)}`).join('\n');
  const surchargeText = order.surcharge > 0 ? `\nRecargo Mercado Pago: ${currency.format(order.surcharge)}` : '';
  const text = `Hola ${order.customerName},\n\nRecibimos tu orden/boleta de compra N.º ${order.number}.\n\n${lineText}\n\nSubtotal: ${currency.format(order.subtotal)}${surchargeText}\nTotal: ${currency.format(order.total)}\nForma de pago: ${paymentLabel}\nFecha: ${orderDate.format(order.createdAt)}\n\nConfirmaremos disponibilidad y entrega.\n\nEste comprobante registra tu pedido y no sustituye una factura electrónica fiscal.`;
  const rows = order.lines.map((line) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eadfcd">${line.quantity} × ${escapeHtml(line.title)}</td><td style="padding:10px 0;border-bottom:1px solid #eadfcd;text-align:right;white-space:nowrap">${currency.format(line.total)}</td></tr>`).join('');
  const surchargeRow = order.surcharge > 0 ? `<tr><td style="padding:8px 0">Recargo Mercado Pago</td><td style="padding:8px 0;text-align:right">${currency.format(order.surcharge)}</td></tr>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3eb;color:#24231d;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="background:#f2c230;padding:22px 26px"><strong style="font-size:22px">boutique del este</strong></div><div style="background:#fff;padding:28px 26px"><p style="margin-top:0;color:#6c645d;font-size:13px">ORDEN/BOLETA DE COMPRA</p><h1 style="margin:0 0 8px;font-size:26px">N.º ${order.number}</h1><p>Hola ${escapeHtml(order.customerName)}, recibimos tu pedido.</p><table style="width:100%;border-collapse:collapse;font-size:14px">${rows}<tr><td style="padding:12px 0 4px">Subtotal</td><td style="padding:12px 0 4px;text-align:right">${currency.format(order.subtotal)}</td></tr>${surchargeRow}<tr><td style="padding:12px 0;border-top:2px solid #24231d"><strong>Total</strong></td><td style="padding:12px 0;border-top:2px solid #24231d;text-align:right"><strong>${currency.format(order.total)}</strong></td></tr></table><p style="font-size:13px;line-height:1.6"><strong>Forma de pago:</strong> ${paymentLabel}<br><strong>Fecha:</strong> ${orderDate.format(order.createdAt)}</p><p style="font-size:13px;line-height:1.6">Confirmaremos disponibilidad y coordinaremos la entrega.</p><p style="margin-bottom:0;color:#777;font-size:11px;line-height:1.5">Este comprobante registra tu pedido y no sustituye una factura electrónica fiscal.</p></div></div></body></html>`;

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

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const customerName = input.customerName.trim().replace(/\s+/g, ' ');
  const customerEmail = input.customerEmail.trim().toLowerCase();
  if (customerName.length < 2 || customerName.length > 100) {
    throw new OrderReceiptError('Ingresá tu nombre para emitir la orden de compra.', 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 150) {
    throw new OrderReceiptError('Ingresá un correo válido para recibir la orden de compra.', 400);
  }

  const lines = getOrderLines(input.items);
  const subtotal = lines.reduce((total, line) => total + line.total, 0);
  const surcharge = Math.max(0, input.surcharge || 0);
  const smtp = smtpConfiguration();
  const order: PurchaseOrder = {
    number: await reserveOrderNumber(),
    customerName,
    customerEmail,
    createdAt: new Date(),
    paymentMethod: input.paymentMethod,
    lines,
    subtotal,
    surcharge,
    total: subtotal + surcharge,
  };

  await sendPurchaseOrderEmail(order, smtp);
  return order;
}
