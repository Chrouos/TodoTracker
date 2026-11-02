'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * 隨內容長高的 textarea，卡在 min / max 之間，超過 max 才出現捲軸。
 * 需要直接操作元素（例如插入時間戳、控制游標）時傳 innerRef。
 */
export default function AutoTextarea({
  value, onChange, min = 80, max = 320, innerRef, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  innerRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'ref'>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const setRef = useCallback((el: HTMLTextAreaElement | null) => {
    ref.current = el;
    if (innerRef) innerRef.current = el;
  }, [innerRef]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Measuring a collapsed textarea can clamp every enclosing scroll container.
      const scrollPositions: [HTMLElement, number, number][] = [];
      for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        scrollPositions.push([node, node.scrollTop, node.scrollLeft]);
      }
      el.style.height = 'auto';
      const want = Math.max(min, el.scrollHeight + 2);
      el.style.height = `${Math.min(max, want)}px`;
      el.style.overflowY = want > max ? 'auto' : 'hidden';
      for (const [node, top, left] of scrollPositions) {
        if (node.scrollTop !== top) node.scrollTop = top;
        if (node.scrollLeft !== left) node.scrollLeft = left;
      }
    };
    fit();
    let previousWidth = el.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === previousWidth) return;
      previousWidth = entry.contentRect.width;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, min, max, rest.wrap, rest.hidden]);

  return (
    <textarea
      {...rest}
      ref={setRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ resize: 'none', minHeight: min, ...rest.style }}
    />
  );
}
