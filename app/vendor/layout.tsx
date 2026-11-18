import VendorSidebar from '@/components/layout/vendor-sidebar';
import VendorHeader from '@/components/layout/vendor-header';
import VendorAccessGate from '@/components/layout/vendor-access-gate';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClaimsUserId } from '@/lib/auth/claims-user';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  // Sign-in redirect only: VendorAccessGate and every vendor API authorize with getUser().
  if (!(await getClaimsUserId(db))) redirect('/login');

  return (
    <>
      {/* clip, not hidden: hidden turns these boxes into non-scrolling scroll
          containers, which silently disables position: sticky in every page. */}
      <style>{'html:has(.vendor-portal), body:has(.vendor-portal) { overflow-x: clip; }'}</style>
      <div className="vendor-portal min-h-screen overflow-x-clip bg-background">
        <VendorSidebar />
        <main className="ml-0 min-w-0 overflow-x-clip lg:ml-60">
          <VendorHeader />
          <div className="w-full px-4 pt-6 pb-8 sm:px-6 sm:pt-8 xl:px-8">
            <VendorAccessGate>{children}</VendorAccessGate>
          </div>
        </main>
      </div>
    </>
  );
}
