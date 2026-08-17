'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { toLocalInput, fromLocalInput } from '@/lib/time';
import { projectIdForTask } from '@/lib/entryRelations';
import { flattenTree, indentLabel } from '@/lib/tree';
import AutoTextarea from '@/components/AutoTextarea';
import AttachmentPicker from '@/components/AttachmentPicker';
import ShareControls from '@/components/ShareControls';
import { FEATURES } from '@/lib/features';

export type EntryDraft = {
  id: string;
  description: string;
  notes: string;
  projectId: string;
  taskId: string;
  startedAt: string;
  endedAt: string;
};

export default function EntryDialog({ draft, onClose }: { draft: EntryDraft; onClose: () => void }) {
  const { data, act } = useStore();
  const [form, setForm] = useState(draft);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => { ref.current?.showModal(); }, []);

  const save = async () => {
    if (new Date(form.endedAt) <= new Date(form.startedAt)) {
      alert('結束時間必須晚於開始時間');
      return;
    }
    const old = data.entries.find((e) => e.id === form.id);
    await act('upsertEntry', {
      ...(old ?? {}),
      id: form.id || undefined,
      description: form.description,
      notes: form.notes,
      projectId: form.projectId || null,
      taskId: form.taskId || null,
      startedAt: form.startedAt,
      endedAt: form.endedAt,
      source: form.id ? old?.source ?? 'manual' : 'manual',
    });
    onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{
        border: '1px solid var(--hairline-strong)', borderRadius: 4, padding: 24,
        width: 520, maxWidth: '92vw', background: 'var(--canvas)', color: 'var(--text-ink)',
      }}
    >
      <h2 style={{ marginBottom: 16 }}>{form.id ? '編輯紀錄' : '手動補登'}</h2>

      <label className="field" style={{ marginBottom: 12 }}>
        <span>描述</span>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>

      <div className="grid2" style={{ marginBottom: 12 }}>
        <label className="field"><span>專案</span>
          <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, taskId: '' })}>
            <option value="">— 未分類 —</option>
            {flattenTree(data.projects).map((p) => (
              <option key={p.id} value={p.id}>{indentLabel(p.name, p.depth)}</option>
            ))}
          </select>
        </label>
        <label className="field"><span>Todo</span>
          <select value={form.taskId} onChange={(e) => setForm({
            ...form,
            taskId: e.target.value,
            projectId: projectIdForTask(e.target.value, data.tasks, form.projectId),
          })}>
            <option value="">— 無 —</option>
            {data.tasks
              .filter((t) => !form.projectId || t.projectId === form.projectId)
              .map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
      </div>

      <div className="grid2">
        <label className="field"><span>開始</span>
          <input type="datetime-local" value={toLocalInput(form.startedAt)}
            onChange={(e) => setForm({ ...form, startedAt: fromLocalInput(e.target.value) })} />
        </label>
        <label className="field"><span>結束</span>
          <input type="datetime-local" value={toLocalInput(form.endedAt)}
            onChange={(e) => setForm({ ...form, endedAt: fromLocalInput(e.target.value) })} />
        </label>
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        <span>工作紀錄</span>
        <AutoTextarea value={form.notes} min={96} max={360} placeholder="這段時間做了什麼？"
          onChange={(v) => setForm({ ...form, notes: v })} />
      </label>

      {FEATURES.workNoteImagesAndSharing && form.id && <>
        <AttachmentPicker target={{ kind: 'entry', id: form.id }} attachments={[]} />
        <ShareControls target={{ kind: 'entry', id: form.id }} share={null} />
      </>}

      <div className="actions">
        <button onClick={() => ref.current?.close()}>取消</button>
        <button className="btn-primary" onClick={save}>儲存</button>
      </div>
    </dialog>
  );
}
