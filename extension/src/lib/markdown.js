// Keep this Extension-local module aligned with shared/markdown. The unpacked
// MV3 extension cannot import modules outside its package root.

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function parseMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index += 1; continue; }
    const fence = lines[index].match(/^```([^`]*)\s*$/);
    if (fence) {
      const value = [];
      const language = fence[1].trim();
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) value.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ type: 'codeBlock', value: value.join('\n'), ...(language ? { language } : {}) });
      continue;
    }
    const heading = lines[index].match(/^(#{1,6})[ \t]+(.*)$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, inlines: parseInlines(heading[2]) }); index += 1; continue; }
    if (isTableStart(lines, index)) {
      const table = parseTable(lines, index);
      blocks.push(table.block);
      index = table.next;
      continue;
    }
    if (isHorizontalRule(lines[index])) { blocks.push({ type: 'horizontalRule' }); index += 1; continue; }
    if (lines[index].startsWith('>')) {
      const quoted = [];
      while (index < lines.length && lines[index].startsWith('>')) quoted.push(lines[index++].replace(/^> ?/, ''));
      blocks.push({ type: 'quote', blocks: parseMarkdown(quoted.join('\n')) });
      continue;
    }
    const list = matchListItem(lines[index]);
    if (list) {
      const parsed = parseList(lines, index, list.indent);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) paragraph.push(lines[index++]);
    blocks.push({ type: 'paragraph', inlines: parseInlines(paragraph.join('\n')) });
  }
  return blocks;
}

export function parseInlines(value) {
  const inlines = [];
  let index = 0;
  const text = (chunk) => {
    if (!chunk) return;
    const previous = inlines.at(-1);
    if (previous?.type === 'text') previous.value += chunk;
    else inlines.push({ type: 'text', value: chunk });
  };
  while (index < value.length) {
    if (value.startsWith('**', index)) {
      const end = value.indexOf('**', index + 2);
      if (end > index + 2) { inlines.push({ type: 'strong', inlines: parseInlines(value.slice(index + 2, end)) }); index = end + 2; continue; }
    }
    if (value[index] === '*') {
      const end = value.indexOf('*', index + 1);
      if (end > index + 1) { inlines.push({ type: 'emphasis', inlines: parseInlines(value.slice(index + 1, end)) }); index = end + 1; continue; }
    }
    if (value[index] === '`') {
      const end = value.indexOf('`', index + 1);
      if (end > index + 1) { inlines.push({ type: 'code', inlines: value.slice(index + 1, end) }); index = end + 1; continue; }
    }
    if (value[index] === '[') {
      const link = value.slice(index).match(/^\[([^\]]+)\]\(([^\s)]+)\)/);
      if (link && isSafeUrl(link[2])) { inlines.push({ type: 'link', url: link[2], inlines: parseInlines(link[1]) }); index += link[0].length; continue; }
    }
    text(value[index++]);
  }
  return inlines;
}

export function serializeMarkdown(blocks) {
  return blocks.map(serializeBlock).join('\n\n');
}

export function serializeInlines(inlines = []) {
  return inlines.map((inline) => {
    if (inline.type === 'text') return inline.value;
    if (inline.type === 'strong') return `**${serializeInlines(inline.inlines)}**`;
    if (inline.type === 'emphasis') return `*${serializeInlines(inline.inlines)}*`;
    if (inline.type === 'code') return `\`${typeof inline.inlines === 'string' ? inline.inlines : serializeInlines(inline.inlines)}\``;
    if (inline.type === 'link') return isSafeUrl(inline.url) ? `[${serializeInlines(inline.inlines)}](${inline.url})` : serializeInlines(inline.inlines);
    return '';
  }).join('');
}

export function renderMarkdown(markdown, options) {
  return renderBlocks(parseMarkdown(markdown), options);
}

export function renderBlocks(blocks, options = {}) {
  return blocks.map((block, index) => renderBlock(block, options, [index])).join('');
}

export function shouldShowMarkdownToggle(text, scrollHeight, collapsedHeight) {
  return String(text ?? '').trim().length > 120 && scrollHeight > collapsedHeight + 24;
}

/** Compatibility entry point for existing Extension previews. */
export const markdownToHTML = renderMarkdown;

