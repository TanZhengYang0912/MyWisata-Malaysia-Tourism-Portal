import { redirect } from "next/navigation";

export default async function GuestActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const safeId = encodeURIComponent(id);
  redirect(`/customer/activity/${safeId}`);
}
