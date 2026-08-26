import { cloneBlocks } from './ast.js';
import { parseMarkdown } from './parser.js';

export function replaceEditorSelection(blocks, selection, pastedMarkdown) {
  const next = cloneBlocks(blocks);
  const range = resolveSelection(next, selection);
  if (!range) return { blocks: next, nextSelection: collapseSelection(selection.focus) };

  const { start, end } = range;
  const [before] = splitInlinesAtOffset(start.block.inlines, start.offset);
  const [, after] = splitInlinesAtOffset(end.block.inlines, end.offset);
  const pasted = parseMarkdown(pastedMarkdown);
  if (pasted.length === 1 && pasted[0].type === 'paragraph') {
    const inlines = mergeInlines([...before, ...pasted[0].inlines, ...after]);
    start.container.splice(start.index, end.index - start.index + 1, { ...start.block, inlines });
    return { blocks: next, nextSelection: selectionAt(start.path, textLength(before) + textLength(pasted[0].inlines)) };
  }
  const replacement = [];
  if (before.length) replacement.push({ ...start.block, inlines: before });
  replacement.push(...pasted);
  if (after.length) replacement.push({ ...end.block, inlines: after });
  if (!replacement.length) replacement.push({ ...start.block, inlines: [] });

  const insertionIndex = start.index + (before.length ? 1 : 0);
  start.container.splice(start.index, end.index - start.index + 1, ...replacement);
  const selectedBlock = pasted.at(-1) ?? replacement[0];
  const selectedIndex = pasted.length ? insertionIndex + pasted.length - 1 : start.index;
  const selectedPath = [...start.path.slice(0, -1), selectedIndex];
  if (pasted.length && !isTextBlock(selectedBlock)) {
    const caret = ensureParagraphAfterBlock(next, selectedPath);
    return { blocks: caret.blocks, nextSelection: selectionAt(caret.nextPath, 0) };
  }
  const offset = pasted.length ? textLength(selectedBlock.inlines) : textLength(before);
  return { blocks: next, nextSelection: selectionAt(selectedPath, offset) };
}

export function splitBlockAtSelection(blocks, selection) {
  const next = cloneBlocks(blocks);
  const range = resolveSelection(next, selection);
  if (!range || !samePoint(range.start, range.end)) return { blocks: next, nextSelection: collapseSelection(selection.focus) };

  const { start } = range;
  const [before, after] = splitInlinesAtOffset(start.block.inlines, start.offset);
  const nextBlock = after.length
    ? { ...start.block, inlines: after }
    : start.block.type === 'heading'
      ? { type: 'paragraph', inlines: [] }
      : { ...start.block, inlines: after };
  start.container.splice(start.index, 1, { ...start.block, inlines: before }, nextBlock);
  return { blocks: next, nextSelection: selectionAt([...start.path.slice(0, -1), start.index + 1], 0) };
}

export function deleteBackwardAtSelection(blocks, selection) {
  if (!isCollapsed(selection)) {
    const result = replaceEditorSelection(blocks, selection, '');
    return { ...result, changed: Boolean(resolveSelection(blocks, selection)) };
  }
  const next = cloneBlocks(blocks);
  const location = resolveTextBlock(next, selection.anchor.path);
  if (!location || selection.anchor.offset !== 0) return unchanged(next, selection);
  const previous = location.container[location.index - 1];
  if (location.block.type !== 'paragraph' || previous?.type !== 'paragraph') return unchanged(next, selection);

  const offset = textLength(previous.inlines);
  previous.inlines = mergeInlines([...previous.inlines, ...location.block.inlines]);
  location.container.splice(location.index, 1);
  return { blocks: next, nextSelection: selectionAt([...location.path.slice(0, -1), location.index - 1], offset), changed: true };
}

export function deleteForwardAtSelection(blocks, selection) {
  if (!isCollapsed(selection)) {
    const result = replaceEditorSelection(blocks, selection, '');
    return { ...result, changed: Boolean(resolveSelection(blocks, selection)) };
  }
  const next = cloneBlocks(blocks);
  const location = resolveTextBlock(next, selection.anchor.path);
  if (!location || selection.anchor.offset !== textLength(location.block.inlines)) return unchanged(next, selection);
  const following = location.container[location.index + 1];
  if (location.block.type !== 'paragraph' || following?.type !== 'paragraph') return unchanged(next, selection);

  following.inlines = mergeInlines([...location.block.inlines, ...following.inlines]);
  location.container.splice(location.index, 1);
  return { blocks: next, nextSelection: selectionAt(location.path, selection.anchor.offset), changed: true };
}

export function ensureParagraphAfterBlock(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolveBlock(next, path);
  if (!location) return { blocks: next, nextPath: path };
  const following = location.container[location.index + 1];
  if (following?.type === 'paragraph') return { blocks: next, nextPath: [...path.slice(0, -1), location.index + 1] };
  location.container.splice(location.index + 1, 0, { type: 'paragraph', inlines: [] });
  return { blocks: next, nextPath: [...path.slice(0, -1), location.index + 1] };
}

