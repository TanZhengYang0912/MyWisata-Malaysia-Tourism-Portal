import fs from 'fs';

let content = fs.readFileSync('app/api/vendors/[vendorId]/orders/route.ts', 'utf8');

content = content.replace(/const authDb = await createClient\(\) as any;\n\s*/, '');
content = content.replace(/\(item: any\) => String\(item\.product_name/g, '(item: { order_id: string; product_name: string | null; variant_name: string | null }) => String(item.product_name');
content = content.replace(/\(item: any\) => item\.order_id/g, '(item: { order_id: string }) => item.order_id');
content = content.replace(/\(item: any\) => item\.id/g, '(item: { id: string }) => item.id');
content = content.replace(/\(order: any\) => \{/g, '(order: { order_items: Array<{ vendor_id: string; fulfil_status: string; line_total: number | string | null; outlets: { name: string } | null; quantity: number; product_name: string }>; [key: string]: unknown }) => {');
content = content.replace(/\(i: any\) => i\.vendor_id === vendorId/g, '(i: { vendor_id: string }) => i.vendor_id === vendorId');
content = content.replace(/\(item: any\) => sum \+ Number\(item\.line_total/g, '(item: { line_total: number | string | null }) => sum + Number(item.line_total');
content = content.replace(/\(item: any\) => item\.outlets\?\.name \? outletShortName\(item\.outlets\.name\)/g, '(item: { outlets: { name: string } | null }) => item.outlets?.name ? outletShortName(item.outlets.name)');
content = content.replace(/\(item: any\) => item\.fulfil_status/g, '(item: { fulfil_status: string }) => item.fulfil_status');
content = content.replace(/\(i: any\) => `\$\{i\.quantity\}/g, '(i: { quantity: number; product_name: string }) => `${i.quantity}');

fs.writeFileSync('app/api/vendors/[vendorId]/orders/route.ts', content);
