import { cloneBlocks } from '../../shared/markdown/index.js';
import type { Block, Inline } from '../../shared/markdown/index.js';

type ListBlock = Extract<Block, { type: 'list' | 'taskList' }>;
type ListItem = ListBlock['items'][number];
type ListLocation = {
  block: ListBlock;
  index: number;
  item: ListItem;
  parentItemPath: number[] | null;
};

export function inlineText(inlines: Inline[] = []): string {
  return inlines.map((inline) => {
    if (inline.type === 'text') return inline.value;
    if (inline.type === 'code') return typeof inline.inlines === 'string' ? inline.inlines : inlineText(inline.inlines as Inline[]);
    return inlineText(inline.inlines as Inline[]);
  }).join('');
}

export function updateInlinesForTextInput(inlines: Inline[], nextText: string): Inline[] {
  const currentText = inlineText(inlines);
  if (currentText === nextText) return inlines;

  let start = 0;
  while (start < currentText.length && start < nextText.length && currentText[start] === nextText[start]) start += 1;
  let currentEnd = currentText.length;
  let nextEnd = nextText.length;
  while (currentEnd > start && nextEnd > start && currentText[currentEnd - 1] === nextText[nextEnd - 1]) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  return replaceInlineRange(inlines, start, currentEnd, nextText.slice(start, nextEnd));
}

export function splitTextBlockAtOffset(blocks: Block[], path: number[], offset: number): { blocks: Block[]; nextPath: number[] } {
  const next = cloneBlocks(blocks);
  const location = resolveTextBlock(next, path);
  if (!location) return { blocks: next, nextPath: path };

  const { container, index, block } = location;
  if (!inlineText(block.inlines).length) {
    if (block.type === 'heading') {
      container[index] = { type: 'paragraph', inlines: [] };
      return { blocks: next, nextPath: path };
    }
    container.splice(index + 1, 0, { type: 'paragraph', inlines: [] });
    return { blocks: next, nextPath: [...path.slice(0, -1), index + 1] };
  }

  const [before, after] = splitInlinesAtOffset(block.inlines, offset);
  container.splice(index, 1, { ...block, inlines: before }, { ...block, inlines: after });
  return { blocks: next, nextPath: [...path.slice(0, -1), index + 1] };
}

export function collectTaskItemPaths(blocks: Block[]): number[][] {
  const paths: number[][] = [];
  blocks.forEach((block, index) => collectBlockTaskPaths(block, [index], paths));
  return paths;
}

export function listItemPathAfterIndent(blocks: Block[], path: number[], direction: 'in' | 'out'): number[] {
  const location = resolveListLocation(blocks, path);
  if (!location) return path;

  if (direction === 'out') {
    if (!location.parentItemPath) return path;
    const next = [...location.parentItemPath];
    next[next.length - 1] += 1;
    return next;
  }

  if (location.index === 0) return path;
  const previous = location.block.items[location.index - 1];
  const nested = previous.children.find((child) => child.type === location.block.type) as ListBlock | undefined;
  return [...path.slice(0, -1), location.index - 1, nested?.items.length ?? 0];
}

function replaceInlineRange(inlines: Inline[], start: number, end: number, replacement: string): Inline[] {
  let cursor = 0;
  for (const inline of inlines) {
    const length = inlineText([inline]).length;
    if (start >= cursor && end <= cursor + length && inline.type !== 'text') {
      if (inline.type === 'code' && typeof inline.inlines === 'string') {
        return replaceInsideInline(inlines, inline, start - cursor, end - cursor, replacement);
      }
      if (typeof inline.inlines !== 'string') {
        const updated = replaceInlineRange(inline.inlines, start - cursor, end - cursor, replacement);
        return replaceInline(inlines, inline, { ...inline, inlines: updated });
      }
    }
    cursor += length;
  }

  const [before, rest] = splitInlinesAtOffset(inlines, start);
  const [, after] = splitInlinesAtOffset(rest, Math.max(0, end - start));
  return mergeInlines([...before, ...(replacement ? [{ type: 'text', value: replacement } satisfies Inline] : []), ...after]);
}

function replaceInsideInline(inlines: Inline[], target: Inline, start: number, end: number, replacement: string): Inline[] {
  if (target.type !== 'code' || typeof target.inlines !== 'string') return inlines;
  return replaceInline(inlines, target, { ...target, inlines: `${target.inlines.slice(0, start)}${replacement}${target.inlines.slice(end)}` });
}

function replaceInline(inlines: Inline[], target: Inline, replacement: Inline): Inline[] {
  return inlines.map((inline) => inline === target ? replacement : cloneInline(inline));
}

function splitInlinesAtOffset(inlines: Inline[], offset: number): [Inline[], Inline[]] {
  const left: Inline[] = [];
  const right: Inline[] = [];
  let cursor = 0;
  for (const inline of inlines) {
    const length = inlineText([inline]).length;
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

function splitInline(inline: Inline, offset: number): [Inline | null, Inline | null] {
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

function mergeInlines(inlines: Inline[]): Inline[] {
  const output: Inline[] = [];
  for (const inline of inlines) {
    const previous = output.at(-1);
    if (inline.type === 'text' && previous?.type === 'text') {
      previous.value += inline.value;
      continue;
    }
    output.push(cloneInline(inline));
  }
  return output;
}

function cloneInline(inline: Inline): Inline {
  if (inline.type === 'text') return { ...inline };
  return typeof inline.inlines === 'string' ? { ...inline } : { ...inline, inlines: inline.inlines.map(cloneInline) } as Inline;
}

function resolveTextBlock(blocks: Block[], path: number[]): { container: Block[]; index: number; block: Extract<Block, { type: 'paragraph' | 'heading' }> } | null {
  let container = blocks;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth];
    const block = container[index];
    if (!block) return null;
    if (depth === path.length - 1) return block.type === 'paragraph' || block.type === 'heading' ? { container, index, block } : null;
    if (block.type !== 'quote' || !block.blocks) return null;
    container = block.blocks;
  }
  return null;
}

function collectBlockTaskPaths(block: Block, path: number[], paths: number[][]): void {
  if (block.type === 'quote') {
    block.blocks?.forEach((child, index) => collectBlockTaskPaths(child, [...path, index], paths));
    return;
  }
  if (block.type !== 'list' && block.type !== 'taskList') return;
  block.items.forEach((item, index) => {
    const itemPath = [...path, index];
    if (block.type === 'taskList') paths.push(itemPath);
    item.children.forEach((child) => collectBlockTaskPaths(child, itemPath, paths));
  });
}

function resolveListLocation(blocks: Block[], path: number[]): ListLocation | null {
  const first = blocks[path[0]];
  if (!first) return null;
  return resolveListBlock(first, path.slice(1), [path[0]], null);
}

function resolveListBlock(block: Block, path: number[], prefix: number[], parentItemPath: number[] | null): ListLocation | null {
  if (block.type === 'quote') {
    const child = block.blocks?.[path[0]];
    return child ? resolveListBlock(child, path.slice(1), [...prefix, path[0]], null) : null;
  }
  if ((block.type !== 'list' && block.type !== 'taskList') || !path.length) return null;
  const index = path[0];
  const item = block.items[index];
  if (!item) return null;
  if (path.length === 1) return { block, index, item, parentItemPath };
  const child = item.children.find((entry) => entry.type === 'list' || entry.type === 'taskList' || entry.type === 'quote');
  const itemPath = [...prefix, index];
  return child ? resolveListBlock(child, path.slice(1), itemPath, itemPath) : null;
}
