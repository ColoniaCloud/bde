'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';

/**
 * Google Identity Services: el aviso «Continuar como…» (One Tap) y el botón
 * oficial de «Ingresar con Google».
 *
 * El script de Google sólo se carga para quien no tiene sesión. El ID token que
 * devuelve se verifica en el servidor (/api/auth/google/one-tap); acá no se
 * confía en nada de lo que trae.
 *
 * Si el script no carga (bloqueador, red, CSP), los botones caen al ingreso
 * por redirección de siempre: nadie se queda sin poder entrar.
 */

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: Record<string, unknown>) => void;
  prompt: () => void;
  cancel: () => void;
  disableAutoSelect: () => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

type GoogleIdentityValue = {
  status: Status;
  busy: boolean;
  error: string;
};

const GoogleIdentityContext = createContext<GoogleIdentityValue>({ status: 'idle', busy: false, error: '' });

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// En el panel y en el resultado del pago el aviso estorba.
const NO_PROMPT_PATHS = ['/pago'];

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('no cargó')), { once: true });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function GoogleIdentityProvider({ children }: { children: React.ReactNode }) {
  const { customer, loading, googleEnabled, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prompted = useRef(false);
  const hadSession = useRef(false);

  const handleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    if (!response.credential) return;
    setBusy(true);
    setError('');

    try {
      const result = await fetch('/api/auth/google/one-tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      if (!result.ok) {
        const data = await result.json().catch(() => null) as { message?: string } | null;
        throw new Error(data?.message || 'No pudimos completar el ingreso.');
      }

      await refresh();
      // Las páginas del servidor (la cuenta, por ejemplo) se vuelven a pedir con la sesión nueva.
      router.refresh();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'No pudimos completar el ingreso.');
    } finally {
      setBusy(false);
    }
  }, [refresh, router]);

  // El callback de Google se registra una sola vez; con la ref siempre llama a
  // la versión vigente sin tener que volver a inicializar.
  const credentialHandler = useRef(handleCredential);
  useEffect(() => { credentialHandler.current = handleCredential; }, [handleCredential]);

  // Cargar e inicializar sólo si hace falta, una vez por «generación»: la
  // generación cambia al cerrar sesión, porque el nonce anterior ya se usó.
  // Ojo: el efecto no depende de `status`. Si dependiera, el propio
  // setStatus('loading') lo volvería a correr y cancelaría la carga en curso.
  const [generation, setGeneration] = useState(0);
  const startedGeneration = useRef(-1);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (loading || customer || !googleEnabled) return;
    if (startedGeneration.current === generation) return;
    startedGeneration.current = generation;
    setStatus('loading');

    void (async () => {
      try {
        const config = await fetch('/api/auth/google/one-tap', { cache: 'no-store' })
          .then((response) => response.json() as Promise<{ enabled: boolean; clientId?: string; nonce?: string }>);
        if (!config.enabled || !config.clientId || !config.nonce) throw new Error('deshabilitado');

        await loadScript();
        const id = window.google?.accounts?.id;
        if (!id) throw new Error('sin API');
        if (!mounted.current) return;

        id.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          callback: (response: GoogleCredentialResponse) => void credentialHandler.current(response),
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
          itp_support: true,
          use_fedcm_for_prompt: true,
        });
        setStatus('ready');
      } catch {
        if (mounted.current) setStatus('unavailable');
      }
    })();
  }, [loading, customer, googleEnabled, generation]);

  // Mostrar «Continuar como…» una vez por carga de página.
  useEffect(() => {
    if (status !== 'ready' || customer || prompted.current) return;
    if (NO_PROMPT_PATHS.some((path) => pathname.startsWith(path))) return;
    prompted.current = true;
    window.google?.accounts?.id?.prompt();
  }, [status, customer, pathname]);

  // Al entrar, el aviso se cierra. Al salir, Google no vuelve a elegir la cuenta
  // solo, y se pide un nonce nuevo: el anterior se consumió al entrar.
  useEffect(() => {
    const id = window.google?.accounts?.id;
    if (customer) {
      id?.cancel();
      hadSession.current = true;
    } else if (!loading && hadSession.current) {
      hadSession.current = false;
      id?.disableAutoSelect();
      setGeneration((current) => current + 1);
    }
  }, [customer, loading]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <GoogleIdentityContext.Provider value={{ status, busy, error }}>
      {children}
      {error && <output className="toast toast-error" role="alert">{error}</output>}
    </GoogleIdentityContext.Provider>
  );
}

export function useGoogleIdentity() {
  return useContext(GoogleIdentityContext);
}

/**
 * Botón oficial de Google. Mientras el script carga, o si no carga, muestra el
 * enlace al ingreso por redirección, que funciona sin JavaScript de terceros.
 */
export function GoogleSignInButton({ text = 'continue_with', width = 280 }: {
  text?: 'signin_with' | 'continue_with';
  width?: number;
}) {
  const { status, busy } = useGoogleIdentity();
  const container = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const id = window.google?.accounts?.id;
    if (status !== 'ready' || !id || !container.current) return;
    id.renderButton(container.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text,
      logo_alignment: 'left',
      locale: 'es-419',
      width,
    });
    setRendered(true);
  }, [status, text, width]);

  return (
    <div className="google-signin" aria-busy={busy}>
      <div ref={container} hidden={!rendered} />
      {!rendered && (
        // Es una redirección del servidor hacia Google, no una navegación interna.
        // oxlint-disable-next-line next/no-html-link-for-pages
        <a className="google-signin-fallback" href="/api/auth/google">
          <GoogleLogo />
          <span>{text === 'signin_with' ? 'Ingresar con Google' : 'Continuar con Google'}</span>
        </a>
      )}
      {busy && <small>ingresando…</small>}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
