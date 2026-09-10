import type { CollectionConfig } from 'payload';
import { isAdmin, isAdminField, isPanel } from '@/lib/access';

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
    read: isPanel,
    create: isAdmin,
    // Un administrador edita a cualquiera; el resto, sólo su propia ficha.
    update: ({ req, id }) => {
      if (req.user?.collection !== 'users') return false;
      return req.user.role === 'admin' || req.user.id === id;
    },
    delete: isAdmin,
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
        update: isAdminField,
      },
    },
  ],
};
