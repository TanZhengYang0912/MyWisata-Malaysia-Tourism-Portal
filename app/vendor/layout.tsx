import VendorSidebar from '@/components/layout/vendor-sidebar';

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
