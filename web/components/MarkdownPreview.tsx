import type { ElementType, ReactNode } from 'react';

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'list'; lines: string[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'table'; rows: string[][]; alignments: ('left' | 'center' | 'right' | null)[] };

type ListItem = { marker: string; text: string; children: ListItem[] };

function inline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^\s)]+\))/g);
  return parts.filter(Boolean).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={i}>{part}</span>;
  });
}

function splitTableRow(line: string) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()); }
function isTableSeparator(line: string) { return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell)); }

function buildList(lines: string[]): ListItem[] {
  const root: ListItem[] = [];
  const stack: { indent: number; items: ListItem[] }[] = [];
  for (const line of lines) {
    const match = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, '    ').length;
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const items = stack.length ? stack[stack.length - 1].items.at(-1)!.children : root;
    const item = { marker: match[2], text: match[3], children: [] as ListItem[] };
    items.push(item);
    stack.push({ indent, items: item.children });
  }
  return root;
}

function renderList(items: ListItem[], key = 'list'): ReactNode {
  if (!items.length) return null;
  const Tag = /^\d/.test(items[0].marker) ? 'ol' : 'ul';
  return <Tag key={key}>{items.map((item, i) => <li key={`${key}-${i}`}>{inline(item.text)}{renderList(item.children, `${key}-${i}`)}</li>)}</Tag>;
}

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) { const code: string[] = []; i++; while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]); if (i < lines.length) i++; blocks.push({ type: 'code', language: fence[1], text: code.join('\n') }); continue; }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); i++; continue; }
    if (i + 1 < lines.length && line.includes('|') && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line); const separator = splitTableRow(lines[i + 1]);
      const alignments = separator.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.startsWith(':') ? 'left' : cell.endsWith(':') ? 'right' : null);
      const rows = [header]; i += 2; while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitTableRow(lines[i++]));
      blocks.push({ type: 'table', rows, alignments }); continue;
    }
    if (/^\s*>/.test(line)) { const quote: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, '')); blocks.push({ type: 'quote', lines: quote }); continue; }
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) { const list: string[] = []; while (i < lines.length && (/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[i]) || !lines[i].trim())) list.push(lines[i++]); blocks.push({ type: 'list', lines: list }); continue; }
    const paragraph: string[] = [line]; i++; while (i < lines.length && lines[i].trim() && !/^\s*(?:```|#{1,6}\s|>|(?:[-+*]|\d+[.)])\s+)/.test(lines[i])) paragraph.push(lines[i++]); blocks.push({ type: 'paragraph', lines: paragraph });
  }
  return blocks;
}

function renderBlocks(blocks: Block[]): ReactNode[] {
  return blocks.map((block, i) => {
    if (block.type === 'heading') { const Tag = `h${block.level}` as ElementType; return <Tag key={i}>{inline(block.text)}</Tag>; }
    if (block.type === 'paragraph') return <p key={i}>{block.lines.map((line, n) => <span key={n}>{n > 0 && <br />}{inline(line)}</span>)}</p>;
    if (block.type === 'quote') return <blockquote key={i}>{renderBlocks(parse(block.lines.join('\n')))}</blockquote>;
    if (block.type === 'code') return <pre key={i} data-language={block.language || undefined}><code>{block.text}</code></pre>;
    if (block.type === 'table') return <div className="markdown-table-wrap" key={i}><table><thead><tr>{block.rows[0].map((cell, n) => <th key={n} style={{ textAlign: block.alignments[n] ?? 'left' }}>{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.slice(1).map((row, r) => <tr key={r}>{block.rows[0].map((_, c) => <td key={c} style={{ textAlign: block.alignments[c] ?? 'left' }}>{inline(row[c] ?? '')}</td>)}</tr>)}</tbody></table></div>;
    return <div className="markdown-list" key={i}>{renderList(buildList(block.lines), `list-${i}`)}</div>;
  });
}

export default function MarkdownPreview({ source, className = '' }: { source: string; className?: string }) {
  if (!source.trim()) return null;
  return <div className={`markdown-preview ${className}`.trim()}>{renderBlocks(parse(source))}</div>;
}
