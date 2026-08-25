import {
  cloneBlocks,
  continueBlock,
  detectMarkdownShortcut,
  exitEmptyBlock,
  indentListItem,
  parseMarkdown,
  pathToItem,
  renderBlocks,
  renderMarkdown,
  serializeMarkdown,
  toggleTaskItem,
  updateAtPath,
} from '../../shared/markdown/index.js';

export type {
  Block,
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
  detectMarkdownShortcut,
  exitEmptyBlock,
  indentListItem,
  parseMarkdown,
  pathToItem,
  renderBlocks,
  renderMarkdown,
  serializeMarkdown,
  toggleTaskItem,
  updateAtPath,
};

/** Compatibility entry point for existing Web Markdown previews. */
export function markdownToHtml(markdown: string, options?: MarkdownRenderOptions): string {
  return renderMarkdown(markdown, options);
}
