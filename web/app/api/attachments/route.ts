import { NextResponse } from 'next/server';
import { attachmentPath, validateImage } from '@/lib/attachments';
import { supabaseFetch } from '@/lib/supabase-rest';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file'); const kind = String(form.get('kind') || ''); const targetId = String(form.get('targetId') || '');
    if (!(file instanceof File) || !['project', 'task', 'entry'].includes(kind) || !targetId) return NextResponse.json({ error: 'invalid_attachment' }, { status: 400 });
    const valid = validateImage(file); if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    const target = { kind: kind as 'project' | 'task' | 'entry', id: targetId };
    const path = attachmentPath(target, 'server', file.name);
    const bytes = await file.arrayBuffer();
    const upload = await supabaseFetch(`/storage/v1/object/note-attachments/${path}`, { method: 'POST', headers: { 'content-type': file.type, 'x-upsert': 'false' }, body: bytes });
    if (!upload.ok) return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
    const row = { storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, ...(kind === 'project' ? { project_id: targetId } : kind === 'task' ? { task_id: targetId } : { time_entry_id: targetId }) };
    const inserted = await supabaseFetch('/rest/v1/note_attachments', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!inserted.ok) return NextResponse.json({ error: 'metadata_failed' }, { status: 500 });
    return NextResponse.json((await inserted.json())[0]);
  } catch { return NextResponse.json({ error: 'attachment_unavailable' }, { status: 503 }); }
}
