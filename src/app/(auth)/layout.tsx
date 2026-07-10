export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">🇲🇾 Tourism Portal</h1>
          <p className="text-gray-500 mt-1 text-sm">Discover Malaysia&apos;s hidden gems</p>
        </div>
        {children}
      </div>
    </div>
  );
}
