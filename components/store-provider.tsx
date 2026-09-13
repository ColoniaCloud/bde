'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckoutActions } from '@/components/checkout-actions';
import { ProductImage } from '@/components/product-image';

/** Lo mínimo que necesita el carrito para agregar un producto. */
export type CartProduct = {
  code: number;
  brand: string;
  name: string;
  price: number;
  image: string;
};

type CartItem = CartProduct & { quantity: number };

type StoreContextValue = {
  cart: Record<number, number>;
  favorites: number[];
  cartCount: number;
  addToCart: (product: CartProduct) => void;
  changeQuantity: (code: number, amount: number) => void;
  toggleFavorite: (code: number) => void;
  openCart: () => void;
  showNotice: (message: string) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

const currency = new Intl.NumberFormat('es-UY', {
  style: 'currency',
  currency: 'UYU',
  maximumFractionDigits: 0,
});

const FREE_SHIPPING_FROM = 2500;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // Se guarda sólo código y cantidad. La clave de localStorage no cambia y el
  // código es el mismo número que antes era el `id`, así que los carritos ya
  // guardados en el teléfono de un cliente siguen siendo válidos.
  const [cart, setCart] = useState<Record<number, number>>({});
  const [favorites, setFavorites] = useState<number[]>([]);
  const [details, setDetails] = useState<Record<number, CartProduct>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem('natura-uy-cart') || '{}'));
      setFavorites(JSON.parse(localStorage.getItem('natura-uy-favorites') || '[]'));
    } catch {
      setCart({});
      setFavorites([]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem('natura-uy-cart', JSON.stringify(cart));
  }, [cart, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem('natura-uy-favorites', JSON.stringify(favorites));
  }, [favorites, hydrated]);

  // El nombre y el precio de lo que hay en la bolsa se piden al servidor en
  // lugar de venir de un catálogo embebido en el bundle. Además evita mostrarle
  // al cliente un precio viejo guardado en su navegador.
  const codes = Object.keys(cart).join(',');
  useEffect(() => {
    if (!hydrated || codes === '') return;
    const controller = new AbortController();

    fetch(`/api/cart-items?codes=${codes}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no disponible'))))
      .then((data: { products: CartProduct[] }) => {
        setDetails(Object.fromEntries(data.products.map((product) => [product.code, product])));
      })
      .catch(() => {
        // Sin conexión el cajón muestra lo que ya tenía; el precio final lo
        // vuelve a calcular el servidor al confirmar el pedido.
      });

    return () => controller.abort();
  }, [codes, hydrated]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  }, []);

  const addToCart = useCallback((product: CartProduct) => {
    setCart((current) => ({ ...current, [product.code]: (current[product.code] ?? 0) + 1 }));
    setDetails((current) => ({ ...current, [product.code]: product }));
    showNotice(`${product.brand} se agregó a tu bolsa`);
  }, [showNotice]);

  const changeQuantity = useCallback((code: number, amount: number) => {
    setCart((current) => {
      const next = Math.max(0, (current[code] ?? 0) + amount);
      const updated = { ...current, [code]: next };
      if (!next) delete updated[code];
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((code: number) => {
    setFavorites((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }, []);

  const openCart = useCallback(() => setCartOpen(true), []);

  const cartItems: CartItem[] = Object.entries(cart)
    .map(([code, quantity]) => {
      const detail = details[Number(code)];
      return detail ? { ...detail, quantity } : null;
    })
    .filter((item): item is CartItem => item !== null);

  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const missingDetails = cartCount > 0 && cartItems.length === 0;

  const whatsappLines = cartItems.map(
    (item) => `${item.quantity} × ${item.brand} ${item.name} — ${currency.format(item.price * item.quantity)}`,
  );
  const whatsappMessage = `Hola, quiero realizar este pedido de Boutique del Este:\n\n${whatsappLines.join('\n')}\n\nTotal: ${currency.format(cartTotal)}\n\n¿Podrían confirmarme disponibilidad y entrega?`;
  const whatsappUrl = `https://wa.me/59892143420?text=${encodeURIComponent(whatsappMessage)}`;

  const value = useMemo(
    () => ({ cart, favorites, cartCount, addToCart, changeQuantity, toggleFavorite, openCart, showNotice }),
    [cart, favorites, cartCount, addToCart, changeQuantity, toggleFavorite, openCart, showNotice],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      {notice && <output className="toast">✓ {notice}</output>}
      {cartOpen && (
        <div
          className="drawer-layer"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}
        >
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="drawer-head">
              <div><span>tu compra</span><h2 id="cart-title">Mi bolsa ({cartCount})</h2></div>
              <button aria-label="Cerrar bolsa" onClick={() => setCartOpen(false)}>×</button>
            </div>
            {cartItems.length ? <>
              <div className="cart-list">
                {cartItems.map((item) => (
                  <article key={item.code}>
                    <ProductImage src={item.image} alt="" />
                    <div>
                      <span>{item.brand}</span>
                      <h3>{item.name}</h3>
                      <strong>{currency.format(item.price)}</strong>
                      <div className="quantity">
                        <button aria-label="Quitar uno" onClick={() => changeQuantity(item.code, -1)}>−</button>
                        <b>{item.quantity}</b>
                        <button aria-label="Agregar uno" onClick={() => changeQuantity(item.code, 1)}>+</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="shipping-progress">
                <div>
                  <span>{cartTotal >= FREE_SHIPPING_FROM
                    ? '¡Tenés envío gratis!'
                    : `Te faltan ${currency.format(FREE_SHIPPING_FROM - cartTotal)} para envío gratis`}</span>
                  <b>{Math.min(100, Math.round((cartTotal / FREE_SHIPPING_FROM) * 100))}%</b>
                </div>
                <i><em style={{ width: `${Math.min(100, (cartTotal / FREE_SHIPPING_FROM) * 100)}%` }} /></i>
              </div>
              <div className="cart-total"><span>Subtotal</span><strong>{currency.format(cartTotal)}</strong></div>
              <CheckoutActions cart={cart} subtotal={cartTotal} whatsappUrl={whatsappUrl} />
            </> : (
              <div className="empty-cart">
                <span>♧</span>
                <h3>{missingDetails ? 'Estamos cargando tu bolsa' : 'Tu bolsa está vacía'}</h3>
                <p>{missingDetails
                  ? 'Si no aparece en unos segundos, revisá tu conexión.'
                  : 'Descubrí los favoritos de esta semana.'}</p>
                <button onClick={() => setCartOpen(false)}>seguir comprando</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore debe usarse dentro de StoreProvider');
  return value;
}
