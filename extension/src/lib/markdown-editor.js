const DEFAULT_MODE = 'toolbar';

export function normalizeMarkdownEditorMode(mode) {
  return mode === 'source' ? 'source' : DEFAULT_MODE;
}

function wrapSelection(value, start, end, marker, placeholder) {
  const selected = value.slice(start, end) || placeholder;
  const replacement = `${marker}${selected}${marker}`;
  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + selected.length,
  };
}

function prefixLines(value, start, end, prefix) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const selectedEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const selected = value.slice(lineStart, selectedEnd);
  const lines = selected.split('\n');
  const replacement = lines.map((line) => `${prefix}${line}`).join('\n');
  const added = prefix.length * lines.length;
  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(selectedEnd)}`,
    selectionStart: start + prefix.length,
    selectionEnd: end + added,
  };
}

export function formatMarkdownSelection(value, start, end, command) {
  const text = String(value ?? '');
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  if (command === 'bold') return wrapSelection(text, safeStart, safeEnd, '**', '粗體文字');
  if (command === 'italic') return wrapSelection(text, safeStart, safeEnd, '*', '斜體文字');
  if (command === 'code') return wrapSelection(text, safeStart, safeEnd, '`', '程式碼');
  if (command === 'heading') return prefixLines(text, safeStart, safeEnd, '## ');
  if (command === 'unordered-list') return prefixLines(text, safeStart, safeEnd, '- ');
  if (command === 'ordered-list') return prefixLines(text, safeStart, safeEnd, '1. ');
  if (command === 'quote') return prefixLines(text, safeStart, safeEnd, '> ');
  if (command === 'link') {
    const selected = text.slice(safeStart, safeEnd) || '連結文字';
    const replacement = `[${selected}](https://)`;
    const urlStart = safeStart + selected.length + 3;
    return {
      value: `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`,
      selectionStart: urlStart,
      selectionEnd: urlStart + 8,
    };
  }
  return { value: text, selectionStart: safeStart, selectionEnd: safeEnd };
}
