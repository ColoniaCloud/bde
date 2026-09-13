import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

/**
 * Política de seguridad de contenido.
 *
 * Cada permiso está acá porque algo concreto lo necesita; si se agrega un
 * servicio nuevo hay que sumarlo o el navegador lo bloquea en silencio.
 *
 * Ojo: no alcanza con mirar este archivo. Google Tag Manager carga las
 * etiquetas que estén configuradas **en su panel**, así que dar de alta una
 * herramienta nueva allá la rompe acá sin tocar el repositorio. Así apareció
 * Microsoft Clarity. Lo que avisa es la prueba `e2e/security.spec.ts`, que
 * abre la tienda y falla si el navegador bloquea algo.
 *
 * `'unsafe-inline'` en scripts es inevitable hoy: Google Tag Manager se instala
 * con un script en línea y Next.js incrusta los datos de hidratación del mismo
 * modo. Se puede endurecer con nonces cuando GTM deje de hacer falta.
 */
const csp = [
  "default-src 'self'",
  // Clarity entra a través de GTM: el contenedor carga www.clarity.ms/tag/...
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://*.clarity.ms",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // El catálogo todavía enlaza imágenes al CDN de Natura. El resto son los
  // píxeles de medición: Clarity manda sus datos como una imagen (c.gif) y ese
  // pedido **redirige** a c.bing.com para sincronizar el identificador, así que
  // hacen falta los dos. Analytics cae al mismo método cuando no puede usar la
  // conexión directa.
  "img-src 'self' data: blob: https://production.na01.natura.com https://www.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms https://c.bing.com",
  // Adónde reportan las mediciones. Analytics usa además un servidor por región
  // (region1.google-analytics.com y similares) y Clarity manda una parte a
  // c.bing.com, de ahí que no alcance con el dominio principal de cada uno.
  // Ya no hay Supabase: el ingreso con Google lo resuelve el servidor.
  "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://c.bing.com",
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
