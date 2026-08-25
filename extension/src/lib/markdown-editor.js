import {
  cloneBlocks,
  detectMarkdownShortcut,
  parseMarkdown,
  serializeMarkdown,
  toggleTaskItem,
} from './markdown.js';

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
  if (command === 'todo') return prefixLines(text, safeStart, safeEnd, '- [ ] ');
  if (command === 'table') {
    const replacement = '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |';
    return {
      value: `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`,
      selectionStart: safeStart + 2,
      selectionEnd: safeStart + 10,
    };
  }
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

export function markdownShortcutToBlock(value) {
  const shortcut = detectMarkdownShortcut(value);
  if (!shortcut) return null;
  if (shortcut.type === 'heading') return { type: 'heading', level: shortcut.level, inlines: [] };
  if (shortcut.type === 'task') return { type: 'taskList', items: [{ checked: shortcut.checked, inlines: [], children: [] }] };
  return { type: 'list', ordered: shortcut.ordered, items: [{ inlines: [], children: [] }] };
}

export function serializeTaskCheckboxToggle(markdown, pathLabel) {
  if (!/^\d+(?:\.\d+)+$/.test(String(pathLabel ?? ''))) return String(markdown ?? '');
  try {
    return serializeMarkdown(toggleTaskItem(parseMarkdown(markdown), String(pathLabel).split('.').map(Number)));
  } catch {
    return String(markdown ?? '');
  }
}

const inlineText = (inlines = []) => inlines.map((inline) => {
  if (inline.type === 'text') return inline.value;
  return typeof inline.inlines === 'string' ? inline.inlines : inlineText(inline.inlines);
}).join('');

const textInlines = (value) => value ? [{ type: 'text', value }] : [];

function pathLabel(path) {
  return path.join('.');
}

function parsePath(value) {
  return /^\d+(?:\.\d+)*$/.test(String(value ?? '')) ? String(value).split('.').map(Number) : null;
}

function findBlockAtPath(blocks, path) {
  let container = blocks;
  for (let index = 0; index < path.length; index += 1) {
    const block = container[path[index]];
    if (!block) return null;
    if (index === path.length - 1) return block;
    if (block.type !== 'quote') return null;
    container = block.blocks ?? [];
  }
  return null;
}

function updateBlockAtPath(blocks, path, updater) {
  const next = cloneBlocks(blocks);
  let container = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    const block = container[path[index]];
    if (!block || block.type !== 'quote') return next;
    container = block.blocks ?? [];
  }
  const index = path.at(-1);
  if (container[index]) container[index] = updater(container[index]);
  return next;
}

function updateListItemAtPath(blocks, path, updater) {
  const next = cloneBlocks(blocks);
  const visit = (block, rest) => {
    if (block?.type === 'quote') return visit(block.blocks?.[rest.shift()], rest);
    if (!block || !['list', 'taskList'].includes(block.type)) return;
    const item = block.items[rest.shift()];
    if (!item) return;
    if (!rest.length) { item.inlines = updater(item.inlines); return; }
    visit(item.children.find((child) => ['list', 'taskList', 'quote'].includes(child.type)), rest);
  };
  visit(next[path[0]], path.slice(1));
  return next;
}

function renderBlocks(container, blocks) {
  container.replaceChildren(...blocks.map((block, index) => renderBlock(block, [index])));
}

function surface(kind, path, value, extra = {}) {
  const element = document.createElement('div');
  element.className = 'markdown-editor-surface';
  element.contentEditable = 'true';
  element.spellcheck = true;
  element.dataset.editorSurface = 'true';
  element.dataset.editorKind = kind;
  element.dataset.blockPath = pathLabel(path);
  Object.entries(extra).forEach(([key, entry]) => { element.dataset[key] = String(entry); });
  element.textContent = value;
  return element;
}

