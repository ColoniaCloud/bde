'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { GoogleSignInButton } from '@/components/google-identity';

function accountLabel(name?: string | null, email?: string) {
  const first = name?.trim().split(/\s+/)[0];
  if (first) return first;
  return email?.split('@')[0] || 'mi cuenta';
}

export function AccountButton() {
  const { customer, loading, googleEnabled } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // El panel se cierra al tocar afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading) {
    return (
      <span className="account-button" aria-hidden="true">
        <span className="icon"><UserRound /></span><span>cuenta</span>
      </span>
    );
  }

  if (customer) {
    return (
      <Link className="account-button" href="/cuenta" aria-label={`Cuenta de ${customer.email}`}>
        <span aria-hidden="true" className="icon">
          {customer.picture
            ? <img className="account-avatar" src={customer.picture} alt="" referrerPolicy="no-referrer" />
            : <UserRound />}
        </span>
        <span>{accountLabel(customer.name, customer.email)}</span>
      </Link>
    );
  }

  // Sin Google configurado, el botón lleva a la página de cuenta como antes.
  if (!googleEnabled) {
    return (
      <Link className="account-button" href="/cuenta" aria-label="Ingresar a mi cuenta">
        <span aria-hidden="true" className="icon"><UserRound /></span><span>ingresar</span>
      </Link>
    );
  }

  return (
    <div className="account-menu" ref={wrapper}>
      <button
        type="button"
        className="account-button"
        aria-label="Ingresar a mi cuenta"
        aria-expanded={open}
        aria-controls="account-popover"
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true" className="icon"><UserRound /></span><span>ingresar</span>
      </button>
      {open && (
        <div id="account-popover" className="account-popover" role="dialog" aria-label="Ingresar a tu cuenta">
          <strong>Ingresá a tu cuenta</strong>
          <p>Seguí tus pedidos y guardá tus favoritos en todos tus dispositivos.</p>
          <GoogleSignInButton text="signin_with" width={240} />
          <Link href="/cuenta" onClick={() => setOpen(false)}>Ver mi cuenta</Link>
        </div>
      )}
    </div>
  );
}
