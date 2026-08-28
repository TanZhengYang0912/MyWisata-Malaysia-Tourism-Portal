import { redirect } from "next/navigation";

export default async function GuestActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/customer/activity/${encodeURIComponent(id)}`);
}
