import fs from 'fs';

let content = fs.readFileSync('app/api/vendors/route.ts', 'utf8');

content = content.replace(/\(v: any\)/g, '(v: { id: string })');
content = content.replace(/\(p: any\) => \(p\.categories as Record<string, any>\)\?\.slug/g, '(p: { categories: unknown; vendor_id: string }) => (p.categories as { slug: string } | null)?.slug');
content = content.replace(/\(p: any\) => p\.vendor_id/g, '(p: { vendor_id: string }) => p.vendor_id');

fs.writeFileSync('app/api/vendors/route.ts', content);
