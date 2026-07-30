/**
 * charts.js — 純 SVG 圖表，回傳字串直接塞 innerHTML。
 * 沒有任何相依套件。視覺遵守 DESIGN.md：零陰影、hairline 格線、圓角 0。
 */

import { fmtHM, fmtClock } from './time.js';

/**
 * 甜甜圈：專案時間分配
 * @param {{name:string,color:string,seconds:number}[]} data
 */
export function donutSVG(data, size = 220) {
  const total = data.reduce((s, d) => s + d.seconds, 0);
  const R = 74, SW = 26, C = 2 * Math.PI * R;
  const gap = data.length > 1 ? 2 : 0;

  let acc = 0;
  const arcs = data.map((d) => {
    const raw = total ? (d.seconds / total) * C : 0;
    const len = Math.max(0, raw - gap);
    const el = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${d.color}"
      stroke-width="${SW}" stroke-dasharray="${len} ${C - len}"
      stroke-dashoffset="${-acc}" transform="rotate(-90 100 100)"></circle>`;
    acc += raw;
    return el;
  }).join('');

  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" role="img">
    <circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--surface-card)" stroke-width="${SW}"></circle>
    ${arcs}
    <text x="100" y="97" text-anchor="middle"
      style="font-size:22px;font-weight:700;fill:var(--text-ink);font-variant-numeric:tabular-nums">${fmtHM(total)}</text>
    <text x="100" y="116" text-anchor="middle"
      style="font-size:11px;fill:var(--text-mute)">總時數</text>
  </svg>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * 時間軸：像日曆週檢視。橫軸是日期，縱軸是一天內的時間。
 * @param {ReturnType<import('./time.js').timelineData>} tl
 * @param {(entry)=>{color:string,label:string}} meta
 */
export function timelineSVG(tl, meta) {
  const { days, minMin, maxMin } = tl;

  // 上下各留半小時，並對齊到整點
  const from = Math.max(0, Math.floor((minMin - 30) / 60) * 60);
  const to = Math.min(1440, Math.ceil((maxMin + 30) / 60) * 60);
  const span = Math.max(60, to - from);

  const PL = 46, PR = 8, PT = 24, PB = 8;
  const colW = Math.max(48, Math.min(120, 640 / Math.max(1, days.length)));
  const W = PL + PR + colW * days.length;
  const pxPerHour = span / 60 <= 8 ? 46 : span / 60 <= 14 ? 34 : 26;
  const ih = (span / 60) * pxPerHour;
  const H = PT + ih + PB;

  const y = (min) => PT + ((min - from) / span) * ih;

  // 整點格線 + 時間標籤
  let grid = '';
  for (let m = from; m <= to; m += 60) {
    grid += `<line x1="${PL}" x2="${W - PR}" y1="${y(m)}" y2="${y(m)}"
      stroke="var(--hairline)" stroke-width="1"></line>
      <text x="${PL - 8}" y="${y(m) + 4}" text-anchor="end"
        style="font-size:11px;fill:var(--text-mute);font-variant-numeric:tabular-nums">${String(m / 60).padStart(2, '0')}:00</text>`;
  }

  let cols = '';
  days.forEach((d, i) => {
    const x0 = PL + i * colW;
    cols += `<line x1="${x0}" x2="${x0}" y1="${PT}" y2="${PT + ih}"
        stroke="var(--hairline)" stroke-width="1"></line>
      <text x="${x0 + colW / 2}" y="${PT - 8}" text-anchor="middle"
        style="font-size:11px;fill:var(--text-mute);font-variant-numeric:tabular-nums">${d.date.slice(5)}</text>`;

    for (const b of d.blocks) {
      const m = meta(b.entry);
      const laneW = (colW - 4) / b.lanes;
      const bx = x0 + 2 + b.lane * laneW;
      const by = y(b.s);
      const bh = Math.max(3, y(b.e) - y(b.s));
      const showText = bh >= 16 && laneW >= 40;
      cols += `<g>
        <rect x="${bx}" y="${by}" width="${laneW - 2}" height="${bh}"
          fill="${m.color}" fill-opacity="0.16" stroke="${m.color}" stroke-width="1"></rect>
        ${showText ? `<text x="${bx + 4}" y="${by + 12}"
          style="font-size:10px;fill:var(--text-ink)"
          clip-path="inset(0 0 0 0)">${esc(m.label).slice(0, Math.floor(laneW / 6))}</text>` : ''}
        <title>${esc(m.label)}
${fmtClock(b.entry.startedAt)}–${fmtClock(b.entry.endedAt)}</title>
      </g>`;
    }
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:${W}px" role="img">
    ${grid}
    <line x1="${W - PR}" x2="${W - PR}" y1="${PT}" y2="${PT + ih}" stroke="var(--hairline)" stroke-width="1"></line>
    ${cols}
  </svg>`;
}

/**
 * 折線圖：每日趨勢
 * @param {{date:string,seconds:number}[]} data 必須是連續日期（缺的補 0）
 */
export function lineSVG(data) {
  if (!data.length) return '<div class="empty">—</div>';

  const W = 720, H = 240, PL = 46, PR = 14, PT = 14, PB = 30;
  const iw = W - PL - PR, ih = H - PT - PB;
  const peak = Math.max(...data.map((d) => d.seconds), 0);
  const maxH = Math.max(1, Math.ceil(peak / 3600));
  const ticks = maxH <= 4 ? maxH : 4;

  const x = (i) => PL + (i * iw) / Math.max(1, data.length - 1);
  const y = (s) => PT + (1 - s / (maxH * 3600)) * ih;

  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.seconds).toFixed(1)}`).join(' ');
  const area = `${PL},${PT + ih} ${pts} ${x(data.length - 1).toFixed(1)},${PT + ih}`;
  const every = Math.max(1, Math.ceil(data.length / 8));

  const grid = Array.from({ length: ticks + 1 }, (_, k) => {
    const v = (maxH * 3600 * k) / ticks;
    return `<line x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"
        stroke="var(--hairline)" stroke-width="1"></line>
      <text x="${PL - 8}" y="${y(v) + 4}" text-anchor="end"
        style="font-size:11px;fill:var(--text-mute);font-variant-numeric:tabular-nums">${(v / 3600).toFixed(0)}h</text>`;
  }).join('');

  const dots = data.map((d, i) =>
    `<circle cx="${x(i)}" cy="${y(d.seconds)}" r="2.5"
      fill="${d.seconds ? 'var(--ink)' : 'var(--canvas)'}" stroke="var(--ink)" stroke-width="1">
      <title>${d.date} · ${fmtHM(d.seconds)}</title></circle>`).join('');

  const labels = data.map((d, i) =>
    (i % every === 0 || i === data.length - 1)
      ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle"
          style="font-size:11px;fill:var(--text-mute);font-variant-numeric:tabular-nums">${d.date.slice(5)}</text>`
      : '').join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img">
    ${grid}
    <polygon points="${area}" fill="var(--surface-card)"></polygon>
    <polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-width="1.5"
      stroke-linejoin="round" stroke-linecap="round"></polyline>
    ${dots}
    ${labels}
  </svg>`;
}
