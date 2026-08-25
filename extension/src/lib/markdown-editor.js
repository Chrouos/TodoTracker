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

export const inlineText = (inlines = []) => inlines.map((inline) => {
  if (inline.type === 'text') return inline.value;
  return typeof inline.inlines === 'string' ? inline.inlines : inlineText(inline.inlines);
}).join('');

const textInlines = (value) => value ? [{ type: 'text', value }] : [];

export function blocksFromMarkdown(value) {
  const blocks = parseMarkdown(value);
  return blocks.length ? blocks : [{ type: 'paragraph', inlines: [] }];
}

export function updateInlinesForTextInput(inlines, nextText) {
  const currentText = inlineText(inlines);
  if (currentText === nextText) return inlines;
  let start = 0;
  while (start < currentText.length && start < nextText.length && currentText[start] === nextText[start]) start += 1;
  let currentEnd = currentText.length;
  let nextEnd = nextText.length;
  while (currentEnd > start && nextEnd > start && currentText[currentEnd - 1] === nextText[nextEnd - 1]) { currentEnd -= 1; nextEnd -= 1; }
  return replaceInlineRange(inlines, start, currentEnd, nextText.slice(start, nextEnd));
}

export function splitTextBlockAtOffset(blocks, path, offset) {
  const next = cloneBlocks(blocks);
  const location = textBlockLocation(next, path);
  if (!location) return { blocks: next, nextPath: path };
  const { container, index, block } = location;
  if (!inlineText(block.inlines).length) {
    if (block.type === 'heading') { container[index] = { type: 'paragraph', inlines: [] }; return { blocks: next, nextPath: path }; }
    container.splice(index + 1, 0, { type: 'paragraph', inlines: [] });
    return { blocks: next, nextPath: [...path.slice(0, -1), index + 1] };
  }
  const [before, after] = splitInlinesAtOffset(block.inlines, offset);
  container.splice(index, 1, { ...block, inlines: before }, { ...block, inlines: after });
  return { blocks: next, nextPath: [...path.slice(0, -1), index + 1] };
}

function textBlockLocation(blocks, path) {
  let container = blocks;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth]; const block = container[index];
    if (!block) return null;
    if (depth === path.length - 1) return ['paragraph', 'heading'].includes(block.type) ? { container, index, block } : null;
    if (block.type !== 'quote') return null;
    container = block.blocks ?? [];
  }
  return null;
}

function replaceInlineRange(inlines, start, end, replacement) {
  let cursor = 0;
  for (const inline of inlines) {
    const length = inlineText([inline]).length;
    if (start >= cursor && end <= cursor + length && inline.type !== 'text') {
      if (inline.type === 'code' && typeof inline.inlines === 'string') return replaceInline(inlines, inline, { ...inline, inlines: `${inline.inlines.slice(0, start - cursor)}${replacement}${inline.inlines.slice(end - cursor)}` });
      if (typeof inline.inlines !== 'string') return replaceInline(inlines, inline, { ...inline, inlines: replaceInlineRange(inline.inlines, start - cursor, end - cursor, replacement) });
    }
    cursor += length;
  }
  const [before, rest] = splitInlinesAtOffset(inlines, start);
  const [, after] = splitInlinesAtOffset(rest, Math.max(0, end - start));
  return mergeInlines([...before, ...(replacement ? [{ type: 'text', value: replacement }] : []), ...after]);
}

