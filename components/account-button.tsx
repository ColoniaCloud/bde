'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';

function accountLabel(email?: string) {
  if (!email) return 'mi cuenta';
  return email.split('@')[0] || 'mi cuenta';
}

export function AccountButton() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleAccount() {
    if (busy || loading) return;
    setBusy(true);

    try {
      if (user) {
        await signOut();
        setBusy(false);
      } else {
        await signInWithGoogle();
      }
    } catch (error) {
      console.error(error);
      window.alert('No pudimos iniciar sesión con Google. Probalo de nuevo en unos minutos.');
      setBusy(false);
    }
  }

  const signedIn = Boolean(user);
  const label = signedIn ? accountLabel(user?.email) : 'ingresar';

  return (
    <button
      className="account-button"
      aria-label={signedIn ? `Cuenta ${user?.email}. Cerrar sesión` : 'Ingresar con Google'}
      disabled={busy || loading}
      onClick={handleAccount}
      title={signedIn ? 'Cerrar sesión' : 'Ingresar con Google'}
    >
      <span aria-hidden="true" className="icon">{signedIn ? '✓' : 'G'}</span>
      <span>{loading ? 'cuenta' : label}</span>
    </button>
  );
}
