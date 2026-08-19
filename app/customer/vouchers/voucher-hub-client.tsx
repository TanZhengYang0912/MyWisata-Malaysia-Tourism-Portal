"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleHelp, Clock3, Gift, MapPin, Search, Sparkles, Tag } from "lucide-react";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { buildVoucherUseHref, isClaimUsable, type CustomerVoucher, type CustomerVoucherTab } from "@/lib/customer/voucher-claims";

type VoucherFilter = "all" | CustomerVoucher["voucherType"];

const FILTERS: Array<{ value: VoucherFilter; label: string }> = [
  { value: "all", label: "All deals" },
  { value: "percent", label: "Percentage off" },
  { value: "fixed", label: "Fixed amount" },
  { value: "bogo", label: "Buy one, get one" },
];

function discountLabel(voucher: CustomerVoucher) {
  if (voucher.voucherType === "percent") return `${voucher.discountValue}% off`;
  if (voucher.voucherType === "fixed") return `RM ${voucher.discountValue.toFixed(2)} off`;
  return "Buy one, get one";
}

function expiryLabel(voucher: CustomerVoucher) {
  if (!voucher.validUntil) return "No expiry listed";
  return `Ends ${new Date(voucher.validUntil).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`;
}

function remainingLabel(voucher: CustomerVoucher) {
  if (voucher.maxUses === null) return "Limited-time deal";
  return `${Math.max(0, voucher.maxUses - voucher.usesCount)} left`;
}

function redemptionLabel(mode: CustomerVoucher["redemptionMode"]) {
  if (mode === "both") return "Online or in-store"
  if (mode === "in_store") return "In-store redemption"
  return "Online checkout"
}

function claimAction(voucher: CustomerVoucher) {
  if (!voucher.claim) return "Claim";
  if (voucher.claim.status === "redeemed") return "Redeemed";
  if (!isClaimUsable(voucher.claim)) return "Expired";
  return "Claimed";
}

