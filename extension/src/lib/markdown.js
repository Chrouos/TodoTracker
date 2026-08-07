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

const inline = (value) => String(value ?? '').split(/(`[^`]+`)/g)
  .map((part, index) => (index % 2 ? `<code>${escapeHTML(part.slice(1, -1))}</code>` : inlineText(part)))
  .join('');

export function markdownToHTML(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const result = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let code = null;
  const flushParagraph = () => { if (paragraph.length) { result.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; } };
  const flushList = () => { if (list) { result.push(`</${list}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { result.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; } };
  const flushCode = () => { if (code) { result.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`); code = null; } };
  for (const line of lines) {
    if (/^ {0,3}```/.test(line)) { if (code) flushCode(); else { flushParagraph(); flushList(); flushQuote(); code = []; } continue; }
    if (code) { code.push(line); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); flushQuote(); const level = heading[1].length; result.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    const item = /^\s*([-*+]\s+|\d+\.\s+)(.+)$/.exec(line);
    if (item) { flushParagraph(); flushQuote(); const next = /^\s*\d+\./.test(line) ? 'ol' : 'ul'; if (list !== next) { flushList(); list = next; result.push(`<${list}>`); } result.push(`<li>${inline(item[2])}</li>`); continue; }
    if (/^>\s?/.test(line)) { flushParagraph(); flushList(); quote.push(line.replace(/^>\s?/, '')); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue; }
    flushList();
    flushQuote();
    paragraph.push(line);
  }
  flushCode(); flushParagraph(); flushList(); flushQuote();
  return result.join('');
}
