/**
 * The units recipes are shown in: as written, metric or imperial. Like the
 * theme, it's a per-device choice saved in localStorage. Every component that
 * uses it updates together, and so do other open tabs.
 */
import { useSyncExternalStore } from 'react';
import type { UnitSystem } from './measure';

const STORAGE_KEY = 'units';
const listeners = new Set<() => void>();

function readUnitSystem(): UnitSystem {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'metric' || saved === 'imperial' ? saved : 'original';
  } catch {
    return 'original';
  }
}

let current = readUnitSystem();

export function setUnitSystem(next: UnitSystem) {
  current = next;
  try {
    if (next === 'original') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode or storage disabled: the choice lasts for this visit only
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Changed in another tab (a null key means that tab cleared storage)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    current = readUnitSystem();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useUnitSystem(): [UnitSystem, (next: UnitSystem) => void] {
  return [useSyncExternalStore(subscribe, () => current), setUnitSystem];
}
