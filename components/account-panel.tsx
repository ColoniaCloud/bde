'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, LogOut, MapPin, Package, RotateCcw } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { GoogleSignInButton } from '@/components/google-identity';
import { ProductImage } from '@/components/product-image';
import { StoreFooter } from '@/components/store-footer';
import { StoreHeader } from '@/components/store-header';
import { type CartProduct, useStore } from '@/components/store-provider';
import { type Delivery, describeDelivery } from '@/lib/delivery';
import { currency } from '@/lib/format';

type OrderLine = { code: number; title: string; quantity: number; unitPrice: number; total: number };
type Order = {
  number: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  surcharge: number;
  total: number;
  createdAt: string;
  delivery: Delivery;
  lines: OrderLine[];
};

type Props = {
  customer: { id: number; email: string; name: string | null; picture: string | null; delivery: Delivery } | null;
  googleEnabled: boolean;
  error?: string;
  orders: Order[];
};

type ProductInfo = CartProduct & { status?: string };

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  cancelled: 'Cancelado',
  delivered: 'Entregado',
};

const paymentLabel: Record<string, string> = {
  'mercado-pago': 'Mercado Pago',
  whatsapp: 'Coordinado por WhatsApp',
};

const errorLabel: Record<string, string> = {
  'no-configurado': 'El ingreso con Google no está disponible en este momento.',
  'state-invalido': 'El enlace de ingreso venció. Probá de nuevo.',
  'sin-codigo': 'Google no devolvió la autorización. Probá de nuevo.',
  fallo: 'No pudimos completar el ingreso. Probá de nuevo en unos minutos.',
};

const orderDate = new Intl.DateTimeFormat('es-UY', { dateStyle: 'long' });

/** Datos actuales de una lista de productos, de a 50 como acepta la API. */
async function fetchProducts(codes: number[]): Promise<Map<number, ProductInfo>> {
  const found = new Map<number, ProductInfo>();
  for (let start = 0; start < codes.length; start += 50) {
    const chunk = codes.slice(start, start + 50);
    const response = await fetch(`/api/cart-items?codes=${chunk.join(',')}`);
    if (!response.ok) throw new Error('no disponible');
    const data = await response.json() as { products: ProductInfo[] };
    for (const product of data.products) found.set(product.code, product);
  }
  return found;
}

export function AccountPanel({ customer, googleEnabled, error, orders }: Props) {
  return (
    <main>
      <StoreHeader />

      <section className="section-shell account-page">
        <div className="account-page-inner">
          <Link className="legal-back" href="/">← Volver a la tienda</Link>

          {error && <p className="checkout-error" role="alert">{errorLabel[error] ?? 'No pudimos completar el ingreso.'}</p>}

          {customer
            ? <SignedIn customer={customer} orders={orders} />
            : <SignedOut googleEnabled={googleEnabled} />}
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}

function SignedOut({ googleEnabled }: { googleEnabled: boolean }) {
  return (
    <div className="account-card account-signin">
      <p className="legal-eyebrow">tu cuenta</p>
      <h1>Ingresá a Boutique del Este</h1>
      <ul className="account-benefits">
        <li><Package aria-hidden="true" /> Seguí el estado de tus pedidos.</li>
        <li><Heart aria-hidden="true" /> Tus favoritos en todos tus dispositivos.</li>
        <li><RotateCcw aria-hidden="true" /> Volvé a comprar lo de siempre en un toque.</li>
      </ul>
      {googleEnabled
        ? <GoogleSignInButton />
        : <p>El ingreso con Google todavía no está habilitado. Escribinos por WhatsApp y te ayudamos con tu pedido.</p>}
      <small>Comprar no requiere cuenta: es opcional.</small>
    </div>
  );
}

function SignedIn({ customer, orders }: { customer: NonNullable<Props['customer']>; orders: Order[] }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const firstName = customer.name?.trim().split(/\s+/)[0];

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    router.refresh();
    setBusy(false);
  }

  return <>
    <header className="account-card account-profile">
      <Avatar name={customer.name} email={customer.email} picture={customer.picture} />
      <div>
        <p className="legal-eyebrow">tu cuenta</p>
        <h1>Hola{firstName ? `, ${firstName}` : ''}</h1>
        <p className="account-email">{customer.email}</p>
      </div>
      <button className="account-signout" onClick={() => void handleSignOut()} disabled={busy}>
        <LogOut aria-hidden="true" /> {busy ? 'saliendo…' : 'cerrar sesión'}
      </button>
    </header>

    <div className="account-grid">
      <OrdersCard orders={orders} />
      <div className="account-side">
        <DetailsCard name={customer.name} delivery={customer.delivery} />
        <FavoritesCard />
      </div>
    </div>
  </>;
}

