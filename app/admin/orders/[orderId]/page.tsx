import AdminOrderDetailClient from './page-client';

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<{ returnTo?: string }> };

export default async function AdminOrderDetailPage({ params, searchParams }: Props) {
  const [{ orderId }, query] = await Promise.all([params, searchParams]);
  const returnTo = query.returnTo?.startsWith('/admin/orders?') && !query.returnTo.startsWith('//') ? query.returnTo : '/admin/orders';
  return <AdminOrderDetailClient orderId={orderId} returnTo={returnTo} />;
}
