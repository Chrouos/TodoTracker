import {
  cloneBlocks,
  continueBlock,
  deleteBackwardAtSelection,
  deleteForwardAtSelection,
  detectMarkdownShortcut,
  ensureParagraphAfterBlock,
  exitEmptyBlock,
  indentListItem,
  parseMarkdown,
  pathToItem,
  removeTableBeforeParagraph,
  replaceEditorSelection,
  renderBlocks,
  renderMarkdown,
  serializeMarkdown,
  splitBlockAtSelection,
  toggleTaskItem,
  updateAtPath,
} from '../../shared/markdown/index.js';
import type { Block, EditorPoint, EditorSelection, Inline } from '../../shared/markdown/index.js';

export type {
  Block,
  EditorPoint,
  EditorSelection,
  Inline,
  ListItem,
  MarkdownEditorMode,
  Shortcut,
  TableAlignment,
  TaskItem,
  TaskPath,
} from '../../shared/markdown/index.js';

export type MarkdownRenderOptions = {
  interactiveTasks?: boolean;
};

export {
  cloneBlocks,
  continueBlock,
  deleteBackwardAtSelection,
  deleteForwardAtSelection,
  detectMarkdownShortcut,
  ensureParagraphAfterBlock,
  exitEmptyBlock,
  indentListItem,
  parseMarkdown,
  pathToItem,
  removeTableBeforeParagraph,
  replaceEditorSelection,
  renderBlocks,
  renderMarkdown,
  serializeMarkdown,
  splitBlockAtSelection,
  toggleTaskItem,
  updateAtPath,
};

export type EditorReplacementResult = {
  blocks: Block[];
  nextSelection: EditorSelection;
  handled: boolean;
  usedFallback: boolean;
};

type LocatedBlock = {
  container: Block[];
  index: number;
  block: Block;
  path: number[];
};

type LocatedListItem = {
  items: Array<{ inlines: Inline[]; children: Block[]; checked?: boolean }>;
  index: number;
  item: { inlines: Inline[]; children: Block[]; checked?: boolean };
};

const emptyEditorParagraph = (): Block => ({ type: 'paragraph', inlines: [] });

function locateBlock(blocks: Block[], path: number[]): LocatedBlock | null {
  const visit = (container: Block[], index: number, remaining: number[], currentPath: number[]): LocatedBlock | null => {
    const block = container[index];
    if (!block) return null;
    if (!remaining.length) return { container, index, block, path: currentPath };
    if (block.type === 'quote') {
      return visit(block.blocks ?? [], remaining[0], remaining.slice(1), [...currentPath, remaining[0]]);
    }
    if (block.type === 'list' || block.type === 'taskList') {
      const item = block.items[remaining[0]];
      const childIndex = remaining[1];
      return item && childIndex !== undefined
        ? visit(item.children, childIndex, remaining.slice(2), [...currentPath, remaining[0], childIndex])
        : null;
    }
    return null;
  };
  return path.length ? visit(blocks, path[0], path.slice(1), [path[0]]) : null;
}

function locateListItem(blocks: Block[], path: number[]): LocatedListItem | null {
  if (path.length < 2) return null;
  const visit = (container: Block[], index: number, remaining: number[]): LocatedListItem | null => {
    const block = container[index];
    if (!block) return null;
    if (block.type === 'quote') return visit(block.blocks ?? [], remaining[0], remaining.slice(1));
    if (block.type !== 'list' && block.type !== 'taskList') return null;
    const itemIndex = remaining[0];
    const item = block.items[itemIndex];
    if (!item) return null;
    if (remaining.length === 1) return { items: block.items, index: itemIndex, item };
    const childIndex = remaining[1];
    return childIndex === undefined
      ? null
      : visit(item.children, childIndex, remaining.slice(2));
  };
  return visit(blocks, path[0], path.slice(1));
}

function isTextBlock(block: Block | undefined): block is Extract<Block, { type: 'paragraph' | 'heading' }> {
  return block?.type === 'paragraph' || block?.type === 'heading';
}

function inlineLength(inlines: Inline[]): number {
  return inlines.reduce((length, inline) => length + (
    inline.type === 'text'
      ? inline.value.length
      : typeof inline.inlines === 'string'
        ? inline.inlines.length
        : inlineLength(inline.inlines)
  ), 0);
}

function cloneInline(inline: Inline): Inline {
  return inline.type === 'text'
    ? { ...inline }
    : typeof inline.inlines === 'string'
      ? { ...inline }
      : { ...inline, inlines: inline.inlines.map(cloneInline) };
}

