function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function inline(value: string): string {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return text;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${paragraph.map(inline).join('<br />')}</p>`); paragraph = []; } };
  const flushList = () => { if (list) { output.push(`</${list}>`); list = null; } };
  const flushCode = () => { if (code) { output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; } };

  for (const line of lines) {
    if (line.trim().startsWith('```')) { if (code) flushCode(); else { flushParagraph(); flushList(); code = []; } continue; }
    if (code) { code.push(line); continue; }
    if (/^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      flushParagraph(); flushList();
      output.push('<hr />');
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); const level = heading[1].length; output.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) { flushParagraph(); const next = unordered ? 'ul' : 'ol'; if (list !== next) { flushList(); list = next; output.push(`<${list}>`); } output.push(`<li>${inline((unordered ?? ordered)![1])}</li>`); continue; }
    if (/^>\s?/.test(line)) { flushParagraph(); flushList(); output.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    paragraph.push(line);
  }
  flushCode(); flushParagraph(); flushList();
  return output.join('');
}
