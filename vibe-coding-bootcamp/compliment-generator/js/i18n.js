/* ==========================================================================
   Compliment Generator: interface text, one dictionary per language
   --------------------------------------------------------------------------
   Every word of the interface lives here; js/script.js only uses the keys.

   To add a language:
     1. copy the `en` block, rename it (e.g. `es`) and translate the strings;
     2. optionally give compliments and jokes an `es` field in js/script.js
        (any item without one falls back to English).
   The language switch, the search and the card's size pick it up by themselves.

   - `meta` describes the language: its own name, a short label for the
     switch, the locale used for numbers and plurals, and the text direction.
   - `{name}` in a string is replaced by a value (e.g. `{count}`, `{tag}`).
   - A string written as { one, other } has plural forms; the right one is
     chosen for `count` with the language's plural rules (add `few`, `many`…
     for languages that need them).
   - A key missing from a language falls back to English.
   ========================================================================== */
window.I18N = {
  en: {
    meta: { name: 'English', short: 'EN', locale: 'en-GB', dir: 'ltr' },
    strings: {
      'app.title': 'Compliment Generator',
      'app.description': 'A little dose of kindness: a random compliment or joke with one click.',

      'card.eyebrow.compliment': 'A little something for you',
      'card.eyebrow.joke': 'A little laugh for you',
      'card.tags': 'Tags',
      'action.compliment': 'Get a New Compliment',
      'action.joke': 'Tell Me a Joke',
      'language.label': 'Language',
      'dialog.close': 'Close',

      'type.compliment': 'Compliment',
      'type.joke': 'Joke',

      'favorites.toggle': 'Favorite',
      'favorites.add': 'Add to favorites',
      'favorites.remove': 'Remove from favorites',
      'favorites.open': 'My favorites',
      'favorites.count': { one: '{count} favorite', other: '{count} favorites' },
      'favorites.title': 'My favorites',
      'favorites.empty': 'No favorites yet. Tap the heart on a compliment or joke you love, and it will be kept here.',
      'favorites.show': 'Show on the card',
      'favorites.removeItem': 'Remove from favorites',
      'favorites.clear': 'Clear all',
      'favorites.clearConfirm': 'Clear all? Tap again',
      'favorites.added': 'Added to favorites.',
      'favorites.removed': 'Removed from favorites.',
      'favorites.cleared': 'All favorites cleared.',
      'favorites.noStorage': 'Your browser is blocking storage, so favorites will be lost when you close this page.',

      'copy.label': 'Copy to clipboard',
      'copy.done': 'Copied!',
      'copy.failed': 'Couldn’t copy. Select the text and copy it by hand.',
      'share.label': 'Share',
      'share.on': 'Share on',
      'share.email': 'Email',

      'browse.open': 'Browse & search',
      'browse.title': 'Browse',
      'browse.searchLabel': 'Search compliments and jokes',
      'browse.placeholder': 'Search…',
      'browse.typeLabel': 'Type',
      'browse.type.all': 'All',
      'browse.type.compliment': 'Compliments',
      'browse.type.joke': 'Jokes',
      'browse.tagsLabel': 'Tags',
      'browse.results': { one: '{count} result', other: '{count} results' },
      'browse.empty': 'Nothing matches. Try another word, or remove a tag.',
      'browse.clear': 'Clear filters',
      'browse.random': 'Random from these',
      'browse.tagOnCard': 'Browse everything tagged {tag}',

      'tag.wholesome': 'Wholesome',
      'tag.encouraging': 'Encouraging',
      'tag.brainy': 'Brainy',
      'tag.silly': 'Silly',
      'tag.puns': 'Puns',
      'tag.animals': 'Animals',
      'tag.food': 'Food',
      'tag.spooky': 'Spooky',
      'tag.classics': 'Classics',
    },
  },

  fr: {
    meta: { name: 'Français', short: 'FR', locale: 'fr-FR', dir: 'ltr' },
    strings: {
      'app.title': 'Générateur de compliments',
      'app.description': 'Une petite dose de gentillesse : un compliment ou une blague au hasard, en un clic.',

      'card.eyebrow.compliment': 'Un petit mot pour toi',
      'card.eyebrow.joke': 'Une petite blague pour toi',
      'card.tags': 'Étiquettes',
      'action.compliment': 'Un nouveau compliment',
      'action.joke': 'Raconte-moi une blague',
      'language.label': 'Langue',
      'dialog.close': 'Fermer',

      'type.compliment': 'Compliment',
      'type.joke': 'Blague',

      'favorites.toggle': 'Favori',
      'favorites.add': 'Ajouter aux favoris',
      'favorites.remove': 'Retirer des favoris',
      'favorites.open': 'Mes favoris',
      'favorites.count': { one: '{count} favori', other: '{count} favoris' },
      'favorites.title': 'Mes favoris',
      'favorites.empty': 'Aucun favori pour l’instant. Touche le cœur sur un compliment ou une blague que tu aimes, et il sera gardé ici.',
      'favorites.show': 'Afficher sur la carte',
      'favorites.removeItem': 'Retirer des favoris',
      'favorites.clear': 'Tout effacer',
      'favorites.clearConfirm': 'Tout effacer ? Touche à nouveau',
      'favorites.added': 'Ajouté aux favoris.',
      'favorites.removed': 'Retiré des favoris.',
      'favorites.cleared': 'Tous les favoris ont été effacés.',
      'favorites.noStorage': 'Ton navigateur bloque le stockage : les favoris seront perdus à la fermeture de la page.',

      'copy.label': 'Copier dans le presse-papiers',
      'copy.done': 'Copié !',
      'copy.failed': 'Impossible de copier. Sélectionne le texte et copie-le à la main.',
      'share.label': 'Partager',
      'share.on': 'Partager sur',
      'share.email': 'E-mail',

      'browse.open': 'Parcourir et chercher',
      'browse.title': 'Parcourir',
      'browse.searchLabel': 'Chercher dans les compliments et les blagues',
      'browse.placeholder': 'Chercher…',
      'browse.typeLabel': 'Type',
      'browse.type.all': 'Tout',
      'browse.type.compliment': 'Compliments',
      'browse.type.joke': 'Blagues',
      'browse.tagsLabel': 'Étiquettes',
      'browse.results': { one: '{count} résultat', other: '{count} résultats' },
      'browse.empty': 'Aucun résultat. Essaie un autre mot, ou retire une étiquette.',
      'browse.clear': 'Effacer les filtres',
      'browse.random': 'Au hasard parmi ceux-ci',
      'browse.tagOnCard': 'Parcourir tout ce qui est étiqueté « {tag} »',

      'tag.wholesome': 'Tendre',
      'tag.encouraging': 'Encourageant',
      'tag.brainy': 'Futé',
      'tag.silly': 'Loufoque',
      'tag.puns': 'Jeux de mots',
      'tag.animals': 'Animaux',
      'tag.food': 'Miam',
      'tag.spooky': 'Frissons',
      'tag.classics': 'Classiques',
    },
  },
};
