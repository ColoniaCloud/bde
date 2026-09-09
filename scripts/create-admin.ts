/**
 * Crea el primer usuario del panel.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
 *
 * Sólo sirve para el arranque: los usuarios siguientes se dan de alta desde el
 * propio panel. No pisa un usuario existente.
 */
import { getPayload } from 'payload';
import config from '@payload-config';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || 'Administración';

if (!email || !password) {
  console.error('Faltan ADMIN_EMAIL y ADMIN_PASSWORD.');
  process.exit(1);
}

if (password.length < 12) {
  console.error('La contraseña debe tener al menos 12 caracteres.');
  process.exit(1);
}

const payload = await getPayload({ config });
const existing = await payload.find({
  collection: 'users',
  where: { email: { equals: email } },
  limit: 1,
});

if (existing.docs.length > 0) {
  console.log(`El usuario ${email} ya existe. No se modificó nada.`);
  process.exit(0);
}

await payload.create({
  collection: 'users',
  data: { email, password, name, role: 'admin' },
});

console.log(`Usuario administrador creado: ${email}`);
process.exit(0);
