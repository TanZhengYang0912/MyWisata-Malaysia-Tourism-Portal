import { cn } from '@/components/utils';

export { cn };

// Utility: generate URL-safe slug from a name string
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // remove non-word chars
    .replace(/[\s_]+/g, '-')    // spaces/underscores → hyphens
    .replace(/-+/g, '-')        // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');   // trim leading/trailing hyphens
}
