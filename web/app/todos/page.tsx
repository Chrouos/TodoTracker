'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import AutoTextarea from '@/components/AutoTextarea';
import { fmtHM } from '@/lib/time';
import { taskMetrics, dueLabel, leadLabel, stampLabel } from '@/lib/tasks';
import { flattenTree, indentLabel, descendantIds, pathOf } from '@/lib/tree';
import type { Task, TaskStatus } from '@/lib/types';
import AttachmentPicker from '@/components/AttachmentPicker';
import ShareControls from '@/components/ShareControls';

const blank = () => ({
  id: '', title: '', projectId: '', status: 'todo' as TaskStatus,
  dueDate: '', notes: '',
});

export default function TodosPage() {
  const { status, data, act } = useStore();
  const { tasks, projects, entries } = data;
  const [form, setForm] = useState(blank);
  const [filter, setFilter] = useState('');
  const [showDone, setShowDone] = useState(false);

  if (status === 'disconnected') return <Disconnected />;

  const tree = flattenTree(projects);

  // 選了父專案時，子專案的 todo 也一起列出來
  const scope = filter ? new Set([filter, ...descendantIds(projects, filter)]) : null;

  const list = tasks
    .filter((t) => t.status !== 'archived')
    .filter((t) => (showDone ? true : t.status !== 'done'))
    .filter((t) => (scope ? (t.projectId ? scope.has(t.projectId) : false) : true))
    .sort((a, b) =>
      Number(a.status === 'done') - Number(b.status === 'done')
      || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
      || a.sortOrder - b.sortOrder);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const old = tasks.find((t) => t.id === form.id);
    await act('upsertTask', {
      ...(old ?? {}),
      id: form.id || undefined,
      title: form.title,
      projectId: form.projectId || null,
      status: form.status,
      dueDate: form.dueDate || null,   // 開單／結案時間由 db.js 自己維護
      notes: form.notes,
    });
    setForm(blank());
  };

  const edit = (t: Task) => setForm({
    id: t.id, title: t.title, projectId: t.projectId ?? '', status: t.status,
    dueDate: t.dueDate ?? '', notes: t.notes ?? '',
  });

  const editing = form.id ? tasks.find((t) => t.id === form.id) : undefined;
  const editingMetrics = editing ? taskMetrics(editing, entries) : null;

  return (
    <>
      <h1>Todo</h1>
      <p className="cap">開單日到結案日看得出一件事掛了多久，累積工時看得出實際投入多少。</p>

      <form className="card" onSubmit={submit} style={{ marginTop: 24 }}>
        <div className="grid4">
          <label className="field" style={{ gridColumn: 'span 2' }}>
            <span>項目</span>
            <input value={form.title} placeholder="要做什麼？" required
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="field"><span>專案</span>
            <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">— 未分類 —</option>
              {tree.map((p) => <option key={p.id} value={p.id}>{indentLabel(p.name, p.depth)}</option>)}
            </select>
          </label>
          <label className="field"><span>狀態</span>
            <select value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
              <option value="todo">待辦</option>
              <option value="doing">進行中</option>
              <option value="done">已完成</option>
            </select>
          </label>
        </div>

        <div className="grid4" style={{ marginTop: 12 }}>
          <label className="field"><span>截止日</span>
            <input type="date" value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <span className="hint">唯一可以改的日期。</span>
          </label>
          <label className="field"><span>開單時間</span>
            <input disabled value={editing ? stampLabel(editing.openedAt) : '建立後自動記錄'} />
            <span className="hint">建立當下自動記錄，不可修改。</span>
          </label>
          <label className="field"><span>結案時間</span>
            <input disabled value={editing ? stampLabel(editing.completedAt) : '—'} />
            <span className="hint">按下完成的當下自動記錄；重新打開就清掉。</span>
          </label>
          <label className="field"><span>累積工時</span>
            <input disabled value={editingMetrics?.worked ? fmtHM(editingMetrics.worked) : '—'} />
            <span className="hint">由綁在這個 todo 上的計時紀錄累加。</span>
          </label>
        </div>

        <label className="field" style={{ marginTop: 12 }}><span>備註</span>
          <AutoTextarea value={form.notes} min={80} max={320}
            placeholder="細節、連結、驗收條件…"
            onChange={(v) => setForm({ ...form, notes: v })} /></label>

        <div className="actions">
          <button type="submit" className="btn-primary">{form.id ? '儲存變更' : '新增 Todo'}</button>
          {form.id && <button type="button" onClick={() => setForm(blank())}>取消編輯</button>}
        </div>
        {form.id && <>
          <AttachmentPicker target={{ kind: 'task', id: form.id }} attachments={[]} />
          <ShareControls target={{ kind: 'task', id: form.id }} share={null} />
        </>}
      </form>

      <div className="row" style={{ marginTop: 24 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 260 }}>
          <option value="">— 全部專案 —</option>
          {tree.map((p) => <option key={p.id} value={p.id}>{indentLabel(p.name, p.depth)}</option>)}
        </select>
        <button onClick={() => setShowDone((v) => !v)}>
          {showDone ? '[x] 顯示已完成' : '[ ] 顯示已完成'}
        </button>
        <div className="grow" />
        <span className="cap">
          {list.filter((t) => t.status !== 'done').length} 個未完成 / 共 {list.length}
        </span>
      </div>

      <Section id="todo-list" title="清單">
        {list.length ? list.map((t) => {
          const p = projects.find((x) => x.id === t.projectId);
          const done = t.status === 'done';
          const m = taskMetrics(t, entries);
          const dl = dueLabel(m, done);
          return (
            <div className="item" key={t.id}>
              <button className="btn-ghost btn-sm" style={{ width: 32 }}
                title={done ? '重新打開' : '標記完成'}
                onClick={() => act('upsertTask', { ...t, status: done ? 'todo' : 'done' })}>
                {done ? '[x]' : '[ ]'}
              </button>
              <span className="swatch" style={{ background: p ? p.color : '#9a9898' }} />
              <div className="grow">
                <div className="ellipsis" style={{
                  color: done ? 'var(--text-ash)' : undefined,
                  textDecoration: done ? 'line-through' : undefined,
                }}>
                  {t.title}{' '}
                  {t.status === 'doing' && <span className="badge">進行中</span>}{' '}
                  {dl && <span className={`badge${m.isLate ? ' overdue' : ''}`}>{dl}</span>}{' '}
                  {m.leadMs !== null && <span className="badge">歷時 {leadLabel(m.leadMs)}</span>}{' '}
                  {t.reopenCount > 0 && <span className="badge">重開 {t.reopenCount} 次</span>}
                </div>
                <div className="sub">{p ? pathOf(projects, p.id).join(' / ') : '未分類'}</div>
                <div className="sub num">
                  開單 {stampLabel(t.openedAt)} · 截止 {t.dueDate ?? '—'} · 結案 {stampLabel(t.completedAt)}
                </div>
                {t.notes && <div className="notes">{t.notes}</div>}
              </div>
              <span className="num" title="累積工時">{m.worked ? fmtHM(m.worked) : '—'}</span>
              <div className="act">
                {!done && (
                  <button className="btn-sm" title="對這個 todo 計時"
                    onClick={() => act('startTimer', {
                      projectId: t.projectId, taskId: t.id, description: t.title, notes: '', tagIds: [],
                    })}>[&gt;]</button>
                )}
                <button className="btn-sm" onClick={() => edit(t)}>[編輯]</button>
                <button className="btn-sm btn-danger" onClick={() => {
                  if (confirm('刪除這個 todo？綁在它上面的時間紀錄會保留，只是解除關聯。')) {
                    act('deleteTask', { id: t.id });
                  }
                }}>[x]</button>
              </div>
            </div>
          );
        }) : <div className="empty">沒有符合的 todo</div>}
      </Section>
    </>
  );
}
