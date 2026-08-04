import assert from 'node:assert/strict';
import { localAttachmentKey } from './localAttachments';

assert.equal(localAttachmentKey({ kind: 'task', id: 't1' }), 'todo-tracker:attachments:task:t1');
assert.notEqual(localAttachmentKey({ kind: 'project', id: 't1' }), localAttachmentKey({ kind: 'task', id: 't1' }));
