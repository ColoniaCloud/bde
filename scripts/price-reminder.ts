/**
 * Recordatorio de actualización de precios.
 *
 *   npm run prices:remind
 *
 * Pensado para un cron diario: avisa cuando pasaron más de 20 días desde la
 * última lista aplicada. No actualiza nada — sólo recuerda. El disparador real
 * del proceso sigue siendo que alguien suba el PDF.
 */
import { getPayload } from 'payload';
import config from '@payload-config';
import { smtpConfiguration } from '../lib/order-email.js';

const DAYS = Number(process.env.PRICE_REMINDER_DAYS || 20);

const payload = await getPayload({ config });
const last = await payload.find({
  collection: 'price-updates',
  where: { status: { equals: 'applied' } },
  sort: '-appliedAt',
  limit: 1,
  depth: 0,
});

const lastApplied = last.docs[0]?.appliedAt;
const daysSince = lastApplied
  ? Math.floor((Date.now() - new Date(lastApplied).getTime()) / 86_400_000)
  : Number.POSITIVE_INFINITY;

if (daysSince < DAYS) {
  console.log(`Última actualización hace ${daysSince} días. Nada que recordar (umbral: ${DAYS}).`);
  process.exit(0);
}

const when = lastApplied
  ? `La última fue hace ${daysSince} días.`
  : 'Todavía no se aplicó ninguna lista.';

console.log(`Toca actualizar precios. ${when}`);

try {
  const smtp = smtpConfiguration();
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  await transporter.sendMail({
    from: `Boutique del Este <${smtp.from}>`,
    to: smtp.copy,
    subject: 'Toca actualizar los precios · Boutique del Este',
    text: `${when}\n\nSubí el PDF de la lista en /admin, revisá la propuesta y aplicá los cambios que correspondan.\n\nRecordá: nada se aplica hasta que lo confirmes.`,
  });
  console.log(`Aviso enviado a ${smtp.copy}.`);
} catch (error) {
  // Sin SMTP el recordatorio igual queda en el log del cron.
  console.error('No se pudo enviar el aviso:', error instanceof Error ? error.message : error);
}

process.exit(0);
