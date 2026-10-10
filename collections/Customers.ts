import type { CollectionConfig } from 'payload';

/**
 * Clientes de la tienda.
 *
 * Reemplaza a Supabase. La diferencia que importa no es el proveedor sino que
 * ahora la sesión se puede verificar **en el servidor**: antes el ingreso con
 * Google cambiaba una etiqueta en el encabezado y nada más, y ninguna ruta
 * comprobaba nada.
 *
 * Es una colección de auth aparte de `users`: un cliente nunca debe poder
 * entrar al panel de administración, ni siquiera por error de configuración.
 */
export const Customers: CollectionConfig = {
  slug: 'customers',
  labels: { singular: 'Cliente', plural: 'Clientes' },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30, // 30 días
    maxLoginAttempts: 10,
    lockTime: 10 * 60 * 1000,
    cookies: { sameSite: 'Lax' },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'provider', 'createdAt'],
    group: 'Ventas',
    listSearchableFields: ['email', 'name'],
  },
  access: {
    // El panel ve a todos; un cliente sólo se ve a sí mismo.
    read: ({ req }) => {
      if (req.user?.collection === 'users') return true;
      if (req.user?.collection === 'customers') return { id: { equals: req.user.id } };
      return false;
    },
    // Las altas ocurren por el flujo de ingreso, no por la API pública.
    create: ({ req }) => req.user?.collection === 'users',
    update: ({ req, id }) => {
      if (req.user?.collection === 'users') return true;
      return req.user?.collection === 'customers' && req.user.id === id;
    },
    delete: ({ req }) => req.user?.collection === 'users' && req.user.role === 'admin',
    // Nadie entra al panel con una cuenta de cliente.
    admin: () => false,
  },
  fields: [
    { name: 'name', type: 'text', label: 'Nombre' },
    {
      name: 'provider',
      type: 'select',
      label: 'Cómo ingresa',
      defaultValue: 'password',
      options: [
        { label: 'Correo y contraseña', value: 'password' },
        { label: 'Google', value: 'google' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'googleId',
      type: 'text',
      label: 'Identificador de Google',
      index: true,
      unique: true,
      admin: { readOnly: true },
      access: {
        // Un cliente no necesita ver ni tocar esto.
        read: ({ req }) => req.user?.collection === 'users',
        update: () => false,
      },
    },
    {
      name: 'picture',
      type: 'text',
      label: 'Foto',
      admin: {
        readOnly: true,
        description: 'La foto de perfil de Google. Se actualiza en cada ingreso.',
      },
      access: {
        // Viene de Google: el cliente la ve pero no la puede reemplazar.
        update: () => false,
      },
    },
    {
      // Para completar el checkout solo. El cliente los edita desde su cuenta.
      name: 'delivery',
      type: 'group',
      label: 'Datos de entrega',
      fields: [
        { name: 'phone', type: 'text', label: 'Teléfono', maxLength: 30 },
        { name: 'address', type: 'text', label: 'Dirección', maxLength: 160 },
        { name: 'city', type: 'text', label: 'Ciudad o localidad', maxLength: 80 },
        { name: 'notes', type: 'textarea', label: 'Referencias', maxLength: 300 },
      ],
    },
    {
      name: 'favorites',
      type: 'json',
      label: 'Favoritos',
      defaultValue: [],
      admin: {
        readOnly: true,
        description: 'Códigos de producto. Se sincronizan desde el navegador al ingresar.',
      },
    },
  ],
};
