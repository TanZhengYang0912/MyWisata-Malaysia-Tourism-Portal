import VendorSidebar from '@/components/layout/vendor-sidebar';
import { getOutlets } from "@/backend/domains/catalogue";

export async function scopedOutletIds(activeVendorId?: string, activeOutletIds?: string[]): Promise<string[]> {
  if (activeOutletIds?.length) return activeOutletIds;
  if (activeVendorId) {
    const outlets = await getOutlets();
    return outlets.filter((o) => o.vendorId === activeVendorId).map((o) => o.id);
  }
  return [];
}

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <VendorSidebar />
      <main className="ml-56">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

