'use client';

import { useEffect, useRef, useState } from 'react';
import { validateImage } from '@/lib/attachments';
import type { NoteAttachment, NoteTarget } from '@/lib/types';
import { listLocalAttachments, removeLocalAttachment, saveLocalAttachment, type LocalAttachment } from '@/lib/localAttachments';

export default function AttachmentPicker({ target, attachments, onChanged }: {
  target: NoteTarget; attachments: NoteAttachment[]; onChanged?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [localFiles, setLocalFiles] = useState<LocalAttachment[]>([]);
  useEffect(() => { listLocalAttachments(target).then(setLocalFiles); }, [target]);
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(''); setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const valid = validateImage(file);
        if (!valid.ok) { setError(valid.error); continue; }
        const saved = await saveLocalAttachment(target, file);
        setLocalFiles((current) => [...current, saved]);
      }
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : '圖片上傳失敗'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const remove = async (id: string) => {
    await removeLocalAttachment(target, id); setLocalFiles((current) => current.filter((item) => item.id !== id)); onChanged?.();
  };
  return <div className="attachments">
    <div className="row"><strong>圖片附件</strong><div className="grow" />
      <input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => upload(e.target.files)} />
      <button type="button" className="btn-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? '上傳中…' : '選取圖片'}</button>
    </div>
    {error && <div className="hint" role="alert" style={{ color: 'var(--danger)' }}>{error}</div>}
    {(attachments.length > 0 || localFiles.length > 0) && <div className="attachment-grid">{[...attachments, ...localFiles.map((a) => ({ id: a.id, fileName: a.fileName, url: URL.createObjectURL(a.blob) }))].map((a) => <div className="attachment" key={a.id}>
      {a.url ? <img src={a.url} alt={a.fileName} /> : <span className="hint">圖片</span>}
      <span className="ellipsis">{a.fileName}</span><button type="button" className="btn-ghost btn-sm" onClick={() => remove(a.id)}>刪除</button>
    </div>)}</div>}
  </div>;
}
