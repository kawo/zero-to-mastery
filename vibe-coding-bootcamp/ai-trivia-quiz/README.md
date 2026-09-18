# Quiz Jeux Vidéo

Quiz de 10 questions sur les jeux vidéo, avec chrono et leaderboard. HTML/CSS/JS, sans dépendance ni build.

## Lancer

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
npx serve .
```

## Règles

- 10 questions, 20 secondes chacune ; l'ordre des questions et des réponses est mélangé à chaque partie.
- 100 pts par bonne réponse + jusqu'à 50 pts de bonus selon la rapidité (max 1500 pts).
- Réponses au clavier : `1`–`4` ou `A`–`D`.

## Leaderboard

Top 10 enregistré dans le `localStorage` du navigateur (clé `vgquiz.leaderboard.v1`). Il est donc propre à chaque navigateur/appareil. En cas d'égalité : plus de bonnes réponses, puis le score le plus ancien.

## Structure

```
index.html          écrans accueil / quiz / résultats
css/style.css       thème et mise en page responsive
js/questions.js     banque de questions (modifier ici)
js/leaderboard.js   lecture, tri et sauvegarde des scores
js/app.js           déroulement du quiz, chrono, rendu
```
