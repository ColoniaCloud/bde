'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { GoogleSignInButton } from '@/components/google-identity';
import { MERCADO_PAGO_SURCHARGE_PERCENT, mercadoPagoSurcharge } from '@/lib/pricing';

type CheckoutActionsProps = {
  cart: Record<number, number>;
  subtotal: number;
  whatsappUrl: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const currency = new Intl.NumberFormat('es-UY', {
  style: 'currency',
  currency: 'UYU',
  maximumFractionDigits: 0,
});

export function CheckoutActions({ cart, subtotal, whatsappUrl }: CheckoutActionsProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState<'mercado-pago' | 'whatsapp' | null>(null);
  const [error, setError] = useState('');
  const { customer, googleEnabled } = useAuth();

  // Con sesión, los datos salen de la cuenta. Sólo se completa lo que esté
  // vacío: si la persona ya escribió otra cosa, se respeta.
  useEffect(() => {
    if (!customer) return;
    if (customer.name) setName((current) => current || customer.name || '');
    setEmail((current) => current || customer.email);
  }, [customer]);

  const surcharge = mercadoPagoSurcharge(subtotal);
  const paymentTotal = subtotal + surcharge;
  const items = Object.entries(cart).map(([id, quantity]) => ({ id: Number(id), quantity }));

  function validCustomerDetails() {
    if (name.trim().length < 2) {
      setError('Ingresá tu nombre para emitir la orden de compra.');
      return false;
    }

    if (!emailPattern.test(email.trim())) {
      setError('Ingresá un correo válido para recibir la orden de compra.');
      return false;
    }

    return true;
  }

  async function startPayment() {
    if (!validCustomerDetails()) return;

    setLoading('mercado-pago');
    setError('');

    try {
      const response = await fetch('/api/mercado-pago/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          payerEmail: email.trim(),
          items,
        }),
      });

      const result = await response.json() as { checkoutUrl?: string; message?: string };
      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.message || 'No pudimos iniciar el pago. Intentá nuevamente.');
      }

      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'No pudimos iniciar el pago.');
      setLoading(null);
    }
  }

  async function sendWhatsAppOrder() {
    if (!validCustomerDetails()) return;

    setLoading('whatsapp');
    setError('');

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          customerEmail: email.trim(),
          items,
        }),
      });
      const result = await response.json() as { orderNumber?: string; message?: string };
      if (!response.ok || !result.orderNumber) {
        throw new Error(result.message || 'No pudimos generar la orden de compra.');
      }

      const destination = new URL(whatsappUrl);
      const message = destination.searchParams.get('text') || '';
      destination.searchParams.set('text', `Orden de compra N.º ${result.orderNumber}\n\n${message}\n\nNombre: ${name.trim()}\nCorreo: ${email.trim()}`);
      window.location.assign(destination.toString());
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'No pudimos enviar la orden de compra.');
      setLoading(null);
    }
  }

  return (
    <div className="checkout-actions">
      <div className="mercado-pago-summary" aria-label="Total pagando con Mercado Pago">
        <span>Recargo Mercado Pago ({MERCADO_PAGO_SURCHARGE_PERCENT}%) <b>{currency.format(surcharge)}</b></span>
        <strong>Total con Mercado Pago <b>{currency.format(paymentTotal)}</b></strong>
      </div>
      {customer
        ? <p className="checkout-account">El pedido queda guardado en tu cuenta <b>{customer.email}</b>.</p>
        : googleEnabled && (
          <div className="checkout-signin">
            <p>Ingresá para guardar el pedido en tu cuenta y seguir su estado. Es opcional.</p>
            <GoogleSignInButton width={260} />
          </div>
        )}
      <label htmlFor="checkout-name">Nombre y apellido</label>
      <input
        id="checkout-name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Tu nombre"
        maxLength={100}
      />
      <label htmlFor="checkout-email">Correo para la orden de compra</label>
      <input
        id="checkout-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="tu@email.com"
        aria-describedby="checkout-email-help"
      />
      <small id="checkout-email-help">Recibirás por correo una orden numerada con el detalle de tu compra.</small>
      <button className="mercado-pago-button" type="button" onClick={startPayment} disabled={loading !== null}>
        {loading === 'mercado-pago' ? 'generando orden…' : `pagar ${currency.format(paymentTotal)} con Mercado Pago`}
      </button>
      <button className="whatsapp-checkout" type="button" onClick={sendWhatsAppOrder} disabled={loading !== null}>
        {loading === 'whatsapp' ? 'generando orden…' : 'confirmar y enviar por WhatsApp'}
      </button>
      {error && <p className="checkout-error" role="alert">{error}</p>}
      <small className="checkout-note">La orden también queda respaldada en el correo de Boutique del Este.</small>
    </div>
  );
}
