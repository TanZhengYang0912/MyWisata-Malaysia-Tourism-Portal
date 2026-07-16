import Link from "next/link";

export default function DemoPlaceNotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[#f4fbf8] px-5 text-center text-[#173b3a]"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0e5f58]">Story not found</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">That place is not in the local demo.</h1><Link href="/demo/map" className="mt-5 inline-flex rounded-full bg-[#0e5f58] px-5 py-3 text-sm font-bold text-white">Back to map</Link></div></main>;
}
