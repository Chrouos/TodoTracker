import type { NoteTarget } from './types';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateImage(file: File): { ok: true } | { ok: false; error: string } {
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
    return { ok: false, error: '只支援 JPG、PNG、GIF 或 WebP 圖片' };
  }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: '單張圖片不可超過 10 MB' };
  return { ok: true };
}

export function attachmentPath(target: NoteTarget, userId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120) || 'image';
  return `${userId}/${target.kind}/${target.id}/${crypto.randomUUID()}-${safe}`;
}

export function shareUrl(token: string): string {
  if (typeof window === 'undefined') return `/share/${encodeURIComponent(token)}`;
  return `${window.location.origin}/share/${encodeURIComponent(token)}`;
}
