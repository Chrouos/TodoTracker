/**
 * collapse.js — 讓 [+] / [-] 真的能收合。
 *
 * 依 DESIGN.md：[+] = 已收合、可展開；[-] = 已展開、可收合。
 * 標記必須是可點的，不能只當裝飾用的項目符號。
 *
 * 用法：HTML 寫成
 *   <h2 class="sec" data-collapse="report-donut">專案時間分配</h2>
 *   <div data-collapse-body="report-donut"> ... </div>
 * 然後呼叫一次 initCollapse()。展開狀態存在 chrome.storage.local。
 */

const KEY = 'uiCollapsed';
const INIT_KEY = 'uiCollapseInitialized';

async function readState() {
  const r = await chrome.storage.local.get([KEY, INIT_KEY]);
  return {
    closed: new Set(r[KEY] || []),
    initialized: new Set(r[INIT_KEY] || []),
  };
}
async function writeState({ closed, initialized }) {
  await chrome.storage.local.set({
    [KEY]: [...closed],
    [INIT_KEY]: [...initialized],
  });
}

function paint(id, closed) {
  for (const head of document.querySelectorAll(`[data-collapse="${id}"]`)) {
    const mark = head.querySelector('.mark');
    if (mark) mark.textContent = closed ? '[+]' : '[-]';
    head.setAttribute('aria-expanded', String(!closed));
  }
  for (const body of document.querySelectorAll(`[data-collapse-body="${id}"]`)) {
    body.hidden = closed;
  }
}

export async function initCollapse() {
  const state = await readState();
  let changed = false;

  for (const head of document.querySelectorAll('[data-collapse]')) {
    const id = head.dataset.collapse;
    if (head.dataset.collapseDefault === 'closed' && !state.initialized.has(id)) {
      state.closed.add(id);
      state.initialized.add(id);
      changed = true;
    }
    // 標題整塊可點，marker 一定要有
    if (!head.querySelector('.mark')) {
      head.insertAdjacentHTML('afterbegin', '<span class="mark">[-]</span> ');
    }
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.classList.add('collapsible');
    paint(id, state.closed.has(id));
  }
  if (changed) await writeState(state);

  const toggle = async (id) => {
    const next = await readState();
    if (next.closed.has(id)) next.closed.delete(id); else next.closed.add(id);
    next.initialized.add(id);
    await writeState(next);
    paint(id, next.closed.has(id));
  };

  document.addEventListener('click', (e) => {
    const head = e.target.closest('[data-collapse]');
    if (head) toggle(head.dataset.collapse);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const head = e.target.closest?.('[data-collapse]');
    if (head) { e.preventDefault(); toggle(head.dataset.collapse); }
  });
}
