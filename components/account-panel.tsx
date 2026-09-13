'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { StoreFooter } from '@/components/store-footer';
import { StoreHeader } from '@/components/store-header';
import { currency } from '@/lib/format';

type OrderLine = { title: string; quantity: number; total: number };
type Order = {
  number: string;
  status: string;
  total: number;
  createdAt: string;
  lines: OrderLine[];
};

type Props = {
  customer: { id: number; email: string; name: string | null } | null;
  googleEnabled: boolean;
  error?: string;
  orders: Order[];
};

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  cancelled: 'Cancelado',
  delivered: 'Entregado',
};

const errorLabel: Record<string, string> = {
  'no-configurado': 'El ingreso con Google no está disponible en este momento.',
  'state-invalido': 'El enlace de ingreso venció. Probá de nuevo.',
  'sin-codigo': 'Google no devolvió la autorización. Probá de nuevo.',
  fallo: 'No pudimos completar el ingreso. Probá de nuevo en unos minutos.',
};

const orderDate = new Intl.DateTimeFormat('es-UY', { dateStyle: 'long' });

export function AccountPanel({ customer, googleEnabled, error, orders }: Props) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    router.refresh();
    setBusy(false);
  }

  return (
    <main>
      <StoreHeader />

      <section className="section-shell legal-page">
        <div className="legal-page-inner">
          <Link className="legal-back" href="/">← Volver a la tienda</Link>

          {error && <p className="checkout-error" role="alert">{errorLabel[error] ?? 'No pudimos completar el ingreso.'}</p>}

          {!customer ? <>
            <p className="legal-eyebrow">tu cuenta</p>
            <h1>Ingresá a Boutique del Este</h1>
            <div className="legal-content">
              <p>Con una cuenta ves el estado de tus pedidos y tus favoritos te siguen entre dispositivos.</p>
              {googleEnabled
                ? <p>
                    {/* Tiene que ser un <a>: es una redirección del servidor hacia
                        Google, no una navegación interna que Link pueda manejar. */}
                    {/* oxlint-disable-next-line next/no-html-link-for-pages */}
                    <a className="primary-action" href="/api/auth/google">continuar con Google</a>
                  </p>
                : <p>El ingreso con Google todavía no está habilitado. Escribinos por WhatsApp y te ayudamos con tu pedido.</p>}
            </div>
          </> : <>
            <p className="legal-eyebrow">tu cuenta</p>
            <h1>Hola{customer.name ? `, ${customer.name.split(' ')[0]}` : ''}</h1>
            <div className="legal-content">
              <p>{customer.email}</p>
              <p>
                <button onClick={() => void handleSignOut()} disabled={busy}>
                  {busy ? 'saliendo…' : 'cerrar sesión'}
                </button>
              </p>

              <h2>Mis pedidos</h2>
              {orders.length === 0 ? (
                <p>Todavía no hiciste ningún pedido con esta cuenta. <Link href="/#productos">Mirá el catálogo</Link>.</p>
              ) : (
                <ul className="account-orders">
                  {orders.map((order) => (
                    <li key={order.number}>
                      <strong>N.º {order.number}</strong>
                      <span> · {orderDate.format(new Date(order.createdAt))}</span>
                      <span> · {statusLabel[order.status] ?? order.status}</span>
                      <span> · {currency.format(order.total)}</span>
                      <ul>
                        {order.lines.map((line) => (
                          <li key={line.title}>
                            {line.quantity} × {line.title} — {currency.format(line.total)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>}
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
