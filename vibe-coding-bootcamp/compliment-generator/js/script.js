/* ==========================================================================
   Compliment Generator: behaviour
   Shows a random compliment (with its emoji) each time the button is clicked,
   never the same one twice in a row, in English or French. The card keeps
   the same size whatever the compliment or the language.
   ========================================================================== */

// Wrapping everything in a function keeps these names out of the global scope.
(function () {
  'use strict';

  /* ---------- The compliments ---------- */
  // 100 compliments, each with an emoji and the same text in both languages,
  // so switching language can translate the one on screen.
  // The French uses "tu" and is worded so it never depends on the reader's gender.
  // Add, remove or edit entries here; the rest of the code adapts automatically.
  const compliments = [
    // Kindness and warmth
    { emoji: '🌟',
      en: 'You make the world a little brighter just by being in it.',
      fr: 'Tu rends le monde un peu plus lumineux, simplement en étant là.' },
    { emoji: '🎁',
      en: 'Your kindness is a gift to everyone who knows you.',
      fr: 'Ta gentillesse est un cadeau pour tous ceux qui te connaissent.' },
    { emoji: '👂',
      en: 'You have a wonderful way of making people feel heard.',
      fr: 'Tu as un vrai don pour que les gens se sentent écoutés.' },
    { emoji: '🍵',
      en: 'Being around you feels like a warm cup of tea on a cold day.',
      fr: 'Passer du temps avec toi, c’est comme une tasse de thé chaud un jour de froid.' },
    { emoji: '🤝',
      en: 'People feel safe being themselves around you.',
      fr: 'Avec toi, les gens osent être eux-mêmes.' },
    { emoji: '⚓',
      en: 'You show up for people when it counts.',
      fr: 'Tu es là pour les autres quand ça compte.' },
    { emoji: '💞',
      en: 'Your empathy makes people feel less alone.',
      fr: 'Ton empathie aide les autres à se sentir moins seuls.' },
    { emoji: '🧸',
      en: 'Your hugs could fix almost anything.',
      fr: 'Tes câlins pourraient réparer presque tout.' },
    { emoji: '🤗',
      en: 'You make everyone feel welcome.',
      fr: 'Avec toi, tout le monde se sent le bienvenu.' },
    { emoji: '🧡',
      en: 'You have a heart that makes people feel at home.',
      fr: 'Ton cœur donne aux gens l’impression d’être chez eux.' },
    { emoji: '🌺',
      en: 'You make kindness look effortless.',
      fr: 'Avec toi, la gentillesse a l’air si naturelle.' },
    { emoji: '🥇',
      en: 'When it comes to kindness, you deserve the gold medal.',
      fr: 'Côté gentillesse, tu mérites la médaille d’or.' },
    { emoji: '🕯️',
      en: 'You bring light to people going through dark times.',
      fr: 'Tu apportes de la lumière à ceux qui traversent des moments sombres.' },
    { emoji: '🌸',
      en: 'Your gentleness is a strength.',
      fr: 'Ta douceur est une force.' },
    { emoji: '🍫',
      en: 'You’re sweeter than chocolate, and better for the soul.',
      fr: 'Ta douceur bat celle du chocolat, et elle fait plus de bien à l’âme.' },

    // Strength and courage
    { emoji: '🦁',
      en: 'You are braver than you believe and stronger than you seem.',
      fr: 'Tu as plus de courage que tu ne le crois, et plus de force qu’il n’y paraît.' },
    { emoji: '🕊️',
      en: 'You handle hard things with more grace than you give yourself credit for.',
      fr: 'Tu traverses les moments difficiles avec plus de grâce que tu ne le crois.' },
    { emoji: '🧗',
      en: 'You keep going even when it’s hard, and that’s admirable.',
      fr: 'Tu continues même quand c’est difficile, et c’est admirable.' },
    { emoji: '🌊',
      en: 'You stay calm when others are making waves.',
      fr: 'Tu gardes ton calme quand tout le monde s’agite.' },
    { emoji: '🧘',
      en: 'Your calm is a superpower.',
      fr: 'Ton calme est un super-pouvoir.' },
    { emoji: '🌋',
      en: 'Your determination could move mountains.',
      fr: 'Ta détermination pourrait déplacer des montagnes.' },
    { emoji: '🏅',
      en: 'You handle challenges like a pro.',
      fr: 'Face aux défis, tu assures.' },
    { emoji: '🌳',
      en: 'You’re someone people can lean on.',
      fr: 'Tu es un vrai pilier pour ton entourage.' },
    { emoji: '🐢',
      en: 'Slow progress is still progress, and you’re making it.',
      fr: 'Avancer lentement, c’est avancer quand même, et tu avances.' },
    { emoji: '🎒',
      en: 'You carry a lot, and you still make time for others.',
      fr: 'Tu portes beaucoup de choses, et tu trouves quand même du temps pour les autres.' },

    // Mind and creativity
    { emoji: '🔍',
      en: 'Your curiosity is contagious, in the best possible way.',
      fr: 'Ta curiosité est contagieuse, dans le meilleur sens du terme.' },
    { emoji: '💡',
      en: 'Your ideas are worth sharing. Keep speaking up.',
      fr: 'Tes idées méritent d’être partagées. Continue de prendre la parole.' },
    { emoji: '🎨',
      en: 'Your creativity makes ordinary things feel special.',
      fr: 'Ta créativité rend les choses ordinaires un peu magiques.' },
    { emoji: '🧠',
      en: 'You think in ways that surprise and inspire people.',
      fr: 'Ta façon de penser surprend et inspire les autres.' },
    { emoji: '🧩',
      en: 'You make complicated things feel simple.',
      fr: 'Avec toi, les choses compliquées deviennent simples.' },
    { emoji: '📚',
      en: 'You never stop learning, and it shows.',
      fr: 'Tu n’arrêtes jamais d’apprendre, et ça se voit.' },
    { emoji: '🗝️',
      en: 'You have a knack for finding solutions nobody else sees.',
      fr: 'Tu as le don de trouver des solutions que personne d’autre ne voit.' },
    { emoji: '🔭',
      en: 'You see possibilities where others see problems.',
      fr: 'Tu vois des possibilités là où d’autres voient des problèmes.' },
    { emoji: '📐',
      en: 'You pay attention to details others miss.',
      fr: 'Tu fais attention aux détails que les autres ne voient pas.' },
    { emoji: '🎓',
      en: 'You are smarter than you give yourself credit for.',
      fr: 'Tu as bien plus d’intelligence que tu ne te l’accordes.' },
    { emoji: '🌌',
      en: 'Your imagination has no limits.',
      fr: 'Ton imagination n’a pas de limites.' },
    { emoji: '📝',
      en: 'Your words have a way of staying with people.',
      fr: 'Tes mots ont le don de rester dans les cœurs.' },
    { emoji: '💬',
      en: 'Talking with you always makes things clearer.',
      fr: 'Parler avec toi rend toujours les choses plus claires.' },
    { emoji: '🤓',
      en: 'Your nerdy enthusiasm is adorable.',
      fr: 'Ta passion de geek est adorable.' },
    { emoji: '🪄',
      en: 'You make hard work look like magic.',
      fr: 'Tu fais passer le travail acharné pour de la magie.' },

    // Joy and humour
    { emoji: '😄',
      en: 'Your laugh could turn anyone’s day around.',
      fr: 'Ton rire pourrait illuminer la journée de n’importe qui.' },
    { emoji: '😎',
      en: 'You have great taste. In compliments, obviously.',
      fr: 'Tu as très bon goût. En compliments, évidemment.' },
    { emoji: '☀️',
      en: 'Your smile could outshine the sun on a summer morning.',
      fr: 'Ton sourire ferait de l’ombre au soleil d’un matin d’été.' },
    { emoji: '🌈',
      en: 'You add color to the grayest of days.',
      fr: 'Tu mets de la couleur dans les journées les plus grises.' },
    { emoji: '🎶',
      en: 'Your energy is like a favorite song on repeat.',
      fr: 'Ton énergie, c’est comme une chanson préférée qu’on écoute en boucle.' },
    { emoji: '🎈',
      en: 'You make ordinary moments feel like a celebration.',
      fr: 'Tu transformes les petits moments en fête.' },
    { emoji: '🎭',
      en: 'You make people laugh without even trying.',
      fr: 'Tu fais rire les gens sans même essayer.' },
    { emoji: '🧁',
      en: 'You’re the human equivalent of a warm cupcake.',
      fr: 'Tu es l’équivalent humain d’un cupcake tout juste sorti du four.' },
    { emoji: '🎉',
      en: 'Your enthusiasm is impossible to resist.',
      fr: 'Ton enthousiasme est irrésistible.' },
    { emoji: '😂',
      en: 'Your sense of humor is top-tier.',
      fr: 'Ton sens de l’humour est de première classe.' },
    { emoji: '🎡',
      en: 'Life is more fun with you around.',
      fr: 'La vie est plus amusante quand tu es là.' },
    { emoji: '🪁',
      en: 'Your playful spirit is contagious.',
      fr: 'Ton âme d’enfant est contagieuse.' },
    { emoji: '🎬',
      en: 'If your life were a movie, it would have a great soundtrack.',
      fr: 'Si ta vie était un film, elle aurait une bande originale géniale.' },
    { emoji: '🍋',
      en: 'You turn lemons into the best lemonade.',
      fr: 'Avec des citrons, tu fais la meilleure des limonades.' },
    { emoji: '🍒',
      en: 'You’re the cherry on top of any day.',
      fr: 'Tu es la cerise sur le gâteau de n’importe quelle journée.' },

    // Effort and growth
    { emoji: '💪',
      en: 'The effort you put in really shows, and it matters.',
      fr: 'Tes efforts se voient vraiment, et ils comptent.' },
    { emoji: '🏔️',
      en: 'You’re allowed to be proud of how far you’ve come.',
      fr: 'Tu as parcouru un sacré chemin, et ça mérite d’être célébré.' },
    { emoji: '🌻',
      en: 'You grow a little more wonderful every single day.',
      fr: 'Chaque jour, tu deviens encore un peu plus formidable.' },
    { emoji: '🏆',
      en: 'You’re doing better than you think you are.',
      fr: 'Tu t’en sors bien mieux que tu ne le penses.' },
    { emoji: '🎯',
      en: 'When you set your mind to something, watch out, world.',
      fr: 'Quand tu te lances dans quelque chose, le monde n’a qu’à bien se tenir.' },
    { emoji: '🐝',
      en: 'Your hard work doesn’t go unnoticed.',
      fr: 'Ton travail ne passe pas inaperçu.' },
    { emoji: '🦋',
      en: 'You’ve grown so much, and it’s beautiful to see.',
      fr: 'Tu as tellement évolué, et c’est beau à voir.' },
    { emoji: '🛤️',
      en: 'You’re on the right path, even when it doesn’t feel like it.',
      fr: 'Tu es sur le bon chemin, même quand ça n’en a pas l’air.' },
    { emoji: '🚀',
      en: 'Your potential is sky-high.',
      fr: 'Ton potentiel est immense.' },
    { emoji: '🌠',
      en: 'Dream big. You have what it takes.',
      fr: 'Vois grand : tu as tout ce qu’il faut.' },
    { emoji: '🎀',
      en: 'You put care into everything you do.',
      fr: 'Tu mets du soin dans tout ce que tu fais.' },
    { emoji: '🛠️',
      en: 'You fix things, and people’s days.',
      fr: 'Tu répares les choses, et les journées des gens.' },

    // People around you
    { emoji: '🌱',
      en: 'You bring out the best in the people around you.',
      fr: 'Tu fais ressortir le meilleur chez les gens qui t’entourent.' },
    { emoji: '🪴',
      en: 'You help the people around you grow.',
      fr: 'Tu aides les gens autour de toi à grandir.' },
    { emoji: '🍀',
      en: 'Anyone who has you as a friend is lucky.',
      fr: 'Avoir ton amitié, c’est une vraie chance.' },
    { emoji: '🧶',
      en: 'You bring people together.',
      fr: 'Tu sais rassembler les gens.' },
    { emoji: '🌾',
      en: 'You make the people around you feel valued.',
      fr: 'Tu donnes aux gens autour de toi le sentiment de compter.' },
    { emoji: '🔋',
      en: 'Your positivity recharges everyone around you.',
      fr: 'Ta bonne humeur recharge les batteries de tout ton entourage.' },
    { emoji: '🌬️',
      en: 'You lift people up without even realizing it.',
      fr: 'Tu redonnes le moral aux gens sans même t’en rendre compte.' },
    { emoji: '🥰',
      en: 'Someone out there is smiling because of you.',
      fr: 'Quelque part, quelqu’un sourit grâce à toi.' },
    { emoji: '🥳',
      en: 'When good things happen to you, everyone’s happy, because you deserve it.',
      fr: 'Quand il t’arrive quelque chose de bien, tout le monde se réjouit, parce que tu le mérites.' },
    { emoji: '🏡',
      en: 'You make any place feel like home.',
      fr: 'Tu fais de n’importe quel endroit un petit chez-soi.' },
    { emoji: '🎹',
      en: 'You bring harmony wherever you go.',
      fr: 'Tu apportes de l’harmonie partout où tu passes.' },
    { emoji: '🕰️',
      en: 'Every minute spent with you is worth it.',
      fr: 'Chaque minute passée avec toi vaut le coup.' },

    // Being you
    { emoji: '🌍',
      en: 'The world is better with you in it, exactly as you are.',
      fr: 'Le monde est plus beau avec toi dedans, exactement comme tu es.' },
    { emoji: '🧭',
      en: 'You have a great sense of what really matters.',
      fr: 'Tu as le sens de ce qui compte vraiment.' },
    { emoji: '🔥',
      en: 'Your passion lights up every room you walk into.',
      fr: 'Ta passion illumine chaque pièce où tu entres.' },
    { emoji: '✨',
      en: 'There is a little magic in the way you see the world.',
      fr: 'Il y a un peu de magie dans ta façon de voir le monde.' },
    { emoji: '🌙',
      en: 'Even your quiet moments are full of depth.',
      fr: 'Même tes silences sont pleins de profondeur.' },
    { emoji: '🎤',
      en: 'Your voice deserves to be heard.',
      fr: 'Ta voix mérite d’être entendue.' },
    { emoji: '💎',
      en: 'You are rare, in the most precious way.',
      fr: 'Tu es une perle rare, dans le plus beau sens du terme.' },
    { emoji: '🧣',
      en: 'Your style is uniquely and wonderfully you.',
      fr: 'Ton style n’appartient qu’à toi, et il est magnifique.' },
    { emoji: '🌼',
      en: 'You notice the little things, and that means a lot.',
      fr: 'Tu remarques les petites choses, et ça compte énormément.' },
    { emoji: '🗺️',
      en: 'Your sense of adventure is truly inspiring.',
      fr: 'Ton goût de l’aventure est une vraie source d’inspiration.' },
    { emoji: '🍃',
      en: 'You’re a breath of fresh air.',
      fr: 'Tu es une vraie bouffée d’air frais.' },
    { emoji: '🌤️',
      en: 'Your optimism is refreshing.',
      fr: 'Ton optimisme fait du bien.' },
    { emoji: '🔆',
      en: 'You radiate good vibes.',
      fr: 'Tu dégages de bonnes ondes.' },
    { emoji: '📣',
      en: 'Keep being loud about the things you love.',
      fr: 'Continue de parler haut et fort de ce que tu aimes.' },
    { emoji: '🪐',
      en: 'You’re out of this world.',
      fr: 'Tu es extraordinaire.' },

    // A little encouragement
    { emoji: '⭐',
      en: 'You deserve all the good things coming your way.',
      fr: 'Tu mérites toutes les belles choses qui t’arrivent.' },
    { emoji: '🪞',
      en: 'Take a moment to appreciate yourself. You’re worth it.',
      fr: 'Prends un moment pour t’apprécier : tu le vaux bien.' },
    { emoji: '🌅',
      en: 'Every day with you in it starts a little better.',
      fr: 'Chaque journée commence un peu mieux quand tu en fais partie.' },
    { emoji: '🙌',
      en: 'Thank you for being you.',
      fr: 'Merci d’être toi.' },
    { emoji: '💌',
      en: 'You are loved more than you know.',
      fr: 'On t’aime plus que tu ne le crois.' },
    { emoji: '🥂',
      en: 'Here’s to you, and to everything you’re going to achieve.',
      fr: 'À toi, et à tout ce que tu vas accomplir.' },
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
  const complimentBox = document.getElementById('compliment-box');
  const complimentEl = document.getElementById('compliment');
  const emojiEl = document.getElementById('compliment-emoji');
  const button = document.getElementById('new-compliment');
  const eyebrowEl = document.getElementById('card-title');
  const langSwitch = document.getElementById('lang-switch');
  const descriptionMeta = document.querySelector('meta[name="description"]');

  // Stop quietly if the page doesn't have the expected elements.
  if (!complimentBox || !complimentEl || !emojiEl || !button || !eyebrowEl || !langSwitch) {
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
   * Keeps the card the same size: measures every compliment, in both
   * languages, at the current width, and fixes the text area to the tallest.
   * Uses an invisible copy of the text element so nothing on screen moves.
   */
  function lockComplimentHeight() {
    const width = complimentEl.clientWidth;
    if (!width) return; // not laid out yet (or no layout at all, e.g. in tests)

    const probe = complimentEl.cloneNode(false); // same classes, no content
    probe.removeAttribute('id');
    probe.removeAttribute('aria-live');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      `position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;` +
      `width:${width}px;height:auto;min-height:0;animation:none;`;
    complimentBox.appendChild(probe);

    let tallest = 0;
    for (const compliment of compliments) {
      for (const lang of Object.keys(uiText)) {
        probe.textContent = compliment[lang];
        tallest = Math.max(tallest, probe.offsetHeight);
      }
    }
    probe.remove();

    complimentEl.style.height = `${Math.ceil(tallest)}px`;
  }

  /**
   * Writes the current compliment (emoji + text) in the current language and
   * replays the entrance animation defined in css/style.css.
   */
  function renderCompliment() {
    const compliment = compliments[currentIndex];
    emojiEl.textContent = compliment.emoji;
    complimentEl.textContent = compliment[currentLang];

    // Restart the CSS animation: remove the class, force the browser to apply
    // that change (reading offsetWidth does this), then add the class back.
    complimentBox.classList.remove('is-changing');
    void complimentBox.offsetWidth;
    complimentBox.classList.add('is-changing');
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

  // The text area's height depends on the width: measure again when the
  // window is resized (at most once per frame).
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(lockComplimentHeight);
  });

  /* ---------- Start ---------- */
  renderInterface();
  emojiEl.textContent = compliments[currentIndex].emoji;
  complimentEl.textContent = compliments[currentIndex][currentLang];
  lockComplimentHeight();
  // Web fonts change the text's size once they arrive: measure again then.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(lockComplimentHeight);
  }
})();
