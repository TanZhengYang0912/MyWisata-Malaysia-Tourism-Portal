import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.endsWith('@demo.local')) {
      return NextResponse.json({ error: 'Only seeded demo accounts can use this sign-in flow' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: 'demo123456',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 401 });
    if (!data.session) return NextResponse.json({ error: 'Demo sign-in did not create a session' }, { status: 500 });

    return NextResponse.json({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to sign in' },
      { status: 500 },
    );
  }
}