function VoucherCard({ voucher, onClaim, claiming }: { voucher: CustomerVoucher; onClaim: (voucher: CustomerVoucher) => void; claiming: boolean }) {
  const action = claimAction(voucher);
  const canUse = Boolean(voucher.claim && isClaimUsable(voucher.claim));
  const isOutletVoucher = Boolean(voucher.outletId && !voucher.productId);
  const visibleProductNames = voucher.eligibleProductNames.slice(0, 3);
  const remainingProductCount = Math.max(0, voucher.eligibleProductCount - visibleProductNames.length);
  const imageAlt = `${voucher.outletName ?? voucher.vendorName} outlet`;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_10px_28px_rgba(1,0,102,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(1,0,102,0.12)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-primary text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {voucher.outletImageUrl ? <img src={voucher.outletImageUrl} alt={imageAlt} width={640} height={360} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary via-[#15158a] to-[#31537b]">{voucher.vendorLogoUrl ? <img src={voucher.vendorLogoUrl} alt={`${voucher.vendorName} logo`} width={80} height={80} loading="lazy" className="h-20 w-20 rounded-2xl object-contain" /> : <span className="text-4xl font-black">{voucher.vendorName.slice(0, 2).toUpperCase()}</span>}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-[#01003f]/80 via-transparent to-[#01003f]/10" />
        <div className="absolute inset-x-5 top-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#010066]/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] backdrop-blur-sm"><Sparkles size={12} aria-hidden="true" className="text-[#FFCC00]" /> Verified</span>
          <span className="text-xs font-semibold text-[#FFCC00]">{remainingLabel(voucher)}</span>
        </div>
        <div className="absolute inset-x-5 bottom-4 min-w-0">
          <p className="truncate text-base font-bold">{voucher.vendorName}</p>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-white/80"><MapPin size={12} aria-hidden="true" /> {voucher.locationLabel ?? "Malaysia"}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{isOutletVoucher ? "Outlet voucher" : voucher.voucherType === "bogo" ? "Freebie" : "Partner voucher"}</p>
        <h2 className="mt-1 text-xl font-bold leading-tight text-foreground">{isOutletVoucher ? voucher.outletName ?? voucher.name : voucher.name}</h2>
        <p className="mt-2 text-2xl font-black text-primary">{discountLabel(voucher)}</p>
        {isOutletVoucher && <div className="mt-4 rounded-2xl bg-[#f3f6fb] p-3">
          <p className="text-xs font-semibold text-primary">Applies to all eligible products at this outlet</p>
          <p className="mt-1 text-xs text-muted-foreground">{voucher.eligibleProductCount} {voucher.eligibleProductCount === 1 ? "product" : "products"} available</p>
          {visibleProductNames.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
            {visibleProductNames.map((productName) => <span key={productName} className="max-w-full truncate rounded-full border border-border bg-white px-2 py-1 text-[11px] font-medium text-foreground">{productName}</span>)}
            {remainingProductCount > 0 && <span className="rounded-full border border-border bg-white px-2 py-1 text-[11px] font-semibold text-primary">+{remainingProductCount} more</span>}
          </div>}
        </div>}
        {voucher.minSpend > 0 && <p className="mt-3 text-xs font-semibold text-muted-foreground">Min. spend: RM {voucher.minSpend.toFixed(2)}</p>}
        <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-2"><Clock3 size={14} aria-hidden="true" className="text-primary" /> {expiryLabel(voucher)}</p>
          <p className="flex items-center gap-2"><Tag size={14} aria-hidden="true" className="text-primary" /> {redemptionLabel(voucher.redemptionMode)}</p>
          {!isOutletVoucher && voucher.productName && <p className="truncate text-xs font-semibold text-primary">Eligible product: {voucher.productName}</p>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          {voucher.claim?.status === "claimed" && canUse ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={14} aria-hidden="true" /> Saved to My Vouchers</span> : <span className="text-xs font-semibold text-muted-foreground">Claim now, use later</span>}
          {canUse ? (
            <Button asChild size="sm" className="rounded-full px-4"><Link href={buildVoucherUseHref(voucher.code, voucher.claim!.id)}>Use now <ArrowRight size={14} aria-hidden="true" /></Link></Button>
          ) : (
            <Button type="button" size="sm" variant={action === "Claim" ? "default" : "outline"} className="rounded-full px-4" disabled={claiming || action !== "Claim"} onClick={() => onClaim(voucher)}>{action}</Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function VoucherHubClient() {
  const { showFeedback } = useActionFeedback();
  const [tab, setTab] = useState<CustomerVoucherTab>("deals");
  const [vouchers, setVouchers] = useState<CustomerVoucher[]>([]);
  const [filter, setFilter] = useState<VoucherFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const initialTab = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialTab === "mine" || initialTab === "deals") setTab(initialTab);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/customer/vouchers?tab=${tab}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { data?: { vouchers?: CustomerVoucher[] }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load vouchers");
        if (active) setVouchers(payload.data?.vouchers ?? []);
      })
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load vouchers"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab]);

  async function claim(voucher: CustomerVoucher) {
    setClaimingId(voucher.id);
    try {
      const response = await fetch("/api/customer/vouchers/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voucherId: voucher.id }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to claim voucher");
      showFeedback("success", "Voucher claimed. It is now in My Vouchers.");
      const refresh = await fetch(`/api/customer/vouchers?tab=${tab}`, { cache: "no-store" });
      const refreshed = await refresh.json() as { data?: { vouchers?: CustomerVoucher[] } };
      setVouchers(refreshed.data?.vouchers ?? []);
    } catch (claimError) {
      showFeedback("error", claimError instanceof Error ? claimError.message : "Unable to claim voucher");
    } finally {
      setClaimingId(null);
    }
  }

  const visibleVouchers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return vouchers.filter((voucher) => {
      const typeMatch = filter === "all" || voucher.voucherType === filter;
      const searchMatch = !needle || `${voucher.name} ${voucher.vendorName} ${voucher.outletName ?? ""} ${voucher.code} ${voucher.eligibleProductNames.join(" ")}`.toLowerCase().includes(needle);
      return typeMatch && searchMatch;
    });
  }, [filter, search, vouchers]);

  return (
    <div className="min-h-full bg-[#f3f6fb]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <header className="mb-0 min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c28a00]">Exclusive partner deals</p>
            <h1 className="mt-3 max-w-2xl font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[#10234f] sm:text-5xl">{tab === "deals" ? "Claim vouchers from our verified partners" : "Your claimed vouchers"}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#617394]">{tab === "deals" ? "Claim now, save it to My Vouchers, then use it online at checkout when you are ready." : "Your vouchers stay here until you use them or they expire."}</p>
          </header>

          <div className="flex shrink-0 flex-col items-end gap-3 lg:pt-1">
            <div className="inline-flex rounded-2xl border border-border bg-white p-2 shadow-sm" role="tablist" aria-label="Voucher views">
              <button type="button" role="tab" aria-selected={tab === "deals"} onClick={() => setTab("deals")} className={`rounded-xl px-5 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${tab === "deals" ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>Browse Deals</button>
              <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")} className={`rounded-xl px-5 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${tab === "mine" ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>My Vouchers</button>
            </div>
            <div className="group relative">
              <button type="button" aria-expanded={helpOpen} aria-controls="voucher-help" onClick={() => setHelpOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/30 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <CircleHelp size={16} aria-hidden="true" /> How it works
              </button>
              <div id="voucher-help" role="tooltip" className={`${helpOpen ? "block" : "hidden"} absolute right-0 top-full z-30 mt-2 w-80 rounded-2xl border border-border bg-white p-4 text-left text-xs leading-5 text-muted-foreground shadow-xl group-hover:block group-focus-within:block`}>
                <p className="font-bold text-foreground">Use your voucher in three steps</p>
                <ol className="mt-2 space-y-2">
                  <li><span className="font-bold text-primary">1.</span> Claim a deal and save it to My Vouchers.</li>
                  <li><span className="font-bold text-primary">2.</span> Check the expiry date and minimum spend.</li>
                  <li><span className="font-bold text-primary">3.</span> Use eligible items according to the offer&apos;s redemption method.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Voucher type filters">
            {FILTERS.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${filter === item.value ? "border-primary bg-primary text-white" : "border-border bg-white text-muted-foreground hover:border-primary/30 hover:text-primary"}`}>{item.label}</button>)}
          </div>
          <label className="relative block w-full lg:max-w-xs"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search vouchers</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search deals or partners" className="h-10 w-full rounded-full border border-border bg-white pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
        </div>

         {loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-96 animate-pulse rounded-3xl bg-white" />)}</div> : error ? <div className="rounded-3xl border border-destructive/20 bg-white p-8 text-center"><Gift className="mx-auto text-destructive" /><p className="mt-3 text-sm font-semibold text-destructive">{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 text-sm font-bold text-primary hover:underline">Try again</button></div> : visibleVouchers.length === 0 ? <div className="rounded-3xl border border-border bg-white p-10 text-center"><Gift className="mx-auto text-primary" /><h2 className="mt-3 text-lg font-bold text-foreground">{tab === "mine" ? "No claimed vouchers yet" : "No approved partner vouchers available"}</h2><p className="mt-2 text-sm text-muted-foreground">{tab === "mine" ? "Browse partner deals and claim your first voucher." : "Approved live vendor offers will appear here when a partner publishes an online voucher."}</p>{tab === "mine" && <button type="button" onClick={() => setTab("deals")} className="mt-4 text-sm font-bold text-primary hover:underline">Browse deals</button>}</div> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleVouchers.map((voucher) => <VoucherCard key={voucher.id} voucher={voucher} onClaim={claim} claiming={claimingId === voucher.id} />)}</div>}
      </div>
    </div>
  );
}