export function removeTableBeforeParagraph(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolveBlock(next, path);
  if (!location || location.block.type !== 'paragraph' || location.container[location.index - 1]?.type !== 'table') {
    return { blocks: next, nextPath: path };
  }
  location.container.splice(location.index - 1, 1);
  return { blocks: next, nextPath: [...path.slice(0, -1), location.index - 1] };
}

export function detectMarkdownShortcut(value) {
  if (typeof value !== 'string' || !/^.* $/.test(value)) return null;
  if (/^#{1,6} $/.test(value)) return { type: 'heading', level: value.length - 1 };
  if (/^[-+*] \[ \] $/.test(value)) return { type: 'task', checked: false };
  if (/^[-+*] \[[xX]\] $/.test(value)) return { type: 'task', checked: true };
  if (/^[-+*] $/.test(value)) return { type: 'list', ordered: false };
  if (/^\d+[.)] $/.test(value)) return { type: 'list', ordered: true };
  if (value === '> ') return { type: 'quote' };
  if (value === '``` ') return { type: 'codeBlock' };
  return null;
}

export function continueBlock(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  const source = location.list[location.index];
  location.list.splice(location.index + 1, 0, emptyItem(source));
  return next;
}

export function exitEmptyBlock(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  if (!isEmptyItem(location.item)) return next;
  location.list.splice(location.index, 1);
  const paragraph = { type: 'paragraph', inlines: [] };
  location.container.splice(location.containerIndex + 1, 0, paragraph);
  if (!location.list.length) location.container.splice(location.containerIndex, 1);
  return next;
}

export function indentListItem(blocks, path, direction) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  if (direction === 'in') {
    if (location.index === 0) return next;
    const previous = location.list[location.index - 1];
    const child = previous.children.find((block) => block.type === location.block.type);
    const nested = child ?? { type: location.block.type, ...(location.block.type === 'list' ? { ordered: location.block.ordered } : {}), items: [] };
    if (!child) previous.children.push(nested);
    nested.items.push(location.list.splice(location.index, 1)[0]);
    return next;
  }
  if (direction === 'out' && location.parent) {
    const parentIndex = location.parent.index;
    const parentItem = location.parent.list[parentIndex];
    location.list.splice(location.index, 1);
    location.parent.list.splice(parentIndex + 1, 0, location.item);
    if (!location.list.length) parentItem.children.splice(location.blockIndex, 1);
  }
  return next;
}

export function toggleTaskItem(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = resolve(next, path);
  if (location.block.type !== 'taskList') return next;
  location.item.checked = !location.item.checked;
  return next;
}

function resolveSelection(blocks, selection) {
  if (!selection?.anchor || !selection?.focus) return null;
  const anchor = resolveTextBlock(blocks, selection.anchor.path);
  const focus = resolveTextBlock(blocks, selection.focus.path);
  if (!anchor || !focus || anchor.container !== focus.container) return null;
  const firstIndex = Math.min(anchor.index, focus.index);
  const lastIndex = Math.max(anchor.index, focus.index);
  if (anchor.container.slice(firstIndex + 1, lastIndex).some((block) => !isTextBlock(block))) return null;
  const anchorFirst = anchor.index < focus.index || (anchor.index === focus.index && selection.anchor.offset <= selection.focus.offset);
  const first = anchorFirst
    ? { ...anchor, offset: clampOffset(anchor.block.inlines, selection.anchor.offset) }
    : { ...focus, offset: clampOffset(focus.block.inlines, selection.focus.offset) };
  const last = anchorFirst
    ? { ...focus, offset: clampOffset(focus.block.inlines, selection.focus.offset) }
    : { ...anchor, offset: clampOffset(anchor.block.inlines, selection.anchor.offset) };
  return { start: first, end: last };
}

function resolveTextBlock(blocks, path) {
  const location = resolveBlock(blocks, path);
  return location && isTextBlock(location.block) ? location : null;
}

function isTextBlock(block) {
  return block?.type === 'paragraph' || block?.type === 'heading';
}

function resolveBlock(blocks, path) {
  if (!Array.isArray(path) || !path.length) return null;
  const visit = (container, index, remaining, currentPath) => {
    const block = container[index];
    if (!block) return null;
    if (!remaining.length) return { container, index, block, path: currentPath };
    if (block.type === 'quote') return visit(block.blocks ?? [], remaining[0], remaining.slice(1), [...currentPath, remaining[0]]);
    if (block.type === 'list' || block.type === 'taskList') {
      const itemIndex = remaining[0];
      const childIndex = remaining[1];
      const child = block.items[itemIndex]?.children[childIndex];
      return child === undefined ? null : visit(block.items[itemIndex].children, childIndex, remaining.slice(2), [...currentPath, itemIndex, childIndex]);
    }
    return null;
  };
  return visit(blocks, path[0], path.slice(1), [path[0]]);
}

