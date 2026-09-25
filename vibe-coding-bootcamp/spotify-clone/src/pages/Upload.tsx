import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Database,
  FileDown,
  FileUp,
  Link2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { DemoSeedButton } from '@/components/DemoSeedButton';
import { TopBar } from '@/components/TopBar';
import { UploadDropzone } from '@/components/UploadDropzone';
import { Dialog } from '@/components/ui/Dialog';
import { getStorageInfo, requestPersistentStorage, type StorageInfo } from '@/db/library';
import { describeDbError } from '@/db/indexedDb';
import { useOnline } from '@/hooks/useBrowser';
import { useLibrary } from '@/hooks/useIndexedDb';
import {
  estimateFullExportSize,
  exportMetadata,
  exportWithAudio,
  importBackup,
} from '@/lib/backup';
import { importFiles, isAudioFile } from '@/lib/importer';
import { attachLyricsFiles, isLyricsFile } from '@/lib/lyrics';
import { cn, downloadBlob, formatBytes, pluralize, uid } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { ImportItem, ImportStatus } from '@/types';

const STATUS_TEXT: Record<ImportStatus, string> = {
  queued: 'Waiting',
  hashing: 'Checking for duplicates',
  parsing: 'Reading tags',
  saving: 'Saving',
  done: 'Added',
  relinked: 'Relinked',
  duplicate: 'Already in library',
  error: 'Failed',
};
const FINISHED: ImportStatus[] = ['done', 'relinked', 'duplicate', 'error'];

/** Full backups above this size get an extra warning: the zip is built in memory. */
const LARGE_EXPORT = 500 * 1024 * 1024;

