import VendorSidebar from '@/components/layout/vendor-sidebar';
import VendorAccessGate from '@/components/layout/vendor-access-gate';
import VendorHeader from '@/components/layout/vendor-header';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="vendor-portal min-h-screen bg-background">
      <VendorSidebar />
      <main className="ml-56">
        <VendorHeader />
        <div className="max-w-6xl mx-auto px-6 py-8">
          <VendorAccessGate>{children}</VendorAccessGate>
        </div>
      </main>
    </div>
  );
}
