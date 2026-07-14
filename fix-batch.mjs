import fs from 'fs';

let content = fs.readFileSync('app/api/vendors/[vendorId]/batch/route.ts', 'utf8');

content = `import { type SupabaseClient } from '@supabase/supabase-js';\n` + content;

content = content.replace(/function relation\(value: any\)/g, 'function relation<T>(value: T | T[] | null | undefined): T | null | undefined');
content = content.replace(/function voucherStatus\(voucher: any\) {/, `function voucherStatus(voucher: Record<string, unknown>) {\n  const v = voucher as { valid_from?: string; valid_until?: string; is_active?: boolean; max_uses?: number; uses_count?: number };`);
content = content.replace(/const validFrom = voucher\.valid_from \? new Date\(voucher\.valid_from\)/g, 'const validFrom = v.valid_from ? new Date(v.valid_from)');
content = content.replace(/const validUntil = voucher\.valid_until \? new Date\(voucher\.valid_until\)/g, 'const validUntil = v.valid_until ? new Date(v.valid_until)');
content = content.replace(/if \(!voucher\.is_active\)/g, 'if (!v.is_active)');
content = content.replace(/if \(voucher\.max_uses && voucher\.uses_count >= voucher\.max_uses\)/g, 'if (v.max_uses && v.uses_count !== undefined && v.uses_count >= v.max_uses)');


content = content.replace(/async function findFilteredIds\(db: any,/g, 'async function findFilteredIds(db: SupabaseClient,');

// Replace standard (item: any) => item.id
content = content.replace(/\(item: any\) => item\.id/g, '(item: { id: string }) => item.id');
content = content.replace(/\(item: any\) => item\.order_item_id/g, '(item: { order_item_id: string }) => item.order_item_id');

// Replace specific filter items
content = content.replace(/\.filter\(\(item: any\) => !filters\.status/g, '.filter((item: { id: string; status?: string; [key: string]: unknown }) => !filters.status');

content = content.replace(/\.filter\(\(item: any\) => !searchTerm \|\| \[item\.id, item\.products\?\.name/g, '.filter((item: { id: string; products: { name: string } | null; outlets: { name: string; city: string } | null }) => !searchTerm || [item.id, item.products?.name');

content = content.replace(/return \(data \|\| \[\]\)\.filter\(\(item: any\) => \{\n\s+const order = relation\(item\.orders\);/g, `return (data || []).filter((item: { id: string; order_id: string; product_name: string; variant_name: string; fulfil_status: string; created_at: string; outlet_id: string; orders: unknown }) => {\n      const order = relation(item.orders) as { status: string; users: unknown } | null;`);

content = content.replace(/const customer = relation\(order\?\.users\);/g, 'const customer = relation(order?.users) as { full_name: string; email: string } | null;');

content = content.replace(/return \(data \|\| \[\]\)\.filter\(\(item: any\) => \{\n\s+const customer = relation\(item\.users\);/g, `return (data || []).filter((item: { id: string; users: unknown; order_items: unknown; booking_slots: unknown }) => {\n    const customer = relation(item.users) as { full_name: string; email: string } | null;`);

content = content.replace(/const orderItem = relation\(item\.order_items\);/g, 'const orderItem = relation(item.order_items) as { product_name: string } | null;');
content = content.replace(/const slot = relation\(item\.booking_slots\);/g, 'const slot = relation(item.booking_slots) as { starts_at: string } | null;');

content = content.replace(/const valid = \(items \|\| \[\]\)\.filter\(\(item: any\) => \{/g, 'const valid = (items || []).filter((item: { id: string; orders: unknown; fulfil_status: string }) => {');
content = content.replace(/const orderStatus = relation\(item\.orders\)\?\.status;/g, 'const orderStatus = (relation(item.orders) as { status: string } | null)?.status;');

content = content.replace(/const valid = \(bookings \|\| \[\]\)\.filter\(\(item: any\) =>/g, 'const valid = (bookings || []).filter((item: { id: string; status: string }) =>');
content = content.replace(/const valid = \(slots \|\| \[\]\)\.filter\(\(item: any\) =>/g, 'const valid = (slots || []).filter((item: { id: string; status: string; booked: number }) =>');


fs.writeFileSync('app/api/vendors/[vendorId]/batch/route.ts', content);
