import { NextResponse } from 'next/server';
import { buildOrderItems, createMercadoPagoOrder, MercadoPagoError, type CheckoutItemInput } from '@/lib/mercado-pago';
import { createPurchaseOrder, OrderReceiptError } from '@/lib/order-receipts';
import { databaseProductLookup } from '@/lib/product-lookup';
import { mercadoPagoSurcharge } from '@/lib/pricing';

export const runtime = 'nodejs';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { customerName?: string; payerEmail?: string; items?: CheckoutItemInput[] };
    const customerName = body.customerName?.trim().replace(/\s+/g, ' ') || '';
    const payerEmail = body.payerEmail?.trim().toLowerCase() || '';
    if (customerName.length < 2 || customerName.length > 100) {
      return NextResponse.json({ message: 'Ingresá tu nombre para emitir la orden de compra.' }, { status: 400 });
    }
    if (!emailPattern.test(payerEmail) || payerEmail.length > 150) {
      return NextResponse.json({ message: 'Ingresá un correo válido para continuar.' }, { status: 400 });
    }

    const items = body.items || [];
    const productItems = await buildOrderItems(items, databaseProductLookup);
    const subtotal = productItems.reduce((total, item) => total + Number(item.total_amount), 0);
    const order = await createMercadoPagoOrder(items, payerEmail, databaseProductLookup);
    const purchaseOrder = await createPurchaseOrder({
      customerName,
      customerEmail: payerEmail,
      items,
      paymentMethod: 'mercado-pago',
      surcharge: mercadoPagoSurcharge(subtotal),
      lookup: databaseProductLookup,
    });
    return NextResponse.json({ checkoutUrl: order.checkout_url, orderId: order.id, orderNumber: purchaseOrder.number });
  } catch (error) {
    const status = error instanceof MercadoPagoError || error instanceof OrderReceiptError ? error.status : 500;
    const message = error instanceof MercadoPagoError || error instanceof OrderReceiptError ? error.message : 'No pudimos iniciar el pago. Intentá nuevamente.';
    return NextResponse.json({ message }, { status });
  }
}
