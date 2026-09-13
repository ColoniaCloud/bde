import type { CollectionConfig } from 'payload';
import { isAdmin, isPanel } from '@/lib/access';

/**
 * El catálogo. Los campos replican el tipo `Product` de app/catalog-data.ts para
 * que la fase 2, cuando la tienda pase a leer de la base, sea un cambio mecánico.
 *
 * `code` es el código de Natura, que hoy funciona a la vez como `id` y como `sku`
 * en el archivo. Payload maneja su propio `id` autoincremental, así que el código
 * vive en su propio campo indexado: es la clave que usan las URLs de producto y
 * los carritos ya guardados en el navegador de los clientes.
 */
export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['code', 'brand', 'name', 'price', 'status'],
    group: 'Catálogo',
    listSearchableFields: ['code', 'brand', 'name'],
  },
  access: {
    read: () => true,
    create: isPanel,
    update: isPanel,
    delete: isAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'code',
          type: 'number',
          label: 'Código Natura',
          required: true,
          unique: true,
          index: true,
          admin: {
            width: '30%',
            description: 'Identifica el producto en las URLs y en los carritos guardados. No cambiarlo.',
          },
        },
        { name: 'brand', type: 'text', label: 'Marca', required: true, index: true, admin: { width: '30%' } },
        {
          name: 'category',
          type: 'relationship',
          relationTo: 'categories',
          label: 'Categoría',
          required: true,
          index: true,
          admin: { width: '40%' },
        },
      ],
    },
    { name: 'name', type: 'text', label: 'Nombre', required: true },
    { name: 'description', type: 'textarea', label: 'Descripción', required: true },
    {
      type: 'row',
      fields: [
        {
          name: 'price',
          type: 'number',
          label: 'Precio (UYU)',
          required: true,
          min: 1,
          admin: { width: '33%', step: 1 },
        },
        {
          name: 'oldPrice',
          type: 'number',
          label: 'Precio anterior',
          min: 1,
          admin: { width: '33%', step: 1, description: 'Se muestra tachado. Vacío si no hay oferta.' },
        },
        {
          name: 'discount',
          type: 'number',
          label: 'Descuento (%)',
          min: 0,
          max: 100,
          admin: { width: '34%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          label: 'Disponibilidad',
          required: true,
          defaultValue: 'available',
          index: true,
          options: [
            { label: 'Disponible', value: 'available' },
            { label: 'Sin stock', value: 'out-of-stock' },
            { label: 'A consultar', value: 'on-request' },
          ],
          admin: { width: '50%' },
        },
        {
          name: 'tag',
          type: 'text',
          label: 'Etiqueta',
          admin: { width: '50%', description: 'Por ejemplo «más vendido» o «lanzamiento».' },
        },
      ],
    },
    {
      name: 'image',
      type: 'text',
      label: 'URL de imagen',
      required: true,
      admin: {
        description: 'Hoy apunta al CDN de Natura. La fase 2 mueve las imágenes a Medios.',
      },
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      label: 'Imagen propia',
      admin: { description: 'Cuando esté cargada, tiene prioridad sobre la URL remota.' },
    },
    {
      name: 'details',
      type: 'array',
      label: 'Detalles',
      labels: { singular: 'Detalle', plural: 'Detalles' },
      fields: [{ name: 'text', type: 'text', label: 'Detalle', required: true }],
    },
    {
      name: 'priceHistory',
      type: 'array',
      label: 'Historial de precios',
      admin: {
        readOnly: true,
        description: 'Lo escribe el asistente de precios de la fase 4. No se edita a mano.',
      },
      fields: [
        { name: 'price', type: 'number', required: true },
        { name: 'changedAt', type: 'date', required: true },
        { name: 'source', type: 'text' },
      ],
    },
  ],
};
