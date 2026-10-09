import type { CollectionConfig, RelationshipFieldSingleValidation } from 'payload';
import { isAdmin, isPanel } from '@/lib/access';
import { CATEGORY_ICONS } from '@/lib/category-icons';

/** Valida que la categoría padre deje un único nivel de subcategorías. */
const validateParent: RelationshipFieldSingleValidation = async (value, { id, req }) => {
  if (!value) return true;
  // Puede llegar como id o como documento ya poblado.
  const parentId = typeof value === 'object' ? (value as unknown as { id: number }).id : value;
  if (id !== undefined && String(parentId) === String(id)) {
    return 'Una categoría no puede ser subcategoría de sí misma.';
  }

  const parent = await req.payload
    .findByID({ collection: 'categories', id: parentId, depth: 0, req })
    .catch(() => null);
  if (!parent) return 'La categoría padre no existe.';
  if (parent.parent) return 'Elegí una categoría principal: una subcategoría no puede tener subcategorías.';

  if (id === undefined) return true;
  const children = await req.payload.count({
    collection: 'categories',
    where: { parent: { equals: id } },
    req,
  });
  return children.totalDocs === 0
    ? true
    : 'Esta categoría tiene subcategorías, así que no puede ser subcategoría de otra.';
};

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
    {
      name: 'icon',
      type: 'select',
      label: 'Ícono',
      required: true,
      defaultValue: 'sparkles',
      options: CATEGORY_ICONS.map(({ value, label }) => ({ value, label })),
    },
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
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      label: 'Categoría padre',
      index: true,
      // Un solo nivel de subcategorías. filterOptions sólo acota la lista del
      // panel; las reglas se aplican de verdad en validateParent, que al ser
      // propio reemplaza la validación por defecto de la relación.
      filterOptions: ({ id }) => {
        const topLevel = { parent: { exists: false } };
        return id ? { and: [topLevel, { id: { not_equals: id } }] } : topLevel;
      },
      validate: validateParent,
      admin: {
        position: 'sidebar',
        description: 'Dejalo vacío para una categoría principal. Elegí una para convertirla en subcategoría.',
      },
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
