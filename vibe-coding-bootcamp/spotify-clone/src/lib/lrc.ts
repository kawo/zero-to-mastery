/**
 * LRC lyrics parsing. Handles the common variants:
 *   [01:23.45] line          timestamps as mm:ss, mm:ss.x, mm:ss.xx, mm:ss.xxx or mm:ss:xx
 *   [00:12.00][01:40.00] a   one line repeated at several times
 *   [offset:+250]            global shift in ms (positive = lyrics sooner)
 *   [00:12.00]<00:12.00>Hel <00:12.40>lo    "enhanced" per-word timings (A2 / Walaoke)
 *   [ar: …] [ti: …]          metadata tags, ignored
 */

export interface LyricWord {
  /** Seconds. */
  time: number;
  text: string;
}

export interface LyricLine {
  /** Seconds. */
  time: number;
  text: string;
  /** Per-word timings, when the file has them. */
  words?: LyricWord[];
}

/** Byte-order mark some editors put at the start of UTF-8 files. */
const BOM = new RegExp('^\uFEFF');
const LINE_STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const WORD = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g;

function seconds(min: string, sec: string, frac: string | undefined): number {
  const f = frac ? Number(frac) / 10 ** frac.length : 0;
  return Number(min) * 60 + Number(sec) + f;
}

/** True if the text has at least one LRC line timestamp. */
export function isLrc(text: string): boolean {
  return /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(text);
}

/** Parses LRC text into time-ordered lines. Returns [] if it has no timestamps. */
export function parseLrc(text: string): LyricLine[] {
  let offset = 0;
  const lines: LyricLine[] = [];
  for (const raw of text.replace(BOM, '').split(/\r?\n/)) {
    const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (off) {
      offset = Number(off[1]) / 1000;
      continue;
    }
    const stamps: number[] = [];
    let rest = raw.trim();
    for (let m = LINE_STAMP.exec(rest); m; m = LINE_STAMP.exec(rest)) {
      stamps.push(seconds(m[1]!, m[2]!, m[3]));
      rest = rest.slice(m[0].length);
    }
    if (!stamps.length) continue;

    // Per-word timings: "<mm:ss.xx>word <mm:ss.xx>word". Text before the first one
    // starts with the line.
    let words: LyricWord[] | undefined;
    const timed = [...rest.matchAll(WORD)];
    if (timed.length) {
      const lead = rest.slice(0, timed[0]!.index);
      words = [
        ...(lead.trim() ? [{ time: stamps[0]!, text: lead }] : []),
        ...timed
          .filter((m) => m[4])
          .map((m) => ({ time: seconds(m[1]!, m[2]!, m[3]), text: m[4]! })),
      ];
      rest = words.map((w) => w.text).join('');
    }

    const text = rest.replace(/\s+/g, ' ').trim();
    for (const time of stamps) {
      lines.push({
        time: Math.max(0, time - offset),
        text,
        words: words?.map((w) => ({ time: Math.max(0, w.time - offset), text: w.text })),
      });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the line being sung at `time` (seconds), or -1 before the first line. */
export function lineIndexAt(lines: readonly LyricLine[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.time <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Builds LRC text from timed lines (for lyrics embedded as ID3 SYLT frames). */
export function toLrc(lines: readonly { time: number; text: string }[]): string {
  const stamp = (t: number) => {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
  };
  return lines.map((l) => `${stamp(l.time)}${l.text}`).join('\n');
}
