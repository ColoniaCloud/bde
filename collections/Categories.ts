import type { CollectionConfig } from 'payload';
import { isAdmin, isPanel } from '@/lib/access';

/** Las nueve secciones de la tienda. Reemplaza el arreglo fijo de lib/catalog.ts. */
export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'order'],
    group: 'Catálogo',
  },
  access: {
    read: () => true,
    create: isPanel,
    update: isPanel,
    delete: isAdmin,
  },
  defaultSort: 'order',
  fields: [
    { name: 'name', type: 'text', label: 'Nombre', required: true, unique: true },
    {
      name: 'slug',
      type: 'text',
      label: 'Slug',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Parte de la URL: /categoria/<slug>. Cambiarlo rompe enlaces ya indexados.' },
    },
    { name: 'icon', type: 'text', label: 'Ícono', required: true },
    {
      name: 'tone',
      type: 'select',
      label: 'Tono',
      required: true,
      options: ['peach', 'rose', 'sand', 'green', 'berry', 'orange'].map((value) => ({
        label: value,
        value,
      })),
    },
    { name: 'description', type: 'textarea', label: 'Descripción', required: true },
    {
      name: 'order',
      type: 'number',
      label: 'Orden',
      required: true,
      defaultValue: 0,
      admin: { description: 'Define en qué orden aparecen las categorías en la tienda.' },
    },
  ],
};
