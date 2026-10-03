/**
 * Conciliación de pagos pendientes.
 *
 *   npm run orders:reconcile
 *
 * Los webhooks se pierden: una caída, un timeout o un reintento agotado dejan
 * una orden pagada figurando como pendiente. Este script le vuelve a preguntar
 * a Mercado Pago por las órdenes que llevan rato sin resolverse.
 *
 * Pensado para un cron diario en el VPS.
 */
import { getPayload } from 'payload';
import config from '@payload-config';
import { syncOrderPayment } from '../lib/orders.js';

const HOURS = Number(process.env.RECONCILE_AFTER_HOURS || 2);
const since = new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString();

const payload = await getPayload({ config });
const pending = await payload.find({
  collection: 'orders',
  where: {
    and: [
      { status: { equals: 'pending' } },
      { paymentMethod: { equals: 'mercado-pago' } },
      { externalReference: { exists: true } },
      { createdAt: { less_than: since } },
    ],
  },
  limit: 200,
  depth: 0,
});

console.log(`Órdenes pendientes de más de ${HOURS} h: ${pending.docs.length}`);

let resolved = 0;
for (const order of pending.docs) {
  const reference = order.externalReference;
  if (!reference) continue;

  try {
    const result = await syncOrderPayment(reference);

    if (result.updated) {
      resolved += 1;
      console.log(`  ${order.number}: ${result.status}`);
    }
  } catch (error) {
    console.error(`  ${order.number}: no se pudo consultar —`, error instanceof Error ? error.message : error);
  }
}

console.log(`Resueltas: ${resolved}.`);
process.exit(0);
