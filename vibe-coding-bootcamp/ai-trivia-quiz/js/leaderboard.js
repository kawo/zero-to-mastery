/**
 * Leaderboard persisté dans le localStorage du navigateur.
 * Si le stockage est indisponible (navigation privée, stockage bloqué),
 * le classement reste en mémoire pour la session en cours.
 */
const Leaderboard = (function () {
  "use strict";

  const STORAGE_KEY = "vgquiz.leaderboard.v1";
  const MAX_ENTRIES = 10;

  let cache = read();

  function isValidEntry(e) {
    return (
      e &&
      typeof e.id === "string" &&
      typeof e.name === "string" &&
      Number.isFinite(e.score) &&
      Number.isFinite(e.correct) &&
      Number.isFinite(e.total) &&
      Number.isFinite(e.date)
    );
  }

  // Tri : meilleur score, puis plus de bonnes réponses, puis le plus ancien en premier.
  function compare(a, b) {
    return b.score - a.score || b.correct - a.correct || a.date - b.date;
  }

  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data.filter(isValidEntry).sort(compare) : [];
    } catch {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      /* stockage indisponible : on garde la version en mémoire */
    }
  }

  function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Ajoute un score et renvoie son identifiant et son rang (le rang peut dépasser MAX_ENTRIES). */
  function add({ name, score, correct, total }) {
    const entry = { id: createId(), name, score, correct, total, date: Date.now() };
    const ranked = cache.concat(entry).sort(compare);
    const rank = ranked.indexOf(entry) + 1;
    cache = ranked.slice(0, MAX_ENTRIES);
    persist();
    return { id: entry.id, rank, inTop: rank <= MAX_ENTRIES };
  }

  function getTop() {
    return cache.slice();
  }

  function clear() {
    cache = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* rien à faire */
    }
  }

  return { add, getTop, clear, MAX_ENTRIES };
})();
