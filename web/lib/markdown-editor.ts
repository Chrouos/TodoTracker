import { cloneBlocks, parseMarkdown } from '../../shared/markdown/index.js';
import type { Block, EditorSelection, Inline } from '../../shared/markdown/index.js';

type ListBlock = Extract<Block, { type: 'list' | 'taskList' }>;
type ListItem = ListBlock['items'][number];
type ListLocation = {
  block: ListBlock;
  blockPath: number[];
  index: number;
  item: ListItem;
  parent: { blockPath: number[]; index: number } | null;
};

export type InlineCommand = 'strong' | 'emphasis' | 'code' | 'link';

export function toolbarSelection(
  live: EditorSelection | null,
  remembered: EditorSelection | null,
): EditorSelection | null {
  return remembered ?? live;
}

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

export function applyInlineCommand(
  inlines: Inline[],
  start: number,
  end: number,
  command: InlineCommand,
  url = 'https://example.com',
): { inlines: Inline[]; selectionStart: number; selectionEnd: number } {
  const length = inlineText(inlines).length;
  const safeStart = Math.max(0, Math.min(start, length));
  const safeEnd = Math.max(safeStart, Math.min(end, length));
  const [before, rest] = splitInlinesAtOffset(inlines, safeStart);
  let [selected, after] = splitInlinesAtOffset(rest, safeEnd - safeStart);
  const placeholder = command === 'strong'
    ? '粗體文字'
    : command === 'emphasis'
      ? '斜體文字'
      : command === 'code'
        ? '程式碼'
        : '連結文字';
  if (!selected.length) selected = [{ type: 'text', value: placeholder }];
  const wrapper = command === 'link'
    ? { type: 'link', url: safeHttpsUrl(url), inlines: selected } satisfies Inline
    : { type: command, inlines: selected } satisfies Inline;
  const selectedLength = inlineText(selected).length;
  return {
    inlines: mergeInlines([...before, wrapper, ...after]),
    selectionStart: safeStart,
    selectionEnd: safeStart + selectedLength,
  };
}

export function insertInlineTextAtRange(
  inlines: Inline[],
  start: number,
  end: number,
  text: string,
  afterInlineMark = false,
): Inline[] {
  if (!afterInlineMark) return replaceInlineRange(inlines, start, end, text);
  const [before, rest] = splitInlinesAtOffset(inlines, start);
  const [, after] = splitInlinesAtOffset(rest, Math.max(0, end - start));
  return mergeInlines([...before, ...(text ? [{ type: 'text', value: text } satisfies Inline] : []), ...after]);
}

export function pasteMarkdownAtTextBlock(
  blocks: Block[],
  path: number[],
  start: number,
  end: number,
  markdown: string,
): { blocks: Block[]; nextPath: number[] } {
  const next = cloneBlocks(blocks);
  const location = resolveTextBlock(next, path);
  const pasted = parseMarkdown(markdown);
  if (!location || !pasted.length) return { blocks: next, nextPath: path };

  const textLength = inlineText(location.block.inlines).length;
  const safeStart = Math.max(0, Math.min(start, textLength));
  const safeEnd = Math.max(safeStart, Math.min(end, textLength));
  const [before, rest] = splitInlinesAtOffset(location.block.inlines, safeStart);
  const [, after] = splitInlinesAtOffset(rest, safeEnd - safeStart);
  const replacement: Block[] = [];
  if (before.length) replacement.push({ ...location.block, inlines: before });
  replacement.push(...pasted);
  if (after.length) replacement.push({ ...location.block, inlines: after });
  location.container.splice(location.index, 1, ...replacement);
  return {
    blocks: next,
    nextPath: [...path.slice(0, -1), location.index + replacement.length - 1],
  };
}

export function timestampInsertionText(value: string, offset: number, timestamp: string): string {
  const safeOffset = Math.max(0, Math.min(offset, value.length));
  const atLineStart = safeOffset === 0 || value[safeOffset - 1] === '\n';
  return `${atLineStart ? '' : '\n'}${timestamp}`;
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
    return location.parent ? [...location.parent.blockPath, location.parent.index + 1] : path;
  }

  if (location.index === 0) return path;
  const previous = location.block.items[location.index - 1];
  const childIndex = previous.children.findIndex((child) => child.type === location.block.type);
  const nested = childIndex < 0 ? undefined : previous.children[childIndex] as ListBlock;
  return [
    ...location.blockPath,
    location.index - 1,
    childIndex < 0 ? previous.children.length : childIndex,
    nested?.items.length ?? 0,
  ];
}

function safeHttpsUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : 'https://example.com';
  } catch {
    return 'https://example.com';
  }
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
  const visit = (container: Block[], index: number, remaining: number[]): ReturnType<typeof resolveTextBlock> => {
    const block = container[index];
    if (!block) return null;
    if (!remaining.length) return block.type === 'paragraph' || block.type === 'heading' ? { container, index, block } : null;
    if (block.type === 'quote') {
      return block.blocks ? visit(block.blocks, remaining[0], remaining.slice(1)) : null;
    }
    if (block.type === 'list' || block.type === 'taskList') {
      const item = block.items[remaining[0]];
      const childIndex = remaining[1];
      return item && childIndex !== undefined
        ? visit(item.children, childIndex, remaining.slice(2))
        : null;
    }
    return null;
  };
  return path.length ? visit(blocks, path[0], path.slice(1)) : null;
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
    item.children.forEach((child, childIndex) => collectBlockTaskPaths(child, [...itemPath, childIndex], paths));
  });
}

function resolveListLocation(blocks: Block[], path: number[]): ListLocation | null {
  const first = blocks[path[0]];
  if (!first) return null;
  return resolveListBlock(first, path.slice(1), [path[0]], null);
}

function resolveListBlock(
  block: Block,
  path: number[],
  blockPath: number[],
  parent: { blockPath: number[]; index: number } | null,
): ListLocation | null {
  if (block.type === 'quote') {
    const childIndex = path[0];
    const child = block.blocks?.[childIndex];
    return child ? resolveListBlock(child, path.slice(1), [...blockPath, childIndex], null) : null;
  }
  if ((block.type !== 'list' && block.type !== 'taskList') || !path.length) return null;
  const index = path[0];
  const item = block.items[index];
  if (!item) return null;
  if (path.length === 1) return { block, blockPath, index, item, parent };
  const childIndex = path[1];
  const child = item.children[childIndex];
  return child
    ? resolveListBlock(child, path.slice(2), [...blockPath, index, childIndex], { blockPath, index })
    : null;
}
