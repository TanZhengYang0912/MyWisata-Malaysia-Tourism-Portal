import { redirect } from "next/navigation";

export default async function GuestVendorPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  const safeVendorId = encodeURIComponent(vendorId);
  redirect(`/customer/vendor/${safeVendorId}`);
}
