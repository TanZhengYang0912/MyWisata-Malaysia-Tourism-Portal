import { KycSubmissionPage } from "@/components/kyc/kyc-submission-page";

export default function CustomerKycPage() {
  return (
    <KycSubmissionPage
      selfPath="/customer/kyc"
      backHref="/customer/profile"
      backLabelKey="ui.profile.backToProfile"
    />
  );
}