function splitInlinesAtOffset(inlines, offset) {
  const left = [];
  const right = [];
  let cursor = 0;
  for (const inline of inlines) {
    const length = textLength([inline]);
    if (offset <= cursor) right.push(cloneInline(inline));
    else if (offset >= cursor + length) left.push(cloneInline(inline));
    else {
      const [before, after] = splitInline(inline, offset - cursor);
      if (before) left.push(before);
      if (after) right.push(after);
    }
    cursor += length;
  }
  return [mergeInlines(left), mergeInlines(right)];
}

function splitInline(inline, offset) {
  if (inline.type === 'text') {
    return [inline.value.slice(0, offset) ? { type: 'text', value: inline.value.slice(0, offset) } : null, inline.value.slice(offset) ? { type: 'text', value: inline.value.slice(offset) } : null];
  }
  if (inline.type === 'code' && typeof inline.inlines === 'string') {
    return [inline.inlines.slice(0, offset) ? { ...inline, inlines: inline.inlines.slice(0, offset) } : null, inline.inlines.slice(offset) ? { ...inline, inlines: inline.inlines.slice(offset) } : null];
  }
  if (typeof inline.inlines === 'string') return [cloneInline(inline), null];
  const [before, after] = splitInlinesAtOffset(inline.inlines, offset);
  return [before.length ? { ...inline, inlines: before } : null, after.length ? { ...inline, inlines: after } : null];
}

function mergeInlines(inlines) {
  const output = [];
  for (const inline of inlines) {
    const previous = output.at(-1);
    if (inline.type === 'text' && previous?.type === 'text') previous.value += inline.value;
    else output.push(cloneInline(inline));
  }
  return output;
}

function cloneInline(inline) {
  if (inline.type === 'text') return { ...inline };
  return typeof inline.inlines === 'string' ? { ...inline } : { ...inline, inlines: inline.inlines.map(cloneInline) };
}

function textLength(inlines) {
  return inlines.reduce((length, inline) => length + (inline.type === 'text'
    ? inline.value.length
    : typeof inline.inlines === 'string'
      ? inline.inlines.length
      : textLength(inline.inlines)), 0);
}

function clampOffset(inlines, offset) {
  return Math.max(0, Math.min(Number.isFinite(offset) ? offset : 0, textLength(inlines)));
}

function selectionAt(path, offset) {
  const point = { path, offset };
  return { anchor: point, focus: { ...point, path: [...path] } };
}

function collapseSelection(point) {
  return selectionAt(point?.path ?? [], point?.offset ?? 0);
}

function samePoint(first, second) {
  return first.path.length === second.path.length && first.path.every((part, index) => part === second.path[index]) && first.offset === second.offset;
}

function isCollapsed(selection) {
  return selection?.anchor?.offset === selection?.focus?.offset
    && selection.anchor.path?.length === selection.focus.path?.length
    && selection.anchor.path.every((part, index) => part === selection.focus.path[index]);
}

function unchanged(blocks, selection) {
  return { blocks, nextSelection: collapseSelection(selection.anchor), changed: false };
}

function emptyItem(item) {
  return item.checked === undefined ? { inlines: [], children: [] } : { checked: false, inlines: [], children: [] };
}

function isEmptyItem(item) {
  return item.children.length === 0 && item.inlines.every((inline) => {
    if (inline.type === 'text' || inline.type === 'code') return !inline.inlines && !inline.value;
    return Array.isArray(inline.inlines) && inline.inlines.length === 0;
  });
}

function resolve(blocks, path) {
  if (!Array.isArray(path) || path.length < 2) throw new TypeError('Path must contain at least two indexes');
  return descend(blocks, path[0], path.slice(1), null);
}

function descend(container, blockIndex, path, parent) {
  const block = container[blockIndex];
  if (block?.type === 'quote') {
    const quotedIndex = path[0];
    if (!block.blocks?.[quotedIndex]) throw new RangeError('Path does not reference a quoted block');
    // A quote is a container boundary: outdent may not cross it into an
    // ancestor list that happens to contain the quote block.
    return descendBlock(block.blocks[quotedIndex], block.blocks, quotedIndex, path.slice(1), null);
  }
  return descendBlock(block, container, blockIndex, path, parent);
}

function descendBlock(block, container, blockIndex, path, parent) {
  if (!block || !['list', 'taskList'].includes(block.type)) throw new RangeError('Path does not reference a list block');
  const index = path[0];
  const item = block.items[index];
  if (!item) throw new RangeError('Path does not reference a list item');
  if (path.length === 1) return { list: block.items, index, item, block, container, containerIndex: blockIndex, parent, blockIndex };
  const childIndex = path[1];
  const child = item.children[childIndex];
  if (!child || path.length < 3) throw new RangeError('Path does not reference a nested list');
  return descend(item.children, childIndex, path.slice(2), { list: block.items, index, item, block, container: item.children, blockIndex: childIndex });
}
