/**
 * Banque de questions du quiz.
 * `correct` est l'index de la bonne réponse dans `answers` (l'ordre est mélangé à l'affichage).
 */
const QUESTIONS = [
  {
    question: "En quelle année Super Mario Bros. est-il sorti sur NES au Japon ?",
    answers: ["1983", "1985", "1987", "1990"],
    correct: 1,
    explanation: "Super Mario Bros. est sorti le 13 septembre 1985 au Japon sur Famicom.",
  },
  {
    question: "Quel est le jeu vidéo le plus vendu de tous les temps ?",
    answers: ["Grand Theft Auto V", "Wii Sports", "Minecraft", "PUBG"],
    correct: 2,
    explanation: "Minecraft dépasse les 300 millions d'exemplaires vendus, toutes plateformes confondues.",
  },
  {
    question: "Comment s'appelle le héros de la série The Legend of Zelda ?",
    answers: ["Zelda", "Link", "Ganon", "Epona"],
    correct: 1,
    explanation: "Le héros est Link. Zelda est la princesse d'Hyrule, Ganon l'antagoniste et Epona la jument de Link.",
  },
  {
    question: "Quel studio a développé The Witcher 3: Wild Hunt ?",
    answers: ["BioWare", "Bethesda", "Ubisoft", "CD Projekt Red"],
    correct: 3,
    explanation: "The Witcher 3 (2015) a été développé par le studio polonais CD Projekt Red.",
  },
  {
    question: "Sous quel nom la NES est-elle sortie au Japon ?",
    answers: ["Famicom", "Game Boy", "Super Famicom", "Virtual Boy"],
    correct: 0,
    explanation: "La Famicom (Family Computer) est sortie au Japon en 1983, avant de devenir la NES en Occident.",
  },
  {
    question: "Dans Pac-Man, combien de fantômes poursuivent le joueur ?",
    answers: ["3", "4", "5", "6"],
    correct: 1,
    explanation: "Ils sont quatre : Blinky, Pinky, Inky et Clyde.",
  },
  {
    question: "Quel éditeur français est à l'origine de Rayman ?",
    answers: ["Quantic Dream", "Arkane Studios", "Ubisoft", "Dontnod"],
    correct: 2,
    explanation: "Rayman a été créé par Michel Ancel chez Ubisoft et est sorti en 1995.",
  },
  {
    question: "Dans Minecraft, quelle créature verte explose à proximité du joueur ?",
    answers: ["Enderman", "Creeper", "Ghast", "Zombie"],
    correct: 1,
    explanation: "Le Creeper s'approche silencieusement puis explose. Ssssss… BOUM.",
  },
  {
    question: "Dans quelle série de jeux incarne-t-on le Master Chief ?",
    answers: ["Gears of War", "Destiny", "Call of Duty", "Halo"],
    correct: 3,
    explanation: "Le Master Chief (John-117) est le héros de la série Halo, lancée en 2001 sur Xbox.",
  },
  {
    question: "Quel Pokémon porte le numéro 001 dans le Pokédex national ?",
    answers: ["Pikachu", "Salamèche", "Bulbizarre", "Carapuce"],
    correct: 2,
    explanation: "Bulbizarre ouvre le Pokédex national. Pikachu, lui, porte le numéro 025.",
  },
];
