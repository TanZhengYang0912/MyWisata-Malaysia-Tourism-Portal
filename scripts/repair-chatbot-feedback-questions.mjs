#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  for (const filename of ['.env.local', '.env']) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

function refuse(reason) {
  console.error(reason);
  process.exit(1);
}

loadEnv();

if (process.env.CHATBOT_FEEDBACK_REPAIR !== '1') {
  refuse('Refusing feedback cleanup without CHATBOT_FEEDBACK_REPAIR=1.');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const expectedProjectRef = process.env.CHATBOT_FEEDBACK_REPAIR_PROJECT_REF;
if (!url || !serviceKey || !expectedProjectRef) {
  refuse('Missing Supabase URL, service role key, or expected project ref.');
}

let hostname;
try {
  hostname = new URL(url).hostname;
} catch {
  refuse('Invalid Supabase URL.');
}
if (hostname !== `${expectedProjectRef}.supabase.co`) {
  refuse('Supabase URL does not match the expected project ref.');
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let afterId = null;
let processed = 0;
while (true) {
  const { data, error } = await supabase.rpc('repair_chatbot_feedback_question_source', {
    p_after_id: afterId,
    p_limit: 100,
  });
  if (error) refuse('Feedback cleanup failed. Check the migration and Supabase connection.');

  const batch = Array.isArray(data) ? data[0] : null;
  if (!batch || !batch.next_cursor) break;
  const batchCount = Number(batch.processed_count);
  if (!Number.isInteger(batchCount) || batchCount < 0 || batchCount > 100) {
    refuse('Feedback cleanup returned an invalid batch result.');
  }
  afterId = batch.next_cursor;
  processed += batchCount;
}

console.log(`Repaired ${processed} feedback rows in batches of 100. No question text was printed.`);
