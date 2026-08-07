import type { NoteTarget } from './types';

export type LocalAttachment = {
  id: string;
  target: NoteTarget;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  createdAt: string;
};

export function localAttachmentKey(target: NoteTarget): string {
  return `todo-tracker:attachments:${target.kind}:${target.id}`;
}

const memory = new Map<string, LocalAttachment[]>();
const DB_NAME = 'todo-tracker-local';
const STORE = 'attachments';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}

export async function listLocalAttachments(target: NoteTarget): Promise<LocalAttachment[]> {
  if (typeof indexedDB === 'undefined') return memory.get(localAttachmentKey(target)) ?? [];
  const database = await db();
  return new Promise((resolve, reject) => { const request = database.transaction(STORE).objectStore(STORE).getAll(); request.onsuccess = () => resolve((request.result as LocalAttachment[]).filter((item) => item.target.kind === target.kind && item.target.id === target.id)); request.onerror = () => reject(request.error); });
}

export async function saveLocalAttachment(target: NoteTarget, file: File): Promise<LocalAttachment> {
  const item: LocalAttachment = { id: crypto.randomUUID(), target, fileName: file.name, mimeType: file.type, sizeBytes: file.size, blob: file, createdAt: new Date().toISOString() };
  const key = localAttachmentKey(target); memory.set(key, [...(memory.get(key) ?? []), item]);
  if (typeof indexedDB !== 'undefined') { const database = await db(); await new Promise<void>((resolve, reject) => { const request = database.transaction(STORE, 'readwrite').objectStore(STORE).add(item); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
  return item;
}

export async function removeLocalAttachment(target: NoteTarget, id: string): Promise<void> {
  const key = localAttachmentKey(target); memory.set(key, (memory.get(key) ?? []).filter((item) => item.id !== id));
  if (typeof indexedDB !== 'undefined') { const database = await db(); await new Promise<void>((resolve, reject) => { const request = database.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
}
