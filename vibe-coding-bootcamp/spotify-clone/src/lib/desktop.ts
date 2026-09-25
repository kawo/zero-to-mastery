/**
 * The bridge the Electron app exposes to the page (electron/preload.ts). In a
 * browser it's absent, and everything here returns null/false.
 * Types only are shared with the Electron side, so keep this file free of imports.
 */

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'none' }
  | { state: 'downloading'; version: string; percent?: number }
  /** Downloaded; installs on restart. */
  | { state: 'ready'; version: string }
  /** Found, but this build can't install it itself (unsigned macOS): download it by hand. */
  | { state: 'manual'; version: string; url: string }
  | { state: 'error'; message: string };

export interface DesktopApi {
  platform: 'win32' | 'darwin' | 'linux';
  appInfo(): Promise<{ version: string; autoInstall: boolean }>;
  /** The latest update status (for a page that just loaded). */
  updateStatus(): Promise<UpdateStatus>;
  /** Subscribes to update progress; returns an unsubscribe function. */
  onUpdate(listener: (status: UpdateStatus) => void): () => void;
  checkForUpdates(): Promise<void>;
  /** Quits and installs a downloaded update. */
  installUpdate(): Promise<void>;
}

declare global {
  interface Window {
    tuneboxDesktop?: DesktopApi;
  }
}

/** The desktop bridge, or null when running as a web app. */
export function desktop(): DesktopApi | null {
  return typeof window !== 'undefined' ? (window.tuneboxDesktop ?? null) : null;
}

export const isDesktop = (): boolean => desktop() !== null;
