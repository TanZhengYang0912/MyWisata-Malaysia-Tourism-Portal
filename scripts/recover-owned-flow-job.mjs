#!/usr/bin/env node
/** Explicit single-job recovery. Never scans recipients or sends SMTP directly. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
try { process.loadEnvFile('.env.local'); } catch { /* Server environment may be injected. */ }
const args=process.argv.slice(2);
const value=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
try {
  const allowed=new Set(['--scope','--id','--cycle','--stage','--window','--reason-file']);
  for(let i=0;i<args.length;i+=2) if(!allowed.has(args[i]) || !args[i+1]) throw new Error('invalid_arguments');
  const id=value('--id'),scope=value('--scope');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id??'') || !['withdrawal','guest-link'].includes(scope)) throw new Error('invalid_arguments');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key || new URL(url).hostname!==`${process.env.OWNED_FLOW_RECOVERY_PROJECT_REF}.supabase.co`) throw new Error('explicit_project_confirmation_required');
  if(process.env.OWNED_FLOW_RECOVERY_WRITE!=='1') throw new Error('explicit_recovery_write_required');
  const reason=readFileSync(value('--reason-file')??'', 'utf8').trim();
  if(reason.length<5 || reason.length>300) throw new Error('recovery_reason_required');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  let result;
  if(scope==='withdrawal') {
    const cycle=Number(value('--cycle')),stage=value('--stage');
    if(!Number.isInteger(cycle)||cycle<1||!['pending','pending_second_approval','overdue'].includes(stage)) throw new Error('invalid_arguments');
    result=await db.rpc('requeue_withdrawal_approver_job',{p_id:id,p_cycle:cycle,p_stage:stage,p_reason:reason});
  } else {
    // Replay the original logged hour. Reusing its key also covers ambiguous commits.
    const window=Number(value('--window'));
    if(value('--window')===null||!Number.isInteger(window)||window<0||window>Math.floor(Date.now()/3600000)) throw new Error('invalid_arguments');
    const hash=createHash('sha256').update(`${id}:${window}`).digest('hex');
    result=await db.rpc('queue_guest_order_access',{p_order_id:id,p_event_key:`guest-recovery:${hash}`,p_reason:'Your requested private order link.'});
  }
  if(result.error) throw new Error('recovery_rejected');
  console.log(JSON.stringify({scope,accepted:result.data!==false}));
} catch(error) {
  const safe=new Set(['invalid_arguments','explicit_project_confirmation_required','explicit_recovery_write_required','recovery_reason_required','recovery_rejected']);
  console.error(safe.has(error?.message)?error.message:'recovery_unavailable');process.exitCode=1;
}