export default function Upload() {
  const toast = useToast();
  const online = useOnline();
  const { tracks } = useLibrary();
  const [items, setItems] = useState<ImportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refreshStorage = useCallback(() => void getStorageInfo().then(setStorage), []);
  useEffect(refreshStorage, [refreshStorage, tracks?.length]);

  // Warn before closing the tab mid-import.
  useEffect(() => {
    if (!busy) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [busy]);

  /** .lrc files attach to songs with the same file name (just imported or already here). */
  const addLyricsFiles = async (lrc: File[]) => {
    if (!lrc.length) return;
    const matched = await attachLyricsFiles(lrc);
    toast({
      tone: matched ? 'success' : 'info',
      message: matched
        ? `Added lyrics to ${pluralize(matched, 'song')}${matched < lrc.length ? ` (${lrc.length - matched} .lrc ${lrc.length - matched === 1 ? "file didn't" : "files didn't"} match a song's file name)` : ''}.`
        : `None of the ${pluralize(lrc.length, '.lrc file')} match a song's file name. Name them like the audio file (Song.mp3 → Song.lrc).`,
    });
  };

  const onFiles = async (files: File[]) => {
    const lrc = files.filter(isLyricsFile);
    const audio = files.filter(isAudioFile);
    const skipped = files.length - audio.length - lrc.length;
    if (skipped)
      toast(
        `Skipped ${pluralize(skipped, 'file')} that ${skipped === 1 ? "isn't" : "aren't"} audio or lyrics.`,
      );
    if (!audio.length) {
      await addLyricsFiles(lrc);
      return;
    }

    const entries = audio.map((file) => ({ key: uid(), file }));
    setItems(
      entries.map(({ key, file }) => ({
        key,
        fileName: file.webkitRelativePath || file.name,
        size: file.size,
        status: 'queued',
      })),
    );
    setBusy(true);
    abort.current = new AbortController();
    try {
      const res = await importFiles(entries, {
        signal: abort.current.signal,
        onItem: (key, patch) =>
          setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it))),
      });
      if (res.quotaError) toast({ tone: 'error', message: res.quotaError, duration: 0 });
      const parts = [
        res.added && `${pluralize(res.added, 'song')} added`,
        res.relinked && `${res.relinked} relinked`,
        res.duplicates && `${pluralize(res.duplicates, 'duplicate')} skipped`,
        res.failed && `${res.failed} failed`,
      ].filter(Boolean);
      toast({
        tone: res.failed && !res.added ? 'error' : 'success',
        message: `Import finished: ${parts.join(', ')}.`,
      });
      await addLyricsFiles(lrc);
    } finally {
      setBusy(false);
      refreshStorage();
    }
  };

  const done = items.filter((i) => FINISHED.includes(i.status)).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const added = items.filter((i) => i.status === 'done' || i.status === 'relinked').length;

  return (
    <>
      <TopBar title="Import" subtitle="Add music from this device" />

      {!online && (
        <p className="mb-4 rounded-lg bg-elevated px-4 py-3 text-sm text-muted">
          You're offline. That's fine: importing reads files from your device and never needs the
          network.
        </p>
      )}

      <UploadDropzone onFiles={onFiles} disabled={busy} />

      {items.length > 0 && (
        <section aria-labelledby="progress-heading" className="card mt-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="progress-heading" className="font-bold">
              {busy
                ? `Importing ${done + 1 > items.length ? items.length : done + 1} of ${items.length}…`
                : `Imported ${pluralize(added, 'song')}`}
            </h2>
            <div className="flex gap-2">
              {busy ? (
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5"
                  onClick={() => abort.current?.abort()}
                >
                  Cancel
                </button>
              ) : (
                <>
                  {added > 0 && (
                    <Link to="/songs?sort=createdAt" className="btn-primary px-3 py-1.5">
                      View songs
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5"
                    onClick={() => setItems([])}
                  >
                    Clear list
                  </button>
                </>
              )}
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-3 h-2 overflow-hidden rounded-full bg-elevated"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul
            className="scrollbar-thin mt-4 max-h-80 divide-y divide-border overflow-y-auto"
            aria-label="Files"
          >
            {items.map((it) => (
              <li key={it.key} className="flex items-center gap-3 py-2 text-sm">
                <StatusIcon status={it.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{it.fileName}</p>
                  {it.message && (
                    <p
                      className={cn(
                        'truncate text-xs',
                        it.status === 'error' ? 'text-danger' : 'text-muted',
                      )}
                    >
                      {it.message}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted">{STATUS_TEXT[it.status]}</span>
                <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted sm:block">
                  {formatBytes(it.size)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <StorageCard
          storage={storage}
          onPersist={async () => {
            const ok = await requestPersistentStorage();
            toast(
              ok
                ? { tone: 'success', message: 'Storage is now persistent.' }
                : 'The browser declined. Installing the app usually helps.',
            );
            refreshStorage();
          }}
        />
        <BackupCard trackCount={tracks?.length ?? 0} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-muted">
        <DemoSeedButton />
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: ImportStatus }) {
  if (status === 'done')
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />;
  if (status === 'relinked') return <Link2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />;
  if (status === 'duplicate') return <Copy className="h-4 w-4 shrink-0 text-muted" aria-hidden />;
  if (status === 'error')
    return <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden />;
  if (status === 'queued')
    return <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border" aria-hidden />;
  return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden />;
}

function StorageCard({
  storage,
  onPersist,
}: {
  storage: StorageInfo | null;
  onPersist: () => void;
}) {
  const pct = storage && storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;
  return (
    <section aria-labelledby="storage-heading" className="card p-5">
      <h2 id="storage-heading" className="flex items-center gap-2 font-bold">
        <Database className="h-5 w-5 text-muted" aria-hidden />
        Storage on this device
      </h2>
      {storage ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Using {formatBytes(storage.usage)} of about {formatBytes(storage.quota)} available to
            this site.
          </p>
          <div
            role="meter"
            aria-label="Storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="mt-3 h-2 overflow-hidden rounded-full bg-elevated"
          >
            <div
              className={cn('h-full rounded-full', pct > 85 ? 'bg-danger' : 'bg-accent')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <ShieldCheck
              className={cn('h-4 w-4', storage.persisted ? 'text-accent' : 'text-muted')}
              aria-hidden
            />
            {storage.persisted
              ? 'Persistent: the browser will not clear it automatically.'
              : 'Best-effort: the browser may clear it if the disk fills up.'}
          </p>
          {!storage.persisted && (
            <button type="button" className="btn-secondary mt-3" onClick={onPersist}>
              Make storage persistent
            </button>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">This browser doesn't report storage usage.</p>
      )}
    </section>
  );
}

function BackupCard({ trackCount }: { trackCount: number }) {
  const toast = useToast();
  const [working, setWorking] = useState<string | null>(null);
  const [confirmFull, setConfirmFull] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    setWorking('Exporting…');
    try {
      const { blob, fileName } = await exportMetadata();
      downloadBlob(blob, fileName);
      toast({ tone: 'success', message: 'Library metadata exported.' });
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    } finally {
      setWorking(null);
    }
  };

  const exportFull = async () => {
    setConfirmFull(null);
    setWorking('Preparing zip…');
    try {
      const { blob, fileName } = await exportWithAudio((d, t) =>
        setWorking(`Packing ${d} of ${t} files…`),
      );
      downloadBlob(blob, fileName);
      toast({ tone: 'success', message: `Full backup ready (${formatBytes(blob.size)}).` });
    } catch (err) {
      toast({
        tone: 'error',
        message:
          err instanceof RangeError
            ? 'The library is too large to zip in this browser. Export metadata only, and keep your original files.'
            : describeDbError(err),
      });
    } finally {
      setWorking(null);
    }
  };

  const restore = async (file: File) => {
    setWorking('Restoring…');
    try {
      const s = await importBackup(file);
      const parts = [
        s.tracksAdded && `${pluralize(s.tracksAdded, 'song')} added`,
        s.tracksLinked && `${s.tracksLinked} matched songs already here`,
        s.playlists && pluralize(s.playlists, 'playlist'),
      ].filter(Boolean);
      toast({
        tone: 'success',
        message: `Restore complete: ${parts.join(', ') || 'nothing new'}.`,
      });
      if (s.tracksMissingAudio) {
        toast({
          message: `${pluralize(s.tracksMissingAudio, 'song')} ${s.tracksMissingAudio === 1 ? 'has' : 'have'} no audio on this device yet. Import the original files to relink them.`,
          duration: 0,
        });
      }
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error && !('inner' in err) ? err.message : describeDbError(err),
      });
    } finally {
      setWorking(null);
    }
  };

  return (
    <section aria-labelledby="backup-heading" className="card p-5">
      <h2 id="backup-heading" className="flex items-center gap-2 font-bold">
        <FileDown className="h-5 w-5 text-muted" aria-hidden />
        Backup &amp; restore
      </h2>
      <p className="mt-2 text-sm text-muted">
        A metadata backup (JSON) holds songs, playlists and settings, but no audio. When restored,
        it relinks to songs already on the device, or to files you import later. A full backup (zip)
        also includes the audio and artwork.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!!working || !trackCount}
          onClick={exportJson}
        >
          Export metadata (.json)
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!!working || !trackCount}
          onClick={async () => setConfirmFull(await estimateFullExportSize())}
        >
          Export with audio (.zip)
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!!working}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="h-4 w-4" aria-hidden />
          Restore backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.zip,application/json,application/zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void restore(f);
          }}
        />
      </div>
      {working && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {working}
        </p>
      )}

      <Dialog
        open={confirmFull !== null}
        onClose={() => setConfirmFull(null)}
        title="Export with audio?"
        description={`About ${formatBytes(confirmFull ?? 0)} of audio and artwork will be packed into one zip file.`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmFull(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={exportFull}>
              Export
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {(confirmFull ?? 0) > LARGE_EXPORT
            ? 'That is large. The zip is built in memory, which can fail on phones. If it fails, export metadata only and keep your original files.'
            : 'The download starts when the zip is ready.'}
        </p>
      </Dialog>
    </section>
  );
}