function mergeInlines(inlines: Inline[]): Inline[] {
  return inlines.reduce<Inline[]>((merged, inline) => {
    const previous = merged.at(-1);
    if (inline.type === 'text' && previous?.type === 'text') previous.value += inline.value;
    else merged.push(inline);
    return merged;
  }, []);
}

function splitInline(inline: Inline, offset: number): [Inline | null, Inline | null] {
  if (inline.type === 'text') {
    const before = inline.value.slice(0, offset);
    const after = inline.value.slice(offset);
    return [before ? { type: 'text', value: before } : null, after ? { type: 'text', value: after } : null];
  }
  if (inline.type === 'code' && typeof inline.inlines === 'string') {
    const before = inline.inlines.slice(0, offset);
    const after = inline.inlines.slice(offset);
    return [before ? { ...inline, inlines: before } : null, after ? { ...inline, inlines: after } : null];
  }
  if (typeof inline.inlines === 'string') return [cloneInline(inline), null];
  const [before, after] = splitInlinesAtOffset(inline.inlines, offset);
  return [before.length ? { ...inline, inlines: before } : null, after.length ? { ...inline, inlines: after } : null];
}

function splitInlinesAtOffset(inlines: Inline[], offset: number): [Inline[], Inline[]] {
  const left: Inline[] = [];
  const right: Inline[] = [];
  let cursor = 0;
  for (const inline of inlines) {
    const length = inlineLength([inline]);
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

function canUseTextReplacement(blocks: Block[], selection: EditorSelection): boolean {
  const anchor = locateBlock(blocks, selection.anchor.path);
  const focus = locateBlock(blocks, selection.focus.path);
  if (!isTextBlock(anchor?.block) || !isTextBlock(focus?.block) || anchor?.container !== focus?.container) return false;
  const first = Math.min(anchor.index, focus.index);
  const last = Math.max(anchor.index, focus.index);
  return anchor.container.slice(first, last + 1).every(isTextBlock);
}

function selectionAt(path: number[], offset: number): EditorSelection {
  return {
    anchor: { path: [...path], offset },
    focus: { path: [...path], offset },
  };
}

function firstEditablePoint(blocks: Block[]): EditorPoint {
  const visit = (block: Block, path: number[]): EditorPoint | null => {
    if (isTextBlock(block)) return { path, offset: 0 };
    if (block.type === 'codeBlock') return { path, offset: 0 };
    if (block.type === 'table') return { path, offset: 0 };
    if (block.type === 'quote') {
      for (let index = 0; index < (block.blocks ?? []).length; index += 1) {
        const point = visit(block.blocks![index], [...path, index]);
        if (point) return point;
      }
    }
    if (block.type === 'list' || block.type === 'taskList') {
      const item = block.items[0];
      if (item) return { path: [...path, 0], offset: 0 };
    }
    return null;
  };
  for (let index = 0; index < blocks.length; index += 1) {
    const point = visit(blocks[index], [index]);
    if (point) return point;
  }
  return { path: [0], offset: 0 };
}

function isValidEditorPoint(blocks: Block[], point: EditorPoint): boolean {
  return Boolean(locateBlock(blocks, point.path) ?? locateListItem(blocks, point.path));
}

export function reconcileEditorSelection(blocks: Block[], previous: EditorSelection | null): EditorSelection {
  if (previous && isValidEditorPoint(blocks, previous.anchor) && isValidEditorPoint(blocks, previous.focus)) return previous;
  const point = firstEditablePoint(blocks);
  return selectionAt(point.path, point.offset);
}

export function syncEditorValue(value: string, previous: EditorSelection | null = null): { blocks: Block[]; selection: EditorSelection } {
  const blocks = parseMarkdown(value);
  const normalized = blocks.length ? blocks : [emptyEditorParagraph()];
  return { blocks: normalized, selection: reconcileEditorSelection(normalized, previous) };
}

export function replaceEditorSelectionWithFallback(
  blocks: Block[],
  selection: EditorSelection,
  pastedMarkdown: string,
): EditorReplacementResult {
  if (canUseTextReplacement(blocks, selection)) {
    const result = replaceEditorSelection(blocks, selection, pastedMarkdown);
    return { ...result, handled: true, usedFallback: false };
  }

  const next = cloneBlocks(blocks);
  const anchorTop = selection.anchor.path[0] ?? 0;
  const focusTop = selection.focus.path[0] ?? anchorTop;
  const anchorFirst = anchorTop < focusTop || (anchorTop === focusTop && selection.anchor.offset <= selection.focus.offset);
  const startPoint = anchorFirst ? selection.anchor : selection.focus;
  const endPoint = anchorFirst ? selection.focus : selection.anchor;
  const startIndex = Math.min(anchorTop, focusTop);
  const endIndex = Math.max(anchorTop, focusTop);
  const startBlock = next[startIndex] ?? emptyEditorParagraph();
  const endBlock = next[endIndex] ?? startBlock;
  const startText = isTextBlock(startBlock) ? startBlock : null;
  const endText = isTextBlock(endBlock) ? endBlock : null;
  const before = startPoint.path.length === 1 && startPoint.path[0] === startIndex && startText
    ? splitInlinesAtOffset(startText.inlines, startPoint.offset)[0]
    : [];
  const after = endPoint.path.length === 1 && endPoint.path[0] === endIndex && endText
    ? splitInlinesAtOffset(endText.inlines, endPoint.offset)[1]
    : [];
  const pasted = parseMarkdown(pastedMarkdown);
  const replacement: Block[] = [];
  if (before.length && startText) replacement.push({ ...startText, inlines: before });
  replacement.push(...pasted);
  if (after.length && endText) replacement.push({ ...endText, inlines: after });
  if (!replacement.length) replacement.push(emptyEditorParagraph());

  const insertionIndex = startIndex + (before.length ? 1 : 0);
  next.splice(startIndex, endIndex - startIndex + 1, ...replacement);
  const selectedBlock = pasted.at(-1) ?? replacement[0];
  const selectedIndex = pasted.length ? insertionIndex + pasted.length - 1 : insertionIndex;
  if (pasted.length && !isTextBlock(selectedBlock)) {
    const continued = ensureParagraphAfterBlock(next, [selectedIndex]);
    return {
      blocks: continued.blocks,
      nextSelection: selectionAt(continued.nextPath, 0),
      handled: true,
      usedFallback: true,
    };
  }
  const offset = pasted.length && isTextBlock(selectedBlock)
    ? inlineLength(selectedBlock.inlines)
    : before.length;
  return {
    blocks: next,
    nextSelection: selectionAt([selectedIndex], offset),
    handled: true,
    usedFallback: true,
  };
}

export function splitListItemAtSelection(blocks: Block[], selection: EditorSelection): { blocks: Block[]; nextSelection: EditorSelection; handled: boolean } {
  if (selection.anchor.path.length !== selection.focus.path.length
    || selection.anchor.path.some((part, index) => part !== selection.focus.path[index])
    || selection.anchor.offset !== selection.focus.offset) {
    return { blocks: cloneBlocks(blocks), nextSelection: selection, handled: false };
  }
  const location = locateListItem(blocks, selection.anchor.path);
  if (!location) return { blocks: cloneBlocks(blocks), nextSelection: selection, handled: false };
  const next = cloneBlocks(blocks);
  const clonedLocation = locateListItem(next, selection.anchor.path);
  if (!clonedLocation) return { blocks: next, nextSelection: selection, handled: false };
  const [left, right] = splitInlinesAtOffset(clonedLocation.item.inlines, selection.anchor.offset);
  const leftItem = { ...clonedLocation.item, inlines: left };
  const rightItem = { ...clonedLocation.item, inlines: right, children: [] };
  clonedLocation.items.splice(clonedLocation.index, 1, leftItem, rightItem);
  const nextPath = [...selection.anchor.path];
  nextPath[nextPath.length - 1] += 1;
  return { blocks: next, nextSelection: selectionAt(nextPath, 0), handled: true };
}

export type EditorCheckboxChange = {
  dataset?: {
    markdownEditorTask?: string;
    markdownTaskPath?: string;
  };
};

export function applyEditorCheckboxChange(blocks: Block[], change: EditorCheckboxChange): { blocks: Block[]; handled: boolean } {
  const dataset = change.dataset;
  if (dataset?.markdownEditorTask !== 'true' || !dataset.markdownTaskPath || !/^\d+(?:\.\d+)*$/.test(dataset.markdownTaskPath)) {
    return { blocks: cloneBlocks(blocks), handled: false };
  }
  try {
    return { blocks: toggleTaskItem(blocks, dataset.markdownTaskPath.split('.').map(Number)), handled: true };
  } catch {
    return { blocks: cloneBlocks(blocks), handled: false };
  }
}

/** Compatibility entry point for existing Web Markdown previews. */
export function markdownToHtml(markdown: string, options?: MarkdownRenderOptions): string {
  return renderMarkdown(markdown, options);
}
