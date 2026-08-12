"use client";

import { useEffect, useMemo, useState } from "react";
import { Star, Plus, CheckCircle2, Clock, XCircle, ImagePlus, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { getDiscoveryCategoryLabel, normalizeCategoryRows, type CanonicalCategoryOption } from "@/lib/customer/discovery-categories";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";
import type { VendorRecommendation } from "@/backend/core/types";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { getRecommendationStatus } from "@/lib/customer/recommendation-status";
import Link from "next/link";
import { CustomerPageHeader, CustomerPageShell, CustomerPanel } from "@/components/customer/customer-page-shell";
import { GooglePlacePicker, type RecommendationLocation } from "@/components/recommendations/google-place-picker";

type RecommendationResponse = {
  id: string;
  vendor_name: string;
  status: VendorRecommendation["status"];
  state: string | null;
  categories: { name: string; slug: string | null } | null;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
    city: string | null;
    country: string | null;
    isKycVerified: boolean;
  } | null;
};

function recommendationErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: unknown; details?: unknown } }).error;
  const details = error?.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
  const fields = Object.keys(details?.fieldErrors ?? {});
  if (fields.includes("vendorName")) return "Please enter a vendor or business name with at least 3 characters.";
  if (fields.includes("description")) return "Please enter a description between 20 and 2,000 characters.";
  if (fields.includes("whyRecommend")) return "Please explain why you recommend this place in 20 to 500 characters.";
  if (fields.includes("categoryId")) return "Please select a category.";
  if (fields.includes("location")) return "Please select a location from Google Maps.";
  if (fields.includes("stagedImageIds")) return "Please add at least one valid photo before submitting.";
  if (fields.includes("contact")) return "Please add a phone number, email address, or website.";
  if (fields.includes("imageAttested")) return "Please confirm that you own these photos or have permission to publish them.";
  return "Some required recommendation details are incomplete. Please review the form and try again.";
}

