import { useId, useRef, useState } from 'react';
import { FolderOpen, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/** Recursively collects files from dropped folders (Chrome/Edge/Firefox/Safari all support webkitGetAsEntry). */
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((i) => (i.kind === 'file' ? i.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return [...dt.files];

  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(
        await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)),
      );
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns batches; keep reading until empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
          reader.readEntries(res, rej),
        );
        if (batch.length === 0) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

export function UploadDropzone({ onFiles, disabled }: UploadDropzoneProps) {
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const hintId = useId();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        onFiles(await filesFromDataTransfer(e.dataTransfer));
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
        over ? 'border-accent bg-accent/10' : 'border-border bg-surface',
        disabled && 'opacity-60',
      )}
    >
      <UploadCloud className={cn('h-12 w-12', over ? 'text-accent' : 'text-muted')} aria-hidden />
      <div>
        <p className="text-lg font-bold">Drop MP3s or a folder here</p>
        <p id={hintId} className="mt-1 text-sm text-muted">
          Files stay on this device. Nothing is uploaded to a server. Add .lrc files with the same
          name as a song to give it synced lyrics.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
          aria-describedby={hintId}
        >
          <UploadCloud className="h-4 w-4" aria-hidden />
          Choose files
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          onClick={() => folderInput.current?.click()}
        >
          <FolderOpen className="h-4 w-4" aria-hidden />
          Choose folder
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav,.lrc"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // Non-standard but supported by every major browser for folder picking.
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
