import { NextResponse } from 'next/server';
import { supabaseFetch } from '@/lib/supabase-rest';

type Params = { params: Promise<{ shareId: string }> };

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { shareId } = await params;
    const res = await supabaseFetch('/rest/v1/rpc/revoke_note_share', {
      method: 'POST',
      body: JSON.stringify({ p_share_id: shareId }),
    });
    if (!res.ok) return NextResponse.json({ error: 'revoke_failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'share_unavailable' }, { status: 503 });
  }
}

export async function GET(_: Request, { params }: Params) {
  try {
    const { shareId } = await params;
    if (!/^[0-9a-f-]{20,}$/i.test(shareId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const res = await supabaseFetch('/rest/v1/rpc/get_shared_note', {
      method: 'POST',
      body: JSON.stringify({ p_token: shareId }),
    });
    if (!res.ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const note = await res.json();
    if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const attachments = await Promise.all((note.attachments ?? []).map(async (attachment: { storagePath: string }) => {
      const signed = await supabaseFetch(`/storage/v1/object/sign/note-attachments/${attachment.storagePath}`, {
        method: 'POST',
        body: JSON.stringify({ expiresIn: 300 }),
      });
      if (!signed.ok) return { ...attachment, url: '' };
      const data = await signed.json() as { signedURL?: string };
      return {
        ...attachment,
        url: data.signedURL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1${data.signedURL}` : '',
      };
    }));
    return NextResponse.json({ ...note, attachments }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
