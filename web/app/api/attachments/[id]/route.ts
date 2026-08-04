import { NextResponse } from 'next/server';
import { supabaseFetch } from '@/lib/supabase-rest';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = await supabaseFetch(`/rest/v1/note_attachments?id=eq.${encodeURIComponent(id)}&select=storage_path`);
    if (!found.ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const rows = await found.json(); if (!rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await supabaseFetch(`/storage/v1/object/note-attachments/${rows[0].storage_path}`, { method: 'DELETE' });
    await supabaseFetch(`/rest/v1/note_attachments?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'attachment_unavailable' }, { status: 503 }); }
}