function replaceInline(inlines, target, replacement) { return inlines.map((inline) => inline === target ? replacement : cloneInline(inline)); }
function splitInlinesAtOffset(inlines, offset) {
  const left = []; const right = []; let cursor = 0;
  for (const inline of inlines) {
    const length = inlineText([inline]).length;
    if (offset <= cursor) right.push(cloneInline(inline));
    else if (offset >= cursor + length) left.push(cloneInline(inline));
    else { const [before, after] = splitInline(inline, offset - cursor); if (before) left.push(before); if (after) right.push(after); }
    cursor += length;
  }
  return [mergeInlines(left), mergeInlines(right)];
}
function splitInline(inline, offset) {
  if (inline.type === 'text') return [inline.value.slice(0, offset) ? { type: 'text', value: inline.value.slice(0, offset) } : null, inline.value.slice(offset) ? { type: 'text', value: inline.value.slice(offset) } : null];
  if (inline.type === 'code' && typeof inline.inlines === 'string') return [inline.inlines.slice(0, offset) ? { ...inline, inlines: inline.inlines.slice(0, offset) } : null, inline.inlines.slice(offset) ? { ...inline, inlines: inline.inlines.slice(offset) } : null];
  if (typeof inline.inlines === 'string') return [cloneInline(inline), null];
  const [before, after] = splitInlinesAtOffset(inline.inlines, offset);
  return [before.length ? { ...inline, inlines: before } : null, after.length ? { ...inline, inlines: after } : null];
}
function mergeInlines(inlines) { const output = []; for (const inline of inlines) { const previous = output.at(-1); if (inline.type === 'text' && previous?.type === 'text') previous.value += inline.value; else output.push(cloneInline(inline)); } return output; }
function cloneInline(inline) { return inline.type === 'text' ? { ...inline } : typeof inline.inlines === 'string' ? { ...inline } : { ...inline, inlines: inline.inlines.map(cloneInline) }; }

function pathLabel(path) {
  return path.join('.');
}

function parsePath(value) {
  return /^\d+(?:\.\d+)*$/.test(String(value ?? '')) ? String(value).split('.').map(Number) : null;
}

function caretOffset(surface) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return (surface.textContent ?? '').length;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.startContainer)) return (surface.textContent ?? '').length;
  const before = range.cloneRange(); before.selectNodeContents(surface); before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function selectionOffsets(surface) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return null;
  const before = range.cloneRange(); before.selectNodeContents(surface); before.setEnd(range.startContainer, range.startOffset);
  return { start: before.toString().length, end: before.toString().length + range.toString().length, range };
}

function setSurfaceSelection(surface, start, end = start) {
  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  let cursor = 0; let startNode = null; let endNode = null; let startOffset = 0; let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode; const length = node.textContent.length;
    if (!startNode && start <= cursor + length) { startNode = node; startOffset = Math.max(0, start - cursor); }
    if (!endNode && end <= cursor + length) { endNode = node; endOffset = Math.max(0, end - cursor); break; }
    cursor += length;
  }
  if (!startNode) { surface.focus(); return; }
  const range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(endNode ?? startNode, endNode ? endOffset : startOffset);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); surface.focus();
}

function wrapInlineRange(inlines, start, end, type) {
  const [before, rest] = splitInlinesAtOffset(inlines, start);
  const [selected, after] = splitInlinesAtOffset(rest, Math.max(0, end - start));
  if (!selected.length) return inlines;
  const wrapper = type === 'link' ? { type: 'link', url: 'https://', inlines: selected } : { type, inlines: selected };
  return [...before, wrapper, ...after];
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
    const candidates = item.children.filter((child) => ['list', 'taskList', 'quote'].includes(child.type));
    visit(candidates.length === 1 ? candidates[0] : item.children[rest.shift()], rest);
  };
  visit(next[path[0]], path.slice(1));
  return next;
}

function listLocation(blocks, path) {
  const descend = (block, container, containerIndex, rest, parent, parentPath) => {
    if (block?.type === 'quote') return descend(block.blocks?.[rest.shift()], block.blocks ?? [], rest[0], rest, null, parentPath);
    if (!block || !['list', 'taskList'].includes(block.type)) return null;
    const index = rest.shift(); const item = block.items[index];
    if (!item) return null;
    if (!rest.length) return { block, container, containerIndex, index, item, parent, path: parentPath };
    const candidates = item.children.filter((child) => ['list', 'taskList', 'quote'].includes(child.type));
    const childIndex = candidates.length === 1 ? item.children.indexOf(candidates[0]) : rest.shift();
    return descend(item.children[childIndex], item.children, childIndex, rest, { block, index, item, container, containerIndex, childIndex }, [...parentPath, index]);
  };
  return descend(blocks[path[0]], blocks, path[0], path.slice(1), null, [path[0]]);
}

function emptyListItem(item) { return !item.children.length && !inlineText(item.inlines); }

export function continueListItem(blocks, path) {
  const next = cloneBlocks(blocks); const location = listLocation(next, path);
  if (!location) return next;
  location.block.items.splice(location.index + 1, 0, location.block.type === 'taskList' ? { checked: false, inlines: [], children: [] } : { inlines: [], children: [] });
  return next;
}

