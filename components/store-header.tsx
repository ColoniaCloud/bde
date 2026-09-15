'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, Menu, MessageCircle, Search, ShoppingBag, X } from 'lucide-react';
import { AccountButton } from '@/components/account-button';
import { useStore } from '@/components/store-provider';

const navItems = [
  ['promociones', '/#productos'],
  ['perfumería', '/categoria/perfumeria'],
  ['cuerpo y baño', '/categoria/cuerpo-y-bano'],
  ['cabello', '/categoria/cabello'],
  ['rostro', '/categoria/rostro'],
  ['maquillaje', '/categoria/maquillaje'],
  ['infantil', '/categoria/infantil'],
  ['luz roja', '/categoria/luz-roja'],
  ['hogar', '/categoria/hogar'],
  ['regalos', '/categoria/regalos'],
];

export function StoreHeader() {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, openCart, showNotice } = useStore();

  function submitSearch() {
    const search = query.trim();
    window.location.href = search ? `/?q=${encodeURIComponent(search)}#productos` : '/#productos';
  }

  return <>
    <div className="top-strip"><span>Envíos en un máximo de 48 h en Maldonado y Punta del Este</span><span>Precios en pesos uruguayos</span><span>Stock sujeto a confirmación</span></div>
    <header className="site-header">
      <button className="mobile-menu" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <Link className="wordmark" href="/" aria-label="Boutique del Este, inicio"><img src="/LOG%20OK.png" alt="Boutique del Este" /></Link>
      <form className="search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }} role="search">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="¿qué estás buscando hoy?" aria-label="Buscar productos" />
        <button aria-label="Buscar"><Search className="icon" /></button>
      </form>
      <div className="account-actions">
        <AccountButton />
        <button aria-label="Mis favoritos" onClick={() => showNotice('Tus favoritos quedan guardados en este dispositivo.')}><Heart className="icon" /><span>favoritos</span></button>
        <button aria-label="Consultar por WhatsApp" onClick={() => window.open('https://wa.me/59892143420', '_blank', 'noopener,noreferrer')}><MessageCircle className="icon" /><span>consultas</span></button>
        <button className="bag-button" aria-label={`Bolsa con ${cartCount} productos`} onClick={openCart}><ShoppingBag className="icon" /><b>{cartCount}</b><span>mi bolsa</span></button>
      </div>
    </header>
    <nav className={`main-nav ${menuOpen ? 'open' : ''}`} aria-label="Categorías de productos">
      {navItems.map(([label, href]) => <Link key={label} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}
    </nav>
  </>;
}