export function detectMarkdownShortcut(value) {
  if (typeof value !== 'string' || !/^.* $/.test(value)) return null;
  if (/^#{1,6} $/.test(value)) return { type: 'heading', level: value.length - 1 };
  if (/^[-+*] \[ \] $/.test(value)) return { type: 'task', checked: false };
  if (/^[-+*] \[[xX]\] $/.test(value)) return { type: 'task', checked: true };
  if (/^[-+*] $/.test(value)) return { type: 'list', ordered: false };
  if (/^\d+[.)] $/.test(value)) return { type: 'list', ordered: true };
  return null;
}

export function toggleTaskItem(blocks, path) {
  const next = cloneBlocks(blocks);
  const item = taskAtPath(next, path);
  item.checked = !item.checked;
  return next;
}

export function cloneBlocks(blocks) {
  return JSON.parse(JSON.stringify(blocks));
}

function renderBlock(block, options, path) {
  if (block.type === 'heading') return `<h${Math.min(6, Math.max(1, block.level ?? 1))}>${renderInlines(block.inlines)}</h${Math.min(6, Math.max(1, block.level ?? 1))}>`;
  if (block.type === 'paragraph') return `<p>${renderInlines(block.inlines)}</p>`;
  if (block.type === 'quote') return `<blockquote>${(block.blocks ?? []).map((child, index) => renderBlock(child, options, [...path, index])).join('')}</blockquote>`;
  if (block.type === 'codeBlock') return `<pre><code${block.language ? ` class="language-${escapeHTML(block.language)}"` : ''}>${escapeHTML(block.value ?? '')}</code></pre>`;
  if (block.type === 'list' || block.type === 'taskList') return renderList(block, options, path);
  if (block.type === 'table') return renderTable(block);
  if (block.type === 'horizontalRule') return '<hr>';
  return '';
}

function renderList(block, options, path) {
  const tag = block.type === 'list' && block.ordered ? 'ol' : 'ul';
  const className = block.type === 'taskList' ? ' class="markdown-task-list"' : '';
  return `<${tag}${className}>${block.items.map((item, index) => {
    const itemPath = [...path, index];
    const task = block.type === 'taskList'
      ? `<input type="checkbox"${options.interactiveTasks ? ` data-markdown-task-path="${itemPath.join('.')}" data-markdown-task-checked="${item.checked}"` : ' disabled'}${item.checked ? ' checked' : ''}>`
      : '';
    return `<li>${task}${renderInlines(item.inlines)}${item.children.map((child) => renderBlock(child, options, itemPath)).join('')}</li>`;
  }).join('')}</${tag}>`;
}

function renderTable(table) {
  const row = (cells, tag) => `<tr>${table.header.map((_, index) => `<${tag} style="text-align:${table.alignments[index] ?? 'left'}">${renderInlines(cells[index] ?? [])}</${tag}>`).join('')}</tr>`;
  return `<table><thead>${row(table.header, 'th')}</thead><tbody>${table.rows.map((cells) => row(cells, 'td')).join('')}</tbody></table>`;
}

function renderInlines(inlines = []) {
  return inlines.map((inline) => {
    if (inline.type === 'text') return escapeHTML(inline.value);
    if (inline.type === 'strong') return `<strong>${renderInlines(inline.inlines)}</strong>`;
    if (inline.type === 'emphasis') return `<em>${renderInlines(inline.inlines)}</em>`;
    if (inline.type === 'code') return `<code>${escapeHTML(typeof inline.inlines === 'string' ? inline.inlines : serializeInlines(inline.inlines))}</code>`;
    if (inline.type === 'link') return isSafeUrl(inline.url) ? `<a href="${escapeHTML(inline.url)}" target="_blank" rel="noopener noreferrer">${renderInlines(inline.inlines)}</a>` : renderInlines(inline.inlines);
    return '';
  }).join('');
}

function serializeBlock(block) {
  if (block.type === 'heading') return `${'#'.repeat(block.level ?? 1)} ${serializeInlines(block.inlines)}`;
  if (block.type === 'paragraph') return serializeInlines(block.inlines);
  if (block.type === 'quote') return serializeMarkdown(block.blocks ?? []).split('\n').map((line) => line ? `> ${line}` : '>').join('\n');
  if (block.type === 'codeBlock') return `\`\`\`${block.language ?? ''}\n${block.value ?? ''}\n\`\`\``;
  if (block.type === 'list' || block.type === 'taskList') return block.items.map((item, index) => {
    const prefix = block.type === 'taskList' ? `- [${item.checked ? 'x' : ' '}] ` : `${block.ordered ? `${index + 1}.` : '-'} `;
    return [prefix + serializeInlines(item.inlines), ...item.children.flatMap((child) => serializeBlock(child).split('\n').map((line) => `  ${line}`))].join('\n');
  }).join('\n');
  if (block.type === 'table') return [
    block.header.map(serializeTableCell),
    block.alignments.map((alignment) => alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : '---'),
    ...block.rows.map((row) => row.map(serializeTableCell)),
  ].map((row) => `| ${row.join(' | ')} |`).join('\n');
  return '---';
}

