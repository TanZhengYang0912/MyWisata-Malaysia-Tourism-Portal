import CustomerNavbar from '@/components/layout/customer-navbar';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerNavbar />
      {/* top padding for fixed header; side padding on desktop for sidebar */}
      <main className="pt-14 pb-20 md:pl-52 md:pb-6">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
