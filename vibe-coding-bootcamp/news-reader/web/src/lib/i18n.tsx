// web/src/lib/i18n.tsx
/*
 * Translations, and the locale formatting that goes with them.
 *
 * Hand-rolled rather than react-i18next, for two reasons. The app has about
 * fifty strings and no plural or gender rules worth a formatter — the numbers it
 * shows are article counts inside sentences that read the same either way. And
 * `Keys` below is derived from the English dictionary, so a missing or misspelt
 * key is a compile error rather than a string that quietly renders as itself.
 * If this grows ICU messages, lazy-loaded locales or a translator workflow,
 * swapping this file for i18next is the right move and nothing else changes.
 *
 * One picker drives both the interface and the news: choosing Français asks
 * TheNewsApi for `language=fr` as well as relabelling the buttons. A reader who
 * wants French chrome around English news is a real case, but a rarer one than
 * wanting the whole thing in their language, and two controls would be a worse
 * default for everyone else.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export const LANGUAGES = {
  en: { label: 'English', locale: 'en-GB' },
  fr: { label: 'Français', locale: 'fr-FR' },
  es: { label: 'Español', locale: 'es-ES' },
  de: { label: 'Deutsch', locale: 'de-DE' },
} as const;

export type Lang = keyof typeof LANGUAGES;

export const LANG_CODES = Object.keys(LANGUAGES) as Lang[];

export const isLang = (value: unknown): value is Lang =>
  typeof value === 'string' && value in LANGUAGES;

/* ------------------------------------------------------------------------ */

const en = {
  'app.title': 'News Reader',
  'app.tagline': 'One story at a time',

  'filters.show': 'Show Filters',
  'filters.hide': 'Hide Filters',

  'language.label': 'Language',
  'language.hint': 'Changes the interface and the news it fetches.',

  'search.label': 'Search',
  'search.placeholder': 'Search headlines…',
  'search.submit': 'Search headlines',
  'search.hintIdle': 'Press Enter to search headlines, or browse by category.',
  'search.hintActive': 'Showing headlines matching {term}.',
  'search.clear': 'Clear',

  'categories.label': 'Categories',
  'categories.myTopics': 'My Topics',
  'categories.hintEmpty': 'Star a category to build a My Topics feed.',
  'categories.hintFull': 'My Topics is full — {max} is the maximum.',
  'categories.hintMix': 'My Topics combines {list}.',
  'categories.pinAdd': 'Add {name} to My Topics',
  'categories.pinRemove': 'Remove {name} from My Topics',
  'categories.pinFull': 'My Topics is full ({max} maximum)',

  'category.tech': 'Tech',
  'category.general': 'General',
  'category.science': 'Science',
  'category.sports': 'Sport',
  'category.business': 'Business',
  'category.health': 'Health',
  'category.entertainment': 'Entertainment',
  'category.politics': 'Politics',
  'category.food': 'Food',
  'category.travel': 'Travel',

  'refine.label': 'Refine',
  'refine.from': 'From',
  'refine.to': 'To',
  'refine.source': 'Source domain',
  'refine.sourcePlaceholder': 'Source, e.g. bbc.co.uk',
  'refine.apply': 'Apply',
  'refine.clear': 'Clear filters',
  'refine.hintIdle': 'Narrow by date or source. Paste a URL and the domain is taken from it.',
  'refine.hintActive': 'Filters apply to searches and categories alike.',

  'favorites.open': 'Favorites ({count})',
  'favorites.back': 'Back to News',

  'card.viewFull': 'View Full Article',
  'card.save': 'Save to Favorites',
  'card.saved': 'Saved to Favorites',
  'card.unknownSource': 'Unknown source',
  'card.sourceFilter': 'Show only articles from {source}',
  'card.sourceActive': 'Already showing only {source}',

  'state.errorTitle': 'Something went wrong',
  'state.emptyTitle': 'Nothing to read',
  'state.emptyBody': 'No articles matched. Try another category or search term.',
  'state.favEmpty': 'No saved articles yet. Use “Save to Favorites” on any story.',
  'state.loading': 'Loading articles…',

  'pager.label': 'Article navigation',
  'pager.first': 'First article',
  'pager.prev': 'Previous article',
  'pager.next': 'Next article',
  'pager.article': 'Article {n}',
} as const;

/** Every translatable string. Derived from English, so nothing can drift. */
export type Key = keyof typeof en;

type Dictionary = Record<Key, string>;

