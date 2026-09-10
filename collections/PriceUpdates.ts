import type { CollectionConfig } from 'payload';
import { isAdmin, isPanel } from '@/lib/access';

/**
 * Actualizaciones de precio a partir de un PDF.
 *
 * El flujo es deliberadamente de dos tiempos:
 *
 *   1. Se sube el PDF. El asistente lo lee y arma una PROPUESTA.
 *   2. Una persona la revisa en el panel y recién ahí se aplica.
 *
 * Nunca se escribe un precio sin ese segundo paso. Un modelo leyendo una tabla
 * escaneada se equivoca —confunde una columna, se come un dígito, toma el precio
 * mayorista— y un error acá se cobra.
 */
export const PriceUpdates: CollectionConfig = {
  hooks: {
    afterChange: [
      async ({ doc, operation, req, context }) => {
        // `skipAnalysis` corta la recursión: el análisis actualiza el mismo
        // documento y volvería a dispararse a sí mismo.
        if (context.skipAnalysis) return doc;

        const { analyzePriceUpdate, applyPriceUpdate } = await import('@/lib/price-updates');

        if (operation === 'create' && doc.status === 'pending') {
          await analyzePriceUpdate(doc.id as number, req);
        }

        if (operation === 'update' && doc.status === 'apply') {
          await applyPriceUpdate(doc.id as number, req);
        }

        return doc;
      },
    ],
  },
  slug: 'price-updates',
  labels: { singular: 'Actualización de precios', plural: 'Actualizaciones de precios' },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'createdAt', 'status', 'summary'],
    group: 'Catálogo',
    description: 'Subí el PDF de la lista, revisá la propuesta y aplicá los cambios que correspondan.',
  },
  access: {
    read: isPanel,
    create: isPanel,
    update: isPanel,
    delete: isAdmin,
  },
  upload: {
    staticDir: 'private/price-updates',
    mimeTypes: ['application/pdf'],
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      label: 'Estado',
      required: true,
      defaultValue: 'pending',
      admin: {
        position: 'sidebar',
        description:
          'Poné «Aplicar» y guardá para escribir los precios de las filas tildadas. No hay vuelta atrás automática.',
      },
      options: [
        { label: '1 · Recién subido', value: 'pending' },
        { label: '2 · Leyendo el PDF', value: 'analyzing' },
        { label: '3 · Listo para revisar', value: 'review' },
        { label: '4 · Aplicar los cambios tildados', value: 'apply' },
        { label: '5 · Aplicado', value: 'applied' },
        { label: 'Falló', value: 'failed' },
      ],
    },
    {
      name: 'completeList',
      type: 'checkbox',
      label: 'Es la lista completa',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Tildalo sólo si el PDF trae TODO el catálogo. Si está tildado, los productos que no figuren se proponen como sin stock. Con una lista parcial dejalo sin tildar.',
      },
    },
    {
      name: 'summary',
      type: 'text',
      label: 'Resumen',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'error',
      type: 'textarea',
      label: 'Detalle del error',
      admin: { readOnly: true, condition: (data) => data?.status === 'failed' },
    },
    {
      name: 'rows',
      type: 'array',
      label: 'Propuesta',
      admin: {
        description:
          'Destildá lo que no quieras aplicar. Las filas marcadas «requiere atención» llegan sin tildar a propósito.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'approved', type: 'checkbox', label: 'Aplicar', admin: { width: '10%' } },
            { name: 'code', type: 'number', label: 'Código', admin: { readOnly: true, width: '15%' } },
            { name: 'name', type: 'text', label: 'Producto', admin: { readOnly: true, width: '35%' } },
            {
              name: 'action',
              type: 'select',
              label: 'Acción',
              admin: { readOnly: true, width: '15%' },
              options: [
                { label: 'Actualizar precio', value: 'update' },
                { label: 'Producto nuevo', value: 'create' },
                { label: 'Ausente del PDF', value: 'missing' },
                { label: 'Descartado', value: 'discarded' },
              ],
            },
            { name: 'currentPrice', type: 'number', label: 'Actual', admin: { readOnly: true, width: '12%' } },
            { name: 'newPrice', type: 'number', label: 'Nuevo', admin: { readOnly: true, width: '13%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'changePercent', type: 'number', label: 'Variación %', admin: { readOnly: true, width: '20%' } },
            {
              name: 'requiresAttention',
              type: 'checkbox',
              label: 'Requiere atención',
              admin: { readOnly: true, width: '20%' },
            },
            { name: 'note', type: 'text', label: 'Observación', admin: { readOnly: true, width: '60%' } },
          ],
        },
      ],
    },
    {
      name: 'appliedAt',
      type: 'date',
      label: 'Aplicado el',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'appliedCount',
      type: 'number',
      label: 'Precios escritos',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
};