export default function RecommendationsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [recs, setRecs] = useState<VendorRecommendation[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categories, setCategories] = useState<CanonicalCategoryOption[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    whyRecommend: "",
    category: "",
    phone: "",
    email: "",
    website: "",
    imageAttested: false,
  });
  const [location, setLocation] = useState<RecommendationLocation | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const imagePreviews = useMemo(() => images.map((image) => ({ file: image, url: URL.createObjectURL(image) })), [images]);
  useEffect(() => () => imagePreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [imagePreviews]);

  const supabase = useMemo(() => createClient(), []);
  useEffect(() => {
    supabase.from("categories").select("id,name,slug").eq("is_active", true).order("sort_order").then(({ data }) => setCategories(normalizeCategoryRows((data ?? []) as { id: string; name: string; slug: string | null }[])));
    if (!currentUser) return;
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((body) => {
        if (body?.data) {
          setRecs(body.data.map((r: RecommendationResponse) => ({
            id: r.id,
            submittedBy: currentUser.id,
            name: r.vendor_name,
            category: r.categories?.slug ? getDiscoveryCategoryLabel(r.categories.slug) : r.categories?.name ?? "",
            state: r.state ?? "",
            status: r.status,
            qualityScore: 0,
            duplicate: false,
            author: r.author ? {
              id: r.author.id,
              name: r.author.name,
              avatarUrl: r.author.avatarUrl ?? undefined,
              city: r.author.city ?? undefined,
              country: r.author.country ?? undefined,
              isKycVerified: Boolean(r.author.isKycVerified),
            } : undefined,
          })));
        }
      })
      .catch(() => setRecs([]));
  }, [currentUser, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setError("");

    if (form.name.trim().length < 3) { setError("Vendor name must be at least 3 characters."); return; }
    if (form.description.trim().length < 20 || form.whyRecommend.trim().length < 20) { setError("Description and recommendation reason must be at least 20 characters."); return; }
    const selectedCategory = categories.find((category) => category.id === form.category);
    if (!selectedCategory) { setError("Select a recommendation category."); return; }
    if (!location) { setError("Select the place from Google Maps."); return; }
    if (images.length < 1) { setError("Add 1 to 5 photos."); return; }
    if (!form.phone.trim() && !form.email.trim() && !form.website.trim()) { setError("Add at least one contact method."); return; }
    if (!form.imageAttested) { setError("Confirm that you have permission to publish these images."); return; }

    setSubmitting(true);
    try {
      const stagedImageIds = await Promise.all(images.map(async (image) => {
        const upload = await fetch('/api/recommendations/images', { method: 'POST', body: (() => { const data = new FormData(); data.append('image', image); return data; })() });
        const uploadBody = await upload.json().catch(() => ({}));
        if (!upload.ok) throw new Error(uploadBody?.error?.message ?? 'Unable to upload image.');
        return uploadBody.data.stagedImageId as string;
      }));
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName:  form.name.trim(),
          description: form.description.trim(),
          whyRecommend: form.whyRecommend.trim(),
          categoryId:  selectedCategory.id,
          location,
          contact: { phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, website: form.website.trim() || undefined },
          stagedImageIds,
          imageAttested: form.imageAttested,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(recommendationErrorMessage(body, 'Failed to submit.'));
        return;
      }
      const newRec: VendorRecommendation = {
        id:           body.data.id,
        submittedBy:  currentUser.id,
        name:         body.data.vendor_name,
        category:     selectedCategory?.name ?? "",
        state:        location.formattedAddress,
        status:       'pending',
        qualityScore: 0,
        duplicate:    false,
      };
      setRecs((prev) => [newRec, ...(prev ?? [])]);
      setShowForm(false);
      setForm({ name: "", description: "", whyRecommend: "", category: "", phone: "", email: "", website: "", imageAttested: false });
      setLocation(null); setImages([]);
      showFeedback("success", "Vendor recommendation submitted for review.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit.";
      setError(message);
      showFeedback("error", message);
    } finally {
      setSubmitting(false);
    }
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  }

  const pending  = (recs ?? []).filter((r) => r.status === "pending" || r.status === "changes_requested");
  const reviewed = (recs ?? []).filter((r) => r.status !== "pending");

  return (
    <CustomerPageShell>
      <CustomerPageHeader
        eyebrow="Community"
        title="Recommend a Vendor"
        description="Know a great local experience that deserves to be on MyWisata? Nominate them here. Admin reviews it first, then the vendor can join or be linked before going live. You earn commission if they join through your recommendation."
        icon={<Star size={14} className="text-accent" />}
        actions={<Button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-2">
          <Plus size={15} /> Recommend
        </Button>}
      />

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6">
          <h2 className="font-bold text-foreground">New Recommendation</h2>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendor / Business Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Aunty Lim's Nyonya Kitchen"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe what makes this vendor special (at least 20 characters)…"
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <p className="text-[10px] text-muted-foreground text-right">{form.description.length}/2000</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="why-recommend" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Why do you recommend this place?</label>
            <textarea id="why-recommend" required value={form.whyRecommend} onChange={(e) => setForm((f) => ({ ...f, whyRecommend: e.target.value }))} placeholder="Share why travellers should discover this place…" rows={3} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
            <p className="text-[10px] text-muted-foreground text-right">{form.whyRecommend.length}/2000</p>
          </div>

          <div className="space-y-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</label>
              <select
                required
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                disabled={categories.length === 0}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select category...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {categories.length === 0 && <p className="text-xs text-destructive">No recommendation categories are available. Please contact support.</p>}
            </div>

          </div>

          <GooglePlacePicker value={location} onChange={setLocation} />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add 1 to 5 photos</p>
            <label className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-6 text-center transition hover:border-primary hover:bg-primary/[0.07]">
              <ImagePlus size={26} aria-hidden="true" className="mb-2 text-primary transition-transform group-hover:scale-110" />
              <span className="text-sm font-semibold text-primary">Choose photos</span>
              <span className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP · up to 5 MB each</span>
              <input aria-label="Add 1 to 5 photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { setImages(Array.from(event.target.files ?? []).slice(0, 5)); event.currentTarget.value = ""; }} className="sr-only" />
            </label>
            {imagePreviews.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">{imagePreviews.map(({ file, url }, index) => <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-xl border border-border bg-secondary"><img src={url} alt={file.name} className="h-28 w-full object-cover" /><button type="button" onClick={() => removeImage(index)} aria-label={`Remove ${file.name}`} className="absolute right-2 top-2 rounded-full bg-foreground/75 p-1.5 text-background opacity-0 transition group-hover:opacity-100 focus:opacity-100"><X size={14} /></button><p className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">{file.name}</p></div>)}</div>}
            <p className="text-xs text-muted-foreground">{images.length > 0 ? `${images.length} photo${images.length === 1 ? '' : 's'} selected` : "Click the upload area to add photos."}</p>
          </div>

          <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add at least one contact method</p><div className="grid gap-2 sm:grid-cols-3"><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" type="email" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="Website" type="url" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></div></div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input aria-label="I own these images or have permission to publish them" type="checkbox" checked={form.imageAttested} onChange={(e) => setForm((f) => ({ ...f, imageAttested: e.target.checked }))} className="mt-0.5" /><span>I own these images or have permission to publish them</span></label>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || categories.length === 0} className="flex-1">
              {submitting ? "Submitting…" : "Submit Recommendation"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {pending.length > 0 && (
        <CustomerPanel className="mb-6 overflow-hidden !p-0 sm:!p-0">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <h2 className="font-bold text-foreground text-sm">Pending Review ({pending.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((r) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.category} · {r.state || "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{getRecommendationStatus(r.status).description}</p>
                  {r.status === "pending" && <p className="mt-1 text-xs text-muted-foreground">Pending recommendations cannot be edited.</p>}
                  {r.status === "changes_requested" && <button type="button" onClick={() => setShowForm(true)} className="mt-1 text-xs font-semibold text-primary hover:underline">Update the requested details</button>}
                  {r.author && <div className="mt-1 flex items-center gap-2"><Link href={`/customer/profile/${r.author.id}`} className="text-xs font-semibold text-primary hover:underline">View contributor profile</Link><VerifiedContributorBadge verified={r.author.isKycVerified} /></div>}
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </CustomerPanel>
      )}

      <CustomerPanel className="overflow-hidden !p-0 sm:!p-0">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">My Recommendations</h2>
        </div>
        {(recs ?? []).length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Star size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">You haven&apos;t recommended any vendors yet.</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-sm font-semibold text-primary">
              Make your first recommendation →
            </button>
          </div>
        ) : reviewed.length === 0 ? (
          <div className="px-5 py-5 text-center text-sm text-muted-foreground">No reviewed recommendations yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {reviewed.map((r) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {r.status === "approved" || r.status === "converted" ? (
                    <CheckCircle2 size={16} className="text-primary shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-destructive shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.category} · {r.state || "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{getRecommendationStatus(r.status).description}</p>
                    {r.author && <div className="mt-1 flex items-center gap-2"><Link href={`/customer/profile/${r.author.id}`} className="text-xs font-semibold text-primary hover:underline">View contributor profile</Link><VerifiedContributorBadge verified={r.author.isKycVerified} /></div>}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </CustomerPanel>
    </CustomerPageShell>
  );
}
