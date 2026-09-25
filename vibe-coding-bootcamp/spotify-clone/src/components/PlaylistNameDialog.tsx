import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useI18n } from '@/i18n';

interface Props {
  open: boolean;
  mode: 'create' | 'rename';
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}

/** Create or rename a playlist. Remounted per open (via `key`) so the field resets. */
export function PlaylistNameDialog({ open, mode, initialName = '', onClose, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const { t } = useI18n();
  const title = mode === 'create' ? t('playlistName.newTitle') : t('playlistName.renameTitle');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="playlist-name-form"
            className="btn-primary"
            disabled={!name.trim()}
          >
            {mode === 'create' ? t('common.create') : t('common.save')}
          </button>
        </>
      }
    >
      <form
        id="playlist-name-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim()) await onSubmit(name.trim());
        }}
      >
        <label htmlFor="playlist-name" className="mb-1 block text-sm font-medium">
          {t('playlistName.name')}
        </label>
        <input
          id="playlist-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoFocus
          placeholder={t('playlistName.placeholder')}
        />
      </form>
    </Dialog>
  );
}
