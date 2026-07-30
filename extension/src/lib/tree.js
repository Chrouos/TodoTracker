/**
 * tree.js — 專案樹。專案用 parentId 自指派，可以一直往下長。
 *
 * 兩個要小心的地方：
 * 1. 設定父層時必須擋迴圈（不能把自己掛到自己的後代底下）
 * 2. 統計要向上累加，父層的數字 = 自己的 + 所有後代的
 */

export function childrenOf(projects, parentId = null) {
  return projects
    .filter((p) => (p.parentId || null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 深度優先攤平成清單，每筆帶 depth 與 path（祖先名稱陣列） */
export function flattenTree(projects, { includeArchived = true, root = null } = {}) {
  const out = [];
  const walk = (parentId, depth, path) => {
    for (const p of childrenOf(projects, parentId)) {
      if (!includeArchived && p.archivedAt) continue; // 整棵子樹一起跳過
      out.push({ ...p, depth, path });
      walk(p.id, depth + 1, [...path, p.name]);
    }
  };
  walk(root, 0, []);
  return out;
}

/** 某個專案底下所有後代的 id（不含自己） */
export function descendantIds(projects, id) {
  const set = new Set();
  const walk = (pid) => {
    for (const c of projects) {
      if ((c.parentId || null) === pid && !set.has(c.id)) {
        set.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(id);
  return set;
}

/** 把 id 掛到 newParentId 底下會不會造成迴圈 */
export function wouldCycle(projects, id, newParentId) {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  return descendantIds(projects, id).has(newParentId);
}

/** 從根到自己的名稱路徑，例如 ["客戶A", "官網改版", "前端"] */
export function pathOf(projects, id) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const names = [];
  let cur = byId.get(id);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return names;
}

/** 下拉選單用的縮排標籤（HTML option 會吃掉一般空白，所以用 nbsp） */
export function indentLabel(name, depth) {
  return depth === 0 ? name : `${' '.repeat(depth * 3)}└ ${name}`;
}

/**
 * 向上累加。
 * @param {Array} projects
 * @param {Map<string, number>} ownSec  projectId -> 直接記在該專案的秒數
 * @returns {Map<string, {own:number, total:number}>}
 */
export function rollup(projects, ownSec) {
  const result = new Map();
  const memo = new Map();

  const totalOf = (id) => {
    if (memo.has(id)) return memo.get(id);
    memo.set(id, 0); // 先佔位，資料若有迴圈也不會無限遞迴
    let sum = ownSec.get(id) || 0;
    for (const c of projects) {
      if ((c.parentId || null) === id) sum += totalOf(c.id);
    }
    memo.set(id, sum);
    return sum;
  };

  for (const p of projects) {
    result.set(p.id, { own: ownSec.get(p.id) || 0, total: totalOf(p.id) });
  }
  return result;
}
