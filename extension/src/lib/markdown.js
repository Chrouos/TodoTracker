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
