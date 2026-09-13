'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Customer = {
  id: number;
  email: string;
  name?: string | null;
};

type AuthContextValue = {
  customer: Customer | null;
  loading: boolean;
  googleEnabled: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Sesión del cliente.
 *
 * Reemplaza al proveedor de Supabase. La diferencia importante: la sesión vive
 * en una cookie httpOnly que el servidor verifica, así que la cuenta ya no es
 * sólo una etiqueta en el encabezado.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await response.json() as { customer: Customer | null; googleEnabled: boolean };
      setCustomer(data.customer);
      setGoogleEnabled(data.googleEnabled);
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCustomer(null);
  }, []);

  const value = useMemo(
    () => ({ customer, loading, googleEnabled, signOut, refresh }),
    [customer, loading, googleEnabled, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
