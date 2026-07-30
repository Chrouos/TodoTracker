'use client';

/**
 * 純 SVG 圖表，沒有任何相依套件。
 * 視覺遵守 DESIGN.md：零陰影、hairline 格線、等寬字、圓角 0。
 */

import { fmtHM, fmtClock, type Timeline } from '@/lib/time';
import type { Entry } from '@/lib/types';

/* ---------------- 甜甜圈：專案時間分配 ---------------- */

export type Slice = { key: string; name: string; color: string; seconds: number };

export function DonutChart({ data, size = 220 }: { data: Slice[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.seconds, 0);
  const R = 74;
  const SW = 26;
  const C = 2 * Math.PI * R;
  const gap = data.length > 1 ? 2 : 0;

  let acc = 0;
  const arcs = data.map((d) => {
    const raw = total ? (d.seconds / total) * C : 0;
    const len = Math.max(0, raw - gap);
    const el = (
      <circle
        key={d.key}
        cx={100} cy={100} r={R}
        fill="none"
        stroke={d.color}
        strokeWidth={SW}
        strokeDasharray={`${len} ${C - len}`}
        strokeDashoffset={-acc}
        transform="rotate(-90 100 100)"
      />
    );
    acc += raw;
    return el;
  });

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="專案時間分配">
      <circle cx={100} cy={100} r={R} fill="none" stroke="var(--surface-card)" strokeWidth={SW} />
      {arcs}
      <text x={100} y={97} textAnchor="middle"
        style={{ fontSize: 22, fontWeight: 700, fill: 'var(--text-ink)', fontVariantNumeric: 'tabular-nums' }}>
        {fmtHM(total)}
      </text>
      <text x={100} y={116} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-mute)' }}>
        總時數
      </text>
    </svg>
  );
}

/* ---------------- 時間軸：像日曆週檢視 ---------------- */

export function TimelineChart({ tl, meta }: {
  tl: Timeline;
  meta: (e: Entry) => { color: string; label: string };
}) {
  const { days, minMin, maxMin } = tl;

  // 上下各留半小時，對齊到整點
  const from = Math.max(0, Math.floor((minMin - 30) / 60) * 60);
  const to = Math.min(1440, Math.ceil((maxMin + 30) / 60) * 60);
  const span = Math.max(60, to - from);

  const PL = 46, PR = 8, PT = 24, PB = 8;
  const colW = Math.max(48, Math.min(120, 640 / Math.max(1, days.length)));
  const W = PL + PR + colW * days.length;
  const hours = span / 60;
  const pxPerHour = hours <= 8 ? 46 : hours <= 14 ? 34 : 26;
  const ih = hours * pxPerHour;
  const H = PT + ih + PB;

  const y = (min: number) => PT + ((min - from) / span) * ih;

  const gridLines = [];
  for (let m = from; m <= to; m += 60) gridLines.push(m);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: W }}
      role="img" aria-label="每日時間軸">
      {gridLines.map((m) => (
        <g key={m}>
          <line x1={PL} x2={W - PR} y1={y(m)} y2={y(m)} stroke="var(--hairline)" strokeWidth={1} />
          <text x={PL - 8} y={y(m) + 4} textAnchor="end"
            style={{ fontSize: 11, fill: 'var(--text-mute)', fontVariantNumeric: 'tabular-nums' }}>
            {String(m / 60).padStart(2, '0')}:00
          </text>
        </g>
      ))}
      <line x1={W - PR} x2={W - PR} y1={PT} y2={PT + ih} stroke="var(--hairline)" strokeWidth={1} />

      {days.map((d, i) => {
        const x0 = PL + i * colW;
        return (
          <g key={d.date}>
            <line x1={x0} x2={x0} y1={PT} y2={PT + ih} stroke="var(--hairline)" strokeWidth={1} />
            <text x={x0 + colW / 2} y={PT - 8} textAnchor="middle"
              style={{ fontSize: 11, fill: 'var(--text-mute)', fontVariantNumeric: 'tabular-nums' }}>
              {d.date.slice(5)}
            </text>
            {d.blocks.map((b, k) => {
              const m = meta(b.entry);
              const laneW = (colW - 4) / b.lanes;
              const bx = x0 + 2 + b.lane * laneW;
              const by = y(b.s);
              const bh = Math.max(3, y(b.e) - y(b.s));
              const showText = bh >= 16 && laneW >= 40;
              return (
                <g key={`${b.entry.id}-${k}`}>
                  <rect x={bx} y={by} width={laneW - 2} height={bh}
                    fill={m.color} fillOpacity={0.16} stroke={m.color} strokeWidth={1} />
                  {showText && (
                    <text x={bx + 4} y={by + 12} style={{ fontSize: 10, fill: 'var(--text-ink)' }}>
                      {m.label.slice(0, Math.floor(laneW / 6))}
                    </text>
                  )}
                  <title>{`${m.label}\n${fmtClock(b.entry.startedAt)}–${fmtClock(b.entry.endedAt!)}`}</title>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- 折線圖：每日趨勢 ---------------- */

export type Point = { date: string; seconds: number };

export function LineChart({ data }: { data: Point[] }) {
  const W = 720, H = 240, PL = 46, PR = 14, PT = 14, PB = 30;
  const iw = W - PL - PR;
  const ih = H - PT - PB;

  const peak = Math.max(...data.map((d) => d.seconds), 0);
  const maxH = Math.max(1, Math.ceil(peak / 3600));
  const ticks = maxH <= 4 ? maxH : 4;

  const x = (i: number) => PL + (i * iw) / Math.max(1, data.length - 1);
  const y = (s: number) => PT + (1 - s / (maxH * 3600)) * ih;

  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.seconds).toFixed(1)}`).join(' ');
  const area = `${PL},${PT + ih} ${pts} ${x(data.length - 1).toFixed(1)},${PT + ih}`;

  const every = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}
      role="img" aria-label="每日時數趨勢">
      {/* 水平格線 + y 軸標籤 */}
      {Array.from({ length: ticks + 1 }, (_, k) => {
        const v = (maxH * 3600 * k) / ticks;
        return (
          <g key={k}>
            <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)}
              stroke="var(--hairline)" strokeWidth={1} />
            <text x={PL - 8} y={y(v) + 4} textAnchor="end"
              style={{ fontSize: 11, fill: 'var(--text-mute)', fontVariantNumeric: 'tabular-nums' }}>
              {(v / 3600).toFixed(0)}h
            </text>
          </g>
        );
      })}

      {/* 面積：極淡，只用來指示量體 */}
      <polygon points={area} fill="var(--surface-card)" />

      {/* 折線 */}
      <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* 資料點 */}
      {data.map((d, i) => (
        <circle key={d.date} cx={x(i)} cy={y(d.seconds)} r={2.5}
          fill={d.seconds ? 'var(--ink)' : 'var(--canvas)'}
          stroke="var(--ink)" strokeWidth={1}>
          <title>{`${d.date} · ${fmtHM(d.seconds)}`}</title>
        </circle>
      ))}

      {/* x 軸標籤 */}
      {data.map((d, i) =>
        i % every === 0 || i === data.length - 1 ? (
          <text key={d.date} x={x(i)} y={H - 10} textAnchor="middle"
            style={{ fontSize: 11, fill: 'var(--text-mute)', fontVariantNumeric: 'tabular-nums' }}>
            {d.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
