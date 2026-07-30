'use client';

import { useState } from 'react';
import { copyToClipboard } from '@/lib/summary';

/** 按下去把 build() 產出的文字丟進剪貼簿，短暫顯示結果 */
export default function CopyButton({
  build, label = '複製 Markdown', className = '',
}: {
  build: () => string;
  label?: string;
  className?: string;
}) {
  const [flash, setFlash] = useState<string | null>(null);

  const run = async () => {
    const text = build();
    if (!text) setFlash('沒有紀錄');
    else setFlash((await copyToClipboard(text)) ? '已複製 ✓' : '複製失敗');
    setTimeout(() => setFlash(null), 1500);
  };

  return (
    <button className={className} onClick={run} title="複製成 Markdown">
      {flash ?? label}
    </button>
  );
}
