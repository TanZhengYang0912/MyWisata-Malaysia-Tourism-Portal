import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Malaysia Tourism Portal',
  description: 'Discover vendors, book activities, and earn rewards across Malaysia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
          <div className="fixed top-2 right-2 z-50 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded shadow">
            DEMO
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
