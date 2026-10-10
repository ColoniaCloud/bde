'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { GoogleSignInButton } from '@/components/google-identity';
import { describeDelivery } from '@/lib/delivery';
import { MERCADO_PAGO_SURCHARGE_PERCENT, mercadoPagoSurcharge } from '@/lib/pricing';

type CheckoutActionsProps = {
  cart: Record<number, number>;
  subtotal: number;
  whatsappUrl: string;
};

// Donde más se entrega; el campo acepta cualquier otra.
const CITIES = ['Maldonado', 'Punta del Este', 'San Carlos', 'La Barra', 'Manantiales', 'Piriápolis', 'Pan de Azúcar'];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const currency = new Intl.NumberFormat('es-UY', {
  style: 'currency',
  currency: 'UYU',
  maximumFractionDigits: 0,
});

export function CheckoutActions({ cart, subtotal, whatsappUrl }: CheckoutActionsProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [saveToAccount, setSaveToAccount] = useState(true);
  const [loading, setLoading] = useState<'mercado-pago' | 'whatsapp' | null>(null);
  const [error, setError] = useState('');
  const { customer, googleEnabled, refresh } = useAuth();

  // Con sesión, los datos salen de la cuenta. Sólo se completa lo que esté
  // vacío: si la persona ya escribió otra cosa, se respeta.
  useEffect(() => {
    if (!customer) return;
    if (customer.name) setName((current) => current || customer.name || '');
    setEmail((current) => current || customer.email);
    const saved = customer.delivery ?? {};
    setPhone((current) => current || saved.phone || '');
    setAddress((current) => current || saved.address || '');
    setCity((current) => current || saved.city || '');
    setNotes((current) => current || saved.notes || '');
  }, [customer]);

  const delivery = { phone: phone.trim(), address: address.trim(), city: city.trim(), notes: notes.trim() };

  /**
   * Con sesión y la casilla marcada, lo que se usó en este pedido queda en la
   * cuenta para la próxima. Si falla no importa: el pedido ya se hizo.
   */
  async function rememberDetails() {
    if (!customer || !saveToAccount) return;
    try {
      await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), delivery }),
      });
      await refresh();
    } catch {
      // Sin consecuencias para la compra.
    }
  }

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
          delivery,
        }),
      });

      const result = await response.json() as { checkoutUrl?: string; message?: string };
      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.message || 'No pudimos iniciar el pago. Intentá nuevamente.');
      }

      await rememberDetails();
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
          delivery,
        }),
      });
      const result = await response.json() as { orderNumber?: string; message?: string };
      if (!response.ok || !result.orderNumber) {
        throw new Error(result.message || 'No pudimos generar la orden de compra.');
      }

      const destination = new URL(whatsappUrl);
      const message = destination.searchParams.get('text') || '';
      const deliveryLines = describeDelivery(delivery).map((line) => `\n${line}`).join('');
      destination.searchParams.set('text', `Orden de compra N.º ${result.orderNumber}\n\n${message}\n\nNombre: ${name.trim()}\nCorreo: ${email.trim()}${deliveryLines}`);
      await rememberDetails();
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
      <fieldset className="checkout-delivery">
        <legend>Entrega <span>(opcional: si preferís, la coordinamos por WhatsApp)</span></legend>
        <label htmlFor="checkout-phone">Teléfono</label>
        <input
          id="checkout-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="099 123 456"
          maxLength={30}
        />
        <label htmlFor="checkout-address">Dirección</label>
        <input
          id="checkout-address"
          type="text"
          autoComplete="street-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Calle y número"
          maxLength={160}
        />
        <label htmlFor="checkout-city">Ciudad o localidad</label>
        <input
          id="checkout-city"
          type="text"
          autoComplete="address-level2"
          list="checkout-cities"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Maldonado, Punta del Este…"
          maxLength={80}
        />
        <datalist id="checkout-cities">
          {CITIES.map((option) => <option key={option} value={option} aria-label={option} />)}
        </datalist>
        <label htmlFor="checkout-notes">Referencias</label>
        <input
          id="checkout-notes"
          type="text"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Apto, entre calles, horario…"
          maxLength={300}
        />
        {customer && (
          <label className="checkout-remember">
            <input type="checkbox" checked={saveToAccount} onChange={(event) => setSaveToAccount(event.target.checked)} />
            Guardar estos datos en mi cuenta para la próxima compra
          </label>
        )}
      </fieldset>
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
