import { redirect } from "next/navigation";
import { appendCustomerQuery } from "@/lib/customer/navigation-context";
export default async function SearchRedirectPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(appendCustomerQuery('/customer/vendors', await searchParams));
}
