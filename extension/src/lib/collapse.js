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

async function readClosed() {
  const r = await chrome.storage.local.get(KEY);
  return new Set(r[KEY] || []);
}
async function writeClosed(set) {
  await chrome.storage.local.set({ [KEY]: [...set] });
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
  const closed = await readClosed();

  for (const head of document.querySelectorAll('[data-collapse]')) {
    const id = head.dataset.collapse;
    // 標題整塊可點，marker 一定要有
    if (!head.querySelector('.mark')) {
      head.insertAdjacentHTML('afterbegin', '<span class="mark">[-]</span> ');
    }
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.classList.add('collapsible');
    paint(id, closed.has(id));
  }

  const toggle = async (id) => {
    const set = await readClosed();
    if (set.has(id)) set.delete(id); else set.add(id);
    await writeClosed(set);
    paint(id, set.has(id));
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
