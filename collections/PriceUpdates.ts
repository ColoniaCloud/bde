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
    beforeChange: [
      ({ data, operation, context }) => {
        // El análisis lo dispara *pedir* el estado «Recién subido», no llegar
        // a él. Vale al crear (es el valor por omisión) y vale después, que es
        // cómo se vuelve a leer un PDF: si la lectura falló, o si un reinicio
        // del servidor la dejó a medias, se pone ese estado y se guarda.
        const pedido = operation === 'create' ? data.status ?? 'pending' : data.status;
        if (pedido !== 'pending') return data;

        // La decisión se toma acá y se ejecuta en `afterChange`, que es lo que
        // corre una vez que el guardado ya está firme.
        context.startAnalysis = true;

        return {
          ...data,
          status: 'analyzing',
          summary: 'Leyendo el PDF…',
          // La propuesta anterior no sobrevive a una relectura: dejarla
          // sería ofrecer para aplicar filas de una lectura que ya se
          // descartó.
          error: null,
          rows: [],
        };
      },
    ],
    afterChange: [
      async ({ doc, operation, req, context }) => {
        // `skipAnalysis` corta la recursión: el análisis actualiza el mismo
        // documento y volvería a dispararse a sí mismo.
        if (context.skipAnalysis) return doc;

        const { scheduleAnalysis, applyPriceUpdate } = await import('@/lib/price-updates');

        if (context.startAnalysis) {
          // Sin `await`: leer una lista larga son varios minutos de llamadas
          // al modelo, y el pedido del panel no puede quedar esperando eso con
          // la transacción del alta tomada. El resultado queda en el registro.
          void scheduleAnalysis(req.payload, doc.id as number);
        }

        // Aplicar sí va acá y sí se espera: escribe precios, y o se escriben
        // todos los aprobados dentro de esta transacción o no se escribe nada.
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
          'Poné «Aplicar» y guardá para escribir los precios de las filas tildadas. No hay vuelta atrás automática. ' +
          'Si la lectura falló o quedó a medias, poné «Volver a leer el PDF» y guardá: se lee de nuevo el mismo archivo.',
      },
      options: [
        { label: '1 · Volver a leer el PDF', value: 'pending' },
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
