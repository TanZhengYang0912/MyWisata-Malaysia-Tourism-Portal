"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";

const profileSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  city: z.string().min(1, "City is required"),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^(\+?60|0)[0-9]{8,10}$/, "Enter a valid Malaysian phone number (e.g. 0123456789)"),
});

type ProfileErrors = Partial<Record<keyof z.infer<typeof profileSchema>, string>>;

export default function ProfilePage() {
  const { currentUser, refreshUser } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: currentUser?.name !== currentUser?.email ? (currentUser?.name ?? "") : "",
    city: currentUser?.city ?? "",
    phone: currentUser?.phone ?? "",
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function patch(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const result = profileSchema.safeParse(form);
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setErrors({
        fullName: flat.fullName?.[0],
        city: flat.city?.[0],
        phone: flat.phone?.[0],
      });
      return;
    }

    if (!currentUser) return;
    setSaving(true);
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? 'Failed to save profile.');
      }
      await refreshUser();
      router.push("/customer/kyc");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const tier = currentUser?.verificationTier ?? "guest";
  const tierLabels: Record<string, string> = {
    guest: "Guest",
    registered: "Registered",
    profile_complete: "Profile Complete",
    kyc_submitted: "KYC Under Review",
    kyc_verified: "KYC Verified",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
        <UserCircle size={28} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Your Profile</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Fill in your details to unlock KYC submission and higher wallet limits.
      </p>

      {/* Current tier badge */}
      <div
        className="flex items-center gap-3 p-4 rounded-2xl mb-8 border"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <CheckCircle2
          size={20}
          className={tier === "profile_complete" || tier === "kyc_submitted" || tier === "kyc_verified" ? "text-primary" : "text-muted-foreground"}
          style={{ flexShrink: 0 }}
        />
        <p className="text-sm font-semibold text-foreground">
          Current tier: {tierLabels[tier] ?? tier}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <h2 className="font-bold text-foreground">Personal Information</h2>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Full Name
          </label>
          <input
            value={form.fullName}
            onChange={(e) => patch("fullName", e.target.value)}
            placeholder="e.g. Ahmad Bin Ali"
            className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderColor: errors.fullName ? "var(--destructive)" : "var(--border)" }}
          />
          {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            City
          </label>
          <input
            value={form.city}
            onChange={(e) => patch("city", e.target.value)}
            placeholder="e.g. Kuala Lumpur"
            className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderColor: errors.city ? "var(--destructive)" : "var(--border)" }}
          />
          {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Phone Number
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => patch("phone", e.target.value)}
            placeholder="e.g. 0123456789"
            className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderColor: errors.phone ? "var(--destructive)" : "var(--border)" }}
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
        </div>

        {serverError && (
          <p className="text-xs text-destructive text-center">{serverError}</p>
        )}

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save Profile"}
        </Button>
      </form>
    </div>
  );
}
