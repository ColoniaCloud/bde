'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, Menu, MessageCircle, ShoppingBag, X } from 'lucide-react';
import { AccountButton } from '@/components/account-button';
import { useAuth } from '@/components/auth-provider';
import { useNavCategories } from '@/components/nav-categories';
import { SearchBox } from '@/components/search-box';
import { useStore } from '@/components/store-provider';

export function StoreHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, openCart, showNotice } = useStore();
  const { customer } = useAuth();
  const navItems = [
    ['promociones', '/#productos'],
    ...useNavCategories().map((category) => [category.name.toLowerCase(), `/categoria/${category.slug}`]),
  ];

  return <>
    <div className="top-strip"><span>Envíos en un máximo de 48 h en Maldonado y Punta del Este</span><span>Precios en pesos uruguayos</span><span>Stock sujeto a confirmación</span></div>
    <header className="site-header">
      <button className="mobile-menu" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <Link className="wordmark" href="/" aria-label="Boutique del Este, inicio"><img src="/LOG%20OK.png" alt="Boutique del Este" /></Link>
      <SearchBox />
      <div className="account-actions">
        <AccountButton />
        {customer
          ? <Link className="favorites-link" href="/cuenta#favoritos" aria-label="Mis favoritos"><Heart className="icon" /><span>favoritos</span></Link>
          : <button aria-label="Mis favoritos" onClick={() => showNotice('Tus favoritos quedan en este dispositivo. Ingresá para verlos en todos.')}><Heart className="icon" /><span>favoritos</span></button>}
        <button aria-label="Consultar por WhatsApp" onClick={() => window.open('https://wa.me/59892143420', '_blank', 'noopener,noreferrer')}><MessageCircle className="icon" /><span>consultas</span></button>
        <button className="bag-button" aria-label={`Bolsa con ${cartCount} productos`} onClick={openCart}><ShoppingBag className="icon" /><b>{cartCount}</b><span>mi bolsa</span></button>
      </div>
    </header>
    <nav className={`main-nav ${menuOpen ? 'open' : ''}`} aria-label="Categorías de productos">
      {navItems.map(([label, href]) => <Link key={label} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}
    </nav>
  </>;
}
