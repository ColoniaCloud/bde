import type { Payload, PayloadRequest } from 'payload';

type Drizzle = Payload['db']['drizzle'];

/**
 * Devuelve la conexión de la transacción abierta en `req`, o la general si no
 * hay ninguna. Las consultas en SQL directo la necesitan para quedar dentro de
 * la misma transacción que los guardados de Payload.
 */
export async function transactionDb(payload: Payload, req?: Partial<PayloadRequest>): Promise<Drizzle> {
  const id = req?.transactionID instanceof Promise ? await req.transactionID : req?.transactionID;
  const session = id ? payload.db.sessions?.[id] : undefined;
  return (session?.db as Drizzle | undefined) ?? payload.db.drizzle;
}
