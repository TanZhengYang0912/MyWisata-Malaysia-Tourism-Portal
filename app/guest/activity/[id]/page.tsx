import { redirect } from "next/navigation";
import { appendCustomerQuery } from "@/lib/customer/navigation-context";

export default async function GuestActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  redirect(appendCustomerQuery(`/customer/products/${encodeURIComponent(id)}`, await searchParams));
}
