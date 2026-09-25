import { useId, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { CrossfadeControl } from '@/components/PlayerControls';
import { Dialog } from '@/components/ui/Dialog';
import { usePlayer } from '@/hooks/usePlayer';
import {
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_PRESETS,
  eqPreampDb,
  formatBand,
  SPEEDS,
  type EqPresetId,
} from '@/lib/eq';
import { normalizationGainDb, TARGET_LUFS } from '@/lib/loudness';
import { cn } from '@/lib/utils';
import { formatSpeed, rich, useI18n, type MessageKey } from '@/i18n';

/** Opens the Sound panel: speed, crossfade, normalization and equalizer. */
export function SoundButton({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const [open, setOpen] = useState(false);
  const { eq, normalize, playbackRate } = usePlayer();
  const { t } = useI18n();
  const active = eq.enabled || normalize || playbackRate !== 1;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          withLabel ? 'btn-secondary' : 'icon-btn relative',
          active && 'text-accent hover:text-accent',
          className,
        )}
        aria-haspopup="dialog"
        title={t('sound.tooltip')}
      >
        <SlidersHorizontal className={withLabel ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
        {withLabel ? t('sound.button') : <span className="sr-only">{t('sound.settings')}</span>}
        {active && !withLabel && (
          <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden />
        )}
      </button>
      <SoundPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-4 first:pt-0 last:border-0 last:pb-0">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-muted/40',
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  );
}

function SoundPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    playbackRate,
    setPlaybackRate,
    normalize,
    setNormalize,
    eq,
    setEq,
    currentTrack,
    canCrossfade,
  } = usePlayer();
  const presetId = useId();
  const { t, num } = useI18n();

  const setBand = (i: number, db: number) => {
    const gains = eq.gains.map((g, j) => (j === i ? db : g));
    const match = EQ_PRESETS.find((p) => p.gains.every((g, j) => g === gains[j]));
    setEq({ gains, preset: match?.id ?? 'custom', enabled: true });
  };

  const loudness = currentTrack?.loudness;
  const normStatus = !currentTrack
    ? null
    : loudness === undefined
      ? t('sound.measuring')
      : loudness === null
        ? t('sound.notMeasurable')
        : (() => {
            const g = normalizationGainDb(loudness);
            const db = num(Math.round(Math.abs(g) * 10) / 10);
            const change =
              Math.abs(g) < 0.1
                ? t('sound.unchanged')
                : t(g < 0 ? 'sound.quieter' : 'sound.louder', { db });
            return t('sound.measured', { lufs: num(Math.round(loudness.lufs * 10) / 10), change });
          })();

  return (
    <Dialog open={open} onClose={onClose} title={t('sound.title')} className="max-w-xl">
      <Section title={t('sound.speed')}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('sound.speed')}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={playbackRate === s}
              onClick={() => setPlaybackRate(s)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-sm tabular-nums',
                playbackRate === s
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-border hover:bg-elevated',
              )}
            >
              {formatSpeed(s)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {rich(t('sound.speedHelp'), { k1: () => <kbd>&lt;</kbd>, k2: () => <kbd>&gt;</kbd> })}
        </p>
      </Section>

      <Section title={t('sound.crossfade')}>
        <CrossfadeControl hideLabel />
      </Section>

      <Section title={t('sound.normalization')}>
        <div className="flex items-start gap-3">
          <Switch checked={normalize} onChange={setNormalize} label={t('sound.normalization')} />
          <div className="text-sm">
            <p>{t('sound.normalizationSummary', { lufs: TARGET_LUFS })}</p>
            <p className="mt-1 text-xs text-muted">{t('sound.normalizationHelp')}</p>
            {normalize && normStatus && (
              <p className="mt-1 text-xs text-muted" role="status">
                {normStatus}
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title={t('sound.equalizer')}>
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            checked={eq.enabled}
            onChange={(on) => setEq({ enabled: on })}
            label={t('sound.equalizer')}
          />
          <label htmlFor={presetId} className="sr-only">
            {t('sound.preset')}
          </label>
          <select
            id={presetId}
            className="input w-auto py-1.5"
            value={eq.preset}
            onChange={(e) => {
              const p = EQ_PRESETS.find((x) => x.id === (e.target.value as EqPresetId));
              if (p) setEq({ preset: p.id, gains: [...p.gains], enabled: true });
            }}
          >
            {EQ_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`sound.presets.${p.key}` as MessageKey)}
              </option>
            ))}
            {eq.preset === 'custom' && <option value="custom">{t('sound.custom')}</option>}
          </select>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setEq({ preset: 'flat', gains: EQ_BANDS.map(() => 0) })}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {t('sound.reset')}
          </button>
        </div>

        <div
          className="mt-4 grid grid-cols-10 gap-1 text-center"
          role="group"
          aria-label={t('sound.bands')}
        >
          {EQ_BANDS.map((hz, i) => {
            const g = eq.gains[i] ?? 0;
            return (
              <div key={hz} className="flex flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-muted">{g > 0 ? `+${g}` : g}</span>
                <input
                  type="range"
                  className="eq-range"
                  min={-EQ_MAX_DB}
                  max={EQ_MAX_DB}
                  step={1}
                  value={g}
                  disabled={!eq.enabled}
                  onChange={(e) => setBand(i, Number(e.target.value))}
                  aria-label={t('sound.bandLabel', { band: formatBand(hz) })}
                  aria-valuetext={t('sound.bandValue', { db: `${g > 0 ? '+' : ''}${num(g)}` })}
                />
                <span className="text-[10px] text-muted">{formatBand(hz)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          {eq.enabled && eqPreampDb(eq.gains) < 0
            ? t('sound.preamp', { db: -eqPreampDb(eq.gains) })
            : t('sound.bandHelp')}
        </p>
      </Section>

      {!canCrossfade && (eq.enabled || normalize) && (
        <p className="mt-3 rounded-lg bg-elevated p-3 text-xs text-muted">
          {t('sound.iosWarning')}
        </p>
      )}
    </Dialog>
  );
}