function Avatar({ name, email, picture }: { name: string | null; email: string; picture: string | null }) {
  const [broken, setBroken] = useState(false);
  const initial = (name?.trim() || email).charAt(0).toUpperCase();

  if (picture && !broken) {
    return (
      // La foto viene de Google: no hace falta pasarla por la optimización de Next.
      // oxlint-disable-next-line next/no-img-element
      <img className="account-photo" src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    );
  }

  return <span className="account-photo account-initial" aria-hidden="true">{initial}</span>;
}

function OrdersCard({ orders }: { orders: Order[] }) {
  return (
    <section className="account-card" aria-labelledby="pedidos-title">
      <h2 id="pedidos-title"><Package aria-hidden="true" /> Mis pedidos</h2>
      {orders.length === 0
        ? <p className="account-empty">Todavía no hiciste ningún pedido con esta cuenta. <Link href="/#productos">Mirá el catálogo</Link>.</p>
        : <ul className="account-orders">
            {orders.map((order, index) => <OrderItem key={order.number} order={order} open={index === 0} />)}
          </ul>}
    </section>
  );
}

function OrderItem({ order, open }: { order: Order; open: boolean }) {
  const { addManyToCart, showNotice } = useStore();
  const [busy, setBusy] = useState(false);

  async function buyAgain() {
    setBusy(true);
    try {
      const products = await fetchProducts(order.lines.map((line) => line.code));
      const available = order.lines
        .map((line) => ({ line, product: products.get(line.code) }))
        .filter((entry): entry is { line: OrderLine; product: ProductInfo } =>
          entry.product !== undefined && (entry.product.status ?? 'available') === 'available');

      const missing = order.lines.length - available.length;
      if (available.length === 0) {
        showNotice('Ninguno de esos productos está disponible ahora.');
        return;
      }

      addManyToCart(available.map(({ line, product }) => ({ product, quantity: line.quantity })));
      if (missing > 0) {
        showNotice(missing === 1
          ? 'Agregamos tu pedido; un producto ya no está disponible.'
          : `Agregamos tu pedido; ${missing} productos ya no están disponibles.`);
      }
    } catch {
      showNotice('No pudimos cargar los productos. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <details open={open}>
        <summary>
          <span className="account-order-number">N.º {order.number}</span>
          <span className="account-order-date">{orderDate.format(new Date(order.createdAt))}</span>
          <span className={`account-status status-${order.status}`}>{statusLabel[order.status] ?? order.status}</span>
          <strong>{currency.format(order.total)}</strong>
        </summary>
        <div className="account-order-body">
          <ul>
            {order.lines.map((line) => (
              <li key={`${line.code}-${line.title}`}>
                <span>{line.quantity} × <Link href={`/productos/${line.code}`}>{line.title}</Link></span>
                <span>{currency.format(line.total)}</span>
              </li>
            ))}
          </ul>
          <dl>
            <div><dt>Subtotal</dt><dd>{currency.format(order.subtotal)}</dd></div>
            {order.surcharge > 0 && <div><dt>Recargo Mercado Pago</dt><dd>{currency.format(order.surcharge)}</dd></div>}
            <div className="account-order-total"><dt>Total</dt><dd>{currency.format(order.total)}</dd></div>
            <div><dt>Forma de pago</dt><dd>{paymentLabel[order.paymentMethod] ?? order.paymentMethod}</dd></div>
            {describeDelivery(order.delivery).map((line) => {
              const [label, ...rest] = line.split(': ');
              return <div key={label}><dt>{label}</dt><dd>{rest.join(': ')}</dd></div>;
            })}
          </dl>
          <button className="account-buy-again" onClick={() => void buyAgain()} disabled={busy}>
            <RotateCcw aria-hidden="true" /> {busy ? 'agregando…' : 'volver a comprar'}
          </button>
        </div>
      </details>
    </li>
  );
}

function DetailsCard({ name, delivery }: { name: string | null; delivery: Delivery }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [form, setForm] = useState({
    name: name ?? '',
    phone: delivery.phone ?? '',
    address: delivery.address ?? '',
    city: delivery.city ?? '',
    notes: delivery.notes ?? '',
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setStatus('idle');
  };

  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          delivery: { phone: form.phone, address: form.address, city: form.city, notes: form.notes },
        }),
      });
      const data = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message || 'No pudimos guardar tus datos.');
      setStatus('saved');
      // El checkout y el saludo toman los datos nuevos.
      await refresh();
      router.refresh();
    } catch (saveError) {
      setStatus('idle');
      setError(saveError instanceof Error ? saveError.message : 'No pudimos guardar tus datos.');
    }
  }

  return (
    <section className="account-card" id="datos" aria-labelledby="datos-title">
      <h2 id="datos-title"><MapPin aria-hidden="true" /> Mis datos</h2>
      <p className="account-empty">Con esto el checkout se completa solo. Todo es opcional salvo el nombre.</p>
      <form className="account-details" onSubmit={(event) => void save(event)}>
        <label>Nombre y apellido
          <input value={form.name} onChange={update('name')} autoComplete="name" required minLength={2} maxLength={100} />
        </label>
        <label>Teléfono
          <input value={form.phone} onChange={update('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="099 123 456" maxLength={30} />
        </label>
        <label>Dirección
          <input value={form.address} onChange={update('address')} autoComplete="street-address" placeholder="Calle y número" maxLength={160} />
        </label>
        <label>Ciudad o localidad
          <input value={form.city} onChange={update('city')} autoComplete="address-level2" placeholder="Maldonado, Punta del Este…" maxLength={80} />
        </label>
        <label>Referencias
          <input value={form.notes} onChange={update('notes')} placeholder="Apto, entre calles, horario…" maxLength={300} />
        </label>
        {error && <p className="checkout-error" role="alert">{error}</p>}
        <button className="account-save" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'guardando…' : status === 'saved' ? '✓ guardado' : 'guardar mis datos'}
        </button>
      </form>
    </section>
  );
}

