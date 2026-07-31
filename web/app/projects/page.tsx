'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import Disconnected from '@/components/Disconnected';
import Section from '@/components/Section';
import { fmtHM } from '@/lib/time';
import {
  flattenTree, childrenOf, descendantIds, rollup, secondsByProject, indentLabel,
} from '@/lib/tree';
import type { Project } from '@/lib/types';

const BLANK = { id: '', parentId: '', name: '', color: '#201d1d' };

export default function ProjectsPage() {
  const { status, data, act } = useStore();
  const { projects, entries, tasks } = data;
  const [form, setForm] = useState({ ...BLANK });

  if (status === 'disconnected') return <Disconnected />;

  const roll = rollup(projects, secondsByProject(entries.filter((e) => e.endedAt)));
  const tree = flattenTree(projects);

  // 編輯中的專案與它的後代不能當自己的上層，否則會形成迴圈
  const banned = form.id ? new Set([form.id, ...descendantIds(projects, form.id)]) : new Set<string>();

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim()) return;
    await act('upsertProject', {
      id: form.id || undefined,
      parentId: form.parentId || null,
      name: form.name,
      color: form.color,
    });
    setForm({ ...BLANK });
  };

  const edit = (p: Project) => setForm({
    id: p.id, parentId: p.parentId ?? '', name: p.name, color: p.color,
  });

  return (
    <>
      <h1>專案</h1>
      <p className="cap">專案可以一直往下掛子專案，時數會自動累加到上層。這裡建的專案，擴充的下拉會立刻出現。</p>

      <form className="card" onSubmit={submit} style={{ marginTop: 24 }}>
        <div className="grid4">
          <label className="field">
            <span>名稱</span>
            <input value={form.name} placeholder="例：官網改版"
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field">
            <span>顏色</span>
            <input type="color" value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: 'span 2' }}>
            <span>上層專案</span>
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">— 最上層 —</option>
              {tree.filter((p) => !banned.has(p.id)).map((p) => (
                <option key={p.id} value={p.id}>{indentLabel(p.name, p.depth)}</option>
              ))}
            </select>
            <span className="hint">留空就是最上層。自己與自己的子孫不會出現在這裡，避免掛成迴圈。</span>
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="btn-primary">{form.id ? '儲存變更' : '建立專案'}</button>
          {form.id && <button type="button" onClick={() => setForm({ ...BLANK })}>取消編輯</button>}
        </div>
      </form>

      <Section id="proj-list" title="專案樹">
        {tree.length ? tree.map((p) => {
          const r = roll.get(p.id) ?? { own: 0, total: 0 };
          const kids = childrenOf(projects, p.id).length;
          const open = tasks.filter(
            (x) => x.projectId === p.id && x.status !== 'done' && x.status !== 'archived',
          ).length;
          return (
            <div className="item" key={p.id} style={{ paddingLeft: p.depth * 20 }}>
              {p.depth > 0 && <span className="mark">└</span>}
              <span className="swatch" style={{ background: p.color }} />
              <div className="grow">
                <div className="ellipsis">
                  <Link href={`/projects/${p.id}`} className="proj-link">{p.name}</Link>
                  {' '}{p.archivedAt && <span className="badge">已封存</span>}
                </div>
                <div className="sub">
                  {kids > 0 && `${kids} 個子專案 · `}
                  {open > 0 ? `${open} 個待辦` : '沒有待辦'}
                </div>
              </div>
              <span className="num" title="含所有子專案">{fmtHM(r.total)}</span>
              <span className="num ash" style={{ width: 80, textAlign: 'right' }}
                title="只算直接記在這一層的">{kids > 0 ? fmtHM(r.own) : ''}</span>
              <div className="act">
                <button className="btn-sm" onClick={() => edit(p)}>[編輯]</button>
                <button className="btn-sm" onClick={() => act('upsertProject', {
                  ...p, archivedAt: p.archivedAt ? null : new Date().toISOString(),
                })}>{p.archivedAt ? '[復原]' : '[封存]'}</button>
                <button className="btn-sm btn-danger" onClick={() => {
                  if (confirm(
                    kids > 0
                      ? `刪除「${p.name}」？它的 ${kids} 個子專案會往上接到它原本的位置，時間紀錄會變成未分類。`
                      : `刪除「${p.name}」？時間紀錄會保留但變成未分類，該專案的 todo 會一併刪除。`,
                  )) act('deleteProject', { id: p.id });
                }}>[x]</button>
              </div>
            </div>
          );
        }) : <div className="empty">還沒有專案，用上面的表單建一個</div>}
      </Section>

      <Section id="proj-tags" title="標籤">
        <TagSection />
      </Section>
    </>
  );
}

function TagSection() {
  const { data, act } = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#646262');

  return (
    <>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await act('upsertTag', { name, color });
          setName('');
        }}
      >
        <div className="grid4">
          <label className="field"><span>標籤名稱</span>
            <input value={name} placeholder="例：會議" onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>顏色</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        </div>
        <div className="actions"><button className="btn-primary" type="submit">新增標籤</button></div>
      </form>

      {data.tags.length ? data.tags.map((t) => (
        <div className="item" key={t.id}>
          <span className="swatch" style={{ background: t.color }} />
          <div className="grow">{t.name}</div>
          <div className="act">
            <button className="btn-sm btn-danger" onClick={() => act('deleteTag', { id: t.id })}>[x]</button>
          </div>
        </div>
      )) : <div className="empty">還沒有標籤</div>}
    </>
  );
}
