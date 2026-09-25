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
import { cn, downloadBlob, uid } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { ImportItem, ImportStatus } from '@/types';
import { formatBytes, useI18n, type MessageKey } from '@/i18n';

const STATUS_TEXT = {
  queued: 'upload.status.queued',
  hashing: 'upload.status.hashing',
  parsing: 'upload.status.parsing',
  saving: 'upload.status.saving',
  done: 'upload.status.done',
  relinked: 'upload.status.relinked',
  duplicate: 'upload.status.duplicate',
  error: 'upload.status.error',
} as const satisfies Record<ImportStatus, MessageKey>;
const FINISHED: ImportStatus[] = ['done', 'relinked', 'duplicate', 'error'];

/** Full backups above this size get an extra warning: the zip is built in memory. */
const LARGE_EXPORT = 500 * 1024 * 1024;

export default function Upload() {
  const toast = useToast();
  const online = useOnline();
  const { t } = useI18n();
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
        ? t('upload.lyricsAdded', { count: matched }).replace(
            /\.$/,
            matched < lrc.length
              ? `${t('upload.lyricsUnmatched', { count: lrc.length - matched })}.`
              : '.',
          )
        : t('upload.lyricsNoneMatched', { count: lrc.length }),
    });
  };

  const onFiles = async (files: File[]) => {
    const lrc = files.filter(isLyricsFile);
    const audio = files.filter(isAudioFile);
    const skipped = files.length - audio.length - lrc.length;
    if (skipped) toast(t('upload.skipped', { count: skipped }));
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
        res.added && t('upload.partAdded', { count: res.added }),
        res.relinked && t('upload.partRelinked', { count: res.relinked }),
        res.duplicates && t('upload.partDuplicates', { count: res.duplicates }),
        res.failed && t('upload.partFailed', { count: res.failed }),
      ].filter(Boolean);
      toast({
        tone: res.failed && !res.added ? 'error' : 'success',
        message: t('upload.finished', { parts: parts.join(', ') }),
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
      <TopBar title={t('upload.title')} subtitle={t('upload.subtitle')} />

      {!online && (
        <p className="mb-4 rounded-lg bg-elevated px-4 py-3 text-sm text-muted">
          {t('upload.offline')}
        </p>
      )}

      <UploadDropzone onFiles={onFiles} disabled={busy} />

      {items.length > 0 && (
        <section aria-labelledby="progress-heading" className="card mt-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="progress-heading" className="font-bold">
              {busy
                ? t('upload.importing', {
                    current: Math.min(done + 1, items.length),
                    total: items.length,
                  })
                : t('upload.imported', { count: added })}
            </h2>
            <div className="flex gap-2">
              {busy ? (
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5"
                  onClick={() => abort.current?.abort()}
                >
                  {t('common.cancel')}
                </button>
              ) : (
                <>
                  {added > 0 && (
                    <Link to="/songs?sort=createdAt" className="btn-primary px-3 py-1.5">
                      {t('upload.viewSongs')}
                    </Link>
                  )}
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5"
                    onClick={() => setItems([])}
                  >
                    {t('upload.clearList')}
                  </button>
                </>
              )}
            </div>
          </div>
          <div
            role="progressbar"
            aria-label={t('upload.progress')}
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
            aria-label={t('upload.files')}
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
                <span className="shrink-0 text-xs text-muted">{t(STATUS_TEXT[it.status])}</span>
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
                ? { tone: 'success', message: t('upload.persistOk') }
                : t('upload.persistDeclined'),
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
  const { t } = useI18n();
  const pct = storage && storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;
  return (
    <section aria-labelledby="storage-heading" className="card p-5">
      <h2 id="storage-heading" className="flex items-center gap-2 font-bold">
        <Database className="h-5 w-5 text-muted" aria-hidden />
        {t('upload.storageTitle')}
      </h2>
      {storage ? (
        <>
          <p className="mt-2 text-sm text-muted">
            {t('upload.storageUsage', {
              usage: formatBytes(storage.usage),
              quota: formatBytes(storage.quota),
            })}
          </p>
          <div
            role="meter"
            aria-label={t('upload.storageUsed')}
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
            {storage.persisted ? t('upload.persistent') : t('upload.bestEffort')}
          </p>
          {!storage.persisted && (
            <button type="button" className="btn-secondary mt-3" onClick={onPersist}>
              {t('upload.makePersistent')}
            </button>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('upload.noStorageInfo')}</p>
      )}
    </section>
  );
}

function BackupCard({ trackCount }: { trackCount: number }) {
  const toast = useToast();
  const { t } = useI18n();
  const [working, setWorking] = useState<string | null>(null);
  const [confirmFull, setConfirmFull] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    setWorking(t('upload.exporting'));
    try {
      const { blob, fileName } = await exportMetadata();
      downloadBlob(blob, fileName);
      toast({ tone: 'success', message: t('upload.exported') });
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    } finally {
      setWorking(null);
    }
  };

  const exportFull = async () => {
    setConfirmFull(null);
    setWorking(t('upload.preparingZip'));
    try {
      const { blob, fileName } = await exportWithAudio((done, total) =>
        setWorking(t('upload.packing', { done, total })),
      );
      downloadBlob(blob, fileName);
      toast({ tone: 'success', message: t('upload.zipReady', { size: formatBytes(blob.size) }) });
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof RangeError ? t('upload.zipTooLarge') : describeDbError(err),
      });
    } finally {
      setWorking(null);
    }
  };

  const restore = async (file: File) => {
    setWorking(t('upload.restoring'));
    try {
      const s = await importBackup(file);
      const parts = [
        s.tracksAdded && t('upload.restoredSongs', { count: s.tracksAdded }),
        s.tracksLinked && t('upload.restoredLinked', { count: s.tracksLinked }),
        s.playlists && t('common.playlists', { count: s.playlists }),
      ].filter(Boolean);
      toast({
        tone: 'success',
        message: t('upload.restoreComplete', { parts: parts.join(', ') || t('upload.nothingNew') }),
      });
      if (s.tracksMissingAudio) {
        toast({
          message: t('upload.missingAudio', { count: s.tracksMissingAudio }),
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
        {t('upload.backupTitle')}
      </h2>
      <p className="mt-2 text-sm text-muted">{t('upload.backupHelp')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!!working || !trackCount}
          onClick={exportJson}
        >
          {t('upload.exportJson')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!!working || !trackCount}
          onClick={async () => setConfirmFull(await estimateFullExportSize())}
        >
          {t('upload.exportZip')}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!!working}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="h-4 w-4" aria-hidden />
          {t('upload.restore')}
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
        title={t('upload.confirmZipTitle')}
        description={t('upload.confirmZipHelp', { size: formatBytes(confirmFull ?? 0) })}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmFull(null)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={exportFull}>
              {t('upload.export')}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {(confirmFull ?? 0) > LARGE_EXPORT ? t('upload.zipLarge') : t('upload.zipStarts')}
        </p>
      </Dialog>
    </section>
  );
}
