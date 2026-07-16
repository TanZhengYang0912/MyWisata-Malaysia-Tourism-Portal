import Link from "next/link";
import { Globe } from "lucide-react";

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/guest/explore" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white"><Globe size={16} /></span>
            MyWisata
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">Guest Mode</span>
            <Link href="/login" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign in</Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
