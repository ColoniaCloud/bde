import type { CollectionConfig } from 'payload';
import { isAdmin, isPanel } from '@/lib/access';

/** Imágenes propias. Hoy el catálogo enlaza al CDN de Natura; la fase 2 las trae acá. */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Catálogo' },
  access: {
    read: () => true,
    create: isPanel,
    update: isPanel,
    delete: isAdmin,
  },
  upload: {
    staticDir: 'public/media',
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'card', width: 600, height: undefined, position: 'centre' },
      { name: 'detail', width: 1200, height: undefined, position: 'centre' },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Texto alternativo',
      required: true,
      admin: { description: 'Describe la imagen para lectores de pantalla y buscadores.' },
    },
  ],
};
