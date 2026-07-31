'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import AutoTextarea from '@/components/AutoTextarea';
import { fmtDate, fmtClock } from '@/lib/time';
import type { Project } from '@/lib/types';

/**
 * 專案目標／筆記。append 式：寫一則就記下當下時間，之後可以再修改。
 * 新的排在上面，因為通常最關心最近的決定。
 */
export default function ProjectNotes({ project }: { project: Project }) {
  const { act } = useStore();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const notes = [...(project.notes ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const append = async () => {
    if (!draft.trim()) return;
    await act('addProjectNote', { projectId: project.id, text: draft });
    setDraft('');
  };

  const save = async (noteId: string) => {
    await act('updateProjectNote', { projectId: project.id, noteId, text: editText });
    setEditingId(null);
  };

  return (
    <>
      <div className="card">
        <AutoTextarea
          value={draft}
          min={72}
          max={320}
          placeholder="這個專案要達成什麼？有什麼決定或轉折？Ctrl+Enter 送出"
          onChange={setDraft}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') append();
          }}
        />
        <div className="actions">
          <button className="btn-primary" onClick={append} disabled={!draft.trim()}>
            新增一則
          </button>
          <span className="cap" style={{ alignSelf: 'center' }}>
            會記下寫入當下的時間，之後還能修改
          </span>
        </div>
      </div>

      {notes.length ? notes.map((n) => (
        <div className="note-entry" key={n.id}>
          <div className="row cap" style={{ marginBottom: 4 }}>
            <span className="num">{fmtDate(n.createdAt)} {fmtClock(n.createdAt)}</span>
            {n.updatedAt && (
              <span className="ash" title={`最後修改 ${fmtDate(n.updatedAt)} ${fmtClock(n.updatedAt)}`}>
                · 已編輯
              </span>
            )}
            <div className="grow" />
            {editingId === n.id ? (
              <>
                <button className="btn-sm" onClick={() => setEditingId(null)}>取消</button>
                <button className="btn-sm btn-primary" style={{ height: 26 }}
                  onClick={() => save(n.id)}>儲存</button>
              </>
            ) : (
              <div className="act">
                <button className="btn-sm" onClick={() => { setEditingId(n.id); setEditText(n.text); }}>
                  [編輯]
                </button>
                <button className="btn-sm btn-danger" onClick={() => {
                  if (confirm('刪除這則筆記？')) {
                    act('deleteProjectNote', { projectId: project.id, noteId: n.id });
                  }
                }}>[x]</button>
              </div>
            )}
          </div>

          {editingId === n.id ? (
            <AutoTextarea
              value={editText}
              min={72}
              max={400}
              onChange={setEditText}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(n.id); }}
            />
          ) : (
            <div className="note-body">{n.text}</div>
          )}
        </div>
      )) : <div className="empty">還沒有目標或筆記</div>}
    </>
  );
}
