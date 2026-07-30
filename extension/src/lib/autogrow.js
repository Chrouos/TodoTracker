/**
 * autogrow.js — textarea 隨內容長高，卡在 min / max 之間。
 * 超過 max 才出現捲軸。
 */

export function autoGrow(el, { min = 72, max = 280 } = {}) {
  if (!el) return () => {};
  el.style.resize = 'none';
  el.style.minHeight = `${min}px`;

  const fit = () => {
    el.style.height = 'auto';                    // 先收掉才量得到真實 scrollHeight
    const want = Math.max(min, el.scrollHeight + 2);
    el.style.height = `${Math.min(max, want)}px`;
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  };

  el.addEventListener('input', fit);
  fit();
  return fit; // 程式改 value 之後要自己叫一次
}