export function exitEmptyListItem(blocks, path) {
  const next = cloneBlocks(blocks); const location = listLocation(next, path);
  if (!location || !emptyListItem(location.item)) return next;
  location.block.items.splice(location.index, 1);
  location.container.splice(location.containerIndex + 1, 0, { type: 'paragraph', inlines: [] });
  if (!location.block.items.length) location.container.splice(location.containerIndex, 1);
  return next;
}

export function indentListItem(blocks, path, direction) {
  const next = cloneBlocks(blocks); const location = listLocation(next, path);
  if (!location) return next;
  if (direction === 'in') {
    if (!location.index) return next;
    const previous = location.block.items[location.index - 1];
    let child = previous.children.find((entry) => entry.type === location.block.type);
    if (!child) { child = { type: location.block.type, ...(location.block.type === 'list' ? { ordered: location.block.ordered } : {}), items: [] }; previous.children.push(child); }
    child.items.push(location.block.items.splice(location.index, 1)[0]);
  } else if (location.parent) {
    location.block.items.splice(location.index, 1);
    location.parent.block.items.splice(location.parent.index + 1, 0, location.item);
    if (!location.block.items.length) location.parent.item.children.splice(location.containerIndex, 1);
  }
  return next;
}

export function listItemPathAfterIndent(blocks, path, direction) {
  const location = listLocation(blocks, path);
  if (!location) return path;
  if (direction === 'out') return location.parent ? [...location.path.slice(0, -1), location.parent.index + 1] : path;
  return location.index ? [...location.path, location.index - 1, 0] : path;
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
  if (Array.isArray(value)) appendInlines(element, value);
  else element.textContent = value;
  return element;
}

