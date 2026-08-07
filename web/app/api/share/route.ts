import { NextResponse } from 'next/server';
import { supabaseFetch } from '@/lib/supabase-rest';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { kind?: string; id?: string };
    if (!body.kind || !body.id || !['project', 'task', 'entry'].includes(body.kind)) return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
    const res = await supabaseFetch('/rest/v1/rpc/create_note_share', { method: 'POST', body: JSON.stringify({ p_kind: body.kind, p_target_id: body.id }) });
    if (!res.ok) return NextResponse.json({ error: 'share_failed' }, { status: 500 });
    const row = await res.json();
    return NextResponse.json(row);
  } catch { return NextResponse.json({ error: 'share_unavailable' }, { status: 503 }); }
}
