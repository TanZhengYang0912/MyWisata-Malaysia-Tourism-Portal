import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

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

const nextConfig: NextConfig = {
  compress: true,
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: ['pdfkit'],
  experimental: {
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
    remotePatterns: supabaseStorageRemotePattern(),
    minimumCacheTTL: 2592000,
  },
};

export default nextConfig;
