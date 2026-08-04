import { NextResponse } from 'next/server';
import { supabaseFetch } from '@/lib/supabase-rest';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!/^[0-9a-f-]{20,}$/i.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const res = await supabaseFetch('/rest/v1/rpc/get_shared_note', { method: 'POST', body: JSON.stringify({ p_token: token }) });
    if (!res.ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const note = await res.json();
    if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(note, { headers: { 'cache-control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'not_found' }, { status: 404 }); }
}
