import { markdownToHtml } from '@/lib/markdown';

export default function MarkdownPreview({ value, className = '' }: { value: string; className?: string }) {
  if (!value.trim()) return <span className="markdown-empty">沒有筆記</span>;
  return <div className={`markdown-preview ${className}`} dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} />;
}
