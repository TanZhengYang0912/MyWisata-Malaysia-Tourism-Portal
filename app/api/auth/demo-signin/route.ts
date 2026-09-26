import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDemoToolRuntimeEnabled } from '@/lib/demo/runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isDemoToolRuntimeEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = await request.json() as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.endsWith('@demo.local')) {
      return NextResponse.json({ error: 'Only seeded demo accounts can use this sign-in flow' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: 'demo123456',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 401 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to sign in' },
      { status: 500 },
    );
  }
}
