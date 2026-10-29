import type { NextConfig } from "next";

function supabaseStorageRemotePattern() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hostname = supabaseUrl ? new URL(supabaseUrl).hostname : '*.supabase.co';
  
  return [
    {
      protocol: 'https' as const,
      hostname,
      pathname: '/storage/v1/object/public/**',
    },
    {
      protocol: 'https' as const,
      hostname: '*.supabase.co', // Fallback wildcard just in case
      pathname: '/storage/v1/object/public/**',
    }
  ];
}

const isDev = process.env.NODE_ENV === 'development';

/**
 * Content-Security-Policy without nonces (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
 * "Without Nonces"): keeps pages static/cacheable. Inline scripts stay allowed because Next.js bootstraps with them;
 * the policy still blocks scripts and data connections to any origin not listed, plugins, <base> hijacking, and
 * framing by other sites. Every external origin below is one the browser really loads:
 * - Supabase: REST/auth/storage over https, realtime over wss
 * - MapLibre: tiles.openfreemap.org (style, tiles, glyphs), workers from blob:
 * - RainViewer radar: api.rainviewer.com (metadata), tilecache.rainviewer.com (tiles)
 * - Nominatim: place search from the customer search page
 * - Google Maps JS + Places: recommendation place picker
 * Images may come from any https host (vendor/place images are stored as arbitrary URLs); images cannot run script.
 * ponytail: 'unsafe-inline' scripts; move to nonces (proxy.ts, dynamic rendering) if a stricter policy is required.
 */
function contentSecurityPolicy() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
  const supabaseOrigins = supabase ? [supabase.origin, `wss://${supabase.host}`] : ['https://*.supabase.co', 'wss://*.supabase.co'];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), 'https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://challenges.cloudflare.com'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'connect-src': [
      "'self'",
      ...supabaseOrigins,
      'https://tiles.openfreemap.org',
      'https://api.rainviewer.com',
      'https://tilecache.rainviewer.com',
      'https://nominatim.openstreetmap.org',
      'https://maps.googleapis.com',
      'https://places.googleapis.com',
      ...(isDev ? ['ws:'] : []),
    ],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'self'", 'https://challenges.cloudflare.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  // Upgrading would break plain-http localhost in development.
  if (!isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  // Legacy clickjacking guard for browsers that ignore frame-ancestors.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera: QR scanner and profile photo; geolocation: "use my location" in trips and search.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()' },
  // Ignored by browsers over plain http, so harmless on localhost.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/**
 * The one public origin search engines should index (e.g. https://mylawatan.my). The www host
 * redirects to it and every page names it as canonical, so the site is not indexed twice.
 * Null on localhost or when unset, so development is unaffected.
 */
function publicSiteUrl() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '');
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? null : url;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  // Dev only: lets a phone on the same network (iPhone hotspot or home Wi-Fi) load the dev server by LAN IP.
  allowedDevOrigins: ['172.20.10.*', '192.168.*.*'],
  async headers() {
    const site = publicSiteUrl();
    return [
      { source: '/(.*)', headers: securityHeaders },
      // Canonical as an HTTP Link header (honoured by Google) instead of a <link> in every page's metadata.
      // The root needs its own rule: an empty `:path*` is left uninterpolated in header values.
      ...(site ? [
        { source: '/', headers: [{ key: 'Link', value: `<${site.origin}/>; rel="canonical"` }] },
        { source: '/:path+', headers: [{ key: 'Link', value: `<${site.origin}/:path+>; rel="canonical"` }] },
      ] : []),
    ];
  },
  async redirects() {
    const site = publicSiteUrl();
    if (!site || site.hostname.startsWith('www.')) return [];
    return [{
      source: '/:path*',
      has: [{ type: 'host' as const, value: `www.${site.hostname}`.replace(/\./g, '\\.') }],
      destination: `${site.origin}/:path*`,
      permanent: true,
    }];
  },
  serverExternalPackages: ['pdfkit', 'tesseract.js', 'tesseract.js-core'],
  outputFileTracingIncludes: {
    '/api/**': ['./lib/pdf/fonts/*'],
    '/api/cron/process-kyc-prescreening': [
      './lib/kyc/runtime/*.cjs', './node_modules/tesseract.js/src/**/*', './node_modules/tesseract.js/package.json',
      './node_modules/tesseract.js-core/**/*',
      './node_modules/@tesseract.js-data/{eng,msa,chi_sim}/4.0.0_best_int/*.traineddata.gz',
      './node_modules/@tesseract.js-data/{eng,msa,chi_sim}/package.json',
      // forked CJS is not traversed by webpack: trace the pinned Node dependencies too.
      './node_modules/{bmp-js,idb-keyval,is-url,node-fetch,whatwg-url,tr46,webidl-conversions,regenerator-runtime,wasm-feature-detect,zlibjs}/**/*',
    ],
  },
  experimental: {
    cpus: 2,
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'recharts',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 90],
    remotePatterns: supabaseStorageRemotePattern(),
    localPatterns: [
      { pathname: '/branding/mylawatan-logo-transparent.png', search: '?v=2' },
      { pathname: '/branding/mylawatan-logo-transparent.png', search: '?v=3' },
      { pathname: '**', search: '' },
    ],
    minimumCacheTTL: 2592000,
  },
};

export default nextConfig;
