import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

/**
 * Política de seguridad de contenido.
 *
 * Cada permiso está acá porque algo concreto lo necesita; si se agrega un
 * servicio nuevo hay que sumarlo o el navegador lo bloquea en silencio.
 *
 * `'unsafe-inline'` en scripts es inevitable hoy: Google Tag Manager se instala
 * con un script en línea y Next.js incrusta los datos de hidratación del mismo
 * modo. Se puede endurecer con nonces cuando GTM deje de hacer falta.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // El catálogo todavía enlaza imágenes al CDN de Natura.
  "img-src 'self' data: blob: https://production.na01.natura.com https://www.googletagmanager.com https://www.google-analytics.com",
  // Supabase resuelve el ingreso con Google desde el navegador.
  "connect-src 'self' https://*.supabase.co https://www.googletagmanager.com https://www.google-analytics.com",
  "frame-src 'self' https://www.googletagmanager.com",
  "media-src 'self'",
  "worker-src 'self' blob:",
  // Nadie debería poder meter la tienda dentro de un iframe.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // La tienda no usa cámara, micrófono ni ubicación.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Un año, con subdominios. Sólo tiene efecto sobre HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      // El panel y la API no deben quedar en ninguna caché intermedia.
      {
        source: '/admin/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ]),
};

export default withPayload(nextConfig);