const fr: Dictionary = {
  'app.title': 'Lecteur d’actualités',
  'app.tagline': 'Un article à la fois',

  'filters.show': 'Afficher les filtres',
  'filters.hide': 'Masquer les filtres',

  'language.label': 'Langue',
  'language.hint': 'Change l’interface et les actualités récupérées.',

  'search.label': 'Recherche',
  'search.placeholder': 'Rechercher un titre…',
  'search.submit': 'Rechercher dans les titres',
  'search.hintIdle': 'Appuyez sur Entrée pour chercher, ou parcourez par catégorie.',
  'search.hintActive': 'Titres contenant {term}.',
  'search.clear': 'Effacer',

  'categories.label': 'Catégories',
  'categories.myTopics': 'Mes sujets',
  'categories.hintEmpty': 'Ajoutez une catégorie en favori pour créer un fil « Mes sujets ».',
  'categories.hintFull': 'Mes sujets est complet — {max} au maximum.',
  'categories.hintMix': 'Mes sujets regroupe {list}.',
  'categories.pinAdd': 'Ajouter {name} à Mes sujets',
  'categories.pinRemove': 'Retirer {name} de Mes sujets',
  'categories.pinFull': 'Mes sujets est complet ({max} au maximum)',

  'category.tech': 'Tech',
  'category.general': 'Général',
  'category.science': 'Science',
  'category.sports': 'Sport',
  'category.business': 'Économie',
  'category.health': 'Santé',
  'category.entertainment': 'Divertissement',
  'category.politics': 'Politique',
  'category.food': 'Cuisine',
  'category.travel': 'Voyage',

  'refine.label': 'Affiner',
  'refine.from': 'Du',
  'refine.to': 'Au',
  'refine.source': 'Domaine de la source',
  'refine.sourcePlaceholder': 'Source, ex. lemonde.fr',
  'refine.apply': 'Appliquer',
  'refine.clear': 'Effacer les filtres',
  'refine.hintIdle': 'Filtrez par date ou par source. Collez une URL, le domaine en est extrait.',
  'refine.hintActive': 'Les filtres s’appliquent aux recherches comme aux catégories.',

  'favorites.open': 'Favoris ({count})',
  'favorites.back': 'Retour aux actualités',

  'card.viewFull': 'Lire l’article',
  'card.save': 'Ajouter aux favoris',
  'card.saved': 'Ajouté aux favoris',
  'card.unknownSource': 'Source inconnue',
  'card.sourceFilter': 'N’afficher que les articles de {source}',
  'card.sourceActive': 'Seuls les articles de {source} sont affichés',

  'state.errorTitle': 'Une erreur est survenue',
  'state.emptyTitle': 'Rien à lire',
  'state.emptyBody': 'Aucun article trouvé. Essayez une autre catégorie ou un autre mot-clé.',
  'state.favEmpty': 'Aucun article enregistré. Utilisez « Ajouter aux favoris » sur un article.',
  'state.loading': 'Chargement des articles…',

  'pager.label': 'Navigation entre les articles',
  'pager.first': 'Premier article',
  'pager.prev': 'Article précédent',
  'pager.next': 'Article suivant',
  'pager.article': 'Article {n}',
};

const es: Dictionary = {
  'app.title': 'Lector de noticias',
  'app.tagline': 'Una noticia a la vez',

  'filters.show': 'Mostrar filtros',
  'filters.hide': 'Ocultar filtros',

  'language.label': 'Idioma',
  'language.hint': 'Cambia la interfaz y las noticias que se recuperan.',

  'search.label': 'Buscar',
  'search.placeholder': 'Buscar titulares…',
  'search.submit': 'Buscar en los titulares',
  'search.hintIdle': 'Pulsa Intro para buscar, o navega por categoría.',
  'search.hintActive': 'Titulares que contienen {term}.',
  'search.clear': 'Borrar',

  'categories.label': 'Categorías',
  'categories.myTopics': 'Mis temas',
  'categories.hintEmpty': 'Marca una categoría para crear un canal «Mis temas».',
  'categories.hintFull': 'Mis temas está completo: {max} como máximo.',
  'categories.hintMix': 'Mis temas combina {list}.',
  'categories.pinAdd': 'Añadir {name} a Mis temas',
  'categories.pinRemove': 'Quitar {name} de Mis temas',
  'categories.pinFull': 'Mis temas está completo ({max} como máximo)',

  'category.tech': 'Tecnología',
  'category.general': 'General',
  'category.science': 'Ciencia',
  'category.sports': 'Deportes',
  'category.business': 'Economía',
  'category.health': 'Salud',
  'category.entertainment': 'Entretenimiento',
  'category.politics': 'Política',
  'category.food': 'Gastronomía',
  'category.travel': 'Viajes',

  'refine.label': 'Refinar',
  'refine.from': 'Desde',
  'refine.to': 'Hasta',
  'refine.source': 'Dominio de la fuente',
  'refine.sourcePlaceholder': 'Fuente, p. ej. elpais.com',
  'refine.apply': 'Aplicar',
  'refine.clear': 'Borrar filtros',
  'refine.hintIdle': 'Filtra por fecha o fuente. Pega una URL y se extrae el dominio.',
  'refine.hintActive': 'Los filtros se aplican tanto a las búsquedas como a las categorías.',

  'favorites.open': 'Favoritos ({count})',
  'favorites.back': 'Volver a las noticias',

  'card.viewFull': 'Leer el artículo',
  'card.save': 'Guardar en favoritos',
  'card.saved': 'Guardado en favoritos',
  'card.unknownSource': 'Fuente desconocida',
  'card.sourceFilter': 'Mostrar solo artículos de {source}',
  'card.sourceActive': 'Ya se muestran solo los de {source}',

  'state.errorTitle': 'Algo ha ido mal',
  'state.emptyTitle': 'Nada que leer',
  'state.emptyBody': 'Ningún artículo coincide. Prueba otra categoría u otra palabra.',
  'state.favEmpty': 'Aún no hay artículos guardados. Usa «Guardar en favoritos».',
  'state.loading': 'Cargando artículos…',

  'pager.label': 'Navegación entre artículos',
  'pager.first': 'Primer artículo',
  'pager.prev': 'Artículo anterior',
  'pager.next': 'Artículo siguiente',
  'pager.article': 'Artículo {n}',
};

