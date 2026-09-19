/* ==========================================================================
   Compliment Generator: behaviour
   Shows a random compliment each time the button is clicked (never the same
   one twice in a row), in English or French.
   ========================================================================== */

// Wrapping everything in a function keeps these names out of the global scope.
(function () {
  'use strict';

  /* ---------- The compliments ---------- */
  // Each compliment exists in both languages, so switching language can
  // translate the one on screen instead of picking a new one.
  // Add, remove or edit entries here; the rest of the code adapts automatically.
  const compliments = [
    {
      en: 'You make the world a little brighter just by being in it.',
      fr: 'Tu rends le monde un peu plus lumineux, simplement en étant là.',
    },
    {
      en: 'Your kindness is a gift to everyone who knows you.',
      fr: 'Ta gentillesse est un cadeau pour tous ceux qui te connaissent.',
    },
    {
      en: 'You have a wonderful way of making people feel heard.',
      fr: 'Tu as un vrai don pour que les gens se sentent écoutés.',
    },
    {
      en: 'Your curiosity is contagious, in the best possible way.',
      fr: 'Ta curiosité est contagieuse, dans le meilleur sens du terme.',
    },
    {
      en: 'You handle hard things with more grace than you give yourself credit for.',
      fr: 'Tu traverses les moments difficiles avec plus de grâce que tu ne le crois.',
    },
    {
      en: 'Your laugh could turn anyone’s day around.',
      fr: 'Ton rire pourrait illuminer la journée de n’importe qui.',
    },
    {
      en: 'You are braver than you believe and stronger than you seem.',
      fr: 'Tu as plus de courage que tu ne le crois, et plus de force qu’il n’y paraît.',
    },
    {
      en: 'The effort you put in really shows, and it matters.',
      fr: 'Tes efforts se voient vraiment, et ils comptent.',
    },
    {
      en: 'You bring out the best in the people around you.',
      fr: 'Tu fais ressortir le meilleur chez les gens qui t’entourent.',
    },
    {
      en: 'Your ideas are worth sharing. Keep speaking up.',
      fr: 'Tes idées méritent d’être partagées. Continue de prendre la parole.',
    },
    {
      en: 'You’re allowed to be proud of how far you’ve come.',
      fr: 'Tu as parcouru un sacré chemin, et ça mérite d’être célébré.',
    },
    {
      en: 'Being around you feels like a warm cup of tea on a cold day.',
      fr: 'Passer du temps avec toi, c’est comme une tasse de thé chaud un jour de froid.',
    },
    {
      en: 'You have great taste. In compliments, obviously.',
      fr: 'Tu as très bon goût. En compliments, évidemment.',
    },
    {
      en: 'Your creativity makes ordinary things feel special.',
      fr: 'Ta créativité rend les choses ordinaires un peu magiques.',
    },
    {
      en: 'The world is better with you in it, exactly as you are.',
      fr: 'Le monde est plus beau avec toi dedans, exactement comme tu es.',
    },
  ];

  /* ---------- Interface text in each language ---------- */
  const uiText = {
    en: {
      title: 'Compliment Generator',
      description: 'A little dose of kindness: get a random compliment with one click.',
      eyebrow: 'A little something for you',
      button: 'Get a New Compliment',
      switchLabel: 'Language',
    },
    fr: {
      title: 'Générateur de compliments',
      description: 'Une petite dose de gentillesse : un compliment au hasard, en un clic.',
      eyebrow: 'Un petit mot pour toi',
      button: 'Un nouveau compliment',
      switchLabel: 'Langue',
    },
  };

  const STORAGE_KEY = 'compliment-generator.lang';

  /* ---------- Page elements ---------- */
  const complimentEl = document.getElementById('compliment');
  const button = document.getElementById('new-compliment');
  const eyebrowEl = document.getElementById('card-title');
  const langSwitch = document.getElementById('lang-switch');
  const descriptionMeta = document.querySelector('meta[name="description"]');

  // Stop quietly if the page doesn't have the expected elements.
  if (!complimentEl || !button || !eyebrowEl || !langSwitch) {
    return;
  }

  /* ---------- State ---------- */
  let currentLang = pickStartingLanguage();

  // Index of the compliment on screen. The HTML starts with the first one
  // (in English), so look it up in either language to be safe.
  const startText = complimentEl.textContent.trim();
  let currentIndex = compliments.findIndex((c) => c.en === startText || c.fr === startText);
  if (currentIndex < 0) currentIndex = 0; // the HTML text was edited: fall back to the first one

  /**
   * Chooses the language to start in: the one saved from a previous visit,
   * otherwise French if the browser prefers French, otherwise English.
   */
  function pickStartingLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && uiText[saved]) return saved;
    } catch (error) {
      // Storage can be blocked (private mode, strict settings): just carry on.
    }
    const browserLang = (navigator.language || 'en').toLowerCase();
    return browserLang.startsWith('fr') ? 'fr' : 'en';
  }

  /** Remembers the chosen language for the next visit (if storage is allowed). */
  function saveLanguage(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      // Not being able to save the choice isn't a problem worth reporting.
    }
  }

  /**
   * Picks a random index that is different from the current one,
   * so clicking the button always shows something new.
   */
  function getRandomIndex() {
    if (compliments.length < 2) {
      return 0; // nothing else to choose from
    }

    let index;
    do {
      // Math.random() gives a number from 0 (inclusive) to 1 (exclusive);
      // multiplying and flooring turns it into a valid array index.
      index = Math.floor(Math.random() * compliments.length);
    } while (index === currentIndex);

    return index;
  }

  /**
   * Writes the current compliment in the current language and replays the
   * fade-in animation defined in css/style.css.
   */
  function renderCompliment() {
    complimentEl.textContent = compliments[currentIndex][currentLang];

    // Restart the CSS animation: remove the class, force the browser to apply
    // that change (reading offsetWidth does this), then add the class back.
    complimentEl.classList.remove('is-changing');
    void complimentEl.offsetWidth;
    complimentEl.classList.add('is-changing');
  }

  /** Updates every piece of interface text to the current language. */
  function renderInterface() {
    const text = uiText[currentLang];

    // The page language tells screen readers which voice and pronunciation to use.
    document.documentElement.lang = currentLang;
    document.title = text.title;
    if (descriptionMeta) descriptionMeta.setAttribute('content', text.description);

    eyebrowEl.textContent = text.eyebrow;
    button.textContent = text.button;
    langSwitch.setAttribute('aria-label', text.switchLabel);

    // Mark the selected language button (styled through [aria-pressed="true"]).
    langSwitch.querySelectorAll('[data-lang]').forEach((option) => {
      option.setAttribute('aria-pressed', String(option.dataset.lang === currentLang));
    });
  }

  /** Shows a new random compliment. */
  function showNewCompliment() {
    currentIndex = getRandomIndex();
    renderCompliment();
  }

  /** Switches language and translates what's already on screen. */
  function setLanguage(lang) {
    if (!uiText[lang] || lang === currentLang) return;
    currentLang = lang;
    saveLanguage(lang);
    renderInterface();
    renderCompliment(); // same compliment, now in the other language
  }

  /* ---------- Wire up the controls ---------- */
  button.addEventListener('click', showNewCompliment);

  // One listener on the switch handles both language buttons.
  langSwitch.addEventListener('click', (event) => {
    const option = event.target.closest('[data-lang]');
    if (option) setLanguage(option.dataset.lang);
  });

  /* ---------- Start ---------- */
  renderInterface();
  if (currentLang !== 'en') {
    // The HTML ships in English; show the starting compliment in French too.
    complimentEl.textContent = compliments[currentIndex][currentLang];
  }
})();
