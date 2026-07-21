import Link from 'next/link';
import VendorClaimForm from '@/components/vendor/vendor-claim-form';

export default async function VendorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>;
}) {
  const { recommendation: token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto mt-10 max-w-xl px-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold text-foreground">Vendor invitation not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use the one-time claim link from your invitation email.</p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-primary">Return home</Link>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto mt-10 mb-12 max-w-xl px-4">
      <VendorClaimForm token={token} />
    </main>
  );
}
