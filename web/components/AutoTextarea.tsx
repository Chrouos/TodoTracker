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
    el.style.height = 'auto';                 // 先收掉才量得到真實 scrollHeight
    const want = Math.max(min, el.scrollHeight + 2);
    el.style.height = `${Math.min(max, want)}px`;
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  }, [value, min, max]);

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
