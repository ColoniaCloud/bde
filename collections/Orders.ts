import type { CollectionConfig } from 'payload';

/**
 * Los pedidos.
 *
 * Antes de esta colección, el único registro de una venta era el correo que se
 * enviaba: si el envío fallaba, la venta se perdía, y no había forma de saber
 * qué pagos se habían acreditado.
 *
 * Las líneas guardan el precio *congelado* al momento de la compra. Si mañana
 * cambia el precio en el catálogo, lo que el cliente compró no se mueve.
 */
export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'number',
    defaultColumns: ['number', 'createdAt', 'customerName', 'total', 'status'],
    group: 'Ventas',
    listSearchableFields: ['number', 'customerName', 'customerEmail'],
  },
  access: {
    // Los pedidos no son públicos: sólo se ven desde el panel.
    read: ({ req }) => Boolean(req.user),
    // Se crean desde el servidor con la Local API, que no pasa por este control.
    create: () => false,
    update: ({ req }) => Boolean(req.user),
    delete: () => false,
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'number',
          type: 'text',
          label: 'N.º de orden',
          required: true,
          unique: true,
          index: true,
          admin: { readOnly: true, width: '25%' },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Estado',
          required: true,
          defaultValue: 'pending',
          index: true,
          options: [
            { label: 'Pendiente', value: 'pending' },
            { label: 'Pagado', value: 'paid' },
            { label: 'Cancelado', value: 'cancelled' },
            { label: 'Entregado', value: 'delivered' },
          ],
          admin: { width: '25%' },
        },
        {
          name: 'paymentMethod',
          type: 'select',
          label: 'Forma de pago',
          required: true,
          options: [
            { label: 'Mercado Pago', value: 'mercado-pago' },
            { label: 'WhatsApp', value: 'whatsapp' },
          ],
          admin: { readOnly: true, width: '25%' },
        },
        {
          name: 'emailSent',
          type: 'checkbox',
          label: 'Comprobante enviado',
          defaultValue: false,
          admin: {
            width: '25%',
            description: 'Si está sin marcar, el correo falló y el pedido igual quedó registrado.',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'customerName', type: 'text', label: 'Cliente', required: true, admin: { width: '50%' } },
        { name: 'customerEmail', type: 'email', label: 'Correo', required: true, index: true, admin: { width: '50%' } },
      ],
    },
    {
      name: 'lines',
      type: 'array',
      label: 'Líneas',
      required: true,
      admin: { readOnly: true, description: 'Precios congelados al momento de la compra.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'code', type: 'number', label: 'Código', required: true, admin: { width: '20%' } },
            { name: 'title', type: 'text', label: 'Producto', required: true, admin: { width: '40%' } },
            { name: 'quantity', type: 'number', label: 'Cantidad', required: true, admin: { width: '13%' } },
            { name: 'unitPrice', type: 'number', label: 'Precio', required: true, admin: { width: '13%' } },
            { name: 'total', type: 'number', label: 'Total', required: true, admin: { width: '14%' } },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'subtotal', type: 'number', label: 'Subtotal', required: true, admin: { readOnly: true, width: '33%' } },
        { name: 'surcharge', type: 'number', label: 'Recargo', required: true, defaultValue: 0, admin: { readOnly: true, width: '33%' } },
        { name: 'total', type: 'number', label: 'Total', required: true, admin: { readOnly: true, width: '34%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'mercadoPagoOrderId',
          type: 'text',
          label: 'Orden de Mercado Pago',
          index: true,
          admin: { readOnly: true, width: '50%' },
        },
        {
          name: 'externalReference',
          type: 'text',
          label: 'Referencia externa',
          index: true,
          admin: { readOnly: true, width: '50%' },
        },
      ],
    },
    {
      name: 'events',
      type: 'array',
      label: 'Historial',
      admin: {
        readOnly: true,
        description: 'Cada cambio de estado queda registrado con su origen.',
      },
      fields: [
        { name: 'at', type: 'date', required: true },
        { name: 'type', type: 'text', required: true },
        { name: 'detail', type: 'text' },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Notas internas',
      admin: { description: 'No se le muestran al cliente.' },
    },
  ],
};
