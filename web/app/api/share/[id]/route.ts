import { NextResponse } from 'next/server';
import { supabaseFetch } from '@/lib/supabase-rest';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await supabaseFetch('/rest/v1/rpc/revoke_note_share', { method: 'POST', body: JSON.stringify({ p_share_id: id }) });
    if (!res.ok) return NextResponse.json({ error: 'revoke_failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'share_unavailable' }, { status: 503 }); }
}
