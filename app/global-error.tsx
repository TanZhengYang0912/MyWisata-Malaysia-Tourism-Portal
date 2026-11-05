"use client";

import { useEffect } from 'react';

// Last-resort boundary: renders only when the root layout itself throws, which
// means providers (i18n, theme) are NOT available. It replaces the root layout,
// so it must render its own <html>/<body>, and it uses inline styles + English
// only because no CSS or translation runtime can be relied upon here.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Root layout error boundary caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', background: '#ffffff', color: '#111827' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280', maxWidth: '28rem' }}>
            An unexpected error occurred while loading MYLawatan. You can try again, or return to the homepage.
          </p>
          <div style={{ marginTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={reset}
              style={{ borderRadius: '9999px', border: 'none', background: '#0f766e', color: '#ffffff', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
            {/* Plain anchor on purpose: a full-page reload is more robust than
                client-side routing when the root layout has crashed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{ borderRadius: '9999px', border: '1px solid #d1d5db', color: '#111827', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none' }}
            >
              Go to homepage
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
              Error reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