function renderBlock(block, path) {
  if (block.type === 'paragraph' || block.type === 'heading') {
    const element = document.createElement(block.type === 'heading' ? `h${Math.min(6, Math.max(1, block.level ?? 1))}` : 'p');
    element.className = 'markdown-editor-block';
    element.appendChild(surface('block', path, inlineText(block.inlines)));
    return element;
  }
  if (block.type === 'quote') {
    const element = document.createElement('blockquote');
    element.className = 'markdown-editor-block';
    (block.blocks ?? []).forEach((child, index) => element.appendChild(renderBlock(child, [...path, index])));
    return element;
  }
  if (block.type === 'codeBlock') {
    const pre = document.createElement('pre'); const code = document.createElement('code');
    pre.className = 'markdown-editor-block'; code.appendChild(surface('code', path, block.value ?? ''));
    pre.appendChild(code); return pre;
  }
  if (block.type === 'list' || block.type === 'taskList') {
    const list = document.createElement(block.type === 'list' && block.ordered ? 'ol' : 'ul');
    list.className = `markdown-editor-block${block.type === 'taskList' ? ' markdown-task-list' : ''}`;
    block.items.forEach((item, index) => {
      const itemPath = [...path, index]; const li = document.createElement('li');
      if (block.type === 'taskList') {
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = item.checked;
        checkbox.dataset.markdownEditorTask = 'true'; checkbox.dataset.markdownTaskPath = pathLabel(itemPath); li.appendChild(checkbox);
      }
      li.appendChild(surface('list-item', itemPath, inlineText(item.inlines)));
      item.children.forEach((child) => li.appendChild(renderBlock(child, itemPath)));
      list.appendChild(li);
    });
    return list;
  }
  if (block.type === 'table') {
    const wrap = document.createElement('div'); const table = document.createElement('table'); const head = document.createElement('thead'); const body = document.createElement('tbody'); const headerRow = document.createElement('tr');
    wrap.className = 'markdown-editor-table-wrap'; table.className = 'markdown-editor-block';
    block.header.forEach((cell, column) => { const th = document.createElement('th'); th.appendChild(surface('table-cell', path, inlineText(cell), { tableSection: 'header', tableRow: 0, tableColumn: column })); headerRow.appendChild(th); });
    head.appendChild(headerRow);
    block.rows.forEach((row, rowIndex) => { const tr = document.createElement('tr'); row.forEach((cell, column) => { const td = document.createElement('td'); td.appendChild(surface('table-cell', path, inlineText(cell), { tableSection: 'body', tableRow: rowIndex, tableColumn: column })); tr.appendChild(td); }); body.appendChild(tr); });
    table.append(head, body); wrap.appendChild(table); return wrap;
  }
  return document.createElement('hr');
}

/**
 * Mount the native block editor while preserving the textarea as the public
 * compatibility source for forms, auto-grow listeners, and external callers.
 */
