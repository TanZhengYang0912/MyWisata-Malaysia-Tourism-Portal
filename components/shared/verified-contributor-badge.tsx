import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Public, boolean-only KYC indicator. Keeping the input intentionally narrow
 * prevents callers from coupling public UI to internal KYC status or metadata.
 */
export function VerifiedContributorBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;

  return (
    <Badge
      variant="outline"
      role="img"
      aria-label="Verified Contributor"
      title="Verified Contributor"
      className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      <CheckCircle2 aria-hidden="true" />
      <span>Verified Contributor</span>
    </Badge>
  );
}
