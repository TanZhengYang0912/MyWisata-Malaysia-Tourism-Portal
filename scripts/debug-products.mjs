// Reproduce the discovery page query to see why it returns empty
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local','.env']) {
  const p = path.resolve(process.cwd(), f);
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p,'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
    }
    break;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('▶ Test 1: ANON (no session)');
{
  const anon = createClient(url, anonKey);
  const { data, error, count } = await anon
    .from('products')
    .select('id, name', { count: 'exact' })
    .eq('status', 'active');
  console.log(`  count=${count}, rows=${data?.length}, error=${error?.message ?? 'none'}`);
}

console.log('\n▶ Test 2: AUTHENTICATED as customer1');
{
  const client = createClient(url, anonKey);
  const { error: signInErr } = await client.auth.signInWithPassword({
    email: 'customer1@demo.local', password: 'demo123456',
  });
  if (signInErr) { console.log('  sign-in failed:', signInErr.message); }
  else {
    const { data, error, count } = await client
      .from('products')
      .select('id, name', { count: 'exact' })
      .eq('status', 'active');
    console.log(`  count=${count}, rows=${data?.length}, error=${error?.message ?? 'none'}`);
  }
}

console.log('\n▶ Test 3: SERVICE ROLE sees products');
{
  const svc = createClient(url, serviceKey);
  const { data, error } = await svc.from('products').select('id,name,status').eq('status','active');
  console.log(`  rows=${data?.length}, error=${error?.message ?? 'none'}`);
}

console.log('\n▶ Test 4: Same nested query the discovery page uses (anon)');
{
  const anon = createClient(url, anonKey);
  const { data, error } = await anon
    .from('products')
    .select(`
      id, name,
      outlets ( id, name, vendors ( id, name, slug ) ),
      categories ( name )
    `)
    .eq('status', 'active')
    .limit(3);
  console.log(`  rows=${data?.length}, error=${error?.message ?? 'none'}`);
  if (data?.length) console.log('  first row:', JSON.stringify(data[0]).slice(0,300));
}

console.log('\n▶ Test 5: Categories readable by anon?');
{
  const anon = createClient(url, anonKey);
  const { data, error } = await anon.from('categories').select('*').limit(3);
  console.log(`  rows=${data?.length}, error=${error?.message ?? 'none'}`);
}

console.log('\n▶ Test 6: Vendors readable by anon?');
{
  const anon = createClient(url, anonKey);
  const { data, error } = await anon.from('vendors').select('id,name,status').limit(3);
  console.log(`  rows=${data?.length}, error=${error?.message ?? 'none'}`);
}
