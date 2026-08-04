'use client';

import { useState } from 'react';
import { shareUrl } from '@/lib/attachments';
import type { NoteShare, NoteTarget } from '@/lib/types';

export default function ShareControls({ target, share, onChanged }: { target: NoteTarget; share: NoteShare | null; onChanged?: () => void }) {
  const [message, setMessage] = useState('');
  const create = async () => {
    const res = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(target) });
    if (!res.ok) return setMessage('建立分享連結失敗');
    const next = await res.json() as NoteShare;
    await navigator.clipboard.writeText(shareUrl(next.token)); setMessage('連結已複製'); onChanged?.();
  };
  const revoke = async () => {
    if (!share) return;
    const res = await fetch(`/api/share/${encodeURIComponent(share.id)}`, { method: 'DELETE' });
    if (!res.ok) setMessage('撤銷分享失敗'); else { setMessage('分享已撤銷'); onChanged?.(); }
  };
  return <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn-sm" onClick={create}>建立／複製分享連結</button>{share && <button type="button" className="btn-sm" onClick={revoke}>撤銷分享</button>}{message && <span className="hint">{message}</span>}</div>;
}
