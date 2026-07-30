import type { Entry, Project } from './types';
import { durationSec } from './time';

/**
 * 專案樹。專案用 parentId 自指派，可以一直往下長。
 * 跟 extension/src/lib/tree.js 是同一套邏輯。
 */

export type TreeNode = Project & { depth: number; path: string[] };

export function childrenOf(projects: Project[], parentId: string | null = null): Project[] {
  return projects
    .filter((p) => (p.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function flattenTree(
  projects: Project[],
  { includeArchived = true, root = null as string | null } = {},
): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (parentId: string | null, depth: number, path: string[]) => {
    for (const p of childrenOf(projects, parentId)) {
      if (!includeArchived && p.archivedAt) continue; // 整棵子樹一起跳過
      out.push({ ...p, depth, path });
      walk(p.id, depth + 1, [...path, p.name]);
    }
  };
  walk(root, 0, []);
  return out;
}

export function descendantIds(projects: Project[], id: string): Set<string> {
  const set = new Set<string>();
  const walk = (pid: string) => {
    for (const c of projects) {
      if ((c.parentId ?? null) === pid && !set.has(c.id)) {
        set.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(id);
  return set;
}

export function wouldCycle(projects: Project[], id: string, newParentId: string | null): boolean {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  return descendantIds(projects, id).has(newParentId);
}

export function ancestorIds(projects: Project[], id: string | null): string[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = id ? byId.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

export function pathOf(projects: Project[], id: string | null): string[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return ancestorIds(projects, id).map((x) => byId.get(x)!.name);
}

/** HTML option 會吃掉一般空白，所以縮排用 nbsp */
export function indentLabel(name: string, depth: number): string {
  return depth === 0 ? name : `${' '.repeat(depth * 3)}└ ${name}`;
}

/** 直接記在各專案上的秒數；未分類的 key 是 null */
export function secondsByProject(entries: Entry[]): Map<string | null, number> {
  const m = new Map<string | null, number>();
  for (const e of entries) {
    const k = e.projectId ?? null;
    m.set(k, (m.get(k) ?? 0) + durationSec(e));
  }
  return m;
}

/** 向上累加：父層的 total = 自己的 own + 所有後代的 total */
export function rollup(
  projects: Project[], ownSec: Map<string | null, number>,
): Map<string, { own: number; total: number }> {
  const memo = new Map<string, number>();

  const totalOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    memo.set(id, 0); // 先佔位，資料若有迴圈也不會無限遞迴
    let sum = ownSec.get(id) ?? 0;
    for (const c of projects) {
      if ((c.parentId ?? null) === id) sum += totalOf(c.id);
    }
    memo.set(id, sum);
    return sum;
  };

  const out = new Map<string, { own: number; total: number }>();
  for (const p of projects) {
    out.set(p.id, { own: ownSec.get(p.id) ?? 0, total: totalOf(p.id) });
  }
  return out;
}
