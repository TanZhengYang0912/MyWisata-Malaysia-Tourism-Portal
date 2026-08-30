import { redirect } from "next/navigation";

export default function LegacyAccountVerificationPage() {
  redirect("/customer/profile");
}
