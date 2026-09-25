/** Locale-aware formatting of sizes, durations, percentages and speeds. */
import { formatNumber, getLocale, translate, type Locale } from '@/i18n/core';

/** "12.3 MB" / « 12,3 Mo ». */
export function formatBytes(bytes: number, locale: Locale = getLocale()): string {
  const units = locale === 'fr' ? ['o', 'Ko', 'Mo', 'Go', 'To'] : ['B', 'KB', 'MB', 'GB', 'TB'];
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${units[0]}`;
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  const rounded = v >= 10 || i === 0 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${formatNumber(rounded, locale)}\u00a0${units[i]}`;
}

/** "1 hr 12 min" / « 1 h 12 min »: totals for playlists and the library. */
export function formatTotalDuration(seconds: number, locale: Locale = getLocale()): string {
  if (seconds < 60) return translate(locale, 'format.durationSeconds', { s: Math.round(seconds) });
  const mins = Math.round(seconds / 60);
  if (mins < 60) return translate(locale, 'format.durationMinutes', { m: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m
    ? translate(locale, 'format.durationHoursMinutes', { h, m })
    : translate(locale, 'format.durationHours', { h });
}

/** Spoken time for aria-valuetext: "2 minutes 5 seconds". */
export function spokenTime(seconds: number, locale: Locale = getLocale()): string {
  if (!Number.isFinite(seconds)) return translate(locale, 'format.unknownTime');
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const secs = translate(locale, 'format.seconds', { count: s % 60 });
  return m ? `${translate(locale, 'format.minutes', { count: m })} ${secs}` : secs;
}

/** 0.8 → "80%" / « 80 % ». */
export function formatPercent(fraction: number, locale: Locale = getLocale()): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    fraction,
  );
}

/** 1.25 → "1.25×" / « 1,25× ». */
export function formatSpeed(rate: number, locale: Locale = getLocale()): string {
  return `${formatNumber(Number(rate.toFixed(2)), locale)}×`;
}
