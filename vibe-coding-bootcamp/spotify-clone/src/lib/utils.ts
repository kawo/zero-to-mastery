import { clsx, type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

/** UUIDs need a secure context; fall back for http:// LAN testing. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Content hash used for dedupe. SHA-256 when WebCrypto is available (https/localhost),
 * otherwise a 64-bit FNV-1a so imports still work on plain http.
 */
export async function hashBlob(blob: Blob): Promise<string> {
  const data = await blob.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return `sha256:${toHex(await crypto.subtle.digest('SHA-256', data))}`;
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i]!, 0x01000193);
    h2 = Math.imul(h2 ^ bytes[i]!, 0x5bd1e995);
  }
  return `fnv:${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/** Case/diacritic-insensitive text for search. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function shuffleArray<T>(list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Where "Play" starts in a list: a random track when shuffle is on, else the first. */
export function startIndex(length: number, shuffle: boolean): number {
  return shuffle ? Math.floor(Math.random() * length) : 0;
}

const NON_TEXT_INPUTS = [
  'button',
  'checkbox',
  'radio',
  'range',
  'submit',
  'reset',
  'file',
  'color',
  'image',
];

/** True when the user is typing: every key belongs to the field. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(target.type);
}

/** True for controls that use Space themselves (buttons, links, checkboxes, sliders…). */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    'button, a[href], input, select, textarea, summary, [role="button"], [role="menuitem"], [role="slider"], [role="checkbox"], [tabindex]:not([tabindex="-1"])',
  );
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
