import VendorSidebar from '@/components/layout/vendor-sidebar';
import VendorAccessGate from '@/components/layout/vendor-access-gate';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50">
      <VendorSidebar />
      <main className="ml-56">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <VendorAccessGate>{children}</VendorAccessGate>
        </div>
      </main>
    </div>
  );
}
