import type { NoteAttachment } from '@/lib/types';

export default function SharedNoteView({ note }: { note: { kind: string; title: string; notes?: string; startedAt?: string; endedAt?: string; attachments?: NoteAttachment[] } }) {
  return <main className="shared-note"><p className="cap">公開工作筆記 · {note.kind}</p><h1>{note.title || '工作筆記'}</h1>{note.startedAt && <p className="num mute">{new Date(note.startedAt).toLocaleString()} {note.endedAt ? `— ${new Date(note.endedAt).toLocaleString()}` : ''}</p>}<div className="shared-notes">{note.notes || '沒有文字筆記'}</div>{note.attachments?.length ? <div className="attachment-grid">{note.attachments.map((a) => <figure className="attachment" key={a.id}><img src={a.url} alt={a.fileName} /><figcaption>{a.fileName}</figcaption></figure>)}</div> : null}</main>;
}
