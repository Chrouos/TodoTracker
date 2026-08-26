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

/** Compatibility entry point for existing Web Markdown previews. */
export function markdownToHtml(markdown: string, options?: MarkdownRenderOptions): string {
  return renderMarkdown(markdown, options);
}
