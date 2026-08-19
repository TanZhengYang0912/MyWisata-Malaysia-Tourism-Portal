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
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: ['pdfkit'],
  images: {
    remotePatterns: supabaseStorageRemotePattern(),
  },
};

export default nextConfig;