function FavoritesCard() {
  const { favorites, toggleFavorite, addToCart } = useStore();
  const [products, setProducts] = useState<Map<number, ProductInfo>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const codes = favorites.join(',');

  useEffect(() => {
    if (codes === '') {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    fetchProducts(codes.split(',').map(Number))
      .then((found) => { if (!cancelled) setProducts(found); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [codes]);

  // Productos que ya no existen en el catálogo no se muestran.
  const items = favorites.map((code) => products.get(code)).filter((item): item is ProductInfo => item !== undefined);

  return (
    <section className="account-card" id="favoritos" aria-labelledby="favoritos-title">
      <h2 id="favoritos-title"><Heart aria-hidden="true" /> Mis favoritos</h2>
      {favorites.length === 0
        ? <p className="account-empty">Marcá productos con el corazón y te esperan acá, en cualquier dispositivo.</p>
        : !loaded
          ? <p className="account-empty">Cargando tus favoritos…</p>
          : <ul className="account-favorites">
              {items.map((product) => (
                <li key={product.code}>
                  <Link href={`/productos/${product.code}`} className="account-favorite-image">
                    <ProductImage src={product.image} alt="" />
                  </Link>
                  <div>
                    <span>{product.brand}</span>
                    <Link href={`/productos/${product.code}`}>{product.name}</Link>
                    <strong>{currency.format(product.price)}</strong>
                  </div>
                  <div className="account-favorite-actions">
                    {(product.status ?? 'available') === 'available'
                      ? <button onClick={() => addToCart(product)}>agregar</button>
                      : <Link href={`/productos/${product.code}`}>consultar</Link>}
                    <button aria-label={`Quitar ${product.name} de favoritos`} onClick={() => toggleFavorite(product.code)}>quitar</button>
                  </div>
                </li>
              ))}
            </ul>}
    </section>
  );
}
