import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type GuestVendorPageProps = { params: Promise<{ vendorId: string }> };

export const dynamic = "force-dynamic";

export default async function GuestVendorPage({ params }: GuestVendorPageProps) {
  const { vendorId } = await params;
  const db = await createClient();
  const { data: vendor } = await db
    .from("vendors")
    .select("id,name,description,cover_url")
    .eq("id", vendorId)
    .eq("status", "approved")
    .maybeSingle();
  if (!vendor) notFound();

  const { data: outlets } = await db
    .from("outlets")
    .select("id,name,city,state,address")
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .order("name");

  return <main className="mx-auto max-w-5xl px-6 py-10">
    <Link href="/guest/explore" className="text-sm font-semibold text-primary underline underline-offset-4">← Back to listings</Link>
    <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {vendor.cover_url ? <>
        {/* Guest vendor pages support uploaded cover URLs, which are not statically enumerable for next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={vendor.cover_url} alt="" className="h-56 w-full object-cover" />
      </> : null}
      <div className="p-7"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Verified MyWisata vendor</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">{vendor.name}</h1>{vendor.description ? <p className="mt-3 max-w-3xl text-muted-foreground">{vendor.description}</p> : null}<Link href="/guest/explore" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Browse listings</Link></div>
    </section>
    <section className="mt-8"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Locations</p><h2 className="mt-2 text-2xl font-bold">Active outlets</h2></div><p className="text-sm text-muted-foreground">{outlets?.length ?? 0} outlet{outlets?.length === 1 ? "" : "s"}</p></div>{!outlets?.length ? <p className="mt-5 rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">No public outlets yet.</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2">{outlets.map((outlet) => <article key={outlet.id} className="rounded-2xl border border-border bg-card p-5"><h3 className="font-bold">{outlet.name}</h3><p className="mt-2 text-sm text-muted-foreground">{[outlet.city, outlet.state].filter(Boolean).join(", ") || "Malaysia"}</p>{outlet.address ? <p className="mt-1 text-sm text-muted-foreground">{outlet.address}</p> : null}</article>)}</div>}</section>
  </main>;
}
