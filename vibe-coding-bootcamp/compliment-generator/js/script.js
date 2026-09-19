/* ==========================================================================
   Compliment Generator: behaviour
   Shows a random compliment or joke (with its emoji) at the click of a
   button, never the same one twice in a row, in every language of js/i18n.js
   (English and French). The card keeps the same size whatever the text or
   the language.
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
    { emoji: '🌟', tags: ['wholesome'],
      en: 'You make the world a little brighter just by being in it.',
      fr: 'Tu rends le monde un peu plus lumineux, simplement en étant là.' },
    { emoji: '🎁', tags: ['wholesome'],
      en: 'Your kindness is a gift to everyone who knows you.',
      fr: 'Ta gentillesse est un cadeau pour tous ceux qui te connaissent.' },
    { emoji: '👂', tags: ['wholesome'],
      en: 'You have a wonderful way of making people feel heard.',
      fr: 'Tu as un vrai don pour que les gens se sentent écoutés.' },
    { emoji: '🍵', tags: ['wholesome'],
      en: 'Being around you feels like a warm cup of tea on a cold day.',
      fr: 'Passer du temps avec toi, c’est comme une tasse de thé chaud un jour de froid.' },
    { emoji: '🤝', tags: ['wholesome'],
      en: 'People feel safe being themselves around you.',
      fr: 'Avec toi, les gens osent être eux-mêmes.' },
    { emoji: '⚓', tags: ['wholesome'],
      en: 'You show up for people when it counts.',
      fr: 'Tu es là pour les autres quand ça compte.' },
    { emoji: '💞', tags: ['wholesome'],
      en: 'Your empathy makes people feel less alone.',
      fr: 'Ton empathie aide les autres à se sentir moins seuls.' },
    { emoji: '🧸', tags: ['wholesome', 'silly'],
      en: 'Your hugs could fix almost anything.',
      fr: 'Tes câlins pourraient réparer presque tout.' },
    { emoji: '🤗', tags: ['wholesome'],
      en: 'You make everyone feel welcome.',
      fr: 'Avec toi, tout le monde se sent le bienvenu.' },
    { emoji: '🧡', tags: ['wholesome'],
      en: 'You have a heart that makes people feel at home.',
      fr: 'Ton cœur donne aux gens l’impression d’être chez eux.' },
    { emoji: '🌺', tags: ['wholesome'],
      en: 'You make kindness look effortless.',
      fr: 'Avec toi, la gentillesse a l’air si naturelle.' },
    { emoji: '🥇', tags: ['wholesome'],
      en: 'When it comes to kindness, you deserve the gold medal.',
      fr: 'Côté gentillesse, tu mérites la médaille d’or.' },
    { emoji: '🕯️', tags: ['wholesome'],
      en: 'You bring light to people going through dark times.',
      fr: 'Tu apportes de la lumière à ceux qui traversent des moments sombres.' },
    { emoji: '🌸', tags: ['wholesome'],
      en: 'Your gentleness is a strength.',
      fr: 'Ta douceur est une force.' },
    { emoji: '🍫', tags: ['wholesome'],
      en: 'You’re sweeter than chocolate, and better for the soul.',
      fr: 'Ta douceur bat celle du chocolat, et elle fait plus de bien à l’âme.' },

    // Strength and courage
    { emoji: '🦁', tags: ['encouraging'],
      en: 'You are braver than you believe and stronger than you seem.',
      fr: 'Tu as plus de courage que tu ne le crois, et plus de force qu’il n’y paraît.' },
    { emoji: '🕊️', tags: ['encouraging'],
      en: 'You handle hard things with more grace than you give yourself credit for.',
      fr: 'Tu traverses les moments difficiles avec plus de grâce que tu ne le crois.' },
    { emoji: '🧗', tags: ['encouraging'],
      en: 'You keep going even when it’s hard, and that’s admirable.',
      fr: 'Tu continues même quand c’est difficile, et c’est admirable.' },
    { emoji: '🌊', tags: ['encouraging'],
      en: 'You stay calm when others are making waves.',
      fr: 'Tu gardes ton calme quand tout le monde s’agite.' },
    { emoji: '🧘', tags: ['encouraging'],
      en: 'Your calm is a superpower.',
      fr: 'Ton calme est un super-pouvoir.' },
    { emoji: '🌋', tags: ['encouraging'],
      en: 'Your determination could move mountains.',
      fr: 'Ta détermination pourrait déplacer des montagnes.' },
    { emoji: '🏅', tags: ['encouraging'],
      en: 'You handle challenges like a pro.',
      fr: 'Face aux défis, tu assures.' },
    { emoji: '🌳', tags: ['encouraging'],
      en: 'You’re someone people can lean on.',
      fr: 'Tu es un vrai pilier pour ton entourage.' },
    { emoji: '🐢', tags: ['encouraging'],
      en: 'Slow progress is still progress, and you’re making it.',
      fr: 'Avancer lentement, c’est avancer quand même, et tu avances.' },
    { emoji: '🎒', tags: ['encouraging'],
      en: 'You carry a lot, and you still make time for others.',
      fr: 'Tu portes beaucoup de choses, et tu trouves quand même du temps pour les autres.' },

    // Mind and creativity
    { emoji: '🔍', tags: ['brainy'],
      en: 'Your curiosity is contagious, in the best possible way.',
      fr: 'Ta curiosité est contagieuse, dans le meilleur sens du terme.' },
    { emoji: '💡', tags: ['brainy'],
      en: 'Your ideas are worth sharing. Keep speaking up.',
      fr: 'Tes idées méritent d’être partagées. Continue de prendre la parole.' },
    { emoji: '🎨', tags: ['brainy'],
      en: 'Your creativity makes ordinary things feel special.',
      fr: 'Ta créativité rend les choses ordinaires un peu magiques.' },
    { emoji: '🧠', tags: ['brainy'],
      en: 'You think in ways that surprise and inspire people.',
      fr: 'Ta façon de penser surprend et inspire les autres.' },
    { emoji: '🧩', tags: ['brainy'],
      en: 'You make complicated things feel simple.',
      fr: 'Avec toi, les choses compliquées deviennent simples.' },
    { emoji: '📚', tags: ['brainy'],
      en: 'You never stop learning, and it shows.',
      fr: 'Tu n’arrêtes jamais d’apprendre, et ça se voit.' },
    { emoji: '🗝️', tags: ['brainy'],
      en: 'You have a knack for finding solutions nobody else sees.',
      fr: 'Tu as le don de trouver des solutions que personne d’autre ne voit.' },
    { emoji: '🔭', tags: ['brainy'],
      en: 'You see possibilities where others see problems.',
      fr: 'Tu vois des possibilités là où d’autres voient des problèmes.' },
    { emoji: '📐', tags: ['brainy'],
      en: 'You pay attention to details others miss.',
      fr: 'Tu fais attention aux détails que les autres ne voient pas.' },
    { emoji: '🎓', tags: ['brainy'],
      en: 'You are smarter than you give yourself credit for.',
      fr: 'Tu as bien plus d’intelligence que tu ne te l’accordes.' },
    { emoji: '🌌', tags: ['brainy'],
      en: 'Your imagination has no limits.',
      fr: 'Ton imagination n’a pas de limites.' },
    { emoji: '📝', tags: ['brainy'],
      en: 'Your words have a way of staying with people.',
      fr: 'Tes mots ont le don de rester dans les cœurs.' },
    { emoji: '💬', tags: ['brainy'],
      en: 'Talking with you always makes things clearer.',
      fr: 'Parler avec toi rend toujours les choses plus claires.' },
    { emoji: '🤓', tags: ['brainy', 'silly'],
      en: 'Your nerdy enthusiasm is adorable.',
      fr: 'Ta passion de geek est adorable.' },
    { emoji: '🪄', tags: ['brainy'],
      en: 'You make hard work look like magic.',
      fr: 'Tu fais passer le travail acharné pour de la magie.' },

    // Joy and humour
    { emoji: '😄', tags: ['wholesome'],
      en: 'Your laugh could turn anyone’s day around.',
      fr: 'Ton rire pourrait illuminer la journée de n’importe qui.' },
    { emoji: '😎', tags: ['wholesome', 'silly'],
      en: 'You have great taste. In compliments, obviously.',
      fr: 'Tu as très bon goût. En compliments, évidemment.' },
    { emoji: '☀️', tags: ['wholesome'],
      en: 'Your smile could outshine the sun on a summer morning.',
      fr: 'Ton sourire ferait de l’ombre au soleil d’un matin d’été.' },
    { emoji: '🌈', tags: ['wholesome'],
      en: 'You add color to the grayest of days.',
      fr: 'Tu mets de la couleur dans les journées les plus grises.' },
    { emoji: '🎶', tags: ['wholesome'],
      en: 'Your energy is like a favorite song on repeat.',
      fr: 'Ton énergie, c’est comme une chanson préférée qu’on écoute en boucle.' },
    { emoji: '🎈', tags: ['wholesome'],
      en: 'You make ordinary moments feel like a celebration.',
      fr: 'Tu transformes les petits moments en fête.' },
    { emoji: '🎭', tags: ['wholesome'],
      en: 'You make people laugh without even trying.',
      fr: 'Tu fais rire les gens sans même essayer.' },
    { emoji: '🧁', tags: ['wholesome', 'silly'],
      en: 'You’re the human equivalent of a warm cupcake.',
      fr: 'Tu es l’équivalent humain d’un cupcake tout juste sorti du four.' },
    { emoji: '🎉', tags: ['wholesome'],
      en: 'Your enthusiasm is impossible to resist.',
      fr: 'Ton enthousiasme est irrésistible.' },
    { emoji: '😂', tags: ['wholesome'],
      en: 'Your sense of humor is top-tier.',
      fr: 'Ton sens de l’humour est de première classe.' },
    { emoji: '🎡', tags: ['wholesome', 'silly'],
      en: 'Life is more fun with you around.',
      fr: 'La vie est plus amusante quand tu es là.' },
    { emoji: '🪁', tags: ['wholesome', 'silly'],
      en: 'Your playful spirit is contagious.',
      fr: 'Ton âme d’enfant est contagieuse.' },
    { emoji: '🎬', tags: ['wholesome', 'silly'],
      en: 'If your life were a movie, it would have a great soundtrack.',
      fr: 'Si ta vie était un film, elle aurait une bande originale géniale.' },
    { emoji: '🍋', tags: ['wholesome', 'silly'],
      en: 'You turn lemons into the best lemonade.',
      fr: 'Avec des citrons, tu fais la meilleure des limonades.' },
    { emoji: '🍒', tags: ['wholesome', 'silly'],
      en: 'You’re the cherry on top of any day.',
      fr: 'Tu es la cerise sur le gâteau de n’importe quelle journée.' },

    // Effort and growth
    { emoji: '💪', tags: ['encouraging'],
      en: 'The effort you put in really shows, and it matters.',
      fr: 'Tes efforts se voient vraiment, et ils comptent.' },
    { emoji: '🏔️', tags: ['encouraging'],
      en: 'You’re allowed to be proud of how far you’ve come.',
      fr: 'Tu as parcouru un sacré chemin, et ça mérite d’être célébré.' },
    { emoji: '🌻', tags: ['encouraging'],
      en: 'You grow a little more wonderful every single day.',
      fr: 'Chaque jour, tu deviens encore un peu plus formidable.' },
    { emoji: '🏆', tags: ['encouraging'],
      en: 'You’re doing better than you think you are.',
      fr: 'Tu t’en sors bien mieux que tu ne le penses.' },
    { emoji: '🎯', tags: ['encouraging'],
      en: 'When you set your mind to something, watch out, world.',
      fr: 'Quand tu te lances dans quelque chose, le monde n’a qu’à bien se tenir.' },
    { emoji: '🐝', tags: ['encouraging'],
      en: 'Your hard work doesn’t go unnoticed.',
      fr: 'Ton travail ne passe pas inaperçu.' },
    { emoji: '🦋', tags: ['encouraging'],
      en: 'You’ve grown so much, and it’s beautiful to see.',
      fr: 'Tu as tellement évolué, et c’est beau à voir.' },
    { emoji: '🛤️', tags: ['encouraging'],
      en: 'You’re on the right path, even when it doesn’t feel like it.',
      fr: 'Tu es sur le bon chemin, même quand ça n’en a pas l’air.' },
    { emoji: '🚀', tags: ['encouraging'],
      en: 'Your potential is sky-high.',
      fr: 'Ton potentiel est immense.' },
    { emoji: '🌠', tags: ['encouraging'],
      en: 'Dream big. You have what it takes.',
      fr: 'Vois grand : tu as tout ce qu’il faut.' },
    { emoji: '🎀', tags: ['encouraging'],
      en: 'You put care into everything you do.',
      fr: 'Tu mets du soin dans tout ce que tu fais.' },
    { emoji: '🛠️', tags: ['encouraging'],
      en: 'You fix things, and people’s days.',
      fr: 'Tu répares les choses, et les journées des gens.' },

    // People around you
    { emoji: '🌱', tags: ['wholesome'],
      en: 'You bring out the best in the people around you.',
      fr: 'Tu fais ressortir le meilleur chez les gens qui t’entourent.' },
    { emoji: '🪴', tags: ['wholesome'],
      en: 'You help the people around you grow.',
      fr: 'Tu aides les gens autour de toi à grandir.' },
    { emoji: '🍀', tags: ['wholesome'],
      en: 'Anyone who has you as a friend is lucky.',
      fr: 'Avoir ton amitié, c’est une vraie chance.' },
    { emoji: '🧶', tags: ['wholesome'],
      en: 'You bring people together.',
      fr: 'Tu sais rassembler les gens.' },
    { emoji: '🌾', tags: ['wholesome'],
      en: 'You make the people around you feel valued.',
      fr: 'Tu donnes aux gens autour de toi le sentiment de compter.' },
    { emoji: '🔋', tags: ['wholesome'],
      en: 'Your positivity recharges everyone around you.',
      fr: 'Ta bonne humeur recharge les batteries de tout ton entourage.' },
    { emoji: '🌬️', tags: ['wholesome'],
      en: 'You lift people up without even realizing it.',
      fr: 'Tu redonnes le moral aux gens sans même t’en rendre compte.' },
    { emoji: '🥰', tags: ['wholesome'],
      en: 'Someone out there is smiling because of you.',
      fr: 'Quelque part, quelqu’un sourit grâce à toi.' },
    { emoji: '🥳', tags: ['wholesome'],
      en: 'When good things happen to you, everyone’s happy, because you deserve it.',
      fr: 'Quand il t’arrive quelque chose de bien, tout le monde se réjouit, parce que tu le mérites.' },
    { emoji: '🏡', tags: ['wholesome'],
      en: 'You make any place feel like home.',
      fr: 'Tu fais de n’importe quel endroit un petit chez-soi.' },
    { emoji: '🎹', tags: ['wholesome'],
      en: 'You bring harmony wherever you go.',
      fr: 'Tu apportes de l’harmonie partout où tu passes.' },
    { emoji: '🕰️', tags: ['wholesome'],
      en: 'Every minute spent with you is worth it.',
      fr: 'Chaque minute passée avec toi vaut le coup.' },

    // Being you
    { emoji: '🌍', tags: ['wholesome'],
      en: 'The world is better with you in it, exactly as you are.',
      fr: 'Le monde est plus beau avec toi dedans, exactement comme tu es.' },
    { emoji: '🧭', tags: ['wholesome'],
      en: 'You have a great sense of what really matters.',
      fr: 'Tu as le sens de ce qui compte vraiment.' },
    { emoji: '🔥', tags: ['wholesome'],
      en: 'Your passion lights up every room you walk into.',
      fr: 'Ta passion illumine chaque pièce où tu entres.' },
    { emoji: '✨', tags: ['wholesome'],
      en: 'There is a little magic in the way you see the world.',
      fr: 'Il y a un peu de magie dans ta façon de voir le monde.' },
    { emoji: '🌙', tags: ['wholesome'],
      en: 'Even your quiet moments are full of depth.',
      fr: 'Même tes silences sont pleins de profondeur.' },
    { emoji: '🎤', tags: ['wholesome'],
      en: 'Your voice deserves to be heard.',
      fr: 'Ta voix mérite d’être entendue.' },
    { emoji: '💎', tags: ['wholesome'],
      en: 'You are rare, in the most precious way.',
      fr: 'Tu es une perle rare, dans le plus beau sens du terme.' },
    { emoji: '🧣', tags: ['wholesome'],
      en: 'Your style is uniquely and wonderfully you.',
      fr: 'Ton style n’appartient qu’à toi, et il est magnifique.' },
    { emoji: '🌼', tags: ['wholesome'],
      en: 'You notice the little things, and that means a lot.',
      fr: 'Tu remarques les petites choses, et ça compte énormément.' },
    { emoji: '🗺️', tags: ['wholesome'],
      en: 'Your sense of adventure is truly inspiring.',
      fr: 'Ton goût de l’aventure est une vraie source d’inspiration.' },
    { emoji: '🍃', tags: ['wholesome'],
      en: 'You’re a breath of fresh air.',
      fr: 'Tu es une vraie bouffée d’air frais.' },
    { emoji: '🌤️', tags: ['wholesome'],
      en: 'Your optimism is refreshing.',
      fr: 'Ton optimisme fait du bien.' },
    { emoji: '🔆', tags: ['wholesome'],
      en: 'You radiate good vibes.',
      fr: 'Tu dégages de bonnes ondes.' },
    { emoji: '📣', tags: ['wholesome'],
      en: 'Keep being loud about the things you love.',
      fr: 'Continue de parler haut et fort de ce que tu aimes.' },
    { emoji: '🪐', tags: ['wholesome'],
      en: 'You’re out of this world.',
      fr: 'Tu es extraordinaire.' },

    // A little encouragement
    { emoji: '⭐', tags: ['encouraging', 'wholesome'],
      en: 'You deserve all the good things coming your way.',
      fr: 'Tu mérites toutes les belles choses qui t’arrivent.' },
    { emoji: '🪞', tags: ['encouraging', 'wholesome'],
      en: 'Take a moment to appreciate yourself. You’re worth it.',
      fr: 'Prends un moment pour t’apprécier : tu le vaux bien.' },
    { emoji: '🌅', tags: ['encouraging', 'wholesome'],
      en: 'Every day with you in it starts a little better.',
      fr: 'Chaque journée commence un peu mieux quand tu en fais partie.' },
    { emoji: '🙌', tags: ['encouraging', 'wholesome'],
      en: 'Thank you for being you.',
      fr: 'Merci d’être toi.' },
    { emoji: '💌', tags: ['encouraging', 'wholesome'],
      en: 'You are loved more than you know.',
      fr: 'On t’aime plus que tu ne le crois.' },
    { emoji: '🥂', tags: ['encouraging', 'wholesome'],
      en: 'Here’s to you, and to everything you’re going to achieve.',
      fr: 'À toi, et à tout ce que tu vas accomplir.' },
  ];

  /* ---------- The jokes ---------- */
  // 100 family-friendly jokes. "\n" separates the setup from the punchline,
  // which is shown in bold on its own line.
  // Puns rarely survive translation: when the English joke relies on one,
  // the French side is a French joke on the same theme rather than a literal
  // translation (English knock-knock jokes, for instance, are paired with
  // French "M. et Mme…" jokes).
  const jokes = [
    // Animals
    { emoji: '🐘', tags: ['animals', 'silly'],
      en: 'Why don’t elephants use computers?\nThey’re scared of the mouse.',
      fr: 'Pourquoi les éléphants n’utilisent-ils pas d’ordinateur ?\nIls ont peur de la souris.' },
    { emoji: '🐔', tags: ['animals', 'silly'],
      en: 'Why did the chicken cross the road?\nTo get to the other side.',
      fr: 'Pourquoi la poule a-t-elle traversé la route ?\nPour aller de l’autre côté.' },
    { emoji: '🐌', tags: ['animals', 'silly'],
      en: 'What does a snail say when it rides on a turtle?\n“Wheeee!”',
      fr: 'Que dit un escargot sur le dos d’une tortue ?\n« Youhou, trop rapide ! »' },
    { emoji: '🐙', tags: ['animals', 'silly'],
      en: 'How did the octopus win the tickle fight?\nIt had eight arms.',
      fr: 'Comment la pieuvre a-t-elle gagné la bataille de chatouilles ?\nElle avait huit bras.' },
    { emoji: '🦒', tags: ['animals', 'silly'],
      en: 'Why do giraffes have such long necks?\nBecause their feet smell.',
      fr: 'Pourquoi les girafes ont-elles un si long cou ?\nParce qu’elles ont les pieds qui puent.' },
    { emoji: '🐸', tags: ['animals', 'puns'],
      en: 'What’s a frog’s favorite drink?\nCroak-a-Cola.',
      fr: 'Quelle est la boisson préférée des grenouilles ?\nLe Coâ-Coâ-Cola.' },
    { emoji: '🐄', tags: ['animals', 'puns'],
      en: 'Where do cows go on vacation?\nMoo York.',
      fr: 'Où les vaches partent-elles en vacances ?\nÀ Meuh-York.' },
    { emoji: '🐱', tags: ['animals', 'puns'],
      en: 'What do you call a pile of cats?\nA meowtain.',
      fr: 'Comment appelle-t-on une pile de chats ?\nUne miaou-tagne.' },
    { emoji: '🐧', tags: ['animals', 'puns'],
      en: 'Why don’t penguins like parties?\nThey find it hard to break the ice.',
      fr: 'Pourquoi les pingouins n’aiment-ils pas les fêtes ?\nIls ont du mal à briser la glace.' },
    { emoji: '🐝', tags: ['animals', 'silly'],
      en: 'Why do bees hum?\nBecause they don’t know the words.',
      fr: 'Pourquoi les abeilles bourdonnent-elles ?\nParce qu’elles ne connaissent pas les paroles.' },
    { emoji: '🐟', tags: ['animals', 'puns'],
      en: 'Why are fish so smart?\nBecause they live in schools.',
      fr: 'Pourquoi les poissons sont-ils si studieux ?\nIls nagent en bancs et ne sèchent jamais les cours.' },
    { emoji: '🐍', tags: ['animals', 'brainy', 'puns'],
      en: 'What’s a snake’s favorite subject at school?\nHiss-tory.',
      fr: 'Quelle est la matière préférée des serpents ?\nL’hiss-toire.' },
    { emoji: '🦉', tags: ['animals', 'puns'],
      en: 'What do you call an owl that does magic tricks?\nHoo-dini.',
      fr: 'Comment appelle-t-on une chouette magicienne ?\nHou-dini.' },
    { emoji: '🐻', tags: ['animals', 'puns'],
      en: 'What do you call a bear with no teeth?\nA gummy bear.',
      fr: 'Comment appelle-t-on un ours sans dents ?\nUn ours en gélatine.' },
    { emoji: '🐶', tags: ['animals', 'puns'],
      en: 'What do you call a dog that does magic?\nA labracadabrador.',
      fr: 'Comment appelle-t-on un chien magicien ?\nUn labracadabrador.' },
    { emoji: '🐑', tags: ['animals', 'puns'],
      en: 'What do sheep do on sunny days?\nHave a baa-becue.',
      fr: 'Que font les moutons quand il fait beau ?\nUn bêêê-rbecue.' },
    { emoji: '🎸', tags: ['animals', 'puns'],
      en: 'What do you call a cow that plays the guitar?\nA moo-sician.',
      fr: 'Comment appelle-t-on une vache qui joue de la guitare ?\nUne meuh-sicienne.' },
    { emoji: '🦈', tags: ['animals', 'puns'],
      en: 'What did the shark say after eating a clownfish?\n“That tasted a little funny.”',
      fr: 'Qu’a dit le requin après avoir mangé un poisson-clown ?\n« Il avait un drôle de goût. »' },
    { emoji: '🦘', tags: ['animals', 'puns'],
      en: 'What do you call a lazy kangaroo?\nA pouch potato.',
      fr: 'Pourquoi le kangourou est-il toujours détendu ?\nIl a tout ce qu’il faut dans la poche.' },
    { emoji: '🐆', tags: ['animals', 'puns'],
      en: 'Why don’t leopards play hide-and-seek?\nThey’re always spotted.',
      fr: 'Pourquoi les léopards ne jouent-ils jamais à cache-cache ?\nIls sont toujours repérés.' },
    { emoji: '🐭', tags: ['animals', 'puns'],
      en: 'What’s a mouse’s favorite game?\nHide-and-squeak.',
      fr: 'Quel est le jeu préféré des souris ?\nCache-cache avec le chat… mais jamais très longtemps.' },
    { emoji: '🦩', tags: ['animals', 'silly'],
      en: 'Why do flamingos stand on one leg?\nIf they lifted both, they’d fall over.',
      fr: 'Pourquoi les flamants roses se tiennent-ils sur une patte ?\nS’ils levaient l’autre, ils tomberaient.' },
    { emoji: '🐊', tags: ['animals', 'puns'],
      en: 'What do you call an alligator in a vest?\nAn investigator.',
      fr: 'Comment appelle-t-on un crocodile qui mène l’enquête ?\nSherlock Crocs.' },
    { emoji: '🐿️', tags: ['animals', 'puns'],
      en: 'Why don’t squirrels ever get lost?\nThey always stay on the right branch.',
      fr: 'Pourquoi les écureuils ne se perdent-ils jamais ?\nIls restent toujours sur la bonne branche.' },
    { emoji: '🕷️', tags: ['animals', 'puns'],
      en: 'Why are spiders so good with computers?\nThey spend their whole life on the web.',
      fr: 'Pourquoi les araignées sont-elles douées en informatique ?\nElles passent leur vie sur la toile.' },
    { emoji: '🐡', tags: ['animals', 'puns'],
      en: 'What do you call a fish wearing a bow tie?\nSofishticated.',
      fr: 'Comment appelle-t-on un poisson qui porte un nœud papillon ?\nUn thon très chic.' },
    { emoji: '🦀', tags: ['animals', 'puns'],
      en: 'Why don’t crabs share their snacks?\nBecause they’re shellfish.',
      fr: 'Pourquoi les crabes marchent-ils de travers ?\nParce qu’ils ont bu trop d’eau salée.' },
    { emoji: '🐴', tags: ['animals', 'puns'],
      en: 'Why did the pony have to gargle?\nIt was a little horse.',
      fr: 'Pourquoi le cheval ne peut-il pas chanter ce soir ?\nIl a un chat dans la gorge.' },
    { emoji: '🐇', tags: ['animals', 'puns'],
      en: 'How do rabbits travel?\nBy hare-plane.',
      fr: 'Que fait un lapin qui ne vient pas à son rendez-vous ?\nIl pose un lapin.' },
    { emoji: '🐷', tags: ['animals', 'puns'],
      en: 'What do you call a pig that does karate?\nA pork chop.',
      fr: 'Pourquoi les cochons s’entendent-ils si bien ?\nIls sont copains comme cochons.' },
    { emoji: '🐜', tags: ['animals', 'puns'],
      en: 'Why don’t ants ever get sick?\nThey have little anty-bodies.',
      fr: 'Pourquoi les fourmis ne tombent-elles jamais malades ?\nElles ont des anticorps fourmi-dables.' },
    { emoji: '🌭', tags: ['animals', 'puns'],
      en: 'Why did the dog sit in the shade?\nHe didn’t want to be a hot dog.',
      fr: 'Pourquoi le chien s’assoit-il à l’ombre ?\nIl ne veut pas devenir un hot-dog.' },
    { emoji: '🐈', tags: ['animals', 'puns'],
      en: 'Why was the cat sitting on the computer?\nTo keep an eye on the mouse.',
      fr: 'Pourquoi le chat est-il assis sur l’ordinateur ?\nPour surveiller la souris.' },
    { emoji: '🦆', tags: ['animals', 'puns'],
      en: 'What do you call a duck that gets straight A’s?\nA wise quacker.',
      fr: 'Comment appelle-t-on un canard très intelligent ?\nUn génie du coin-coin.' },
    { emoji: '🦔', tags: ['animals', 'silly'],
      en: 'What do you get if you cross a hedgehog and a snake?\nBarbed wire.',
      fr: 'Que donne le croisement d’un hérisson et d’un serpent ?\nDu fil barbelé.' },

    // Dinosaurs, monsters and ghosts
    { emoji: '🦖', tags: ['spooky', 'puns'],
      en: 'What do you call a sleeping dinosaur?\nA dino-snore.',
      fr: 'Comment appelle-t-on un dinosaure qui dort ?\nUn dino-dort.' },
    { emoji: '🦕', tags: ['spooky', 'brainy', 'puns'],
      en: 'What do you call a dinosaur that knows every word?\nA thesaurus.',
      fr: 'Comment appelle-t-on un dinosaure qui connaît tous les mots ?\nUn dico-saure.' },
    { emoji: '💀', tags: ['spooky', 'puns'],
      en: 'Why don’t skeletons fight each other?\nThey don’t have the guts.',
      fr: 'Pourquoi les squelettes ne se battent-ils jamais ?\nIls n’ont pas de tripes.' },
    { emoji: '🎃', tags: ['spooky', 'puns'],
      en: 'Why didn’t the skeleton go to the party?\nIt had no body to go with.',
      fr: 'Pourquoi le squelette n’est-il pas allé à la fête ?\nIl n’avait pas le cœur à ça.' },
    { emoji: '🎺', tags: ['spooky', 'puns'],
      en: 'What’s a skeleton’s favorite instrument?\nThe trom-bone.',
      fr: 'Quel est l’instrument préféré des squelettes ?\nLe trombone… pardon, le trom-os.' },
    { emoji: '👻', tags: ['spooky', 'puns'],
      en: 'Why are ghosts such bad liars?\nYou can see right through them.',
      fr: 'Pourquoi les fantômes mentent-ils si mal ?\nOn voit clair dans leur jeu.' },
    { emoji: '🧛', tags: ['spooky', 'puns'],
      en: 'Why don’t vampires have many friends?\nThey’re a pain in the neck.',
      fr: 'Pourquoi les vampires sont-ils toujours de mauvaise humeur ?\nIls ont les crocs.' },
    { emoji: '🛸', tags: ['spooky', 'puns'],
      en: 'What’s an alien’s favorite chocolate bar?\nA Milky Way.',
      fr: 'Que boivent les extraterrestres au goûter ?\nDu lait de la Voie lactée.' },

    // Food
    { emoji: '🍅', tags: ['food', 'puns'],
      en: 'Why did the tomato blush?\nBecause it saw the salad dressing.',
      fr: 'Pourquoi la tomate est-elle toute rouge ?\nElle a vu la salade se déshabiller.' },
    { emoji: '🥚', tags: ['food', 'puns'],
      en: 'Why don’t eggs tell jokes?\nThey’d crack each other up.',
      fr: 'Pourquoi les œufs ne racontent-ils jamais de blagues ?\nIls finiraient tous par craquer.' },
    { emoji: '🍌', tags: ['food', 'puns'],
      en: 'Why did the banana go to the doctor?\nIt wasn’t peeling well.',
      fr: 'Pourquoi la banane est-elle allée chez le médecin ?\nElle ne se sentait pas bien dans sa peau.' },
    { emoji: '🍪', tags: ['food', 'puns'],
      en: 'Why did the cookie go to the nurse?\nIt felt crummy.',
      fr: 'Pourquoi le cookie est-il allé à l’infirmerie ?\nIl était en miettes.' },
    { emoji: '🥐', tags: ['food', 'puns'],
      en: 'Why did the croissant see a therapist?\nIt was feeling a bit flaky.',
      fr: 'Pourquoi le croissant est-il allé chez le psy ?\nIl n’était pas dans son assiette.' },
    { emoji: '🍩', tags: ['food', 'puns'],
      en: 'Why did the doughnut go to the dentist?\nIt needed a filling.',
      fr: 'Pourquoi le beignet est-il allé chez le dentiste ?\nIl avait besoin d’un plombage… à la confiture.' },
    { emoji: '🥔', tags: ['food', 'puns'],
      en: 'Why do potatoes make great detectives?\nThey keep their eyes peeled.',
      fr: 'Pourquoi les patates sont-elles toujours en forme ?\nElles ont la frite.' },
    { emoji: '🍋', tags: ['food', 'puns'],
      en: 'Why did the lemon stop running?\nIt ran out of juice.',
      fr: 'Pourquoi le citron s’est-il arrêté de courir ?\nIl n’avait plus de jus.' },
    { emoji: '☕', tags: ['food', 'puns'],
      en: 'Why did the coffee call the police?\nIt got mugged.',
      fr: 'Pourquoi le café a-t-il porté plainte ?\nIl s’est fait moudre de coups.' },
    { emoji: '🍓', tags: ['food', 'puns'],
      en: 'What did one strawberry say to the other?\nIf you weren’t so sweet, we wouldn’t be in this jam.',
      fr: 'Que dit une fraise à une autre fraise ?\nSi on n’avait pas été si douces, on ne finirait pas en confiture.' },
    { emoji: '🍦', tags: ['food', 'puns'],
      en: 'Where do ice creams go to learn?\nSundae school.',
      fr: 'Que dit une glace à la vanille à son amoureux ?\n« Je fonds pour toi. »' },
    { emoji: '🍐', tags: ['food', 'puns'],
      en: 'What did one pear say to the other?\nWe make a great pair.',
      fr: 'Que dit une poire à une autre poire ?\nOn se fend la poire !' },
    { emoji: '🍔', tags: ['food', 'puns'],
      en: 'What did the hamburger name its daughter?\nPatty.',
      fr: 'Comment s’appelle la fille du hamburger ?\nSteak-phanie.' },
    { emoji: '🥖', tags: ['food', 'puns'],
      en: 'What does a loaf of bread do when it’s tired?\nIt loafs around.',
      fr: 'Pourquoi la baguette se méfie-t-elle toujours ?\nElle ne veut pas se faire rouler dans la farine.' },
    { emoji: '🎂', tags: ['food', 'silly'],
      en: 'What did the birthday cake say to the fork?\n“Want a piece of me?”',
      fr: 'Que dit le gâteau d’anniversaire à la fourchette ?\n« Tu veux ma part ? »' },
    { emoji: '⛄', tags: ['food', 'puns'],
      en: 'What do snowmen eat for breakfast?\nFrosted Flakes.',
      fr: 'Que mangent les bonshommes de neige au petit-déjeuner ?\nDes flocons, bien sûr.' },
    { emoji: '💛', tags: ['food', 'silly'],
      en: 'What’s orange and sounds like a parrot?\nA carrot.',
      fr: 'Qu’est-ce qui est jaune et qui attend ?\nJonathan.' },

    // School, work and everyday things
    { emoji: '📚', tags: ['brainy', 'puns'],
      en: 'Why was the math book sad?\nIt had too many problems.',
      fr: 'Pourquoi le livre de maths est-il triste ?\nIl a trop de problèmes.' },
    { emoji: '🪜', tags: ['brainy', 'puns'],
      en: 'Why did the student bring a ladder to school?\nTo get into high school.',
      fr: 'Pourquoi l’élève apporte-t-il une échelle à l’école ?\nPour passer dans la classe supérieure.' },
    { emoji: '🍎', tags: ['brainy', 'puns'],
      en: 'Why did the teacher wear sunglasses?\nHer students were so bright.',
      fr: 'Pourquoi la maîtresse porte-t-elle des lunettes de soleil ?\nSes élèves sont trop brillants.' },
    { emoji: '✏️', tags: ['brainy', 'puns'],
      en: 'Why did the pencil win the argument?\nIt made a good point.',
      fr: 'Pourquoi le crayon a-t-il gagné le débat ?\nSes arguments étaient bien taillés.' },
    { emoji: '📖', tags: ['brainy', 'puns'],
      en: 'Why don’t books ever feel cold?\nThey have covers.',
      fr: 'Pourquoi les livres n’ont-ils jamais froid ?\nIls ont une couverture.' },
    { emoji: '📕', tags: ['brainy', 'puns'],
      en: 'I’m reading a book about anti-gravity.\nIt’s impossible to put down.',
      fr: 'Je lis un livre sur l’antigravité.\nImpossible de le reposer !' },
    { emoji: '🔢', tags: ['brainy', 'silly'],
      en: 'What did zero say to eight?\n“Nice belt!”',
      fr: 'Que dit le zéro au huit ?\n« Sympa, ta ceinture ! »' },
    { emoji: '🎧', tags: ['brainy', 'puns'],
      en: 'Why did the music teacher need a ladder?\nTo reach the high notes.',
      fr: 'Pourquoi le prof de musique monte-t-il sur une échelle ?\nPour atteindre les notes aiguës.' },
    { emoji: '⚡', tags: ['brainy', 'puns'],
      en: 'Why is an electrician always up to date?\nThey’re always current.',
      fr: 'Quel est le comble pour un électricien ?\nNe pas être au courant.' },
    { emoji: '🥬', tags: ['puns'],
      en: 'What’s a gardener’s favorite game?\nHide-and-go-seed.',
      fr: 'Quel est le comble pour un jardinier ?\nRaconter des salades.' },
    { emoji: '🦷', tags: ['puns'],
      en: 'What does a dentist call their X-rays?\nTooth pics.',
      fr: 'Quel est le comble pour un dentiste ?\nAvoir une dent contre quelqu’un.' },
    { emoji: '🎩', tags: ['brainy', 'puns'],
      en: 'Why did the magician go back to school?\nTo work on his spelling.',
      fr: 'Quel est le comble pour un magicien ?\nAvoir un tour de reins.' },
    { emoji: '🏦', tags: ['puns'],
      en: 'I used to be a banker,\nbut I lost interest.',
      fr: 'Avant, j’étais banquier,\nmais j’ai perdu tout intérêt.' },
    { emoji: '🥕', tags: ['puns'],
      en: 'Why did the scarecrow win an award?\nHe was outstanding in his field.',
      fr: 'Pourquoi l’épouvantail a-t-il reçu un prix ?\nIl était le meilleur dans son domaine… et il n’en bougeait jamais.' },
    { emoji: '💻', tags: ['puns'],
      en: 'Why did the computer go to the doctor?\nIt had caught a virus.',
      fr: 'Pourquoi l’ordinateur est-il allé chez le médecin ?\nIl avait attrapé un virus.' },
    { emoji: '📱', tags: ['puns'],
      en: 'Why did the phone need glasses?\nIt lost all its contacts.',
      fr: 'Pourquoi le téléphone porte-t-il des lunettes ?\nIl a perdu tous ses contacts.' },
    { emoji: '🔋', tags: ['silly'],
      en: 'What did the battery say to the charger?\n“You complete me.”',
      fr: 'Qu’a dit la batterie au chargeur ?\n« Sans toi, je suis à plat. »' },
    { emoji: '⏰', tags: ['puns'],
      en: 'Why did the man throw his clock out the window?\nHe wanted to see time fly.',
      fr: 'Pourquoi l’homme a-t-il jeté son réveil par la fenêtre ?\nPour voir le temps s’envoler.' },
    { emoji: '🧱', tags: ['puns'],
      en: 'What did one wall say to the other?\n“Meet you at the corner!”',
      fr: 'Que dit un mur à un autre mur ?\n« On se retrouve au coin ! »' },
    { emoji: '🧹', tags: ['puns'],
      en: 'What did the broom say to the vacuum cleaner?\n“I’m tired of people pushing us around.”',
      fr: 'Que dit le balai à l’aspirateur ?\n« J’en ai marre qu’on nous pousse partout. »' },
    { emoji: '🧊', tags: ['silly'],
      en: 'What did the ice cube say to the glass of water?\n“I used to be like you.”',
      fr: 'Qu’a dit le glaçon au verre d’eau ?\n« Avant, j’étais comme toi. »' },

    // Sports, travel and the sky
    { emoji: '⚽', tags: ['puns'],
      en: 'Why did the soccer ball quit the team?\nIt was tired of being kicked around.',
      fr: 'Pourquoi le ballon de foot a-t-il quitté l’équipe ?\nIl en avait marre de se faire shooter.' },
    { emoji: '🚲', tags: ['puns'],
      en: 'Why can’t a bicycle stand up on its own?\nIt’s two-tired.',
      fr: 'Pourquoi le vélo ne tient-il pas debout tout seul ?\nIl est crevé.' },
    { emoji: '✈️', tags: ['puns'],
      en: 'Why was the airplane sent to its room?\nIt had a bad altitude.',
      fr: 'Pourquoi l’avion a-t-il été puni ?\nIl avait une mauvaise altitude.' },
    { emoji: '🚀', tags: ['puns'],
      en: 'How do astronauts organize a party?\nThey planet.',
      fr: 'Comment les astronautes organisent-ils une fête ?\nIls la planètent.' },
    { emoji: '🌙', tags: ['silly'],
      en: 'Why did the cow jump over the moon?\nThe farmer had cold hands.',
      fr: 'Pourquoi la vache a-t-elle sauté par-dessus la lune ?\nLe fermier avait les mains froides.' },
    { emoji: '🌞', tags: ['brainy', 'puns'],
      en: 'Why doesn’t the sun go to college?\nIt already has millions of degrees.',
      fr: 'Pourquoi le soleil ne va-t-il pas à l’université ?\nIl a déjà des millions de degrés.' },
    { emoji: '🌻', tags: ['puns'],
      en: 'Why is the sunflower always in a good mood?\nIt always looks on the bright side.',
      fr: 'Pourquoi le tournesol a-t-il toujours le moral ?\nIl regarde toujours du bon côté.' },
    { emoji: '🌊', tags: ['puns'],
      en: 'What did the ocean say to the beach?\nNothing, it just waved.',
      fr: 'Qu’a dit l’océan à la plage ?\nRien, il s’est contenté de faire des vagues.' },
    { emoji: '🌫️', tags: ['puns'],
      en: 'I tried to catch some fog yesterday.\nI mist.',
      fr: 'Hier, j’ai essayé d’attraper le brouillard.\nRésultat : je suis resté dans le flou.' },
    { emoji: '❄️', tags: ['puns'],
      en: 'What do you call a snowman in July?\nA puddle.',
      fr: 'Comment appelle-t-on un bonhomme de neige en juillet ?\nUne flaque.' },
    { emoji: '🎈', tags: ['puns'],
      en: 'Why should you never give Elsa a balloon?\nShe’ll let it go.',
      fr: 'Pourquoi ne faut-il jamais donner de ballon à la Reine des neiges ?\nElle va le libérer, le délivrer…' },

    // Knock-knock jokes (English) and “M. et Mme…” jokes (French)
    { emoji: '🚪', tags: ['classics', 'puns'],
      en: 'Knock, knock. Who’s there? Lettuce.\nLettuce who? Lettuce in, it’s cold out here!',
      fr: 'M. et Mme Térieur ont deux fils.\nAlain et Alex : Alain Térieur et Alex Térieur !' },
    { emoji: '🚪', tags: ['classics', 'puns'],
      en: 'Knock, knock. Who’s there? Boo.\nBoo who? Don’t cry, it’s only a joke!',
      fr: 'M. et Mme Tatouille ont une fille.\nSarah : Sarah Tatouille !' },
    { emoji: '🚪', tags: ['classics', 'silly'],
      en: 'Knock, knock. Who’s there? Interrupting cow.\nInterrupting c— MOO!',
      fr: 'M. et Mme Débauche ont un fils.\nJean : Jean Débauche !' },
    { emoji: '🚪', tags: ['classics', 'puns'],
      en: 'Knock, knock. Who’s there? Olive.\nOlive who? Olive you, and I missed you!',
      fr: 'M. et Mme Assin ont un fils.\nMarc : Marc Assin !' },
    { emoji: '🚪', tags: ['classics', 'puns'],
      en: 'Knock, knock. Who’s there? Tank.\nTank who? You’re welcome!',
      fr: 'M. et Mme Kiroul ont un fils.\nPierre : Pierre Kiroul n’amasse pas mousse !' },
    { emoji: '🚪', tags: ['classics', 'puns'],
      en: 'Knock, knock. Who’s there? Hawaii.\nHawaii you? I’m fine, thanks!',
      fr: 'M. et Mme Bonbeur ont un fils.\nJean : Jean Bonbeur !' },
    { emoji: '🚪', tags: ['classics', 'puns'],
      en: 'Knock, knock. Who’s there? Atch.\nAtch who? Bless you!',
      fr: 'M. et Mme Onette ont un fils.\nMario : Mario Onette !' },

    // And one to finish
    { emoji: '🙃', tags: ['puns'],
      en: 'I told my friend ten jokes to make him laugh.\nSadly, no pun in ten did.',
      fr: 'J’ai raconté dix blagues à un ami pour le faire rire.\nAucune n’a marché… sauf celle-ci, j’espère !' },
  ];

  /* ---------- Tags ---------- */
  // Every compliment and joke has one to three of these tags (the `tags` field
  // above). They're shown on the card and used to filter the search. Their
  // names, in each language, are in js/i18n.js ('tag.wholesome'…).
  const tagInfo = {
    wholesome: { emoji: '💛' },
    encouraging: { emoji: '💪' },
    brainy: { emoji: '🧠' },
    silly: { emoji: '🤪' },
    puns: { emoji: '🥁' },
    animals: { emoji: '🐾' },
    food: { emoji: '🍕' },
    spooky: { emoji: '👻' },
    classics: { emoji: '🚪' },
  };

  /* ---------- Languages and interface text ---------- */
  // All the interface text is in js/i18n.js (loaded just before this file),
  // one dictionary per language. Every language found there gets a button in
  // the switch.
  const dictionaries = window.I18N;
  const DEFAULT_LANG = 'en';  // used for any string or item a language is missing
  if (!dictionaries || !dictionaries[DEFAULT_LANG]) {
    return; // no dictionary: nothing sensible to show
  }
  const languages = Object.keys(dictionaries);

  // Plural rules and number formats, made once per language when first needed.
  const pluralRules = {};
  const numberFormats = {};
  const localeOf = (lang) => (dictionaries[lang].meta && dictionaries[lang].meta.locale) || lang;

  function formatValue(lang, value) {
    if (typeof value !== 'number') return String(value);
    numberFormats[lang] = numberFormats[lang] || new Intl.NumberFormat(localeOf(lang));
    return numberFormats[lang].format(value);
  }

  /**
   * The text for `key` in `lang`, with its {placeholders} filled from `params`.
   * A string with plural forms ({ one, other }) is picked for `params.count`.
   * A string missing from a language falls back to English, then to the key
   * itself, so a gap shows up clearly instead of breaking the page.
   */
  function translate(lang, key, params = {}) {
    const own = dictionaries[lang] && dictionaries[lang].strings[key];
    let value = own !== undefined ? own : dictionaries[DEFAULT_LANG].strings[key];
    if (value === undefined) return key;
    if (typeof value === 'object') {
      pluralRules[lang] = pluralRules[lang] || new Intl.PluralRules(localeOf(lang));
      value = value[pluralRules[lang].select(params.count)] || value.other;
    }
    return value.replace(/\{(\w+)\}/g, (match, name) => (name in params ? formatValue(lang, params[name]) : match));
  }

  /** Same, in the language on screen: t('browse.results', { count: 3 }) → "3 results". */
  const t = (key, params) => translate(currentLang, key, params);

  /** A compliment's or joke's text in a language (English if it has no translation). */
  const textOf = (item, lang = currentLang) => item[lang] || item[DEFAULT_LANG];

  /** A tag's name in a language. */
  const tagName = (tag, lang = currentLang) => translate(lang, `tag.${tag}`);

  // The two kinds of content the card can show.
  const collections = { compliment: compliments, joke: jokes };

  const STORAGE_KEY = 'compliment-generator.lang';
  const FAVORITES_KEY = 'compliment-generator.favorites';
  const REMOVED_KEY = 'compliment-generator.favorites.removed';  // removals, for sync
  const ACCOUNT_KEY = 'compliment-generator.account';

  // Keyboard shortcut for the search: Ctrl+K, or ⌘K on Apple devices.
  // (Not a single key like "/": those fire by accident with speech input and
  // some screen readers, see WCAG 2.1.4 "Character Key Shortcuts".)
  const onApple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const SHORTCUT_LABEL = onApple ? '⌘K' : 'Ctrl+K';

  /* ---------- Page elements ---------- */
  const complimentBox = document.getElementById('compliment-box');
  const complimentEl = document.getElementById('compliment');
  const emojiEl = document.getElementById('compliment-emoji');
  const complimentButton = document.getElementById('new-compliment');
  const jokeButton = document.getElementById('new-joke');
  const eyebrowEl = document.getElementById('card-title');
  const langSwitch = document.getElementById('lang-switch');
  const favToggle = document.getElementById('fav-toggle');
  const openFavoritesButton = document.getElementById('open-favorites');
  const favoritesCount = document.getElementById('favorites-count');
  const favoritesDialog = document.getElementById('favorites-dialog');
  const favoritesClose = document.getElementById('favorites-close');
  const favoritesEmpty = document.getElementById('favorites-empty');
  const favoritesList = document.getElementById('favorites-list');
  const favoritesNote = document.getElementById('favorites-note');
  const favoritesClear = document.getElementById('favorites-clear');
  const statusEl = document.getElementById('status');
  const copyButton = document.getElementById('copy-button');
  const shareButton = document.getElementById('share-button');
  const shareMenu = document.getElementById('share-menu');
  const shareLinks = document.getElementById('share-links');
  const speakButton = document.getElementById('speak-button');
  const complimentTags = document.getElementById('compliment-tags');
  const openBrowseButton = document.getElementById('open-browse');
  const browseDialog = document.getElementById('browse-dialog');
  const browseClose = document.getElementById('browse-close');
  const browseSearch = document.getElementById('browse-search');
  const browseType = document.getElementById('browse-type');
  const browseTags = document.getElementById('browse-tags');
  const browseSummary = document.getElementById('browse-summary');
  const browseList = document.getElementById('browse-list');
  const browseEmpty = document.getElementById('browse-empty');
  const browseClear = document.getElementById('browse-clear');
  const browseRandom = document.getElementById('browse-random');

  // Stop quietly if the page doesn't have the expected elements.
  const required = [complimentBox, complimentEl, emojiEl, complimentButton, jokeButton, eyebrowEl, langSwitch,
    favToggle, openFavoritesButton, favoritesCount, favoritesDialog, favoritesClose, favoritesEmpty,
    favoritesList, favoritesNote, favoritesClear, statusEl, copyButton, shareButton, shareMenu, shareLinks, speakButton,
    complimentTags, openBrowseButton, browseDialog, browseClose, browseSearch, browseType, browseTags,
    browseSummary, browseList, browseEmpty, browseClear, browseRandom];
  if (required.some((element) => !element)) {
    return;
  }

  /* ---------- State ---------- */
  let currentLang = pickStartingLanguage();
  let currentMode = 'compliment';  // 'compliment' or 'joke'

  // Index of the item on screen. The HTML starts with the first compliment
  // (in English), so look it up in every language to be safe.
  const startText = complimentEl.textContent.trim();
  let currentIndex = compliments.findIndex((c) => languages.some((lang) => textOf(c, lang) === startText));
  if (currentIndex < 0) currentIndex = 0; // the HTML text was edited: fall back to the first one

  /* ---------- Favorites: state ---------- */
  // Saved in localStorage as a list, newest first:
  //   [{ type: 'compliment' | 'joke', en: '<the English text>', at: '<ISO date>' }]
  // The type and English text identify an item, so favorites still point to
  // the right one if the lists are reordered. A favorite whose text has since
  // been edited no longer matches anything and is dropped quietly.
  const favoriteKey = (type, item) => `${type}:${item.en}`;

  // Look-up from a favorite's key to the item's place in its list.
  const itemByKey = new Map();
  for (const [type, list] of Object.entries(collections)) {
    list.forEach((item, index) => itemByKey.set(favoriteKey(type, item), { type, index }));
  }

  let storageWorks = true; // false if the browser blocks storage (favorites then last for this visit only)
  let favorites = loadFavorites();
  // When each favorite was removed: { "<key>": "<ISO date>" }. Sync needs this,
  // so a favorite removed on one device doesn't come back from another one.
  let removedFavorites = loadRemoved();
  let clearTimer = 0;

  /**
   * Chooses the language to start in: the one saved from a previous visit,
   * otherwise the first of the browser's preferred languages that has a
   * dictionary, otherwise English.
   */
  function pickStartingLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && dictionaries[saved]) return saved;
    } catch (error) {
      // Storage can be blocked (private mode, strict settings): just carry on.
    }
    const preferred = [navigator.language, ...(navigator.languages || [])];
    for (const code of preferred) {
      const base = String(code || '').toLowerCase().split('-')[0]; // "fr-CA" → "fr"
      if (dictionaries[base]) return base;
    }
    return DEFAULT_LANG;
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
   * Picks a random index in `list`, different from `avoid`, so clicking a
   * button always shows something new. Pass -1 to allow any index.
   */
  function getRandomIndex(list, avoid) {
    if (list.length < 2) {
      return 0; // nothing else to choose from
    }

    let index;
    do {
      // Math.random() gives a number from 0 (inclusive) to 1 (exclusive);
      // multiplying and flooring turns it into a valid array index.
      index = Math.floor(Math.random() * list.length);
    } while (index === avoid);

    return index;
  }

  /**
   * Writes a text into an element. A joke ("setup\npunchline") becomes two
   * lines: the setup, then the punchline in bold. A compliment stays plain text.
   * Everything goes through textContent, so no text is ever read as HTML.
   */
  function setText(element, text) {
    const newline = text.indexOf('\n');
    if (newline === -1) {
      element.textContent = text;
      return;
    }
    const setup = document.createElement('span');
    setup.className = 'joke-setup';
    setup.textContent = text.slice(0, newline);
    const punchline = document.createElement('span');
    punchline.className = 'joke-punchline';
    // Inner span: the highlighter effect is drawn on it, so it follows the
    // text line by line instead of filling a rectangle.
    const punchlineText = document.createElement('span');
    punchlineText.className = 'joke-punchline-text';
    punchlineText.textContent = text.slice(newline + 1);
    punchline.appendChild(punchlineText);
    element.replaceChildren(setup, punchline);
  }

  /**
   * Keeps the card the same size: measures every compliment and every joke,
   * in every language, at the current width, and fixes the text area to the
   * tallest. Uses an invisible copy of the text element so nothing on screen moves.
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
    for (const list of Object.values(collections)) {
      for (const item of list) {
        for (const lang of languages) {
          setText(probe, textOf(item, lang));
          tallest = Math.max(tallest, probe.offsetHeight);
        }
      }
    }
    probe.remove();

    complimentEl.style.height = `${Math.ceil(tallest)}px`;
  }

  /**
   * Shows the current item (emoji + text) in the current language, updates the
   * small heading above it, and replays the entrance animation from css/style.css.
   */
  function renderItem() {
    const item = collections[currentMode][currentIndex];
    emojiEl.textContent = item.emoji;
    setText(complimentEl, textOf(item));
    eyebrowEl.textContent = t(`card.eyebrow.${currentMode}`);
    // Jokes get their own timing in the CSS (the punchline arrives a beat later).
    complimentBox.classList.toggle('is-joke', currentMode === 'joke');
    renderFavoriteToggle();
    renderCardTags();
    closeShareMenu();
    stopSpeaking(); // the text being read is no longer on the card

    // Restart the CSS animation: remove the class, force the browser to apply
    // that change (reading offsetWidth does this), then add the class back.
    complimentBox.classList.remove('is-changing');
    void complimentBox.offsetWidth;
    complimentBox.classList.add('is-changing');
  }

  /* ---------- Interface text ---------- */

  /**
   * Fills every element marked in index.html from the dictionary:
   *   data-i18n="key"                      → the element's text
   *   data-i18n-attr="attr:key; attr:key"  → attributes (aria-label, title…)
   * Text that depends on the state (the heart's tooltip, "Copied!"…) is set
   * by the functions that manage that state instead.
   */
  function applyStaticText() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
      for (const pair of element.dataset.i18nAttr.split(';')) {
        const [attribute, key] = pair.split(':').map((part) => part.trim());
        if (attribute && key) element.setAttribute(attribute, t(key));
      }
    });
  }

  /**
   * One option per language in the dictionary, written in that language
   * ("Français", not "French") so it's recognisable whatever the page language.
   * Built once: switching language only changes which option is checked.
   */
  function buildLanguageSwitch() {
    langSwitch.replaceChildren(...languages.map((lang) => {
      const meta = dictionaries[lang].meta || {};
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'lang-option';
      option.setAttribute('role', 'radio');
      option.dataset.lang = lang;
      option.lang = lang; // screen readers read the name with the right voice
      option.textContent = meta.short || lang.toUpperCase();
      option.setAttribute('aria-label', meta.name || lang);
      return option;
    }));
    langSwitch.hidden = languages.length < 2; // nothing to switch between
  }

  /** Updates every piece of interface text to the current language. */
  function renderInterface() {
    const meta = dictionaries[currentLang].meta || {};

    // The page language tells screen readers which voice and pronunciation to
    // use; the direction is ready for right-to-left languages.
    document.documentElement.lang = currentLang;
    document.documentElement.dir = meta.dir || 'ltr';
    applyStaticText();

    eyebrowEl.textContent = t(`card.eyebrow.${currentMode}`);
    openBrowseButton.title = `${t('browse.open')} (${SHORTCUT_LABEL})`;

    // The chosen language is checked, and is the switch's only Tab stop.
    const options = [...langSwitch.querySelectorAll('[data-lang]')];
    options.forEach((option) => option.setAttribute('aria-checked', String(option.dataset.lang === currentLang)));
    setTabStop(options, options.find((option) => option.dataset.lang === currentLang));

    renderFavorites();
    renderFavoritesNote();
    favoritesClear.textContent = t(favoritesClear.classList.contains('is-confirming') ? 'favorites.clearConfirm' : 'favorites.clear');

    copyButton.title = t(copyButton.classList.contains('is-done') ? 'copy.done' : 'copy.label');
    speakButton.title = t(speakButton.getAttribute('aria-pressed') === 'true' ? 'speak.stop' : 'speak.label');
    if (!shareMenu.hidden) renderShareLinks();

    renderCardTags();
    if (browseDialog.open) renderBrowse();
    renderAccount();
  }

  /**
   * Shows a new random compliment or joke. Within the same mode it's never the
   * one already on screen; switching mode can pick any item.
   */
  function showNew(mode) {
    const avoid = mode === currentMode ? currentIndex : -1;
    currentMode = mode;
    currentIndex = getRandomIndex(collections[mode], avoid);
    renderItem();
  }

  /** Switches language and translates what's already on screen. */
  function setLanguage(lang) {
    if (!dictionaries[lang] || lang === currentLang) return;
    currentLang = lang;
    saveLanguage(lang);
    renderInterface();
    renderItem(); // same compliment or joke, now in the other language
  }

  /* ---------- Keyboard helpers ---------- */

  /** Makes `active` the only item of a group reachable with Tab (a "roving" Tab stop). */
  function setTabStop(items, active) {
    const stop = active || items[0];
    items.forEach((item) => { item.tabIndex = item === stop ? 0 : -1; });
  }

  /**
   * Arrow keys inside a group (radio group or toolbar): Left/Up go to the
   * previous item, Right/Down to the next (wrapping round), Home and End to
   * the first and last. The group stays a single Tab stop (unless `roving` is
   * false: every item keeps its own). Returns the item
   * that received focus, or null if the key wasn't one of these.
   */
  function moveInGroup(event, group, selector, { roving = true } = {}) {
    const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const key = event.key;
    if (event.altKey || event.ctrlKey || event.metaKey) return null;
    if (!(key in steps) && key !== 'Home' && key !== 'End') return null;

    const items = [...group.querySelectorAll(selector)];
    const from = items.indexOf(document.activeElement);
    if (from < 0) return null;

    let step = steps[key];
    // In a right-to-left language, Left means "next".
    if (document.documentElement.dir === 'rtl' && (key === 'ArrowLeft' || key === 'ArrowRight')) step = -step;
    const to = key === 'Home' ? 0
      : key === 'End' ? items.length - 1
        : (from + step + items.length) % items.length;

    event.preventDefault(); // no page scrolling
    if (roving) setTabStop(items, items[to]);
    items[to].focus();
    return items[to];
  }

  /**
   * Up/Down (and Home/End) in a list of results or favorites: move to the row
   * above or below, staying in the same column (the text, or the button on
   * its right). Tab still goes through every button as usual.
   */
  function moveInList(event, { beforeFirst = null } = {}) {
    const key = event.key;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
    const current = event.target.closest('button');
    if (!current) return;

    const column = current.classList.contains('favorites-show') ? '.favorites-show' : '.favorites-remove, .browse-fav';
    const buttons = [...event.currentTarget.querySelectorAll(column)];
    const from = buttons.indexOf(current);
    const to = key === 'Home' ? 0
      : key === 'End' ? buttons.length - 1
        : from + (key === 'ArrowDown' ? 1 : -1);

    event.preventDefault();
    if (to < 0) {
      if (beforeFirst) beforeFirst.focus(); // e.g. Up from the first result goes back to the search field
      return;
    }
    if (buttons[to]) buttons[to].focus();
  }

  /* ---------- Dialogs ---------- */

  // What had focus before each dialog opened, to give it back on closing.
  const dialogOpeners = new Map();

  function openDialog(dialog) {
    const active = document.activeElement;
    dialogOpeners.set(dialog, active && active !== document.body ? active : null);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    returnFocus(dialog);
  }

  /**
   * Puts keyboard focus back where it was before the dialog opened. If that
   * element is gone (a tag chip on the card is rebuilt when the item
   * changes), the button that opens the dialog gets it instead.
   */
  function returnFocus(dialog) {
    if (!dialogOpeners.has(dialog)) return; // already done
    const opener = dialogOpeners.get(dialog);
    dialogOpeners.delete(dialog);
    const fallback = dialog === browseDialog ? openBrowseButton
      : dialog === accountDialog ? openAccountButton
        : openFavoritesButton;
    (opener && opener.isConnected ? opener : fallback).focus();
  }

  /* ---------- Favorites: storage ---------- */

  /**
   * Reads the saved favorites. Anything that isn't a valid favorite (hand-edited
   * data, an item that no longer exists, a duplicate) is left out.
   */
  function loadFavorites() {
    let stored = null;
    try {
      stored = localStorage.getItem(FAVORITES_KEY);
    } catch (error) {
      storageWorks = false; // storage is blocked
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(stored || '[]');
    } catch (error) {
      return []; // unreadable data: start with an empty list
    }
    if (!Array.isArray(parsed)) return [];

    const seen = new Set();
    const valid = [];
    for (const entry of parsed) {
      if (!entry || typeof entry.en !== 'string' || !collections[entry.type]) continue;
      const key = favoriteKey(entry.type, entry);
      if (!itemByKey.has(key) || seen.has(key)) continue;
      seen.add(key);
      valid.push({ type: entry.type, en: entry.en, at: typeof entry.at === 'string' ? entry.at : new Date().toISOString() });
    }
    return valid;
  }

  /** Reads the saved removal dates, keeping only valid ones for existing items. */
  function loadRemoved() {
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(REMOVED_KEY) || '{}');
    } catch (error) {
      return {};
    }
    const valid = {};
    if (!parsed || typeof parsed !== 'object') return valid;
    for (const [key, when] of Object.entries(parsed)) {
      if (itemByKey.has(key) && Number.isFinite(Date.parse(when)) && !isFavorite(key)) valid[key] = when;
    }
    return valid;
  }

  /** Saves the favorites. If storage is blocked or full, they stay in memory. */
  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      localStorage.setItem(REMOVED_KEY, JSON.stringify(removedFavorites));
      storageWorks = true;
    } catch (error) {
      storageWorks = false;
    }
    renderFavoritesNote();
  }

  /* ---------- Favorites: actions ---------- */

  /**
   * Reads a short message aloud to screen readers (e.g. "Added to favorites").
   * While a dialog is open the rest of the page is hidden from them, so the
   * message goes to the live region inside that dialog.
   */
  function announce(message) {
    const region = document.querySelector('dialog[open] [data-live]') || statusEl;
    region.textContent = '';
    // A short delay makes screen readers announce the same message twice in a row.
    setTimeout(() => { region.textContent = message; }, 50);
  }

  function currentKey() {
    return favoriteKey(currentMode, collections[currentMode][currentIndex]);
  }

  function isFavorite(key) {
    return favorites.some((favorite) => favoriteKey(favorite.type, favorite) === key);
  }

  /** Adds an item to the favorites, or removes it if it's already there. */
  function toggleFavoriteItem(type, index) {
    const item = collections[type][index];
    const key = favoriteKey(type, item);
    const adding = !isFavorite(key);
    if (adding) {
      favorites.unshift({ type, en: item.en, at: new Date().toISOString() });
      delete removedFavorites[key];
      announce(t('favorites.added'));
    } else {
      favorites = favorites.filter((favorite) => favoriteKey(favorite.type, favorite) !== key);
      removedFavorites[key] = new Date().toISOString();
      announce(t('favorites.removed'));
    }
    saveFavorites();
    renderFavorites();
    scheduleSync();
    return adding;
  }

  /** The heart on the card: same thing for the item on screen, with a little "pop". */
  function toggleFavorite() {
    if (toggleFavoriteItem(currentMode, currentIndex)) {
      favToggle.classList.remove('is-popping');
      void favToggle.offsetWidth;
      favToggle.classList.add('is-popping');
    }
  }

  /** Removes one favorite from the list, keeping keyboard focus in a sensible place. */
  function removeFavorite(key) {
    const position = favorites.findIndex((favorite) => favoriteKey(favorite.type, favorite) === key);
    if (position < 0) return;
    favorites.splice(position, 1);
    removedFavorites[key] = new Date().toISOString();
    saveFavorites();
    renderFavorites();
    scheduleSync();
    announce(t('favorites.removed'));

    // Focus the next item's remove button (or the previous one), else the close button.
    const buttons = favoritesList.querySelectorAll('.favorites-remove');
    const next = buttons[Math.min(position, buttons.length - 1)];
    (next || favoritesClose).focus();
  }

  /** "Clear all" needs a second press within 4 seconds, so it can't happen by accident. */
  function clearFavorites() {
    if (!favoritesClear.classList.contains('is-confirming')) {
      favoritesClear.classList.add('is-confirming');
      favoritesClear.textContent = t('favorites.clearConfirm');
      // The focused button's new text isn't always read out: announce it.
      announce(t('favorites.clearConfirm'));
      clearTimer = setTimeout(resetClearButton, 4000);
      return;
    }
    const now = new Date().toISOString();
    for (const favorite of favorites) removedFavorites[favoriteKey(favorite.type, favorite)] = now;
    favorites = [];
    saveFavorites();
    resetClearButton();
    renderFavorites();
    scheduleSync();
    announce(t('favorites.cleared'));
    favoritesClose.focus();
  }

  function resetClearButton() {
    clearTimeout(clearTimer);
    favoritesClear.classList.remove('is-confirming');
    favoritesClear.textContent = t('favorites.clear');
  }

  function openFavorites() {
    resetClearButton();
    renderFavoritesList();
    openDialog(favoritesDialog);
  }

  function closeFavorites() {
    closeDialog(favoritesDialog);
  }

  /* ---------- Favorites: display ---------- */

  /**
   * Heart on the card: filled when the item on screen is a favorite. Its name
   * stays "Favorite" and aria-pressed says whether it's on (a toggle button
   * whose name changed too would be read as the opposite of its state); the
   * tooltip says what a click will do.
   */
  function renderFavoriteToggle() {
    const pressed = isFavorite(currentKey());
    favToggle.setAttribute('aria-pressed', String(pressed));
    favToggle.title = t(pressed ? 'favorites.remove' : 'favorites.add');
  }

  /** The counter on the "My favorites" button. */
  function renderFavoritesButton() {
    favoritesCount.textContent = formatValue(currentLang, favorites.length);
  }

  function renderFavoritesNote() {
    favoritesNote.textContent = t('favorites.noStorage');
    favoritesNote.hidden = storageWorks;
  }

  /** A tag's emoji (hidden from screen readers, which just read the name) and its name. */
  function fillTag(element, tag) {
    const emoji = document.createElement('span');
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = tagInfo[tag].emoji;
    element.replaceChildren(emoji, ` ${tagName(tag)}`);
  }

  /**
   * The main button of a row in the favorites or the search results: the
   * emoji, the type ("Joke"), the text and optionally the tags. Clicking it
   * shows the item on the card.
   */
  function itemButton(type, item, { terms = [], withTags = false } = {}) {
    const show = document.createElement('button');
    show.type = 'button';
    show.className = 'favorites-show';
    show.title = t('favorites.show');
    const emoji = document.createElement('span');
    emoji.className = 'favorites-emoji';
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = item.emoji;
    const body = document.createElement('span');
    body.className = 'favorites-body';
    const label = document.createElement('span');
    label.className = 'favorites-type';
    label.textContent = t(`type.${type}`);
    const content = document.createElement('span');
    content.className = 'favorites-text';
    setText(content, textOf(item));
    highlight(content, terms);
    body.append(label, content);
    if (withTags) {
      const itemTags = document.createElement('span');
      itemTags.className = 'item-tags';
      for (const tag of item.tags) {
        const chip = document.createElement('span');
        chip.className = 'item-tag';
        fillTag(chip, tag);
        itemTags.appendChild(chip);
      }
      body.appendChild(itemTags);
    }
    show.append(emoji, body);
    return show;
  }

  /** The list in the dialog, in the current language, newest first. */
  function renderFavoritesList() {
    favoritesEmpty.hidden = favorites.length > 0;
    favoritesClear.disabled = favorites.length === 0;
    renderFavoritesNote();

    favoritesList.replaceChildren(...favorites.map((favorite) => {
      const key = favoriteKey(favorite.type, favorite);
      const { type, index } = itemByKey.get(key);
      const item = collections[type][index];

      const li = document.createElement('li');
      li.className = 'favorites-item';

      const show = itemButton(type, item);
      show.dataset.key = key;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'favorites-remove';
      remove.dataset.key = key;
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${t('favorites.removeItem')}: ${textOf(item).replace('\n', ' ')}`);
      remove.title = t('favorites.removeItem');

      li.append(show, remove);
      return li;
    }));
  }

  /** Everything that depends on the favorites. */
  function renderFavorites() {
    renderFavoriteToggle();
    renderFavoritesButton();
    if (favoritesDialog.open) renderFavoritesList();
    if (browseDialog.open) syncBrowseHearts();
  }

  /* ---------- Copy and share ---------- */

  /** What gets copied or shared: the emoji and the text on the card, in the current language. */
  function shareableText() {
    const item = collections[currentMode][currentIndex];
    return `${item.emoji} ${textOf(item)}`;
  }

  /** The page's address, only when it's online (a file:// path means nothing to someone else). */
  function pageUrl() {
    return /^https?:$/.test(window.location.protocol) ? window.location.href.split('#')[0] : '';
  }

  /**
   * True if the address can be reached from the internet. Facebook's servers
   * fetch the shared page to build its preview, so localhost, local network
   * addresses and .local names can't be shared there.
   */
  function isPublicUrl(url) {
    if (!url) return false;
    const host = new URL(url).hostname;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]') return false;
    const ip = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
    if (ip) {
      const [a, b] = [Number(ip[1]), Number(ip[2])];
      if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return false;
    }
    return true;
  }

  /** Older browsers: copy through a hidden, temporarily selected text field. */
  function copyWithTextarea(text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0;';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    field.remove();
    return copied;
  }

  let copyTimer = 0;

  /** Puts text on the clipboard. Resolves to true if it worked. */
  async function writeClipboard(text) {
    // The modern Clipboard API needs a secure context (https, localhost or a local file).
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Permission refused: try the older way below.
      }
    }
    return copyWithTextarea(text);
  }

  /** Copies the card's text, then shows a check mark for a moment and announces it. */
  async function copyToClipboard() {
    const copied = await writeClipboard(shareableText());

    announce(t(copied ? 'copy.done' : 'copy.failed'));
    if (copied) {
      clearTimeout(copyTimer);
      copyButton.classList.add('is-done');
      copyButton.title = t('copy.done');
      copyTimer = setTimeout(() => {
        copyButton.classList.remove('is-done');
        copyButton.title = t('copy.label');
      }, 1600);
    }
  }

  /**
   * Share: the device's own share sheet when there is one (phones, Safari,
   * Edge and Chrome on Windows…), otherwise a small menu of share links.
   */
  async function share() {
    if (!shareMenu.hidden) {
      closeShareMenu();
      return;
    }
    const text = shareableText();
    const url = pageUrl();
    const data = { title: t(`card.eyebrow.${currentMode}`), text };
    if (url) data.url = url;

    if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return; // the person closed the share sheet
        // Any other failure: fall back to the menu below.
      }
    }
    openShareMenu();
  }

  /** Builds the share links for the text on the card (and the page address, when online). */
  function renderShareLinks() {
    const text = shareableText();
    const url = pageUrl();
    const withUrl = url ? `${text}\n\n${url}` : text;
    const enc = encodeURIComponent;
    const subject = t(`card.eyebrow.${currentMode}`);

    // Facebook doesn't accept pre-filled text: its share window only takes a
    // link, and only a public one, since its servers fetch the page to build the
    // preview (see the Open Graph tags in index.html). So Facebook shares the
    // page link, and is only offered when the page is online at a public address.
    const services = [
      { name: 'WhatsApp', badge: 'W', color: '#C9F2D5', href: `https://wa.me/?text=${enc(withUrl)}` },
      { name: 'X', badge: 'X', color: '#E9ECEF', href: `https://x.com/intent/post?text=${enc(text)}${url ? `&url=${enc(url)}` : ''}` },
      isPublicUrl(url) && { name: 'Facebook', badge: 'f', color: '#D6E4FF', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
      { name: t('share.email'), badge: '@', color: '#FFE8B3', href: `mailto:?subject=${enc(subject)}&body=${enc(withUrl)}` },
    ].filter(Boolean);

    shareLinks.replaceChildren(...services.map((service) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'share-link';
      link.href = service.href;
      // Web services open in a new tab; email opens the mail app.
      if (!service.href.startsWith('mailto:')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      const badge = document.createElement('span');
      badge.className = 'share-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.style.setProperty('--badge', service.color);
      badge.textContent = service.badge;
      const label = document.createElement('span');
      label.className = 'share-label';
      label.textContent = service.name;
      link.append(badge, label);
      li.appendChild(link);
      return li;
    }));
  }

  function openShareMenu() {
    renderShareLinks();
    shareMenu.hidden = false;
    shareButton.setAttribute('aria-expanded', 'true');
    const first = shareLinks.querySelector('a');
    if (first) first.focus();
  }

  function closeShareMenu({ returnFocus: giveFocusBack = false } = {}) {
    if (shareMenu.hidden) return;
    shareMenu.hidden = true;
    shareButton.setAttribute('aria-expanded', 'false');
    if (giveFocusBack) shareButton.focus();
  }

  /* ---------- Read aloud (Web Speech API) ---------- */

  const speech = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
    ? window.speechSynthesis
    : null;
  // Silence before a joke's punchline, the same beat as the card's animation.
  const PUNCHLINE_PAUSE = 700;
  // Goes up every time reading starts or stops, so the callbacks of a reading
  // that was stopped (or replaced) know they're out of date and do nothing.
  let speechRun = 0;
  let punchlineTimer = 0;

  /**
   * The best installed voice for a language: one for the exact locale
   * ("fr-FR") first, then any of the same language ("fr-CA"), preferring
   * voices on the device and the system default. Null if there's none: the
   * browser then chooses from the utterance's language.
   */
  function voiceFor(lang) {
    const voices = speech.getVoices();
    const tag = (voice) => voice.lang.toLowerCase().replace('_', '-');
    const locale = localeOf(lang).toLowerCase();
    const best = (list) => list.find((v) => v.localService && v.default) || list.find((v) => v.localService) || list[0];
    return best(voices.filter((v) => tag(v) === locale)) || best(voices.filter((v) => tag(v).split('-')[0] === lang)) || null;
  }

  function renderSpeakButton(speaking) {
    speakButton.setAttribute('aria-pressed', String(speaking));
    speakButton.title = t(speaking ? 'speak.stop' : 'speak.label');
  }

  function stopSpeaking() {
    if (!speech) return;
    speechRun += 1;
    clearTimeout(punchlineTimer);
    if (speech.speaking || speech.pending) speech.cancel();
    renderSpeakButton(false);
  }

  /**
   * Reads the card aloud in its language: a compliment in one go; a joke as
   * the setup, a short pause, then the punchline. The emoji isn't read.
   */
  function speakCard() {
    const busy = speech.speaking || speech.pending;
    stopSpeaking();
    const run = speechRun;

    const item = collections[currentMode][currentIndex];
    // An item with no translation is shown in English, so it's read in English.
    const lang = item[currentLang] ? currentLang : DEFAULT_LANG;
    const parts = textOf(item).split('\n'); // [text] or [setup, punchline]
    const voice = voiceFor(lang);

    const say = (index) => {
      if (run !== speechRun) return; // stopped in the meantime
      const utterance = new SpeechSynthesisUtterance(parts[index]);
      utterance.lang = localeOf(lang); // pronunciation, even without a matching voice
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (run !== speechRun) return;
        if (index + 1 < parts.length) punchlineTimer = setTimeout(() => say(index + 1), PUNCHLINE_PAUSE);
        else renderSpeakButton(false);
      };
      utterance.onerror = (event) => {
        if (run !== speechRun) return;
        // "interrupted"/"canceled" just mean it was stopped; anything else is a real failure.
        if (event.error !== 'interrupted' && event.error !== 'canceled') announce(t('speak.failed'));
        stopSpeaking();
      };
      speech.speak(utterance);
    };

    renderSpeakButton(true);
    // Chrome can drop a speak() that comes right after cancel(): wait a moment then.
    if (busy) punchlineTimer = setTimeout(() => say(0), 60);
    else say(0);
  }

  /* ---------- Account and sync ---------- */
  // Optional: the favorites can be kept on a sync server (server/server.js) so
  // every device signed in to the same account has the same list. Without a
  // server, nothing here shows and favorites stay on this device as before.
  //
  // How it works: the page sends everything it knows (favorites and when
  // each was added, removals and when), the server merges it with what it has
  // (js/sync.js: the latest change of each item wins) and sends back the
  // result. So changes made offline, on any device, all end up everywhere.

  const syncRules = window.FavoritesSync || null;   // js/sync.js
  const openAccountButton = document.getElementById('open-account');
  const openAccountLabel = document.getElementById('open-account-label');
  const accountDialog = document.getElementById('account-dialog');
  const accountClose = document.getElementById('account-close');
  const accountForm = document.getElementById('account-form');
  const accountUsername = document.getElementById('account-username');
  const accountPassword = document.getElementById('account-password');
  const accountPasswordHint = document.getElementById('account-password-hint');
  const accountError = document.getElementById('account-error');
  const accountSubmit = document.getElementById('account-submit');
  const accountModeButton = document.getElementById('account-mode');
  const accountPanel = document.getElementById('account-panel');
  const accountName = document.getElementById('account-name');
  const accountStatus = document.getElementById('account-status');
  const accountSyncButton = document.getElementById('account-sync');
  const accountSignOut = document.getElementById('account-signout');
  const accountDelete = document.getElementById('account-delete');
  const accountDeleteForm = document.getElementById('account-delete-form');
  const accountDeletePassword = document.getElementById('account-delete-password');
  const accountDeleteError = document.getElementById('account-delete-error');
  const accountElements = [openAccountButton, openAccountLabel, accountDialog, accountClose, accountForm, accountUsername,
    accountPassword, accountPasswordHint, accountError, accountSubmit, accountModeButton, accountPanel, accountName,
    accountStatus, accountSyncButton, accountSignOut, accountDelete, accountDeleteForm, accountDeletePassword, accountDeleteError];

  const USERNAME_RULE = /^[A-Za-z0-9_.-]{3,32}$/; // same rule as the server
  const syncApi = resolveSyncApi();               // '' when sync is off
  let account = loadAccount();                    // { username, token, api, lastSynced } or null
  let syncAvailable = false;                      // the server answered
  let syncState = 'idle';                         // 'idle' | 'syncing' | 'offline' | 'error'
  let syncTimer = 0;
  let syncRunning = null;
  let syncAgain = false;
  let accountMode = 'login';                      // or 'register'
  let accountBusy = false;

  /** The API's address from <meta name="sync-api">, or '' if sync is off or can't work here. */
  function resolveSyncApi() {
    if (!syncRules || typeof fetch !== 'function' || accountElements.some((element) => !element)) return '';
    const meta = document.querySelector('meta[name="sync-api"]');
    const value = ((meta && meta.content) || '').trim();
    if (!value || value === 'off') return '';
    try {
      if (value === 'auto') {
        return /^https?:$/.test(window.location.protocol) ? new URL('api/', window.location.href).href : '';
      }
      return new URL(value.replace(/\/?$/, '/'), window.location.href).href;
    } catch (error) {
      return '';
    }
  }

  /** The saved session, if it belongs to this API. */
  function loadAccount() {
    if (!syncApi) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
      if (saved && typeof saved.username === 'string' && typeof saved.token === 'string' && saved.api === syncApi) return saved;
    } catch (error) {
      // Nothing usable saved.
    }
    return null;
  }

  function saveAccount() {
    try {
      if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
      else localStorage.removeItem(ACCOUNT_KEY);
    } catch (error) {
      // Storage blocked: the session lasts until the page is closed.
    }
  }

  /** One call to the sync API. Resolves to { status, data }; rejects if the server can't be reached. */
  async function api(method, route, { body, token } = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : 0;
    try {
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(syncApi + route, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit', // the token travels in the header, never as a cookie
        signal: controller ? controller.signal : undefined,
      });
      let data = {};
      try {
        data = (await response.json()) || {};
      } catch (error) {
        // No body (204) or not JSON.
      }
      return { status: response.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  /** This device's favorites and removals, in the shared sync format. */
  function localEntries() {
    const entries = favorites.map((f) => ({ type: f.type, en: f.en, updated: f.at }));
    for (const [key, updated] of Object.entries(removedFavorites)) {
      const { type, index } = itemByKey.get(key);
      entries.push({ type, en: collections[type][index].en, updated, removed: true });
    }
    return entries;
  }

  /**
   * Takes the server's merged list. It's merged once more with what's here,
   * so a change made while the request was on its way isn't lost (the next
   * sync sends it). Items this version of the app doesn't have are skipped.
   */
  function applyEntries(serverEntries) {
    const merged = syncRules.mergeEntries(localEntries(), serverEntries);
    if (!merged) return;
    const nextFavorites = [];
    const nextRemoved = {};
    for (const entry of merged) {
      const key = favoriteKey(entry.type, entry);
      if (!itemByKey.has(key)) continue;
      if (entry.removed) nextRemoved[key] = entry.updated;
      else nextFavorites.push({ type: entry.type, en: entry.en, at: entry.updated });
    }
    const changed = JSON.stringify(nextFavorites) !== JSON.stringify(favorites) ||
      JSON.stringify(nextRemoved) !== JSON.stringify(removedFavorites);
    if (!changed) return;
    favorites = nextFavorites;
    removedFavorites = nextRemoved;
    saveFavorites();
    renderFavorites();
  }

  /** Syncs a moment after a change, so several quick changes go in one request. */
  function scheduleSync() {
    if (!account) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 1500);
  }

  /** Sends this device's favorites and takes back the merged list. */
  function syncNow() {
    if (!account) return Promise.resolve();
    clearTimeout(syncTimer);
    if (syncRunning) {
      syncAgain = true; // one more round once this one is done
      return syncRunning;
    }
    syncState = 'syncing';
    renderAccount();
    syncRunning = (async () => {
      try {
        const { status, data } = await api('POST', 'favorites/sync', { token: account.token, body: { entries: localEntries() } });
        if (status === 200 && Array.isArray(data.entries)) {
          applyEntries(data.entries);
          syncAvailable = true;
          syncState = 'idle';
          account.lastSynced = new Date().toISOString();
          saveAccount();
        } else if (status === 401) {
          sessionEnded();
        } else {
          syncState = 'error';
        }
      } catch (error) {
        syncState = 'offline'; // tried again when the connection comes back
      }
      syncRunning = null;
      renderAccount();
      if (syncAgain && account) {
        syncAgain = false;
        await syncNow();
      }
    })();
    return syncRunning;
  }

  /** The server no longer knows this session (expired, or the account was deleted elsewhere). */
  function sessionEnded() {
    account = null;
    saveAccount();
    syncState = 'idle';
    announce(t('account.announce.expired'));
  }

  /** Asks the server whether sync is available here, then syncs if signed in. */
  async function checkSyncServer() {
    if (!syncApi) return;
    try {
      const { status, data } = await api('GET', 'health');
      syncAvailable = status === 200 && data.service === 'compliment-generator-sync';
    } catch (error) {
      syncAvailable = false;
    }
    renderAccount();
    if (account) syncNow();
  }

  function syncStatusText() {
    if (syncState === 'syncing') return t('account.status.syncing');
    if (syncState === 'offline') return t('account.status.offline');
    if (syncState === 'error') return t('account.status.error');
    if (!account || !account.lastSynced) return t('account.status.never');
    const time = new Intl.DateTimeFormat(localeOf(currentLang), { dateStyle: 'medium', timeStyle: 'short' })
      .format(new Date(account.lastSynced));
    return t('account.status.synced', { time });
  }

  /** The account button and dialog, for the current state and language. */
  function renderAccount() {
    if (!syncApi) return;
    openAccountButton.hidden = !syncAvailable && !account;
    openAccountButton.dataset.state = account ? syncState : 'signed-out';
    if (account) {
      // The visible label is the username; the full name says what it is.
      openAccountLabel.textContent = account.username;
      openAccountButton.setAttribute('aria-label', t('account.buttonSignedIn', { name: account.username }));
      openAccountButton.title = syncStatusText();
    } else {
      openAccountLabel.textContent = t('account.open');
      openAccountButton.removeAttribute('aria-label');
      openAccountButton.removeAttribute('title');
    }

    accountForm.hidden = Boolean(account);
    accountPanel.hidden = !account;
    if (account) {
      accountName.textContent = account.username;
      accountStatus.textContent = syncStatusText();
      accountSyncButton.disabled = syncState === 'syncing';
    } else {
      const registering = accountMode === 'register';
      accountSubmit.textContent = t(accountBusy ? 'account.working' : registering ? 'account.register' : 'account.login');
      accountModeButton.textContent = t(registering ? 'account.haveAccount' : 'account.newHere');
      accountPassword.setAttribute('autocomplete', registering ? 'new-password' : 'current-password');
      accountPassword.setAttribute('minlength', registering ? '8' : '1');
      accountPasswordHint.hidden = !registering;
    }
  }

  /** Shows an error under a form (read out by the role="alert" region) and marks the field. */
  function showAccountError(target, code, field) {
    const key = `account.error.${code}`;
    const message = t(key);
    target.textContent = message === key ? t('account.error.server_error') : message;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  function clearAccountErrors() {
    accountError.textContent = '';
    accountDeleteError.textContent = '';
    for (const field of [accountUsername, accountPassword, accountDeletePassword]) field.removeAttribute('aria-invalid');
  }

  function setAccountBusy(busy) {
    accountBusy = busy;
    // aria-disabled rather than disabled: the button keeps focus while waiting.
    accountSubmit.setAttribute('aria-disabled', String(busy));
    accountForm.setAttribute('aria-busy', String(busy));
    renderAccount();
  }

  /** Sign in or create an account. */
  async function submitAccountForm(event) {
    event.preventDefault();
    if (accountBusy) return;
    clearAccountErrors();
    const registering = accountMode === 'register';
    const username = accountUsername.value.trim();
    const password = accountPassword.value;

    // The same checks the server makes, to answer at once.
    if (!USERNAME_RULE.test(username)) {
      showAccountError(accountError, 'invalid_username', accountUsername);
      return;
    }
    if (!password) {
      showAccountError(accountError, 'missing_password', accountPassword);
      return;
    }
    if (registering && (password.length < 8 || password.toLowerCase() === username.toLowerCase())) {
      showAccountError(accountError, 'invalid_password', accountPassword);
      return;
    }

    setAccountBusy(true);
    try {
      const { status, data } = await api('POST', registering ? 'register' : 'login', { body: { username, password } });
      if ((status === 200 || status === 201) && data.token && data.user) {
        account = { username: data.user.username, token: data.token, api: syncApi, lastSynced: null };
        saveAccount();
        syncAvailable = true;
        accountUsername.value = '';
        accountPassword.value = '';
        accountMode = 'login';
        setAccountBusy(false);
        announce(t('account.announce.signedIn', { name: account.username }));
        accountSyncButton.focus();
        // This device's favorites join the account's (nothing is lost on either side).
        await syncNow();
        return;
      }
      const code = data.error || 'server_error';
      const field = code === 'invalid_username' || code === 'username_taken' ? accountUsername
        : code === 'invalid_password' || code === 'wrong_credentials' ? accountPassword
          : null;
      if (code === 'wrong_credentials') accountPassword.value = '';
      showAccountError(accountError, code, field);
    } catch (error) {
      showAccountError(accountError, 'network', null);
    } finally {
      if (accountBusy) setAccountBusy(false);
    }
  }

  /** Signs out on this device. Pending changes are sent first, if possible; favorites stay here. */
  async function signOut() {
    if (!account) return;
    if (syncTimer || syncRunning) {
      try {
        await syncNow();
      } catch (error) {
        // Offline: they stay on this device anyway.
      }
    }
    const { token } = account;
    account = null;
    saveAccount();
    clearTimeout(syncTimer);
    syncState = 'idle';
    renderAccount();
    announce(t('account.announce.signedOut'));
    accountUsername.focus();
    api('POST', 'logout', { token }).catch(() => {}); // end the session on the server too
  }

  /** Deletes the account on the server, after checking the password. */
  async function deleteAccount(event) {
    event.preventDefault();
    if (!account || accountBusy) return;
    clearAccountErrors();
    const password = accountDeletePassword.value;
    if (!password) {
      showAccountError(accountDeleteError, 'missing_password', accountDeletePassword);
      return;
    }
    accountBusy = true;
    try {
      const { status, data } = await api('DELETE', 'account', { token: account.token, body: { password } });
      if (status === 204) {
        account = null;
        saveAccount();
        accountDeletePassword.value = '';
        accountDelete.open = false;
        syncState = 'idle';
        renderAccount();
        announce(t('account.announce.deleted'));
        accountUsername.focus();
      } else if (status === 401) {
        sessionEnded();
        renderAccount();
      } else {
        showAccountError(accountDeleteError, data.error || 'server_error', data.error === 'wrong_password' ? accountDeletePassword : null);
      }
    } catch (error) {
      showAccountError(accountDeleteError, 'network', null);
    } finally {
      accountBusy = false;
    }
  }

  function openAccount() {
    clearAccountErrors();
    renderAccount();
    openDialog(accountDialog);
    (account ? accountSyncButton : accountUsername).focus();
    if (account && syncState !== 'syncing') syncNow(); // show an up-to-date status
  }

  /* ---------- Tags on the card ---------- */

  /** Chips under the text; each opens the search filtered on that tag. */
  function renderCardTags() {
    const item = collections[currentMode][currentIndex];
    complimentTags.replaceChildren(...item.tags.map((tag) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.dataset.tag = tag;
      chip.setAttribute('aria-haspopup', 'dialog');
      fillTag(chip, tag);
      chip.title = t('browse.tagOnCard', { tag: tagName(tag) });
      return chip;
    }));
  }

  /* ---------- Browse & search ---------- */

  // Current filters. Tags combine: every selected tag must be present.
  const browse = { query: '', type: 'all', tags: new Set() };
  let tagFiltersLang = '';   // language the tag filter chips were built in
  let tagFilterStop = '';    // tag chip that is the toolbar's Tab stop
  let summaryTimer = 0;

  /**
   * Makes text comparable: lower case, without accents, with plain
   * apostrophes. Each character stays one character long, so a match found in
   * the folded text is at the same position in the original (for highlighting).
   */
  function fold(text) {
    let out = '';
    for (const unit of String(text)) {
      let c = unit.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (c === '’' || c === '‘') c = "'";
      out += c.length === unit.length ? c : unit;
    }
    return out;
  }

  // Everything searchable, prepared once: every language and the tag names,
  // so "chien" and "dog" both find the dog joke whatever the page language.
  const searchIndex = [];
  for (const [type, list] of Object.entries(collections)) {
    list.forEach((item, index) => {
      const texts = languages.map((lang) => textOf(item, lang)).join(' ');
      const tagWords = item.tags.map((tag) => languages.map((lang) => tagName(tag, lang)).join(' ')).join(' ');
      searchIndex.push({ type, index, item, haystack: fold(`${texts} ${tagWords} ${item.emoji}`) });
    });
  }

  function searchTerms() {
    return fold(browse.query).split(/\s+/).filter(Boolean);
  }

  /** Items matching the search words, the type and every selected tag. */
  function browseResults() {
    const terms = searchTerms();
    return searchIndex.filter((entry) =>
      (browse.type === 'all' || entry.type === browse.type) &&
      [...browse.tags].every((tag) => entry.item.tags.includes(tag)) &&
      terms.every((term) => entry.haystack.includes(term)));
  }

  /** Wraps the search words found in an element's text in <mark> (text nodes only, never HTML). */
  function highlight(element, terms) {
    if (!terms.length) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const original = node.textContent;
      const folded = fold(original);
      const ranges = [];
      for (const term of terms) {
        let from = folded.indexOf(term);
        while (from !== -1) {
          ranges.push([from, from + term.length]);
          from = folded.indexOf(term, from + term.length);
        }
      }
      if (!ranges.length) continue;
      // Merge overlapping matches, then rebuild the text with <mark> around them.
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [ranges[0]];
      for (const [start, end] of ranges.slice(1)) {
        const last = merged[merged.length - 1];
        if (start <= last[1]) last[1] = Math.max(last[1], end);
        else merged.push([start, end]);
      }
      const fragment = document.createDocumentFragment();
      let position = 0;
      for (const [start, end] of merged) {
        fragment.append(original.slice(position, start));
        const mark = document.createElement('mark');
        mark.textContent = original.slice(start, end);
        fragment.append(mark);
        position = end;
      }
      fragment.append(original.slice(position));
      node.replaceWith(fragment);
    }
  }

  const heartSvg = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" /></svg>';

  /** Heart buttons in the results follow the favorites list (same naming as the card's heart). */
  function syncBrowseHearts() {
    browseList.querySelectorAll('.browse-fav').forEach((heart) => {
      const pressed = isFavorite(heart.dataset.key);
      heart.setAttribute('aria-pressed', String(pressed));
      heart.setAttribute('aria-label', `${t('favorites.toggle')}: ${heart.dataset.label}`);
      heart.title = t(pressed ? 'favorites.remove' : 'favorites.add');
    });
  }

  /** The tag filter chips: built once per language, then only their state changes. */
  function renderTagFilters() {
    if (tagFiltersLang !== currentLang) {
      browseTags.replaceChildren(...Object.keys(tagInfo).map((tag) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip';
        chip.dataset.tag = tag;
        fillTag(chip, tag);
        return chip;
      }));
      tagFiltersLang = currentLang;
    }
    const chips = [...browseTags.querySelectorAll('[data-tag]')];
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(browse.tags.has(chip.dataset.tag))));
    setTabStop(chips, chips.find((chip) => chip.dataset.tag === tagFilterStop));
  }

  /** Filters and results, in the current language. */
  function renderBrowse() {
    const terms = searchTerms();
    const results = browseResults();

    // Type filter: a radio group, whose Tab stop is the checked option.
    const typeOptions = [...browseType.querySelectorAll('[data-type]')];
    typeOptions.forEach((option) => option.setAttribute('aria-checked', String(option.dataset.type === browse.type)));
    setTabStop(typeOptions, typeOptions.find((option) => option.dataset.type === browse.type));

    renderTagFilters();

    // Results. The count is shown at once but only announced once typing
    // pauses, so screen readers don't read a number after every key.
    browseSummary.textContent = t('browse.results', { count: results.length });
    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => {
      if (browseDialog.open) announce(browseSummary.textContent);
    }, 700);
    browseEmpty.textContent = t('browse.empty');
    browseEmpty.hidden = results.length > 0;
    browseRandom.disabled = results.length === 0;
    browseClear.disabled = !browse.query && browse.type === 'all' && browse.tags.size === 0;

    browseList.replaceChildren(...results.map(({ type, index, item }) => {
      const li = document.createElement('li');
      li.className = 'favorites-item';

      const show = itemButton(type, item, { terms, withTags: true });
      show.dataset.type = type;
      show.dataset.index = String(index);

      const heart = document.createElement('button');
      heart.type = 'button';
      heart.className = 'browse-fav';
      heart.dataset.key = favoriteKey(type, item);
      heart.dataset.type = type;
      heart.dataset.index = String(index);
      heart.dataset.label = textOf(item).replace('\n', ' ');
      heart.innerHTML = heartSvg;

      li.append(show, heart);
      return li;
    }));
    syncBrowseHearts();
  }

  /** Opens the search, optionally already filtered on one tag. */
  function openBrowse({ tag = null } = {}) {
    closeShareMenu();
    if (tag) {
      browse.query = '';
      browse.type = 'all';
      browse.tags = new Set([tag]);
      tagFilterStop = tag;
      browseSearch.value = '';
    }
    renderBrowse();
    openDialog(browseDialog);
    browseSearch.focus();
  }

  function closeBrowse() {
    closeDialog(browseDialog);
  }

  /** Shows an item on the card and closes the search. */
  function showFromBrowse(type, index) {
    currentMode = type;
    currentIndex = index;
    renderItem();
    closeBrowse();
  }

  /* ---------- Wire up the controls ---------- */
  complimentButton.addEventListener('click', () => showNew('compliment'));
  jokeButton.addEventListener('click', () => showNew('joke'));

  favToggle.addEventListener('click', toggleFavorite);

  // Browse & search
  openBrowseButton.addEventListener('click', () => openBrowse());
  browseClose.addEventListener('click', closeBrowse);
  browseDialog.addEventListener('click', (event) => {
    if (event.target === browseDialog) closeBrowse(); // click on the backdrop
  });
  complimentTags.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag]');
    if (chip) openBrowse({ tag: chip.dataset.tag });
  });
  browseSearch.addEventListener('input', () => {
    browse.query = browseSearch.value;
    renderBrowse();
  });
  // Down arrow from the search field jumps to the first result.
  browseSearch.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    const first = browseList.querySelector('.favorites-show');
    if (!first) return;
    event.preventDefault();
    first.focus();
  });

  function chooseType(option) {
    browse.type = option.dataset.type;
    renderBrowse();
  }
  browseType.addEventListener('click', (event) => {
    const option = event.target.closest('[data-type]');
    if (option) chooseType(option);
  });
  // Radio group: the arrow keys move and choose at the same time.
  browseType.addEventListener('keydown', (event) => {
    const option = moveInGroup(event, browseType, '[data-type]');
    if (option) chooseType(option);
  });

  browseTags.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag]');
    if (!chip) return;
    const tag = chip.dataset.tag;
    if (browse.tags.has(tag)) browse.tags.delete(tag);
    else browse.tags.add(tag);
    tagFilterStop = tag;
    renderBrowse();
    chip.focus(); // the chips are kept, so focus stays on the one just pressed
  });
  // Toolbar: the arrow keys only move; Space or Enter turns a tag on or off.
  browseTags.addEventListener('keydown', (event) => {
    const chip = moveInGroup(event, browseTags, '[data-tag]');
    if (chip) tagFilterStop = chip.dataset.tag;
  });

  browseList.addEventListener('click', (event) => {
    const heart = event.target.closest('.browse-fav');
    const show = event.target.closest('.favorites-show');
    if (heart) toggleFavoriteItem(heart.dataset.type, Number(heart.dataset.index));
    else if (show) showFromBrowse(show.dataset.type, Number(show.dataset.index));
  });
  browseList.addEventListener('keydown', (event) => moveInList(event, { beforeFirst: browseSearch }));
  browseClear.addEventListener('click', () => {
    browse.query = '';
    browse.type = 'all';
    browse.tags.clear();
    browseSearch.value = '';
    renderBrowse();
    browseSearch.focus();
  });
  browseRandom.addEventListener('click', () => {
    const results = browseResults();
    if (!results.length) return;
    // Avoid picking the item already on the card when there's a choice.
    const others = results.filter((r) => !(r.type === currentMode && r.index === currentIndex));
    const pool = others.length ? others : results;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    showFromBrowse(pick.type, pick.index);
  });

  // Ctrl+K (⌘K on a Mac) opens the search from anywhere, or goes back to the
  // search field if it's already open.
  document.addEventListener('keydown', (event) => {
    if ((event.key || '').toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (favoritesDialog.open) return;
    event.preventDefault(); // the browser's own Ctrl+K (search bar)
    if (browseDialog.open) browseSearch.focus();
    else openBrowse();
  });

  copyButton.addEventListener('click', copyToClipboard);
  shareButton.addEventListener('click', share);

  // Read aloud: only offered where the browser can speak.
  if (speech) {
    speakButton.hidden = false;
    speech.getVoices(); // some browsers only load their voice list when first asked
    speakButton.addEventListener('click', () => {
      if (speakButton.getAttribute('aria-pressed') === 'true') stopSpeaking();
      else speakCard();
    });
    // Don't keep talking after leaving the page.
    window.addEventListener('pagehide', stopSpeaking);
  }

  // The share menu closes after picking a service, on Esc, when focus leaves
  // it (Tab), or on a click elsewhere. Up/Down/Home/End move between the links.
  shareLinks.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeShareMenu();
  });
  shareMenu.addEventListener('keydown', (event) => moveInGroup(event, shareLinks, 'a', { roving: false }));
  shareMenu.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (next && !shareMenu.contains(next) && next !== shareButton) closeShareMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !shareMenu.hidden) closeShareMenu({ returnFocus: true });
  });
  document.addEventListener('click', (event) => {
    if (!shareMenu.hidden && !shareMenu.contains(event.target) && !shareButton.contains(event.target)) closeShareMenu();
  });

  openFavoritesButton.addEventListener('click', openFavorites);
  favoritesClose.addEventListener('click', closeFavorites);
  favoritesClear.addEventListener('click', clearFavorites);

  // Closed with Esc (or by the browser): focus goes back where it was.
  favoritesDialog.addEventListener('close', () => {
    resetClearButton();
    returnFocus(favoritesDialog);
  });
  browseDialog.addEventListener('close', () => returnFocus(browseDialog));

  // A click on the dimmed backdrop (outside the dialog box) closes it.
  favoritesDialog.addEventListener('click', (event) => {
    if (event.target === favoritesDialog) closeFavorites();
  });

  // One listener for the whole list: show an item on the card, or remove it.
  favoritesList.addEventListener('click', (event) => {
    const show = event.target.closest('.favorites-show');
    const remove = event.target.closest('.favorites-remove');
    if (remove) {
      removeFavorite(remove.dataset.key);
    } else if (show) {
      const found = itemByKey.get(show.dataset.key);
      if (!found) return;
      currentMode = found.type;
      currentIndex = found.index;
      renderItem();
      closeFavorites();
    }
  });
  favoritesList.addEventListener('keydown', (event) => moveInList(event));

  // Favorites changed in another tab: pick up the new list.
  window.addEventListener('storage', (event) => {
    if (event.key === ACCOUNT_KEY || event.key === null) {
      account = loadAccount(); // signed in or out in another tab
      renderAccount();
    }
    if (event.key !== FAVORITES_KEY && event.key !== REMOVED_KEY && event.key !== null) return;
    favorites = loadFavorites();
    removedFavorites = loadRemoved();
    renderFavorites();
  });

  // Language switch: a click, or the arrow keys (a radio group chooses as it moves).
  langSwitch.addEventListener('click', (event) => {
    const option = event.target.closest('[data-lang]');
    if (option) setLanguage(option.dataset.lang);
  });
  langSwitch.addEventListener('keydown', (event) => {
    const option = moveInGroup(event, langSwitch, '[data-lang]');
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
  buildLanguageSwitch();
  renderInterface();
  emojiEl.textContent = compliments[currentIndex].emoji;
  setText(complimentEl, textOf(compliments[currentIndex]));
  lockComplimentHeight();
  // Web fonts change the text's size once they arrive: measure again then.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(lockComplimentHeight);
  }

  /* ---------- Account and sync: wiring ---------- */
  if (syncApi) {
    openAccountButton.addEventListener('click', openAccount);
    accountClose.addEventListener('click', () => closeDialog(accountDialog));
    accountDialog.addEventListener('click', (event) => {
      if (event.target === accountDialog) closeDialog(accountDialog);
    });
    accountDialog.addEventListener('close', () => {
      accountDelete.open = false;
      accountPassword.value = '';
      accountDeletePassword.value = '';
      returnFocus(accountDialog);
    });
    accountForm.addEventListener('submit', submitAccountForm);
    accountModeButton.addEventListener('click', () => {
      accountMode = accountMode === 'login' ? 'register' : 'login';
      clearAccountErrors();
      renderAccount();
      accountUsername.focus();
    });
    accountSyncButton.addEventListener('click', async () => {
      await syncNow();
      if (syncState === 'idle' && account) announce(t('account.announce.synced'));
      else if (account) announce(syncStatusText());
    });
    accountSignOut.addEventListener('click', signOut);
    accountDeleteForm.addEventListener('submit', deleteAccount);

    // Back online, or back to this tab after a while: catch up.
    window.addEventListener('online', () => {
      if (account) syncNow();
      else checkSyncServer();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !account) return;
      const last = Date.parse(account.lastSynced || 0) || 0;
      if (Date.now() - last > 30000) syncNow();
    });

    renderAccount();   // signed in: the button shows at once, even offline
    checkSyncServer();
  }

  /* ---------- Offline support ---------- */
  // The service worker keeps a copy of the app so it works without a
  // connection (and can be installed like an app). Its code is in js/sw.js,
  // loaded by the one-line sw.js at the root, which must stay there to look
  // after index.html. Service workers only run on a web server (http or https,
  // or localhost), not when index.html is opened as a file.
  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    const register = () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // No offline copy this time; the app works normally online.
      });
    };
    // After the page has loaded, so it doesn't compete with the page's own downloads.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }
})();
