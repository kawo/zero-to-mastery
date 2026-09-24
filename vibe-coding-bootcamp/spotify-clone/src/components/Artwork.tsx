import { useState, useSyncExternalStore } from 'react';
import { useBlobUrl } from '@/hooks/useIndexedDb';
import { artworkThumbUrl, initials, placeholderGradient } from '@/lib/audio';
import { cn } from '@/lib/utils';
import type { Track } from '@/types';

type ArtworkTrack = Pick<Track, 'id' | 'hash' | 'title' | 'album' | 'artworkBlobId'>;

const SIZES = {
  xs: { px: 40, cls: 'h-10 w-10 rounded', text: 'text-xs' },
  sm: { px: 48, cls: 'h-12 w-12 rounded-md', text: 'text-sm' },
  md: { px: 160, cls: 'h-40 w-40 rounded-lg', text: 'text-3xl' },
  lg: { px: 320, cls: 'aspect-square w-full rounded-xl', text: 'text-6xl' },
} as const;

export type ArtworkSize = keyof typeof SIZES;

/** Thumbnail buckets so the service worker cache gets hits across sizes/DPRs. */
const bucket = (px: number) => (px <= 96 ? 96 : px <= 192 ? 192 : 384);

function subscribeController(cb: () => void) {
  navigator.serviceWorker?.addEventListener('controllerchange', cb);
  return () => navigator.serviceWorker?.removeEventListener('controllerchange', cb);
}
const hasController = () => !!navigator.serviceWorker?.controller;

interface ArtworkProps {
  track: ArtworkTrack | null | undefined;
  size?: ArtworkSize;
  className?: string;
  /** Decorative by default (the title is next to it); pass alt text when it stands alone. */
  alt?: string;
}

/**
 * Album art with three tiers:
 *  1. Small sizes: resized thumbnail served (and cached) by the service worker.
 *  2. Otherwise / fallback: object URL of the stored image blob.
 *  3. No artwork: deterministic gradient + initials placeholder.
 */
export function Artwork({ track, size = 'sm', className, alt = '' }: ArtworkProps) {
  const { px, cls, text } = SIZES[size];
  const controlled = useSyncExternalStore(subscribeController, hasController, () => false);
  const blobId = track?.artworkBlobId;
  // Remembers which blob failed to load in each tier; a new blobId naturally retries.
  const [failed, setFailed] = useState<{ thumb?: string; full?: string }>({});

  const thumbTier = controlled && px <= 192 && !!blobId && failed.thumb !== blobId;
  const fullUrl = useBlobUrl(!thumbTier && failed.full !== blobId ? blobId : undefined);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const src = !blobId ? null : thumbTier ? artworkThumbUrl(blobId, bucket(px * dpr)) : fullUrl;
  // Reading the blob from IndexedDB takes a moment: show a neutral tile, not the placeholder.
  const loading = src === undefined;

  const seed = track ? track.hash || track.id : 'empty';
  const label = track
    ? track.album && !track.album.startsWith('Unknown')
      ? track.album
      : track.title
    : '';

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden bg-elevated', cls, className)}
      style={src || loading ? undefined : { backgroundImage: placeholderGradient(seed) }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
          onError={() =>
            setFailed((f) => (thumbTier ? { ...f, thumb: blobId } : { ...f, full: blobId }))
          }
        />
      ) : loading ? null : (
        <span
          className={cn('absolute inset-0 grid place-items-center font-bold text-white/90', text)}
        >
          {track ? initials(label) : '♪'}
        </span>
      )}
    </div>
  );
}

/** 2×2 mosaic of distinct artworks for a playlist (single image if fewer than 4). */
export function ArtworkMosaic({
  tracks,
  className,
}: {
  tracks: ArtworkTrack[];
  className?: string;
}) {
  const seen = new Set<string>();
  const distinct = tracks.filter((t) => {
    const key = t.artworkBlobId ?? t.album;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (distinct.length < 4) {
    return <Artwork track={distinct[0] ?? null} size="lg" className={className} />;
  }
  return (
    <div
      className={cn('grid aspect-square w-full grid-cols-2 overflow-hidden rounded-xl', className)}
      aria-hidden
    >
      {distinct.slice(0, 4).map((t) => (
        <Artwork key={t.id} track={t} size="md" className="h-full w-full rounded-none" />
      ))}
    </div>
  );
}
