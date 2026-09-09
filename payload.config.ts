import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { es } from '@payloadcms/translations/languages/es';
import { buildConfig } from 'payload';
import sharp from 'sharp';
import { Categories } from '@/collections/Categories';
import { Media } from '@/collections/Media';
import { Orders } from '@/collections/Orders';
import { PriceUpdates } from '@/collections/PriceUpdates';
import { Products } from '@/collections/Products';
import { Users } from '@/collections/Users';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta ${name}. Es obligatoria para Payload: revisá .env.example.`);
  }
  return value;
}

export default buildConfig({
  collections: [Products, Categories, Orders, PriceUpdates, Media, Users],
  admin: {
    user: Users.slug,
    meta: { titleSuffix: '· Boutique del Este' },
  },
  // La tienda ya es dueña de /api (Mercado Pago, pedidos), así que la API de
  // Payload vive bajo su propio prefijo en lugar de disputar el catch-all.
  routes: { api: '/api/payload' },
  db: postgresAdapter({
    pool: { connectionString: required('DATABASE_URI') },
    // Sin esto, en desarrollo Payload sincroniza el esquema por su cuenta y la
    // base local termina distinta de la que producen las migraciones. Todo
    // cambio de esquema pasa por `npm run payload migrate:create`.
    push: false,
  }),
  editor: lexicalEditor(),
  secret: required('PAYLOAD_SECRET'),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // La tienda es sólo en español, así que no se activa `localization`: no hay
  // contenido que traducir, y agregarla duplicaría cada campo en la base.
  i18n: {
    supportedLanguages: { es },
    fallbackLanguage: 'es',
  },
  // sharp genera los tamaños declarados en la colección Media.
  sharp,
});
