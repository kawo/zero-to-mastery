/**
 * Tracks when a Media Session action last ran, so the keyboard fallback for
 * hardware media keys can tell whether the browser already delivered the key.
 *
 * The OS sends media keys to one "current" media session. When another tab or
 * app holds that spot (common once Tunebox is paused), the key never reaches
 * our Media Session, but a focused Tunebox tab still gets it as a keydown.
 */
let lastAction = -Infinity;

/** How long to wait for the Media Session before handling a media key ourselves. */
export const MEDIA_KEY_GRACE_MS = 400;

export function noteMediaSessionAction(): void {
  lastAction = performance.now();
}

/** True if a Media Session action ran at or after `time` (a `performance.now()` value). */
export function mediaSessionActedSince(time: number): boolean {
  return lastAction >= time;
}