export function mountMarkdownEditor(textarea, { mode, onChange } = {}) {
  if (!textarea?.parentNode) throw new TypeError('mountMarkdownEditor requires a connected textarea');
  const editorMode = normalizeMarkdownEditorMode(mode);
  const parent = textarea.parentNode;
  const marker = document.createComment('markdown-editor');
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-editor';
  wrapper.dataset.editorMode = editorMode;
  wrapper.classList.toggle('is-source', editorMode === 'source');
  parent.insertBefore(marker, textarea);
  parent.insertBefore(wrapper, textarea);
  wrapper.appendChild(textarea);
  let blocks = parseMarkdown(textarea.value);
  let content = null;
  let composing = false;
  let activeSurface = null;

  const emit = () => {
    textarea.value = serializeMarkdown(blocks);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    onChange?.(textarea.value);
  };
  const refresh = () => { if (content) renderBlocks(content, blocks); };
  const commitSurface = (element, refreshAfter = false) => {
    const path = parsePath(element.dataset.blockPath);
    if (!path) return;
    const kind = element.dataset.editorKind;
    const value = element.textContent ?? '';
    if (kind === 'list-item') blocks = updateListItemAtPath(blocks, path, () => textInlines(value));
    else if (kind === 'code') blocks = updateBlockAtPath(blocks, path, (block) => block.type === 'codeBlock' ? { ...block, value } : block);
    else if (kind === 'table-cell') {
      blocks = updateBlockAtPath(blocks, path, (block) => {
        if (block.type !== 'table') return block;
        const cells = element.dataset.tableSection === 'header' ? block.header : block.rows[Number(element.dataset.tableRow)];
        const column = Number(element.dataset.tableColumn);
        if (cells?.[column]) cells[column] = textInlines(value);
        return block;
      });
    } else {
      const current = findBlockAtPath(blocks, path);
      const converted = current && ['paragraph', 'heading'].includes(current.type) ? markdownShortcutToBlock(value) : null;
      blocks = updateBlockAtPath(blocks, path, (block) => converted || ((block.type === 'paragraph' || block.type === 'heading') ? { ...block, inlines: textInlines(value) } : block));
      if (converted) refreshAfter = true;
    }
    emit();
    if (refreshAfter) refresh();
  };
  const focusPath = (path) => requestAnimationFrame(() => content?.querySelector(`[data-editor-surface="true"][data-block-path="${pathLabel(path)}"]`)?.focus());
  const applyCommand = (command) => {
    const target = activeSurface && parsePath(activeSurface.dataset.blockPath);
    const path = target ?? [0];
    const current = findBlockAtPath(blocks, path);
    if (!current || !['paragraph', 'heading'].includes(current.type)) return;
    const inlines = current.inlines;
    blocks = updateBlockAtPath(blocks, path, () => {
      if (command === 'paragraph') return { type: 'paragraph', inlines };
      if (command === 'heading') return { type: 'heading', level: 2, inlines };
      if (command === 'unordered-list') return { type: 'list', ordered: false, items: [{ inlines, children: [] }] };
      if (command === 'ordered-list') return { type: 'list', ordered: true, items: [{ inlines, children: [] }] };
      if (command === 'todo') return { type: 'taskList', items: [{ checked: false, inlines, children: [] }] };
      if (command === 'quote') return { type: 'quote', blocks: [{ type: 'paragraph', inlines }] };
      if (command === 'code') return { type: 'codeBlock', value: inlineText(inlines) };
      if (command === 'table') return { type: 'table', header: [textInlines('Column 1'), textInlines('Column 2')], alignments: ['left', 'left'], rows: [[[], []]] };
      return { type: 'horizontalRule' };
    });
    emit(); refresh(); focusPath(path);
  };
  const onClick = (event) => {
    const button = event.target.closest('[data-markdown-command]');
    if (button && wrapper.contains(button)) { event.preventDefault(); applyCommand(button.dataset.markdownCommand); return; }
    const checkbox = event.target.closest('[data-markdown-editor-task]');
    if (!checkbox || !wrapper.contains(checkbox)) return;
    const path = parsePath(checkbox.dataset.markdownTaskPath);
    if (!path) return;
    try { blocks = toggleTaskItem(blocks, path); emit(); refresh(); } catch { refresh(); }
  };
  const onInput = (event) => {
    const element = event.target.closest?.('[data-editor-surface="true"]');
    if (!element || composing) return;
    activeSurface = element; commitSurface(element);
  };
  const onComposition = (event) => {
    const element = event.target.closest?.('[data-editor-surface="true"]');
    composing = event.type === 'compositionstart';
    if (event.type === 'compositionend' && element) { activeSurface = element; commitSurface(element); }
  };
  const onKeyDown = (event) => {
    const element = event.target.closest?.('[data-editor-surface="true"]');
    if (!element || composing || event.key !== 'Enter') return;
    const path = parsePath(element.dataset.blockPath);
    if (!path || element.dataset.editorKind !== 'block' || path.length !== 1) return;
    event.preventDefault();
    const index = path[0]; const current = blocks[index];
    if (!current || !['paragraph', 'heading'].includes(current.type)) return;
    const value = element.textContent ?? '';
    blocks.splice(index, 1, { ...current, inlines: textInlines(value) }, { type: 'paragraph', inlines: [] });
    emit(); refresh(); focusPath([index + 1]);
  };

  if (editorMode === 'toolbar') {
    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-editor-toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Markdown editor');
    [['paragraph', 'P', 'Paragraph'], ['heading', 'H2', 'Heading'], ['unordered-list', '•', 'List'], ['ordered-list', '1.', 'Ordered list'], ['todo', '☐', 'Todo'], ['quote', '❞', 'Quote'], ['code', '</>', 'Code'], ['table', '▦', 'Table'], ['rule', '—', 'Rule']].forEach(([command, label, title]) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.markdownCommand = command; button.title = title; button.setAttribute('aria-label', title); button.textContent = label; toolbar.appendChild(button);
    });
    content = document.createElement('div'); content.className = 'markdown-editor-content'; content.dataset.markdownEditorBlocks = 'true';
    wrapper.append(toolbar, content); refresh();
    wrapper.addEventListener('click', onClick);
    wrapper.addEventListener('input', onInput);
    wrapper.addEventListener('compositionstart', onComposition);
    wrapper.addEventListener('compositionend', onComposition);
    wrapper.addEventListener('keydown', onKeyDown);
  }

  return {
    destroy() {
      wrapper.removeEventListener('click', onClick); wrapper.removeEventListener('input', onInput);
      wrapper.removeEventListener('compositionstart', onComposition); wrapper.removeEventListener('compositionend', onComposition); wrapper.removeEventListener('keydown', onKeyDown);
      if (marker.parentNode) marker.replaceWith(textarea);
      else wrapper.replaceWith(textarea);
    },
    focus() { if (editorMode === 'source') textarea.focus(); else content?.querySelector('[data-editor-surface="true"]')?.focus(); },
    insertText(text) {
      if (!text) return;
      if (editorMode === 'source') {
        const start = textarea.selectionStart; const end = textarea.selectionEnd;
        textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
        textarea.setSelectionRange(start + text.length, start + text.length);
        textarea.dispatchEvent(new Event('input', { bubbles: true })); onChange?.(textarea.value); return;
      }
      const target = activeSurface || content?.querySelector('[data-editor-surface="true"]');
      if (!target) return;
      target.textContent = `${target.textContent ?? ''}${text}`; activeSurface = target; commitSurface(target);
    },
  };
}
