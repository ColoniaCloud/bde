import type { Metadata } from 'next';
import Script from 'next/script';
import { connection } from 'next/server';
import { AuthProvider } from '@/components/auth-provider';
import { GoogleIdentityProvider } from '@/components/google-identity';
import { NavCategoriesProvider } from '@/components/nav-categories';
import { StoreProvider } from '@/components/store-provider';
import { getCategories, type StoreCategory } from '@/lib/products';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Boutique del Este | Perfumes y cuidado personal en Uruguay',
    template: '%s | Boutique del Este',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: '/FAVICON%20N.svg',
    shortcut: '/FAVICON%20N.svg',
    apple: '/FAVICON%20N.svg',
  },
  keywords: [
    'perfumes en Uruguay',
    'cuidado personal',
    'regalos originales',
    'lámparas de luz roja',
    'Maldonado',
    'Punta del Este',
    'Ekos',
    'Essencial',
    'Tododia',
    'Luna',
  ],
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    title: 'Boutique del Este | Perfumes y cuidado personal en Uruguay',
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    locale: 'es_UY',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Boutique del Este, tienda online en Uruguay' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boutique del Este | Perfumes y cuidado personal en Uruguay',
    description: SITE_DESCRIPTION,
    images: ['/og.png'],
  },
};

const storeStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'OnlineStore',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  currenciesAccepted: 'UYU',
  telephone: '+59892143420',
  areaServed: [
    { '@type': 'City', name: 'Maldonado' },
    { '@type': 'City', name: 'Punta del Este' },
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+59892143420',
    contactType: 'customer service',
    areaServed: 'UY',
    availableLanguage: 'Spanish',
  },
};

/**
 * Categorías para el menú y el pie. `connection()` evita que se lean durante el
 * build: las páginas fijas (las legales) quedarían con el menú congelado, o
 * vacío si el build corre antes de cargar el catálogo, como en el CI.
 *
 * Si la base no responde, el menú sale sin categorías en lugar de tirar abajo
 * también las páginas que no dependen del catálogo.
 */
async function getNavCategories(): Promise<StoreCategory[]> {
  await connection();
  try {
    return await getCategories({ topLevelOnly: true });
  } catch (error) {
    console.error('No se pudieron leer las categorías del menú', error);
    return [];
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const navCategories = await getNavCategories();

  return (
    <html lang="es-UY">
      <head>
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-T4XRFJRK');`}
        </Script>
        {/* Google Analytics 4 directo, además del contenedor de Tag Manager. */}
        <Script
          id="google-analytics-loader"
          src="https://www.googletagmanager.com/gtag/js?id=G-11K0P2W1NV"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-11K0P2W1NV');`}
        </Script>
      </head>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-T4XRFJRK"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(storeStructuredData).replace(/</g, '\\u003c') }}
        />
        <AuthProvider>
          <NavCategoriesProvider categories={navCategories}>
            <GoogleIdentityProvider>
              <StoreProvider>{children}</StoreProvider>
            </GoogleIdentityProvider>
          </NavCategoriesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
