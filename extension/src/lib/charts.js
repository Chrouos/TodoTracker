/**
 * charts.js — 純 SVG 圖表，回傳字串直接塞 innerHTML。
 * 沒有任何相依套件。視覺遵守 DESIGN.md：零陰影、hairline 格線、圓角 0。
 */

import { fmtHM, fmtClock } from './time.js';

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

function trendEmpty() {
  return '<div class="empty">沒有可顯示的資料</div>';
}

function trendY(seconds, maxSeconds, top, height) {
  return top + (1 - (maxSeconds ? seconds / maxSeconds : 0)) * height;
}

function trendColor(level) {
  return ['#fafafa', '#dfeef5', '#9ccde5', '#5fb5dc', '#2d8fbe'][level];
}

export function stackedAreaSVG(data) {
  if (!data?.dates?.length || !data.series?.length) return trendEmpty();

  const W = 760, H = 260, PL = 48, PR = 18, PT = 20, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const maxSeconds = Math.max(3600, Math.ceil(Math.max(...data.dailyTotals, 0) / 3600) * 3600);
  const x = (index) => PL + (index * iw) / Math.max(1, data.dates.length - 1);
  const y = (seconds) => trendY(seconds, maxSeconds, PT, ih);
  const xStep = data.dates.length > 1 ? iw / (data.dates.length - 1) : iw;
  const zoneWidth = data.dates.length > 1 ? Math.max(18, xStep) : iw;
  const gridStep = Math.max(1, Math.ceil(maxSeconds / 3600 / 4));
  let grid = '';
  for (let h = 0; h <= maxSeconds / 3600; h += gridStep) {
    const value = h * 3600;
    grid += `<line x1="${PL}" x2="${W - PR}" y1="${y(value)}" y2="${y(value)}" stroke="var(--hairline)" stroke-width="1"></line>
      <text x="${PL - 8}" y="${y(value) + 4}" text-anchor="end" class="axis-label">${h}h</text>`;
  }

  const tops = data.dates.map(() => 0);
  const areas = data.series.map((series) => {
    const bottom = [...tops];
    const top = series.values.map((value, index) => bottom[index] + value);
    top.forEach((value, index) => { tops[index] = value; });
    const points = top.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`)
      .concat(bottom.map((value, index) => {
        const reverseIndex = data.dates.length - 1 - index;
        return `${x(reverseIndex).toFixed(1)},${y(bottom[reverseIndex]).toFixed(1)}`;
      }))
      .join(' ');
    return `<polygon class="trend-segment" data-project-id="${esc(series.id)}" points="${points}" fill="${esc(series.color)}" fill-opacity="0.72"></polygon>`;
  }).join('');

  const labels = data.dates.map((date, index) =>
    (index % Math.max(1, Math.ceil(data.dates.length / 8)) === 0 || index === data.dates.length - 1)
      ? `<text x="${x(index)}" y="${H - 10}" text-anchor="middle" class="axis-label">${esc(date.slice(5))}</text>`
      : '').join('');
  const zones = data.dates.map((date, index) => {
    const left = index === 0 ? PL : x(index) - zoneWidth / 2;
    const width = data.dates.length === 1
      ? zoneWidth
      : index === 0 || index === data.dates.length - 1 ? zoneWidth / 2 : zoneWidth;
    const details = data.detailsByDate[index] || [];
    const detailText = details.map((item) => `${item.name} ${fmtHM(item.seconds)}`).join(' · ');
    return `<rect class="trend-hover-zone" data-trend-date="${esc(date)}" x="${left}" y="${PT}" width="${width}" height="${ih}" fill="transparent" tabindex="0"><title>${esc(date)} · ${fmtHM(data.dailyTotals[index])}${detailText ? ` · ${esc(detailText)}` : ''}</title></rect>`;
  }).join('');

  return `<svg class="project-trend-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img" aria-label="每日專案工時堆疊趨勢圖">
    ${grid}${areas}${zones}${labels}
  </svg>`;
}

export function heatmapSVG(data) {
  if (!data?.dates?.length || !data.series?.length) return trendEmpty();

  const labelW = 150, colW = Math.max(72, Math.min(132, 610 / data.dates.length));
  const W = labelW + colW * data.dates.length + 16;
  const rowH = 34, headerH = 24, H = headerH + rowH * data.series.length + 8;
  const maxCell = Math.max(1, data.maxCellSeconds || 0);
  const x = (index) => labelW + index * colW;
  const cells = data.series.map((series, row) => {
    const y = headerH + row * rowH;
    const label = `<text x="8" y="${y + 21}" class="heatmap-label">${esc(series.name)}</text>`;
    const columns = data.dates.map((date, index) => {
      const value = series.values[index] || 0;
      const level = value === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((value / maxCell) * 4)));
      const total = data.dailyTotals[index] || 0;
      const pct = total ? Math.round((value / total) * 100) : 0;
      return `<g class="heatmap-cell" data-project-id="${esc(series.id)}" data-trend-date="${esc(date)}" tabindex="0">
        <rect x="${x(index) + 2}" y="${y + 2}" width="${colW - 4}" height="${rowH - 4}" rx="2" fill="${trendColor(level)}"></rect>
        <text x="${x(index) + colW / 2}" y="${y + 21}" text-anchor="middle" class="heatmap-cell-text">${value ? esc(fmtHM(value)) : '—'}</text>
        <title>${esc(date)} · ${esc(series.name)} · ${esc(fmtHM(value))} · ${pct}%</title>
      </g>`;
    }).join('');
    return label + columns;
  }).join('');
  const headers = data.dates.map((date, index) =>
    `<text x="${x(index) + colW / 2}" y="16" text-anchor="middle" class="axis-label">${esc(date.slice(5))}</text>`).join('');

  return `<svg class="project-heatmap-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:${W}px" role="img" aria-label="專案每日工時 Heatmap">
    ${headers}${cells}
  </svg>`;
}
