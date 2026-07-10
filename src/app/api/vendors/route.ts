// P2 — Member 2 owns GET /api/vendors + POST /api/vendors

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);
  const city     = url.searchParams.get('city');
  const category = url.searchParams.get('category');
  const q        = url.searchParams.get('q');

  // TODO P2/B2: Add full filter logic + join with categories + distance sort
  let query = supabase
    .from('vendors')
    .select('*, outlets(id, name, city, lat, lng)')
    .eq('status', 'approved');

  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query.limit(50);
  if (error) return NextResponse.json({ data: null, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, { status: 401 });

  const body = await request.json();
  // TODO P2/B1: validate with Zod, insert vendor with status='pending'
  const { data, error } = await supabase.from('vendors').insert({
    owner_id: user.id,
    name:     body.name,
    slug:     body.slug,
    description: body.description,
    status: 'pending',
  }).select().single();

  if (error) return NextResponse.json({ data: null, error: { code: 'DB_ERROR', message: error.message } }, { status: 400 });
  return NextResponse.json({ data, error: null }, { status: 201 });
}
