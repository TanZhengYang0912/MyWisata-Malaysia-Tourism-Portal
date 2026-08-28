import { redirect } from "next/navigation";

export default async function GuestVendorPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  redirect(`/customer/vendor/${encodeURIComponent(vendorId)}`);
}