const de: Dictionary = {
  'app.title': 'Nachrichtenleser',
  'app.tagline': 'Eine Meldung nach der anderen',

  'filters.show': 'Filter anzeigen',
  'filters.hide': 'Filter ausblenden',

  'language.label': 'Sprache',
  'language.hint': 'Ändert die Oberfläche und die abgerufenen Nachrichten.',

  'search.label': 'Suche',
  'search.placeholder': 'Schlagzeilen durchsuchen…',
  'search.submit': 'Schlagzeilen durchsuchen',
  'search.hintIdle': 'Mit Enter suchen, oder nach Kategorie stöbern.',
  'search.hintActive': 'Schlagzeilen mit {term}.',
  'search.clear': 'Löschen',

  'categories.label': 'Kategorien',
  'categories.myTopics': 'Meine Themen',
  'categories.hintEmpty': 'Markieren Sie eine Kategorie, um „Meine Themen“ zu füllen.',
  'categories.hintFull': 'Meine Themen ist voll — höchstens {max}.',
  'categories.hintMix': 'Meine Themen vereint {list}.',
  'categories.pinAdd': '{name} zu Meine Themen hinzufügen',
  'categories.pinRemove': '{name} aus Meine Themen entfernen',
  'categories.pinFull': 'Meine Themen ist voll (höchstens {max})',

  'category.tech': 'Technik',
  'category.general': 'Allgemein',
  'category.science': 'Wissenschaft',
  'category.sports': 'Sport',
  'category.business': 'Wirtschaft',
  'category.health': 'Gesundheit',
  'category.entertainment': 'Unterhaltung',
  'category.politics': 'Politik',
  'category.food': 'Essen',
  'category.travel': 'Reisen',

  'refine.label': 'Eingrenzen',
  'refine.from': 'Von',
  'refine.to': 'Bis',
  'refine.source': 'Quell-Domain',
  'refine.sourcePlaceholder': 'Quelle, z. B. spiegel.de',
  'refine.apply': 'Anwenden',
  'refine.clear': 'Filter löschen',
  'refine.hintIdle': 'Nach Datum oder Quelle eingrenzen. Eine eingefügte URL wird auf die Domain reduziert.',
  'refine.hintActive': 'Filter gelten für Suchen und Kategorien gleichermaßen.',

  'favorites.open': 'Favoriten ({count})',
  'favorites.back': 'Zurück zu den Nachrichten',

  'card.viewFull': 'Ganzen Artikel lesen',
  'card.save': 'Zu Favoriten hinzufügen',
  'card.saved': 'In Favoriten gespeichert',
  'card.unknownSource': 'Unbekannte Quelle',
  'card.sourceFilter': 'Nur Artikel von {source} zeigen',
  'card.sourceActive': 'Es werden bereits nur {source} gezeigt',

  'state.errorTitle': 'Etwas ist schiefgelaufen',
  'state.emptyTitle': 'Nichts zu lesen',
  'state.emptyBody': 'Keine Treffer. Versuchen Sie eine andere Kategorie oder ein anderes Stichwort.',
  'state.favEmpty': 'Noch nichts gespeichert. Nutzen Sie „Zu Favoriten hinzufügen“.',
  'state.loading': 'Artikel werden geladen…',

  'pager.label': 'Artikelnavigation',
  'pager.first': 'Erster Artikel',
  'pager.prev': 'Vorheriger Artikel',
  'pager.next': 'Nächster Artikel',
  'pager.article': 'Artikel {n}',
};

const DICTIONARIES: Record<Lang, Dictionary> = { en, fr, es, de };

/* ------------------------------------------------------------------------ */

export type Translate = (key: Key, params?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  locale: string;
  t: Translate;
  /** A date in the reader's locale. */
  formatDate: (iso: string) => string;
  formatNumber: (value: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => {
    const dictionary = DICTIONARIES[lang] ?? en;
    const { locale } = LANGUAGES[lang] ?? LANGUAGES.en;

    const t: Translate = (key, params) => {
      // English is the fallback, and the key itself the last resort — visible
      // enough to be noticed, harmless enough not to break a render.
      const raw = dictionary[key] ?? en[key] ?? key;
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (whole, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
      );
    };

    return {
      lang,
      locale,
      t,
      formatDate: (iso: string) => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        return date.toLocaleDateString(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      },
      formatNumber: (value: number) => value.toLocaleString(locale),
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

/** The reader's preferred language, if we support it. */
export function detectLang(): Lang {
  const wanted = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? [];
  for (const tag of wanted) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}
