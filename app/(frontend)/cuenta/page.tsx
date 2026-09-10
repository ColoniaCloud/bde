import type { Metadata } from 'next';
import { headers as nextHeaders } from 'next/headers';
import configPromise from '@payload-config';
import { getPayload } from 'payload';
import { AccountPanel } from '@/components/account-panel';
import { getCustomerOrders } from '@/lib/customers';
import { googleConfigured } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mi cuenta',
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const payload = await getPayload({ config: configPromise });
  const { user } = await payload.auth({ headers: await nextHeaders() });

  const customer = user?.collection === 'customers' ? user : null;
  const orders = customer ? await getCustomerOrders(customer.id) : [];

  return (
    <AccountPanel
      customer={customer ? { id: customer.id, email: customer.email, name: customer.name ?? null } : null}
      googleEnabled={googleConfigured()}
      error={error}
      orders={orders.map((order) => ({
        number: order.number,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        lines: (order.lines ?? []).map((line) => ({
          title: line.title,
          quantity: line.quantity,
          total: line.total,
        })),
      }))}
    />
  );
}
