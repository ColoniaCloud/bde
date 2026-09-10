import 'server-only';
import { randomBytes } from 'node:crypto';
import configPromise from '@payload-config';
import { getPayload } from 'payload';
import type { GoogleProfile } from '@/lib/google-oauth';

/** Alta e ingreso de clientes. */

const payloadClient = () => getPayload({ config: configPromise });

/**
 * Da de alta o reconoce al cliente que llega desde Google, y devuelve su token
 * de sesión.
 *
 * Se busca primero por `googleId` y después por correo: si alguien ya se había
 * registrado con correo y contraseña y luego entra con Google, se vincula la
 * misma cuenta en lugar de crear una duplicada.
 */
export async function signInWithGoogleProfile(profile: GoogleProfile) {
  const payload = await payloadClient();
  const email = profile.email.toLowerCase();

  // Payload emite el token a través de `login`, que exige una contraseña. Para
  // una cuenta de Google no hay ninguna que el cliente conozca, así que se
  // genera una al azar en cada ingreso, se usa en el acto y queda rotada. El
  // hash guardado nunca corresponde a algo que alguien pueda escribir.
  const oneTimePassword = randomBytes(32).toString('hex');

  const existing = await payload.find({
    collection: 'customers',
    where: { or: [{ googleId: { equals: profile.sub } }, { email: { equals: email } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const found = existing.docs[0];

  if (found) {
    await payload.update({
      collection: 'customers',
      id: found.id,
      data: {
        password: oneTimePassword,
        googleId: profile.sub,
        provider: 'google',
        name: found.name || profile.name,
      },
      overrideAccess: true,
    });
  } else {
    await payload.create({
      collection: 'customers',
      data: {
        email,
        password: oneTimePassword,
        name: profile.name,
        provider: 'google',
        googleId: profile.sub,
      },
      overrideAccess: true,
    });
  }

  const result = await payload.login({
    collection: 'customers',
    data: { email, password: oneTimePassword },
    overrideAccess: true,
  });

  if (!result.token) throw new Error('No se pudo emitir la sesión.');

  return { customer: result.user, token: result.token };
}

/** Pedidos de un cliente, para «Mis pedidos». */
export async function getCustomerOrders(customerId: number) {
  const payload = await payloadClient();
  const result = await payload.find({
    collection: 'orders',
    where: { customer: { equals: customerId } },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  });

  return result.docs;
}
