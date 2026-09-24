/**
 * Demo library for quick UI testing (dev flag only, see flags.ts).
 * Generates tiny WAV melodies (8 kHz, 8-bit mono, a few seconds each) and
 * canvas artwork in the browser, so no binary fixtures are committed.
 * Idempotent: re-seeding skips tracks that already exist.
 */
import { db } from '@/db/indexedDb';
import { createPlaylist } from '@/db/library';
import { hslToRgb } from '@/lib/audio';
import type { BlobDoc, Track } from '@/types';

interface DemoSong {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  /** MIDI note numbers; 0 = rest. */
  notes: number[];
  bpm: number;
  hue?: number; // artwork hue; omitted → placeholder artwork
}

const SONGS: DemoSong[] = [
  {
    title: 'Morning Signal',
    artist: 'The Sine Waves',
    album: 'Oscillations',
    genre: 'Electronic',
    year: 2021,
    notes: [60, 64, 67, 72, 67, 64],
    bpm: 150,
    hue: 150,
  },
  {
    title: 'Square Dance',
    artist: 'The Sine Waves',
    album: 'Oscillations',
    genre: 'Electronic',
    year: 2021,
    notes: [67, 0, 67, 69, 71, 69, 67],
    bpm: 180,
    hue: 150,
  },
  {
    title: 'Low Tide',
    artist: 'Harbor Lights',
    album: 'Coastline',
    genre: 'Ambient',
    year: 2019,
    notes: [48, 55, 52, 55],
    bpm: 70,
    hue: 205,
  },
  {
    title: 'Lighthouse',
    artist: 'Harbor Lights',
    album: 'Coastline',
    genre: 'Ambient',
    year: 2019,
    notes: [57, 60, 64, 62, 60],
    bpm: 90,
    hue: 205,
  },
  {
    title: 'Paper Planes',
    artist: 'Mina Okafor',
    album: 'Small Hours',
    genre: 'Indie',
    year: 2023,
    notes: [64, 66, 68, 69, 71, 73],
    bpm: 160,
    hue: 18,
  },
  {
    title: 'Kettle Song',
    artist: 'Mina Okafor',
    album: 'Small Hours',
    genre: 'Indie',
    year: 2023,
    notes: [72, 71, 69, 67, 69],
    bpm: 130,
  },
  {
    title: 'Night Bus',
    artist: 'Quiet Engines',
    album: 'Night Bus',
    genre: 'Lo-fi',
    year: 2022,
    notes: [53, 57, 60, 57, 55],
    bpm: 85,
    hue: 275,
  },
  {
    title: 'Tiny Loop (no tags)',
    artist: 'Unknown artist',
    album: 'Unknown album',
    genre: 'Test',
    year: 2024,
    notes: [69, 0, 69, 0],
    bpm: 200,
  },
];

const RATE = 8000;

function midiToHz(n: number) {
  return 440 * 2 ** ((n - 69) / 12);
}

/** 8-bit PCM WAV with a soft attack/release per note (no clicks). */
function renderWav(notes: number[], bpm: number): Blob {
  const noteLen = Math.round((60 / bpm) * RATE);
  const total = noteLen * notes.length;
  const buf = new ArrayBuffer(44 + total);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + total, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE, true); // byte rate
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true); // bits
  str(36, 'data');
  v.setUint32(40, total, true);
  let o = 44;
  for (const n of notes) {
    const hz = n ? midiToHz(n) : 0;
    for (let i = 0; i < noteLen; i++) {
      const env = Math.min(1, i / 200, (noteLen - i) / 400);
      const s = hz
        ? Math.sin((2 * Math.PI * hz * i) / RATE) * 0.6 +
          Math.sin((4 * Math.PI * hz * i) / RATE) * 0.15
        : 0;
      v.setUint8(o++, Math.round(128 + s * env * 100));
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

async function renderArtwork(hue: number, label: string): Promise<Blob | null> {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const a = hslToRgb(hue, 0.7, 0.5);
  const b = hslToRgb((hue + 60) % 360, 0.7, 0.2);
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, `rgb(${a.r},${a.g},${a.b})`);
  g.addColorStop(1, `rgb(${b.r},${b.g},${b.b})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#fff';
  for (let r = 60; r < 400; r += 55) {
    ctx.beginPath();
    ctx.arc(size * 0.75, size * 0.25, r, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(label, 32, size - 40);
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

export async function seedDemoLibrary(): Promise<number> {
  const now = Date.now();
  const artByAlbum = new Map<string, string>();
  let added = 0;
  const ids: string[] = [];

  for (const [i, s] of SONGS.entries()) {
    const hash = `demo:${i}`;
    const existing = await db.tracks.where('hash').equals(hash).first();
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const blobs: BlobDoc[] = [];
    let artworkBlobId: string | undefined;
    if (s.hue !== undefined) {
      artworkBlobId = artByAlbum.get(s.album);
      if (!artworkBlobId) {
        const art = await renderArtwork(s.hue, s.album);
        if (art) {
          artworkBlobId = `art-demo-${s.album.toLowerCase().replace(/\W+/g, '-')}`;
          artByAlbum.set(s.album, artworkBlobId);
          blobs.push({
            id: artworkBlobId,
            type: 'artwork',
            blob: art,
            mimeType: art.type,
            size: art.size,
            createdAt: now,
          });
        }
      }
    }
    const audio = renderWav(s.notes, s.bpm);
    const id = `demo-${i}`;
    blobs.push({
      id: `audio-${id}`,
      type: 'audio',
      blob: audio,
      mimeType: 'audio/wav',
      size: audio.size,
      createdAt: now,
    });
    const track: Track = {
      id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      genre: s.genre,
      year: s.year,
      duration: (s.notes.length * 60) / s.bpm,
      audioBlobId: `audio-${id}`,
      artworkBlobId,
      hash,
      fileName: `${s.artist} - ${s.title}.wav`,
      fileSize: audio.size,
      mimeType: 'audio/wav',
      playCount: 0,
      createdAt: now + i, // stable "date added" order
      updatedAt: now,
    };
    await db.transaction('rw', db.tracks, db.blobs, async () => {
      await db.blobs.bulkPut(blobs);
      await db.tracks.put(track);
    });
    ids.push(id);
    added++;
  }

  if (added && !(await db.playlists.where('name').equals('Demo mix').count())) {
    await createPlaylist(
      'Demo mix',
      ids.filter((_, i) => i % 2 === 0),
    );
  }
  return added;
}
