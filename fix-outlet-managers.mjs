import fs from 'fs';

let content = fs.readFileSync('app/api/vendors/[vendorId]/outlet-managers/route.ts', 'utf8');

content = content.replace(/\(outlet: any\)/g, '(outlet: { id: string; name: string; city: string; state: string; [key: string]: unknown })');
content = content.replace(/const normalizeUser = \(value: any\) =>/g, 'const normalizeUser = (value: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null | undefined) =>');
content = content.replace(/\(assignment: any\)/g, '(assignment: { outlet_id: string; user_id: string; users: { id: string; full_name: string; email: string } | null })');
content = content.replace(/\(row: any\)/g, '(row: { users: { id: string; full_name: string; email: string } | null })');

fs.writeFileSync('app/api/vendors/[vendorId]/outlet-managers/route.ts', content);
