import { redirect } from "next/navigation";
import { appendCustomerQuery } from "@/lib/customer/navigation-context";

export default async function GuestVendorPage({ params, searchParams }: { params: Promise<{ vendorId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { vendorId } = await params;
  redirect(appendCustomerQuery(`/customer/vendors/${encodeURIComponent(vendorId)}`, await searchParams));
}
