import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDemoToolRuntimeEnabled } from '@/lib/demo/runtime';
import { DEMO_SIGN_IN_CAPTCHA_FAILED_CODE, DEMO_SIGN_IN_FAILED_CODE } from '@/lib/auth/demo-signin-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isDemoToolRuntimeEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = await request.json() as { email?: string; captchaToken?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.endsWith('@demo.local')) {
      return NextResponse.json({ error: 'Only seeded demo accounts can use this sign-in flow' }, { status: 400 });
    }

    if (typeof body.captchaToken !== 'string' || !body.captchaToken.trim() || body.captchaToken.length > 2048) {
      return NextResponse.json({ error: 'Human verification required' }, { status: 403 });
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: 'demo123456',
      options: { captchaToken: body.captchaToken },
    });
    if (error?.code === DEMO_SIGN_IN_CAPTCHA_FAILED_CODE) {
      return NextResponse.json({ code: DEMO_SIGN_IN_CAPTCHA_FAILED_CODE }, { status: 401 });
    }
    if (error) return NextResponse.json({ code: DEMO_SIGN_IN_FAILED_CODE }, { status: 401 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { code: DEMO_SIGN_IN_FAILED_CODE },
      { status: 500 },
    );
  }
}
