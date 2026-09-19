/* ==========================================================================
   Compliment Generator: behaviour
   Shows a random compliment or joke (with its emoji) at the click of a
   button, never the same one twice in a row, in English or French. The card
   keeps the same size whatever the text or the language.
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

  /* ---------- The jokes ---------- */
  // 100 family-friendly jokes. "\n" separates the setup from the punchline,
  // which is shown in bold on its own line.
  // Puns rarely survive translation: when the English joke relies on one,
  // the French side is a French joke on the same theme rather than a literal
  // translation (English knock-knock jokes, for instance, are paired with
  // French "M. et Mme…" jokes).
  const jokes = [
    // Animals
    { emoji: '🐘',
      en: 'Why don’t elephants use computers?\nThey’re scared of the mouse.',
      fr: 'Pourquoi les éléphants n’utilisent-ils pas d’ordinateur ?\nIls ont peur de la souris.' },
    { emoji: '🐔',
      en: 'Why did the chicken cross the road?\nTo get to the other side.',
      fr: 'Pourquoi la poule a-t-elle traversé la route ?\nPour aller de l’autre côté.' },
    { emoji: '🐌',
      en: 'What does a snail say when it rides on a turtle?\n“Wheeee!”',
      fr: 'Que dit un escargot sur le dos d’une tortue ?\n« Youhou, trop rapide ! »' },
    { emoji: '🐙',
      en: 'How did the octopus win the tickle fight?\nIt had eight arms.',
      fr: 'Comment la pieuvre a-t-elle gagné la bataille de chatouilles ?\nElle avait huit bras.' },
    { emoji: '🦒',
      en: 'Why do giraffes have such long necks?\nBecause their feet smell.',
      fr: 'Pourquoi les girafes ont-elles un si long cou ?\nParce qu’elles ont les pieds qui puent.' },
    { emoji: '🐸',
      en: 'What’s a frog’s favorite drink?\nCroak-a-Cola.',
      fr: 'Quelle est la boisson préférée des grenouilles ?\nLe Coâ-Coâ-Cola.' },
    { emoji: '🐄',
      en: 'Where do cows go on vacation?\nMoo York.',
      fr: 'Où les vaches partent-elles en vacances ?\nÀ Meuh-York.' },
    { emoji: '🐱',
      en: 'What do you call a pile of cats?\nA meowtain.',
      fr: 'Comment appelle-t-on une pile de chats ?\nUne miaou-tagne.' },
    { emoji: '🐧',
      en: 'Why don’t penguins like parties?\nThey find it hard to break the ice.',
      fr: 'Pourquoi les pingouins n’aiment-ils pas les fêtes ?\nIls ont du mal à briser la glace.' },
    { emoji: '🐝',
      en: 'Why do bees hum?\nBecause they don’t know the words.',
      fr: 'Pourquoi les abeilles bourdonnent-elles ?\nParce qu’elles ne connaissent pas les paroles.' },
    { emoji: '🐟',
      en: 'Why are fish so smart?\nBecause they live in schools.',
      fr: 'Pourquoi les poissons sont-ils si studieux ?\nIls nagent en bancs et ne sèchent jamais les cours.' },
    { emoji: '🐍',
      en: 'What’s a snake’s favorite subject at school?\nHiss-tory.',
      fr: 'Quelle est la matière préférée des serpents ?\nL’hiss-toire.' },
    { emoji: '🦉',
      en: 'What do you call an owl that does magic tricks?\nHoo-dini.',
      fr: 'Comment appelle-t-on une chouette magicienne ?\nHou-dini.' },
    { emoji: '🐻',
      en: 'What do you call a bear with no teeth?\nA gummy bear.',
      fr: 'Comment appelle-t-on un ours sans dents ?\nUn ours en gélatine.' },
    { emoji: '🐶',
      en: 'What do you call a dog that does magic?\nA labracadabrador.',
      fr: 'Comment appelle-t-on un chien magicien ?\nUn labracadabrador.' },
    { emoji: '🐑',
      en: 'What do sheep do on sunny days?\nHave a baa-becue.',
      fr: 'Que font les moutons quand il fait beau ?\nUn bêêê-rbecue.' },
    { emoji: '🎸',
      en: 'What do you call a cow that plays the guitar?\nA moo-sician.',
      fr: 'Comment appelle-t-on une vache qui joue de la guitare ?\nUne meuh-sicienne.' },
    { emoji: '🦈',
      en: 'What did the shark say after eating a clownfish?\n“That tasted a little funny.”',
      fr: 'Qu’a dit le requin après avoir mangé un poisson-clown ?\n« Il avait un drôle de goût. »' },
    { emoji: '🦘',
      en: 'What do you call a lazy kangaroo?\nA pouch potato.',
      fr: 'Pourquoi le kangourou est-il toujours détendu ?\nIl a tout ce qu’il faut dans la poche.' },
    { emoji: '🐆',
      en: 'Why don’t leopards play hide-and-seek?\nThey’re always spotted.',
      fr: 'Pourquoi les léopards ne jouent-ils jamais à cache-cache ?\nIls sont toujours repérés.' },
    { emoji: '🐭',
      en: 'What’s a mouse’s favorite game?\nHide-and-squeak.',
      fr: 'Quel est le jeu préféré des souris ?\nCache-cache avec le chat… mais jamais très longtemps.' },
    { emoji: '🦩',
      en: 'Why do flamingos stand on one leg?\nIf they lifted both, they’d fall over.',
      fr: 'Pourquoi les flamants roses se tiennent-ils sur une patte ?\nS’ils levaient l’autre, ils tomberaient.' },
    { emoji: '🐊',
      en: 'What do you call an alligator in a vest?\nAn investigator.',
      fr: 'Comment appelle-t-on un crocodile qui mène l’enquête ?\nSherlock Crocs.' },
    { emoji: '🐿️',
      en: 'Why don’t squirrels ever get lost?\nThey always stay on the right branch.',
      fr: 'Pourquoi les écureuils ne se perdent-ils jamais ?\nIls restent toujours sur la bonne branche.' },
    { emoji: '🕷️',
      en: 'Why are spiders so good with computers?\nThey spend their whole life on the web.',
      fr: 'Pourquoi les araignées sont-elles douées en informatique ?\nElles passent leur vie sur la toile.' },
    { emoji: '🐡',
      en: 'What do you call a fish wearing a bow tie?\nSofishticated.',
      fr: 'Comment appelle-t-on un poisson qui porte un nœud papillon ?\nUn thon très chic.' },
    { emoji: '🦀',
      en: 'Why don’t crabs share their snacks?\nBecause they’re shellfish.',
      fr: 'Pourquoi les crabes marchent-ils de travers ?\nParce qu’ils ont bu trop d’eau salée.' },
    { emoji: '🐴',
      en: 'Why did the pony have to gargle?\nIt was a little horse.',
      fr: 'Pourquoi le cheval ne peut-il pas chanter ce soir ?\nIl a un chat dans la gorge.' },
    { emoji: '🐇',
      en: 'How do rabbits travel?\nBy hare-plane.',
      fr: 'Que fait un lapin qui ne vient pas à son rendez-vous ?\nIl pose un lapin.' },
    { emoji: '🐷',
      en: 'What do you call a pig that does karate?\nA pork chop.',
      fr: 'Pourquoi les cochons s’entendent-ils si bien ?\nIls sont copains comme cochons.' },
    { emoji: '🐜',
      en: 'Why don’t ants ever get sick?\nThey have little anty-bodies.',
      fr: 'Pourquoi les fourmis ne tombent-elles jamais malades ?\nElles ont des anticorps fourmi-dables.' },
    { emoji: '🌭',
      en: 'Why did the dog sit in the shade?\nHe didn’t want to be a hot dog.',
      fr: 'Pourquoi le chien s’assoit-il à l’ombre ?\nIl ne veut pas devenir un hot-dog.' },
    { emoji: '🐈',
      en: 'Why was the cat sitting on the computer?\nTo keep an eye on the mouse.',
      fr: 'Pourquoi le chat est-il assis sur l’ordinateur ?\nPour surveiller la souris.' },
    { emoji: '🦆',
      en: 'What do you call a duck that gets straight A’s?\nA wise quacker.',
      fr: 'Comment appelle-t-on un canard très intelligent ?\nUn génie du coin-coin.' },
    { emoji: '🦔',
      en: 'What do you get if you cross a hedgehog and a snake?\nBarbed wire.',
      fr: 'Que donne le croisement d’un hérisson et d’un serpent ?\nDu fil barbelé.' },

    // Dinosaurs, monsters and ghosts
    { emoji: '🦖',
      en: 'What do you call a sleeping dinosaur?\nA dino-snore.',
      fr: 'Comment appelle-t-on un dinosaure qui dort ?\nUn dino-dort.' },
    { emoji: '🦕',
      en: 'What do you call a dinosaur that knows every word?\nA thesaurus.',
      fr: 'Comment appelle-t-on un dinosaure qui connaît tous les mots ?\nUn dico-saure.' },
    { emoji: '💀',
      en: 'Why don’t skeletons fight each other?\nThey don’t have the guts.',
      fr: 'Pourquoi les squelettes ne se battent-ils jamais ?\nIls n’ont pas de tripes.' },
    { emoji: '🎃',
      en: 'Why didn’t the skeleton go to the party?\nIt had no body to go with.',
      fr: 'Pourquoi le squelette n’est-il pas allé à la fête ?\nIl n’avait pas le cœur à ça.' },
    { emoji: '🎺',
      en: 'What’s a skeleton’s favorite instrument?\nThe trom-bone.',
      fr: 'Quel est l’instrument préféré des squelettes ?\nLe trombone… pardon, le trom-os.' },
    { emoji: '👻',
      en: 'Why are ghosts such bad liars?\nYou can see right through them.',
      fr: 'Pourquoi les fantômes mentent-ils si mal ?\nOn voit clair dans leur jeu.' },
    { emoji: '🧛',
      en: 'Why don’t vampires have many friends?\nThey’re a pain in the neck.',
      fr: 'Pourquoi les vampires sont-ils toujours de mauvaise humeur ?\nIls ont les crocs.' },
    { emoji: '🛸',
      en: 'What’s an alien’s favorite chocolate bar?\nA Milky Way.',
      fr: 'Que boivent les extraterrestres au goûter ?\nDu lait de la Voie lactée.' },

    // Food
    { emoji: '🍅',
      en: 'Why did the tomato blush?\nBecause it saw the salad dressing.',
      fr: 'Pourquoi la tomate est-elle toute rouge ?\nElle a vu la salade se déshabiller.' },
    { emoji: '🥚',
      en: 'Why don’t eggs tell jokes?\nThey’d crack each other up.',
      fr: 'Pourquoi les œufs ne racontent-ils jamais de blagues ?\nIls finiraient tous par craquer.' },
    { emoji: '🍌',
      en: 'Why did the banana go to the doctor?\nIt wasn’t peeling well.',
      fr: 'Pourquoi la banane est-elle allée chez le médecin ?\nElle ne se sentait pas bien dans sa peau.' },
    { emoji: '🍪',
      en: 'Why did the cookie go to the nurse?\nIt felt crummy.',
      fr: 'Pourquoi le cookie est-il allé à l’infirmerie ?\nIl était en miettes.' },
    { emoji: '🥐',
      en: 'Why did the croissant see a therapist?\nIt was feeling a bit flaky.',
      fr: 'Pourquoi le croissant est-il allé chez le psy ?\nIl n’était pas dans son assiette.' },
    { emoji: '🍩',
      en: 'Why did the doughnut go to the dentist?\nIt needed a filling.',
      fr: 'Pourquoi le beignet est-il allé chez le dentiste ?\nIl avait besoin d’un plombage… à la confiture.' },
    { emoji: '🥔',
      en: 'Why do potatoes make great detectives?\nThey keep their eyes peeled.',
      fr: 'Pourquoi les patates sont-elles toujours en forme ?\nElles ont la frite.' },
    { emoji: '🍋',
      en: 'Why did the lemon stop running?\nIt ran out of juice.',
      fr: 'Pourquoi le citron s’est-il arrêté de courir ?\nIl n’avait plus de jus.' },
    { emoji: '☕',
      en: 'Why did the coffee call the police?\nIt got mugged.',
      fr: 'Pourquoi le café a-t-il porté plainte ?\nIl s’est fait moudre de coups.' },
    { emoji: '🍓',
      en: 'What did one strawberry say to the other?\nIf you weren’t so sweet, we wouldn’t be in this jam.',
      fr: 'Que dit une fraise à une autre fraise ?\nSi on n’avait pas été si douces, on ne finirait pas en confiture.' },
    { emoji: '🍦',
      en: 'Where do ice creams go to learn?\nSundae school.',
      fr: 'Que dit une glace à la vanille à son amoureux ?\n« Je fonds pour toi. »' },
    { emoji: '🍐',
      en: 'What did one pear say to the other?\nWe make a great pair.',
      fr: 'Que dit une poire à une autre poire ?\nOn se fend la poire !' },
    { emoji: '🍔',
      en: 'What did the hamburger name its daughter?\nPatty.',
      fr: 'Comment s’appelle la fille du hamburger ?\nSteak-phanie.' },
    { emoji: '🥖',
      en: 'What does a loaf of bread do when it’s tired?\nIt loafs around.',
      fr: 'Pourquoi la baguette se méfie-t-elle toujours ?\nElle ne veut pas se faire rouler dans la farine.' },
    { emoji: '🎂',
      en: 'What did the birthday cake say to the fork?\n“Want a piece of me?”',
      fr: 'Que dit le gâteau d’anniversaire à la fourchette ?\n« Tu veux ma part ? »' },
    { emoji: '⛄',
      en: 'What do snowmen eat for breakfast?\nFrosted Flakes.',
      fr: 'Que mangent les bonshommes de neige au petit-déjeuner ?\nDes flocons, bien sûr.' },
    { emoji: '💛',
      en: 'What’s orange and sounds like a parrot?\nA carrot.',
      fr: 'Qu’est-ce qui est jaune et qui attend ?\nJonathan.' },

    // School, work and everyday things
    { emoji: '📚',
      en: 'Why was the math book sad?\nIt had too many problems.',
      fr: 'Pourquoi le livre de maths est-il triste ?\nIl a trop de problèmes.' },
    { emoji: '🪜',
      en: 'Why did the student bring a ladder to school?\nTo get into high school.',
      fr: 'Pourquoi l’élève apporte-t-il une échelle à l’école ?\nPour passer dans la classe supérieure.' },
    { emoji: '🍎',
      en: 'Why did the teacher wear sunglasses?\nHer students were so bright.',
      fr: 'Pourquoi la maîtresse porte-t-elle des lunettes de soleil ?\nSes élèves sont trop brillants.' },
    { emoji: '✏️',
      en: 'Why did the pencil win the argument?\nIt made a good point.',
      fr: 'Pourquoi le crayon a-t-il gagné le débat ?\nSes arguments étaient bien taillés.' },
    { emoji: '📖',
      en: 'Why don’t books ever feel cold?\nThey have covers.',
      fr: 'Pourquoi les livres n’ont-ils jamais froid ?\nIls ont une couverture.' },
    { emoji: '📕',
      en: 'I’m reading a book about anti-gravity.\nIt’s impossible to put down.',
      fr: 'Je lis un livre sur l’antigravité.\nImpossible de le reposer !' },
    { emoji: '🔢',
      en: 'What did zero say to eight?\n“Nice belt!”',
      fr: 'Que dit le zéro au huit ?\n« Sympa, ta ceinture ! »' },
    { emoji: '🎧',
      en: 'Why did the music teacher need a ladder?\nTo reach the high notes.',
      fr: 'Pourquoi le prof de musique monte-t-il sur une échelle ?\nPour atteindre les notes aiguës.' },
    { emoji: '⚡',
      en: 'Why is an electrician always up to date?\nThey’re always current.',
      fr: 'Quel est le comble pour un électricien ?\nNe pas être au courant.' },
    { emoji: '🥬',
      en: 'What’s a gardener’s favorite game?\nHide-and-go-seed.',
      fr: 'Quel est le comble pour un jardinier ?\nRaconter des salades.' },
    { emoji: '🦷',
      en: 'What does a dentist call their X-rays?\nTooth pics.',
      fr: 'Quel est le comble pour un dentiste ?\nAvoir une dent contre quelqu’un.' },
    { emoji: '🎩',
      en: 'Why did the magician go back to school?\nTo work on his spelling.',
      fr: 'Quel est le comble pour un magicien ?\nAvoir un tour de reins.' },
    { emoji: '🏦',
      en: 'I used to be a banker,\nbut I lost interest.',
      fr: 'Avant, j’étais banquier,\nmais j’ai perdu tout intérêt.' },
    { emoji: '🥕',
      en: 'Why did the scarecrow win an award?\nHe was outstanding in his field.',
      fr: 'Pourquoi l’épouvantail a-t-il reçu un prix ?\nIl était le meilleur dans son domaine… et il n’en bougeait jamais.' },
    { emoji: '💻',
      en: 'Why did the computer go to the doctor?\nIt had caught a virus.',
      fr: 'Pourquoi l’ordinateur est-il allé chez le médecin ?\nIl avait attrapé un virus.' },
    { emoji: '📱',
      en: 'Why did the phone need glasses?\nIt lost all its contacts.',
      fr: 'Pourquoi le téléphone porte-t-il des lunettes ?\nIl a perdu tous ses contacts.' },
    { emoji: '🔋',
      en: 'What did the battery say to the charger?\n“You complete me.”',
      fr: 'Qu’a dit la batterie au chargeur ?\n« Sans toi, je suis à plat. »' },
    { emoji: '⏰',
      en: 'Why did the man throw his clock out the window?\nHe wanted to see time fly.',
      fr: 'Pourquoi l’homme a-t-il jeté son réveil par la fenêtre ?\nPour voir le temps s’envoler.' },
    { emoji: '🧱',
      en: 'What did one wall say to the other?\n“Meet you at the corner!”',
      fr: 'Que dit un mur à un autre mur ?\n« On se retrouve au coin ! »' },
    { emoji: '🧹',
      en: 'What did the broom say to the vacuum cleaner?\n“I’m tired of people pushing us around.”',
      fr: 'Que dit le balai à l’aspirateur ?\n« J’en ai marre qu’on nous pousse partout. »' },
    { emoji: '🧊',
      en: 'What did the ice cube say to the glass of water?\n“I used to be like you.”',
      fr: 'Qu’a dit le glaçon au verre d’eau ?\n« Avant, j’étais comme toi. »' },

    // Sports, travel and the sky
    { emoji: '⚽',
      en: 'Why did the soccer ball quit the team?\nIt was tired of being kicked around.',
      fr: 'Pourquoi le ballon de foot a-t-il quitté l’équipe ?\nIl en avait marre de se faire shooter.' },
    { emoji: '🚲',
      en: 'Why can’t a bicycle stand up on its own?\nIt’s two-tired.',
      fr: 'Pourquoi le vélo ne tient-il pas debout tout seul ?\nIl est crevé.' },
    { emoji: '✈️',
      en: 'Why was the airplane sent to its room?\nIt had a bad altitude.',
      fr: 'Pourquoi l’avion a-t-il été puni ?\nIl avait une mauvaise altitude.' },
    { emoji: '🚀',
      en: 'How do astronauts organize a party?\nThey planet.',
      fr: 'Comment les astronautes organisent-ils une fête ?\nIls la planètent.' },
    { emoji: '🌙',
      en: 'Why did the cow jump over the moon?\nThe farmer had cold hands.',
      fr: 'Pourquoi la vache a-t-elle sauté par-dessus la lune ?\nLe fermier avait les mains froides.' },
    { emoji: '🌞',
      en: 'Why doesn’t the sun go to college?\nIt already has millions of degrees.',
      fr: 'Pourquoi le soleil ne va-t-il pas à l’université ?\nIl a déjà des millions de degrés.' },
    { emoji: '🌻',
      en: 'Why is the sunflower always in a good mood?\nIt always looks on the bright side.',
      fr: 'Pourquoi le tournesol a-t-il toujours le moral ?\nIl regarde toujours du bon côté.' },
    { emoji: '🌊',
      en: 'What did the ocean say to the beach?\nNothing, it just waved.',
      fr: 'Qu’a dit l’océan à la plage ?\nRien, il s’est contenté de faire des vagues.' },
    { emoji: '🌫️',
      en: 'I tried to catch some fog yesterday.\nI mist.',
      fr: 'Hier, j’ai essayé d’attraper le brouillard.\nRésultat : je suis resté dans le flou.' },
    { emoji: '❄️',
      en: 'What do you call a snowman in July?\nA puddle.',
      fr: 'Comment appelle-t-on un bonhomme de neige en juillet ?\nUne flaque.' },
    { emoji: '🎈',
      en: 'Why should you never give Elsa a balloon?\nShe’ll let it go.',
      fr: 'Pourquoi ne faut-il jamais donner de ballon à la Reine des neiges ?\nElle va le libérer, le délivrer…' },

    // Knock-knock jokes (English) and “M. et Mme…” jokes (French)
    { emoji: '🚪',
      en: 'Knock, knock. Who’s there? Lettuce.\nLettuce who? Lettuce in, it’s cold out here!',
      fr: 'M. et Mme Térieur ont deux fils.\nAlain et Alex : Alain Térieur et Alex Térieur !' },
    { emoji: '🚪',
      en: 'Knock, knock. Who’s there? Boo.\nBoo who? Don’t cry, it’s only a joke!',
      fr: 'M. et Mme Tatouille ont une fille.\nSarah : Sarah Tatouille !' },
    { emoji: '🚪',
      en: 'Knock, knock. Who’s there? Interrupting cow.\nInterrupting c— MOO!',
      fr: 'M. et Mme Débauche ont un fils.\nJean : Jean Débauche !' },
    { emoji: '🚪',
      en: 'Knock, knock. Who’s there? Olive.\nOlive who? Olive you, and I missed you!',
      fr: 'M. et Mme Assin ont un fils.\nMarc : Marc Assin !' },
    { emoji: '🚪',
      en: 'Knock, knock. Who’s there? Tank.\nTank who? You’re welcome!',
      fr: 'M. et Mme Kiroul ont un fils.\nPierre : Pierre Kiroul n’amasse pas mousse !' },
    { emoji: '🚪',
      en: 'Knock, knock. Who’s there? Hawaii.\nHawaii you? I’m fine, thanks!',
      fr: 'M. et Mme Bonbeur ont un fils.\nJean : Jean Bonbeur !' },
    { emoji: '🚪',
      en: 'Knock, knock. Who’s there? Atch.\nAtch who? Bless you!',
      fr: 'M. et Mme Onette ont un fils.\nMario : Mario Onette !' },

    // And one to finish
    { emoji: '🙃',
      en: 'I told my friend ten jokes to make him laugh.\nSadly, no pun in ten did.',
      fr: 'J’ai raconté dix blagues à un ami pour le faire rire.\nAucune n’a marché… sauf celle-ci, j’espère !' },
  ];

  /* ---------- Interface text in each language ---------- */
  const uiText = {
    en: {
      title: 'Compliment Generator',
      description: 'A little dose of kindness: a random compliment or joke with one click.',
      eyebrow: { compliment: 'A little something for you', joke: 'A little laugh for you' },
      complimentButton: 'Get a New Compliment',
      jokeButton: 'Tell Me a Joke',
      switchLabel: 'Language',
    },
    fr: {
      title: 'Générateur de compliments',
      description: 'Une petite dose de gentillesse : un compliment ou une blague au hasard, en un clic.',
      eyebrow: { compliment: 'Un petit mot pour toi', joke: 'Une petite blague pour toi' },
      complimentButton: 'Un nouveau compliment',
      jokeButton: 'Raconte-moi une blague',
      switchLabel: 'Langue',
    },
  };

  // The two kinds of content the card can show.
  const collections = { compliment: compliments, joke: jokes };

  const STORAGE_KEY = 'compliment-generator.lang';

  /* ---------- Page elements ---------- */
  const complimentBox = document.getElementById('compliment-box');
  const complimentEl = document.getElementById('compliment');
  const emojiEl = document.getElementById('compliment-emoji');
  const complimentButton = document.getElementById('new-compliment');
  const jokeButton = document.getElementById('new-joke');
  const eyebrowEl = document.getElementById('card-title');
  const langSwitch = document.getElementById('lang-switch');
  const descriptionMeta = document.querySelector('meta[name="description"]');

  // Stop quietly if the page doesn't have the expected elements.
  if (!complimentBox || !complimentEl || !emojiEl || !complimentButton || !jokeButton || !eyebrowEl || !langSwitch) {
    return;
  }

  /* ---------- State ---------- */
  let currentLang = pickStartingLanguage();
  let currentMode = 'compliment';  // 'compliment' or 'joke'

  // Index of the item on screen. The HTML starts with the first compliment
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
    punchline.textContent = text.slice(newline + 1);
    element.replaceChildren(setup, punchline);
  }

  /**
   * Keeps the card the same size: measures every compliment and every joke,
   * in both languages, at the current width, and fixes the text area to the
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
        for (const lang of Object.keys(uiText)) {
          setText(probe, item[lang]);
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
    setText(complimentEl, item[currentLang]);
    eyebrowEl.textContent = uiText[currentLang].eyebrow[currentMode];

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

    eyebrowEl.textContent = text.eyebrow[currentMode];
    complimentButton.textContent = text.complimentButton;
    jokeButton.textContent = text.jokeButton;
    langSwitch.setAttribute('aria-label', text.switchLabel);

    // Mark the selected language button (styled through [aria-pressed="true"]).
    langSwitch.querySelectorAll('[data-lang]').forEach((option) => {
      option.setAttribute('aria-pressed', String(option.dataset.lang === currentLang));
    });
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
    if (!uiText[lang] || lang === currentLang) return;
    currentLang = lang;
    saveLanguage(lang);
    renderInterface();
    renderItem(); // same compliment or joke, now in the other language
  }

  /* ---------- Wire up the controls ---------- */
  complimentButton.addEventListener('click', () => showNew('compliment'));
  jokeButton.addEventListener('click', () => showNew('joke'));

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
  setText(complimentEl, compliments[currentIndex][currentLang]);
  lockComplimentHeight();
  // Web fonts change the text's size once they arrive: measure again then.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(lockComplimentHeight);
  }
})();
