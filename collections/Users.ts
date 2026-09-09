import type { CollectionConfig } from 'payload';

/**
 * Quienes entran al panel. `admin` puede todo; `editor` mantiene el catálogo
 * (precios, stock, fotos) pero no da de alta usuarios ni toca la configuración.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role'],
    group: 'Administración',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req, id }) =>
      req.user?.role === 'admin' || (Boolean(req.user) && req.user?.id === id),
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Nombre',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      label: 'Rol',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Administrador', value: 'admin' },
        { label: 'Editor de catálogo', value: 'editor' },
      ],
      access: {
        // Nadie se asciende a sí mismo.
        update: ({ req }) => req.user?.role === 'admin',
      },
    },
  ],
};
