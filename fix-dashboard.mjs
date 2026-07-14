import fs from 'fs';

let content = fs.readFileSync('lib/vendor-dashboard.ts', 'utf8');

content = content.replace(/\(assignment: any\) => \{/g, '(assignment: { outlets: { vendor_id: string } | { vendor_id: string }[]; outlet_id?: string }) => {');
content = content.replace(/\(assignment: any\) => assignment\.outlet_id/g, '(assignment: { outlet_id: string }) => assignment.outlet_id');
content = content.replace(/\(outlet: any\) => scopedOutletIds\?\.includes\(outlet\.id\)/g, '(outlet: { id: string }) => scopedOutletIds?.includes(outlet.id)');
content = content.replace(/\(item: any\) => item\.order_id/g, '(item: { order_id: string }) => item.order_id');
content = content.replace(/as any\[\]/g, 'as Array<{ product_variants: unknown; quantity: number | string | null; reserved: number | string | null; low_stock_threshold: number | string | null; variant_id: string }>');

fs.writeFileSync('lib/vendor-dashboard.ts', content);
