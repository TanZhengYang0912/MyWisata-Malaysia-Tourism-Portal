import VendorSidebar from '@/components/layout/vendor-sidebar';
import VendorAccessGate from '@/components/layout/vendor-access-gate';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="vendor-portal min-h-screen overflow-x-hidden bg-background">
      <VendorSidebar />
      <main className="ml-60 min-w-0 overflow-x-hidden">
        <div className="w-full px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
          <VendorAccessGate>{children}</VendorAccessGate>
        </div>
      </main>
    </div>
  );
}
