import { notFound } from "next/navigation";
import { isDemoToolRuntimeEnabled } from "@/lib/demo/runtime";
import { DemoPurchaseClient } from "./demo-purchase-client";

export default function DevPage() {
  if (!isDemoToolRuntimeEnabled()) notFound();
  return <DemoPurchaseClient />;
}