function serializeTableCell(inlines) { return serializeInlines(inlines).replace(/\|/g, '\\|'); }
function isSafeUrl(url) { return /^https:\/\/[^\s]+$/i.test(url); }
function isHorizontalRule(line) { return /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line); }
function startsBlock(lines, index) { return /^```([^`]*)\s*$/.test(lines[index]) || /^(#{1,6})[ \t]+/.test(lines[index]) || isTableStart(lines, index) || isHorizontalRule(lines[index]) || lines[index].startsWith('>') || Boolean(matchListItem(lines[index])); }
function matchListItem(line) { const match = line.match(/^( *)([-+*]|\d+[.)])\s+(.*)$/); return !match || match[1].length % 2 ? null : { indent: match[1].length, ordered: /^\d/.test(match[2]), content: match[3] }; }
function parseTaskMarker(content) { const match = content.match(/^\[([ xX])\]\s+(.*)$/); return match ? { checked: match[1].toLowerCase() === 'x', content: match[2] } : null; }
function parseList(lines, start, indent) {
  const first = matchListItem(lines[start]); const task = parseTaskMarker(first.content); const items = []; let index = start;
  while (index < lines.length) {
    const current = matchListItem(lines[index]);
    if (!current || current.indent !== indent || current.ordered !== first.ordered || Boolean(parseTaskMarker(current.content)) !== Boolean(task)) break;
    const taskItem = parseTaskMarker(current.content);
    const item = task ? { checked: taskItem.checked, inlines: parseInlines(taskItem.content), children: [] } : { inlines: parseInlines(current.content), children: [] };
    items.push(item); index += 1;
    while (index < lines.length) { const child = matchListItem(lines[index]); if (!child || child.indent <= indent) break; const nested = parseList(lines, index, child.indent); item.children.push(nested.block); index = nested.next; }
  }
  return { block: task ? { type: 'taskList', items } : { type: 'list', ordered: first.ordered, items }, next: index };
}
function splitTableRow(line) {
  const trimmed = line.trim();
  const start = trimmed.startsWith('|') ? 1 : 0;
  const end = trimmed.endsWith('|') && !isEscapedPipe(trimmed, trimmed.length - 1) ? trimmed.length - 1 : trimmed.length;
  const cells = [];
  let cell = '';
  for (let index = start; index < end; index += 1) {
    if (trimmed[index] === '|' && !isEscapedPipe(trimmed, index)) { cells.push(cell.trim()); cell = ''; continue; }
    if (trimmed[index] === '|') cell = `${cell.slice(0, -1)}|`;
    else cell += trimmed[index];
  }
  cells.push(cell.trim());
  return cells;
}
function isEscapedPipe(value, index) { let backslashes = 0; for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) backslashes += 1; return backslashes % 2 === 1; }
function isTableStart(lines, index) { return Boolean(lines[index]?.includes('|') && lines[index + 1]?.includes('|') && splitTableRow(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))); }
function parseTable(lines, start) { const header = splitTableRow(lines[start]).map(parseInlines); const alignments = splitTableRow(lines[start + 1]).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left'); const rows = []; let index = start + 2; while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { const row = splitTableRow(lines[index++]).slice(0, header.length); while (row.length < header.length) row.push(''); rows.push(row.map(parseInlines)); } return { block: { type: 'table', header, alignments, rows }, next: index }; }
function taskAtPath(blocks, path) {
  let block = blocks[path[0]]; let cursor = 1;
  while (block?.type === 'quote') block = block.blocks?.[path[cursor++]];
  while (block && (block.type === 'list' || block.type === 'taskList')) { const item = block.items[path[cursor++]]; if (cursor === path.length) return item; block = item?.children.find((child) => ['list', 'taskList', 'quote'].includes(child.type)); while (block?.type === 'quote') block = block.blocks?.[path[cursor++]]; }
  throw new RangeError('Path does not reference a task item');
}
