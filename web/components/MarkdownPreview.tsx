'use client';

import type { ChangeEvent } from 'react';
import { markdownToHtml, parseMarkdown, serializeMarkdown, toggleTaskItem } from '@/lib/markdown';

type MarkdownPreviewProps = {
  value: string;
  className?: string;
  interactiveTasks?: boolean;
  onChange?: (value: string) => void;
};

function parseTaskPath(value: string | undefined): number[] | null {
  if (!value || !/^\d+(?:\.\d+)+$/.test(value)) return null;
  return value.split('.').map(Number);
}

export default function MarkdownPreview({
  value,
  className = '',
  interactiveTasks = false,
  onChange,
}: MarkdownPreviewProps) {
  const canToggleTasks = interactiveTasks && Boolean(onChange);

  const handleTaskChange = (event: ChangeEvent<HTMLDivElement>) => {
    if (!canToggleTasks || !onChange || !(event.target instanceof HTMLInputElement)) return;
    const path = parseTaskPath(event.target.dataset.markdownTaskPath);
    if (!path) return;

    try {
      onChange(serializeMarkdown(toggleTaskItem(parseMarkdown(value), path)));
    } catch {
      // Rendered Markdown can be stale while its parent updates; ignore that click safely.
    }
  };

  if (!value.trim()) return <span className="markdown-empty">沒有筆記</span>;
  return (
    <div
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: markdownToHtml(value, { interactiveTasks: canToggleTasks }) }}
      onChange={canToggleTasks ? handleTaskChange : undefined}
    />
  );
}
