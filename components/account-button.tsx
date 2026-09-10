'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';

function accountLabel(email?: string) {
  if (!email) return 'mi cuenta';
  return email.split('@')[0] || 'mi cuenta';
}

export function AccountButton() {
  const { customer, loading } = useAuth();

  if (loading) {
    return (
      <span className="account-button" aria-hidden="true">
        <span className="icon">·</span><span>cuenta</span>
      </span>
    );
  }

  return (
    <Link
      className="account-button"
      href="/cuenta"
      aria-label={customer ? `Cuenta de ${customer.email}` : 'Ingresar a mi cuenta'}
    >
      <span aria-hidden="true" className="icon">{customer ? '✓' : '◍'}</span>
      <span>{customer ? accountLabel(customer.email) : 'ingresar'}</span>
    </Link>
  );
}
