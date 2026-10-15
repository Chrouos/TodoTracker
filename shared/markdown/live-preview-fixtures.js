export const livePreviewFixtures = {
  activeSource: [
    {
      markdown: 'Before\n\n- [ ] Task\n\n```js\nvalue();\n```',
      path: [1, 0],
      expected: '- [ ] Task',
    },
  ],
  composition: [
    {
      markdown: 'Before\n\n```js\nvalue();\n```\n\nAfter',
      path: [1],
      source: '```js\nvalue();\nnext();',
      expected: 'Before\n\n```js\nvalue();\nnext();\n\nAfter',
    },
  ],
  replacement: [
    {
      markdown: '- [x] Parent\n  - [ ] Nested\n    - Child\n- [ ] Sibling',
      path: [0, 0, 0, 0],
      source: '- [x] Updated',
      expected: {
        valid: true,
        nextPath: [0, 0, 0, 0],
        markdown: '- [x] Parent\n  - [x] Updated\n    - Child\n- [ ] Sibling',
      },
    },
  ],
  inlineToggle: [
    {
      source: '**Bold** plain',
      start: 0,
      end: 14,
      command: 'bold',
      expected: { source: '**Bold plain**', selectionStart: 2, selectionEnd: 12 },
    },
    {
      source: '[docs](https://example.com)',
      start: 0,
      end: 27,
      command: 'link',
      expected: { source: 'docs', selectionStart: 0, selectionEnd: 4 },
    },
  ],
  blockToggle: [
    {
      source: '```js\nfirst\nsecond\n```',
      command: 'code-block',
      expected: { source: 'first\nsecond', selectionStart: 0, selectionEnd: 12 },
    },
    {
      source: '---',
      command: 'rule',
      expected: { source: '', selectionStart: 0, selectionEnd: 0 },
    },
  ],
  toolbarState: [
    {
      source: 'Text **Bold**',
      start: 7,
      end: 11,
      expected: { bold: true, rule: false, codeBlock: false },
    },
    {
      source: '---',
      start: 0,
      end: 0,
      expected: { bold: false, rule: true, codeBlock: false },
    },
  ],
};