function appendInlines(parent, inlines) {
  inlines.forEach((inline) => {
    if (inline.type === 'text') { parent.append(document.createTextNode(inline.value)); return; }
    const tag = inline.type === 'strong' ? 'strong' : inline.type === 'emphasis' ? 'em' : inline.type === 'code' ? 'code' : inline.type === 'link' ? 'a' : null;
    if (!tag) return;
    const element = document.createElement(tag);
    if (inline.type === 'link') { element.href = inline.url; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
    if (typeof inline.inlines === 'string') element.textContent = inline.inlines;
    else appendInlines(element, inline.inlines);
    parent.append(element);
  });
}

function renderBlock(block, path) {
  if (block.type === 'paragraph' || block.type === 'heading') {
    const element = document.createElement(block.type === 'heading' ? `h${Math.min(6, Math.max(1, block.level ?? 1))}` : 'p');
    element.className = 'markdown-editor-block';
    element.appendChild(surface('block', path, block.inlines));
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
      li.appendChild(surface('list-item', itemPath, item.inlines));
      const listChildren = item.children.filter((child) => ['list', 'taskList', 'quote'].includes(child.type));
      item.children.forEach((child, childIndex) => li.appendChild(renderBlock(child, listChildren.length > 1 ? [...itemPath, childIndex] : itemPath)));
      list.appendChild(li);
    });
    return list;
  }
  if (block.type === 'table') {
    const wrap = document.createElement('div'); const table = document.createElement('table'); const head = document.createElement('thead'); const body = document.createElement('tbody'); const headerRow = document.createElement('tr');
    wrap.className = 'markdown-editor-table-wrap'; table.className = 'markdown-editor-block';
    block.header.forEach((cell, column) => { const th = document.createElement('th'); th.appendChild(surface('table-cell', path, cell, { tableSection: 'header', tableRow: 0, tableColumn: column })); headerRow.appendChild(th); });
    head.appendChild(headerRow);
    block.rows.forEach((row, rowIndex) => { const tr = document.createElement('tr'); row.forEach((cell, column) => { const td = document.createElement('td'); td.appendChild(surface('table-cell', path, cell, { tableSection: 'body', tableRow: rowIndex, tableColumn: column })); tr.appendChild(td); }); body.appendChild(tr); });
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
  let blocks = blocksFromMarkdown(textarea.value);
  let content = null;
  let composing = false;
  let activeSurface = null;
  let emitting = false;

  const emit = () => {
    textarea.value = serializeMarkdown(blocks);
    emitting = true;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    emitting = false;
    onChange?.(textarea.value);
  };
  const refresh = () => { if (content) renderBlocks(content, blocks); };
  const commitSurface = (element, refreshAfter = false) => {
    const path = parsePath(element.dataset.blockPath);
    if (!path) return;
    const kind = element.dataset.editorKind;
    const value = element.textContent ?? '';
    if (kind === 'list-item') blocks = updateListItemAtPath(blocks, path, (inlines) => updateInlinesForTextInput(inlines, value));
    else if (kind === 'code') blocks = updateBlockAtPath(blocks, path, (block) => block.type === 'codeBlock' ? { ...block, value } : block);
    else if (kind === 'table-cell') {
      blocks = updateBlockAtPath(blocks, path, (block) => {
        if (block.type !== 'table') return block;
        const cells = element.dataset.tableSection === 'header' ? block.header : block.rows[Number(element.dataset.tableRow)];
        const column = Number(element.dataset.tableColumn);
        if (cells?.[column]) cells[column] = updateInlinesForTextInput(cells[column], value);
        return block;
      });
    } else {
      const current = findBlockAtPath(blocks, path);
      const converted = current && ['paragraph', 'heading'].includes(current.type) ? markdownShortcutToBlock(value) : null;
      blocks = updateBlockAtPath(blocks, path, (block) => converted || ((block.type === 'paragraph' || block.type === 'heading') ? { ...block, inlines: updateInlinesForTextInput(block.inlines, value) } : block));
      if (converted) refreshAfter = true;
    }
    emit();
    if (refreshAfter) refresh();
  };
  const onTextareaInput = () => {
    if (emitting || editorMode === 'source') return;
    const nextValue = textarea.value;
    if (nextValue === serializeMarkdown(blocks)) return;
    blocks = blocksFromMarkdown(nextValue);
    refresh();
  };
  const focusPath = (path, offset = 0, end = offset) => requestAnimationFrame(() => {
    const element = content?.querySelector(`[data-editor-surface="true"][data-block-path="${pathLabel(path)}"]`);
    if (element) setSurfaceSelection(element, offset, end);
  });
  const applyInlineCommand = (command) => {
    const element = activeSurface;
    const path = element && parsePath(element.dataset.blockPath);
    const selection = element && selectionOffsets(element);
    if (!element || !path || !selection || !['block', 'list-item', 'table-cell'].includes(element.dataset.editorKind)) return;
    const update = (inlines) => wrapInlineRange(inlines, selection.start, selection.end, command);
    if (element.dataset.editorKind === 'list-item') blocks = updateListItemAtPath(blocks, path, update);
    else if (element.dataset.editorKind === 'table-cell') {
      blocks = updateBlockAtPath(blocks, path, (block) => {
        if (block.type !== 'table') return block;
        const cells = element.dataset.tableSection === 'header' ? block.header : block.rows[Number(element.dataset.tableRow)];
        const column = Number(element.dataset.tableColumn);
        if (cells?.[column]) cells[column] = update(cells[column]);
        return block;
      });
    } else blocks = updateBlockAtPath(blocks, path, (block) => ['paragraph', 'heading'].includes(block.type) ? { ...block, inlines: update(block.inlines) } : block);
    emit(); refresh(); focusPath(path, selection.start, selection.end);
  };
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
    if (button && wrapper.contains(button)) {
      event.preventDefault();
      if (['bold', 'italic', 'link'].includes(button.dataset.markdownCommand)) applyInlineCommand(button.dataset.markdownCommand === 'bold' ? 'strong' : button.dataset.markdownCommand === 'italic' ? 'emphasis' : 'link');
      else applyCommand(button.dataset.markdownCommand);
      return;
    }
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
    if (!element || composing || event.isComposing || event.keyCode === 229) return;
    activeSurface = element;
    if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'k'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      applyInlineCommand(event.key.toLowerCase() === 'b' ? 'strong' : event.key.toLowerCase() === 'i' ? 'emphasis' : 'link');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') return;
    const path = parsePath(element.dataset.blockPath);
    if (!path) return;
    if (element.dataset.editorKind === 'list-item' && event.key === 'Tab') {
      event.preventDefault();
      const direction = event.shiftKey ? 'out' : 'in';
      const nextPath = listItemPathAfterIndent(blocks, path, direction);
      blocks = indentListItem(blocks, path, direction); emit(); refresh(); focusPath(nextPath);
      return;
    }
    if (element.dataset.editorKind === 'list-item' && event.key === 'Enter') {
      event.preventDefault();
      if (!(element.textContent ?? '').trim()) { blocks = exitEmptyListItem(blocks, path); emit(); refresh(); return; }
      blocks = continueListItem(blocks, path); emit(); refresh();
      const nextPath = [...path]; nextPath[nextPath.length - 1] += 1; focusPath(nextPath);
      return;
    }
    if (event.key !== 'Enter') return;
    if (element.dataset.editorKind !== 'block') return;
    event.preventDefault();
    const split = splitTextBlockAtOffset(blocks, path, caretOffset(element));
    blocks = split.blocks; emit(); refresh(); focusPath(split.nextPath);
  };
  const onMouseDown = (event) => {
    if (event.target.closest?.('[data-markdown-command]')) event.preventDefault();
  };

  if (editorMode === 'toolbar') {
    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-editor-toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Markdown editor');
    [['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['link', '↗', 'Link'], ['paragraph', 'P', 'Paragraph'], ['heading', 'H2', 'Heading'], ['unordered-list', '•', 'List'], ['ordered-list', '1.', 'Ordered list'], ['todo', '☐', 'Todo'], ['quote', '❞', 'Quote'], ['code', '</>', 'Code'], ['table', '▦', 'Table'], ['rule', '—', 'Rule']].forEach(([command, label, title]) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.markdownCommand = command; button.title = title; button.setAttribute('aria-label', title); button.textContent = label; toolbar.appendChild(button);
    });
    content = document.createElement('div'); content.className = 'markdown-editor-content'; content.dataset.markdownEditorBlocks = 'true';
    wrapper.append(toolbar, content); refresh();
    wrapper.addEventListener('click', onClick);
    wrapper.addEventListener('mousedown', onMouseDown);
    wrapper.addEventListener('input', onInput);
    wrapper.addEventListener('compositionstart', onComposition);
    wrapper.addEventListener('compositionend', onComposition);
    wrapper.addEventListener('keydown', onKeyDown);
    textarea.addEventListener('input', onTextareaInput);
  }

  return {
    destroy() {
      wrapper.removeEventListener('click', onClick); wrapper.removeEventListener('mousedown', onMouseDown); wrapper.removeEventListener('input', onInput);
      wrapper.removeEventListener('compositionstart', onComposition); wrapper.removeEventListener('compositionend', onComposition); wrapper.removeEventListener('keydown', onKeyDown);
      textarea.removeEventListener('input', onTextareaInput);
      if (marker.parentNode) marker.replaceWith(textarea);
      else wrapper.replaceWith(textarea);
    },
    focus() { if (editorMode === 'source') textarea.focus(); else content?.querySelector('[data-editor-surface="true"]')?.focus(); },
    sync() {
      if (editorMode === 'toolbar') { blocks = blocksFromMarkdown(textarea.value); refresh(); }
    },
    insertText(text) {
      if (!text) return;
      if (editorMode === 'source') {
        const start = textarea.selectionStart; const end = textarea.selectionEnd;
        textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
        textarea.setSelectionRange(start + text.length, start + text.length);
        textarea.dispatchEvent(new Event('input', { bubbles: true })); onChange?.(textarea.value); return;
      }
      const selected = typeof window === 'undefined' ? null : window.getSelection();
      const selectedSurface = selected?.anchorNode instanceof Element
        ? selected.anchorNode.closest('[data-editor-surface="true"]')
        : selected?.anchorNode?.parentElement?.closest('[data-editor-surface="true"]');
      const target = selectedSurface && content?.contains(selectedSurface) ? selectedSurface : activeSurface || content?.querySelector('[data-editor-surface="true"]');
      if (!target) return;
      const offsets = selectionOffsets(target);
      if (!offsets) { target.append(document.createTextNode(text)); activeSurface = target; commitSurface(target); return; }
      offsets.range.deleteContents();
      const node = document.createTextNode(text); offsets.range.insertNode(node);
      const range = document.createRange(); range.setStartAfter(node); range.collapse(true);
      selected.removeAllRanges(); selected.addRange(range);
      activeSurface = target; commitSurface(target);
    },
  };
}
