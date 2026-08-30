"use client";

import { useState } from "react";
import { Loader2, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { parseInternationalPhone } from "@/lib/phone/international";

type PhoneVerificationCardProps = {
  onVerified: () => Promise<void> | void;
};

export function PhoneVerificationCard({ onVerified }: PhoneVerificationCardProps) {
  const { t: tCustomer } = useTranslation("customer");
  const { showFeedback } = useActionFeedback();
  const [phase, setPhase] = useState<"enter" | "verify">("enter");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) {
      setError(tCustomer("ui.profileWizard.invalidPhone"));
      return;
    }
    setPhone(parsedPhone.e164);
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: parsedPhone.e164 }),
      });
      if (!response.ok) throw new Error(tCustomer("ui.profileWizard.sendOtp"));
      setPhase("verify");
      showFeedback("success", tCustomer("ui.profileWizard.sendOtp"));
    } catch {
      setError(tCustomer("ui.profileWizard.sendOtp"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp.trim())) {
      setError(tCustomer("ui.profileWizard.invalidOtp"));
      return;
    }
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) {
      setError(tCustomer("ui.profileWizard.invalidPhone"));
      return;
    }
    setPhone(parsedPhone.e164);
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: parsedPhone.e164, code: otp.trim() }),
      });
      if (!response.ok) throw new Error(tCustomer("ui.profileWizard.verifyOtp"));
      await onVerified();
      showFeedback("success", tCustomer("ui.phoneVerification.verified"));
    } catch {
      setError(tCustomer("ui.profileWizard.verifyOtp"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Phone size={18} className="text-primary" />
        <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.verifyPhone")}</h2>
      </div>

      {phase === "enter" ? (
        <>
          <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.phoneDescription")}</p>
          <div className="space-y-1">
            <label htmlFor="verification-phone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.profileWizard.phoneNumber")}</label>
            <InternationalPhoneInput
              id="verification-phone"
              value={phone}
              onChange={(value) => { setPhone(value); setError(null); }}
              disabled={busy}
              error={Boolean(error)}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button onClick={sendOtp} disabled={busy} className="w-full">
            {busy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {busy ? tCustomer("ui.profileWizard.sending") : tCustomer("ui.profileWizard.sendOtp")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.otpDescription", { phone })}</p>
          <div className="space-y-1">
            <label htmlFor="verification-otp" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.profileWizard.otpCode")}</label>
            <input
              id="verification-otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(event) => { setOtp(event.target.value); setError(null); }}
              placeholder="123456"
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 tracking-widest text-center"
              style={{ borderColor: error ? "var(--destructive)" : "var(--border)" }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => { setPhase("enter"); setOtp(""); setError(null); }}
            >
              {tCustomer("ui.profileWizard.changeNumber")}
            </Button>
            <Button type="button" onClick={verifyOtp} disabled={busy} className="flex-1">
              {busy && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {busy ? tCustomer("ui.profileWizard.verifying") : tCustomer("ui.profileWizard.verifyOtp")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
