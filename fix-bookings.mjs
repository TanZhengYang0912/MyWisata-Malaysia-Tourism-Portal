import fs from 'fs';

let content = fs.readFileSync('app/api/vendors/[vendorId]/bookings/route.ts', 'utf8');

content = content.replace(/import \{ createClient \} from '@\/lib\/supabase\/server';\n/, '');
content = content.replace(/import \{ createServiceClient \} from '@\/lib\/supabase\/service';\n/, '');
content = content.replace(/\(slot: any\)/g, '(slot: { id: string })');
content = content.replace(/\(item: any\) => item\.id/g, '(item: { id: string }) => item.id');
content = content.replace(/\(result: Record<string, number>, item: any\)/g, '(result: Record<string, number>, item: { status: string })');
content = content.replace(/\(booking: any\)/g, '(booking: { users: unknown; order_items: unknown; booking_slots: unknown; [key: string]: unknown })');

fs.writeFileSync('app/api/vendors/[vendorId]/bookings/route.ts', content);
