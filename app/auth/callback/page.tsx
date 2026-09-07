'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Estamos iniciando tu sesión...');

  useEffect(() => {
    async function finishSignIn() {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);

      if (error) {
        console.error(error);
        setMessage('No pudimos completar el ingreso. Volvé a intentarlo desde Boutique.');
        window.setTimeout(() => router.replace('/'), 2400);
        return;
      }

      router.replace('/');
    }

    finishSignIn();
  }, [router]);

  return (
    <main className="auth-callback">
      <a className="payment-wordmark" href="/" aria-label="Boutique del Este, inicio">
        Boutique del Este <small>UY</small>
      </a>
      <section className="payment-result-card" aria-live="polite">
        <div className="payment-result-icon">✓</div>
        <p>cuenta</p>
        <h1>{message}</h1>
      </section>
    </main>
  );
}
