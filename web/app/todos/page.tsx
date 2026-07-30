'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import { durationSec, fmtHM } from '@/lib/time';

export default function TodosPage() {
  const { status, data, act } = useStore();
  const { tasks, projects, entries } = data;
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [filter, setFilter] = useState('');
  const [showDone, setShowDone] = useState(false);

  if (status === 'disconnected') return <Disconnected />;

  const list = tasks
    .filter((t) => t.status !== 'archived')
    .filter((t) => (showDone ? true : t.status !== 'done'))
    .filter((t) => (filter ? t.projectId === filter : true))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.sortOrder - b.sortOrder);

  // 每個 todo 累積了多少時間
  const spent = (taskId: string) =>
    entries.filter((e) => e.taskId === taskId && e.endedAt).reduce((s, e) => s + durationSec(e), 0);

  return (
    <>
      <h1>Todo</h1>
      <p className="cap">可以直接對某個 todo 計時，時數會累積在它底下。</p>

      <form
        className="card"
        style={{ marginTop: 24 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await act('upsertTask', { title, projectId: projectId || null });
          setTitle('');
        }}
      >
        <div className="grid2">
          <label className="field"><span>項目</span>
            <input value={title} placeholder="要做什麼？" onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span>專案</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— 未分類 —</option>
              {projects.filter((p) => !p.archivedAt).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions"><button className="btn-primary" type="submit">新增</button></div>
      </form>

      <div className="row" style={{ marginTop: 24 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 220 }}>
          <option value="">— 全部專案 —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="grow" />
        <button onClick={() => setShowDone((v) => !v)}>
          {showDone ? '[x] 顯示已完成' : '[ ] 顯示已完成'}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {list.length ? list.map((t) => {
          const p = projects.find((x) => x.id === t.projectId);
          const doneFlag = t.status === 'done';
          const sec = spent(t.id);
          return (
            <div className="item" key={t.id}>
              <button
                className="btn-ghost btn-sm"
                style={{ width: 32 }}
                onClick={() => act('upsertTask', { ...t, status: doneFlag ? 'todo' : 'done' })}
              >{doneFlag ? '[x]' : '[ ]'}</button>
              <div className="grow">
                <div className="ellipsis" style={{
                  color: doneFlag ? 'var(--text-ash)' : undefined,
                  textDecoration: doneFlag ? 'line-through' : undefined,
                }}>{t.title}</div>
                <div className="sub">{p ? p.name : '未分類'}{t.dueDate ? ` · ${t.dueDate}` : ''}</div>
              </div>
              <span className="num ash">{sec ? fmtHM(sec) : ''}</span>
              <div className="act">
                {!doneFlag && (
                  <button
                    className="btn-sm"
                    title="對這個 todo 計時"
                    onClick={() => act('startTimer', {
                      projectId: t.projectId, taskId: t.id, description: t.title, tagIds: [],
                    })}
                  >[&gt;]</button>
                )}
                <button className="btn-sm btn-danger" onClick={() => act('deleteTask', { id: t.id })}>[x]</button>
              </div>
            </div>
          );
        }) : <div className="empty">沒有 todo</div>}
      </div>
    </>
  );
}
