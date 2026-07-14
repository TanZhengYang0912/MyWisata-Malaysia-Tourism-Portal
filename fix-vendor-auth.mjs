import fs from 'fs';

let content = fs.readFileSync('lib/vendor-authorization.ts', 'utf8');

content = `import { type SupabaseClient } from '@supabase/supabase-js';\n` + content;
content = content.replace(/authDb: any;/g, 'authDb: SupabaseClient;');
content = content.replace(/serviceDb: any;/g, 'serviceDb: SupabaseClient;');
content = content.replace(/const authDb = await createClient\(\) as any;/g, 'const authDb = (await createClient()) as SupabaseClient;');
content = content.replace(/serviceDb: createServiceClient\(\) as any,/g, 'serviceDb: createServiceClient() as SupabaseClient,');
content = content.replace(/\(assignment: any\) =>/g, '(assignment: { outlet_id: string; outlets: unknown; [key: string]: unknown }) =>');

fs.writeFileSync('lib/vendor-authorization.ts', content);
