'use client';

import { useRef, useState } from 'react';
import { validateImage } from '@/lib/attachments';
import type { NoteAttachment, NoteTarget } from '@/lib/types';

export default function AttachmentPicker({ target, attachments, onChanged }: {
  target: NoteTarget; attachments: NoteAttachment[]; onChanged?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(''); setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const valid = validateImage(file);
        if (!valid.ok) { setError(valid.error); continue; }
        const body = new FormData(); body.append('file', file); body.append('kind', target.kind); body.append('targetId', target.id);
        const res = await fetch('/api/attachments', { method: 'POST', body });
        if (!res.ok) throw new Error('圖片上傳失敗');
      }
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : '圖片上傳失敗'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const remove = async (id: string) => {
    const res = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) setError('圖片刪除失敗'); else onChanged?.();
  };
  return <div className="attachments">
    <div className="row"><strong>圖片附件</strong><div className="grow" />
      <input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => upload(e.target.files)} />
      <button type="button" className="btn-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? '上傳中…' : '選取圖片'}</button>
    </div>
    {error && <div className="hint" role="alert" style={{ color: 'var(--danger)' }}>{error}</div>}
    {attachments.length > 0 && <div className="attachment-grid">{attachments.map((a) => <div className="attachment" key={a.id}>
      {a.url ? <img src={a.url} alt={a.fileName} /> : <span className="hint">圖片</span>}
      <span className="ellipsis">{a.fileName}</span><button type="button" className="btn-ghost btn-sm" onClick={() => remove(a.id)}>刪除</button>
    </div>)}</div>}
  </div>;
}
