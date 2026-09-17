import { KycSubmissionPage } from "@/components/kyc/kyc-submission-page";

export default function VendorKycPage() {
  return (
    <KycSubmissionPage
      selfPath="/vendor/kyc"
      backHref="/vendor/wallet"
      backLabelKey="ui.kyc.backToVendorWallet"
      defaultContinuation="/vendor/wallet"
    />
  );
}
