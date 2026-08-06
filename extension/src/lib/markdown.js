const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const inline = (value) => {
  let text = escapeHTML(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return text;
};

export function markdownToHTML(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const result = []; let paragraph = []; let list = null; let code = null;
  const flushParagraph = () => { if (paragraph.length) { result.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; } };
  const flushList = () => { if (list) { result.push(`</${list}>`); list = null; } };
  const flushCode = () => { if (code) { result.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`); code = null; } };
  for (const line of lines) {
    if (line.trim().startsWith('```')) { if (code) flushCode(); else { flushParagraph(); flushList(); code = []; } continue; }
    if (code) { code.push(line); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); const level = heading[1].length; result.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    const item = /^\s*([-*+]\s+|\d+\.\s+)(.+)$/.exec(line);
    if (item) { flushParagraph(); const next = /^\s*\d+\./.test(line) ? 'ol' : 'ul'; if (list !== next) { flushList(); list = next; result.push(`<${list}>`); } result.push(`<li>${inline(item[2])}</li>`); continue; }
    if (/^>\s?/.test(line)) { flushParagraph(); flushList(); result.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    paragraph.push(line);
  }
  flushCode(); flushParagraph(); flushList();
  return result.join('');
}
