const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const inlineText = (value) => {
  let text = escapeHTML(value);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return text;
};

const inline = (value) => {
  const text = String(value ?? '');
  const parts = [];
  const codePattern = /`([^`\n]+)`/g;
  let cursor = 0;
  let match;
  while ((match = codePattern.exec(text))) {
    if (match.index > cursor) parts.push(inlineText(text.slice(cursor, match.index)));
    parts.push(`<code>${escapeHTML(match[1])}</code>`);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(inlineText(text.slice(cursor)));
  return parts.join('');
};

export function shouldShowMarkdownToggle(text, scrollHeight, collapsedHeight) {
  return String(text ?? '').trim().length > 120 && scrollHeight > collapsedHeight + 24;
}

function renderNestedList(lines) {
  const root = [];
  const stack = [];
  for (const line of lines) {
    const match = /^(\s*)([-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, '    ').length;
    const marker = match[2].trim();
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const items = stack.length ? stack[stack.length - 1].item.children : root;
    const item = { marker, text: match[3], children: [] };
    items.push(item);
    stack.push({ indent, item });
  }
  const render = (items, key) => {
    if (!items.length) return '';
    const tag = /^\d/.test(items[0].marker) ? 'ol' : 'ul';
    return `<${tag}>${items.map((item, index) => {
      const task = /^\[([ xX])\]\s+(.+)$/.exec(item.text);
      const body = task
        ? `<input class="task-checkbox" type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}> ${inline(task[2])}`
        : inline(item.text);
      return `<li>${body}${render(item.children, `${key}-${index}`)}</li>`;
    }).join('')}</${tag}>`;
  };
  return render(root, 'list');
}

function splitTableRow(line) {
  const text = line.trim();
  const inner = text.startsWith('|') ? text.slice(1) : text;
  const withoutTrailing = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return withoutTrailing.split('|').map((cell) => cell.trim());
}

function tableAlignment(cell) {
  const value = cell.trim();
  if (/^:-{3,}:$/.test(value)) return 'center';
  if (/^-{3,}:$/.test(value)) return 'right';
  return 'left';
}

function isTableSeparator(line, columnCount) {
  if (!line.includes('|')) return false;
  const cells = splitTableRow(line);
  return cells.length === columnCount && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTable(lines) {
  const header = splitTableRow(lines[0]);
  const separator = splitTableRow(lines[1]);
  const aligns = separator.map(tableAlignment);
  const row = (cells, tag) => {
    const padded = [...cells, ...Array(Math.max(0, header.length - cells.length)).fill('')].slice(0, header.length);
    return `<tr>${padded.map((cell, index) => `<${tag} style="text-align:${aligns[index]}">${inline(cell)}</${tag}>`).join('')}</tr>`;
  };
  return `<table><thead>${row(header, 'th')}</thead><tbody>${lines.slice(2).map((line) => row(splitTableRow(line), 'td')).join('')}</tbody></table>`;
}

export function markdownToHTML(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const result = [];
  let paragraph = [];
  let quote = [];
  let code = null;
  const flushParagraph = () => { if (paragraph.length) { result.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; } };
  const flushQuote = () => { if (quote.length) { result.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; } };
  const flushCode = () => { if (code) { result.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`); code = null; } };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^ {0,3}```/.test(line)) { if (code) flushCode(); else { flushParagraph(); flushQuote(); code = []; } continue; }
    if (code) { code.push(line); continue; }
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1], splitTableRow(line).length)) {
      flushParagraph(); flushQuote();
      const tableLines = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) tableLines.push(lines[i++]);
      i -= 1;
      result.push(renderTable(tableLines));
      continue;
    }
    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph(); flushQuote();
      result.push('<hr />');
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushQuote(); const level = heading[1].length; result.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph(); flushQuote();
      const listLines = [];
      while (i < lines.length && (/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) || !lines[i].trim())) listLines.push(lines[i++]);
      i -= 1;
      result.push(renderNestedList(listLines));
      continue;
    }
    if (/^>\s?/.test(line)) { flushParagraph(); quote.push(line.replace(/^>\s?/, '')); continue; }
    if (!line.trim()) { flushParagraph(); flushQuote(); continue; }
    flushQuote();
    paragraph.push(line);
  }
  flushCode(); flushParagraph(); flushQuote();
  return result.join('');
}
