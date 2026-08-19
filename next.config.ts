import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function supabaseStorageRemotePattern() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return [];

  const hostname = new URL(supabaseUrl).hostname;
  return [
    {
      protocol: 'https' as const,
      hostname,
      pathname: '/storage/v1/object/public/place-images/**',
    },
    {
      protocol: 'https' as const,
      hostname,
      pathname: '/storage/v1/object/public/vendor-images/**',
    },
    {
      protocol: 'https' as const,
      hostname,
      pathname: '/storage/v1/object/public/vendor-products/**',
    },
    {
      protocol: 'https' as const,
      hostname,
      pathname: '/storage/v1/object/public/product-images/**',
    },
  ];
}

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: ['pdfkit'],
  images: {
    remotePatterns: supabaseStorageRemotePattern(),
  },
};

export default nextConfig;
