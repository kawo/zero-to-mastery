(function () {
  "use strict";

  const QUESTION_TIME_MS = 20000;
  const BASE_POINTS = 100;
  const MAX_TIME_BONUS = 50;
  const WARNING_THRESHOLD_MS = 5000;
  const KEY_LABELS = ["A", "B", "C", "D"];
  const LAST_NAME_KEY = "vgquiz.lastPlayer";

  const $ = (selector) => document.querySelector(selector);

  const screens = {
    home: $("#screen-home"),
    quiz: $("#screen-quiz"),
    result: $("#screen-result"),
  };

  const el = {
    startForm: $("#start-form"),
    nameInput: $("#player-name"),
    nameError: $("#name-error"),
    resetBoard: $("#reset-board"),
    homeBoard: $("#home-board"),
    counter: $("#question-counter"),
    liveScore: $("#live-score"),
    progressBar: $("#progress-bar"),
    timerBar: $("#timer-bar"),
    timerText: $("#timer-text"),
    question: $("#question-text"),
    answers: $("#answers"),
    feedback: $("#feedback"),
    feedbackTitle: $("#feedback-title"),
    feedbackText: $("#feedback-text"),
    nextBtn: $("#next-btn"),
    resultTitle: $("#result-title"),
    resultMessage: $("#result-message"),
    resultScore: $("#result-score"),
    resultDetails: $("#result-details"),
    resultRank: $("#result-rank"),
    resultBoard: $("#result-board"),
    replayBtn: $("#replay-btn"),
    homeBtn: $("#home-btn"),
  };

  const state = {
    player: "",
    questions: [],
    index: 0,
    score: 0,
    correct: 0,
    answered: false,
    deadline: 0,
    timerId: null,
  };

  /* ---------- Utilitaires ---------- */

  function shuffle(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function prepareQuestions() {
    return shuffle(QUESTIONS).map((q) => ({
      question: q.question,
      explanation: q.explanation,
      answers: shuffle(q.answers.map((text, i) => ({ text, isCorrect: i === q.correct }))),
    }));
  }

  function showScreen(name, focusTarget) {
    Object.entries(screens).forEach(([key, section]) => {
      section.hidden = key !== name;
    });
    window.scrollTo({ top: 0 });
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function loadLastName() {
    try {
      return localStorage.getItem(LAST_NAME_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveLastName(name) {
    try {
      localStorage.setItem(LAST_NAME_KEY, name);
    } catch {
      /* non bloquant */
    }
  }

  /* ---------- Leaderboard ---------- */

  function renderLeaderboard(container, highlightId) {
    const entries = Leaderboard.getTop();
    container.replaceChildren();

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "board__empty";
      empty.textContent = "Aucun score pour l'instant. Soyez le premier !";
      container.append(empty);
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const list = document.createElement("ol");
    list.className = "board";

    entries.forEach((entry, i) => {
      const item = document.createElement("li");
      item.className = "board__row";
      if (entry.id === highlightId) {
        item.classList.add("board__row--me");
        item.setAttribute("aria-current", "true");
      }

      const rank = document.createElement("span");
      rank.className = "board__rank";
      rank.textContent = medals[i] || `${i + 1}`;

      const name = document.createElement("span");
      name.className = "board__name";
      name.textContent = entry.name; // textContent : pas d'injection HTML via le pseudo

      const detail = document.createElement("span");
      detail.className = "board__detail";
      detail.textContent = `${entry.correct}/${entry.total}`;

      const score = document.createElement("span");
      score.className = "board__score";
      score.textContent = `${entry.score} pts`;

      item.append(rank, name, detail, score);
      list.append(item);
    });

    container.append(list);
  }

  /* ---------- Déroulement du quiz ---------- */

  function startQuiz(player) {
    state.player = player;
    state.questions = prepareQuestions();
    state.index = 0;
    state.score = 0;
    state.correct = 0;
    el.liveScore.textContent = "0";
    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    const q = state.questions[state.index];
    const total = state.questions.length;

    state.answered = false;
    el.counter.textContent = `Question ${state.index + 1} / ${total}`;
    el.progressBar.style.width = `${(state.index / total) * 100}%`;
    el.question.textContent = q.question;
    el.feedback.hidden = true;
    el.feedback.className = "feedback";
    el.nextBtn.hidden = true;

    el.answers.replaceChildren(
      ...q.answers.map((answer, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "answer";
        btn.dataset.index = String(i);

        const key = document.createElement("span");
        key.className = "answer__key";
        key.textContent = KEY_LABELS[i];
        key.setAttribute("aria-hidden", "true");

        const text = document.createElement("span");
        text.className = "answer__text";
        text.textContent = answer.text;

        btn.append(key, text);
        return btn;
      })
    );

    el.question.focus({ preventScroll: true });
    startTimer();
  }

  function startTimer() {
    stopTimer();
    state.deadline = performance.now() + QUESTION_TIME_MS;
    tick();
    state.timerId = setInterval(tick, 100);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function remainingMs() {
    return Math.max(0, state.deadline - performance.now());
  }

  function tick() {
    const left = remainingMs();
    el.timerBar.style.width = `${(left / QUESTION_TIME_MS) * 100}%`;
    el.timerText.textContent = `${Math.ceil(left / 1000)} s`;
    el.timerBar.classList.toggle("timer__bar--warning", left <= WARNING_THRESHOLD_MS);
    if (left <= 0) handleAnswer(null);
  }

  /** @param {number|null} choice index de la réponse choisie, ou null si le temps est écoulé */
  function handleAnswer(choice) {
    if (state.answered) return;
    state.answered = true;

    const left = remainingMs();
    stopTimer();

    const q = state.questions[state.index];
    const isCorrect = choice !== null && q.answers[choice].isCorrect;
    let gained = 0;

    if (isCorrect) {
      gained = BASE_POINTS + Math.round(MAX_TIME_BONUS * (left / QUESTION_TIME_MS));
      state.score += gained;
      state.correct += 1;
      el.liveScore.textContent = String(state.score);
    }

    el.answers.querySelectorAll(".answer").forEach((btn, i) => {
      btn.disabled = true;
      if (q.answers[i].isCorrect) btn.classList.add("answer--correct");
      else if (i === choice) btn.classList.add("answer--wrong");
    });

    if (isCorrect) {
      el.feedbackTitle.textContent = `Bonne réponse ! +${gained} pts`;
      el.feedback.classList.add("feedback--success");
    } else {
      el.feedbackTitle.textContent = choice === null ? "Temps écoulé !" : "Mauvaise réponse…";
      el.feedback.classList.add("feedback--error");
    }
    el.feedbackText.textContent = q.explanation;
    el.feedback.hidden = false;

    const isLast = state.index === state.questions.length - 1;
    el.nextBtn.textContent = isLast ? "Voir mon score 🏁" : "Question suivante →";
    el.nextBtn.hidden = false;
    el.nextBtn.focus({ preventScroll: true });
    el.progressBar.style.width = `${((state.index + 1) / state.questions.length) * 100}%`;
  }

  function nextQuestion() {
    state.index += 1;
    if (state.index < state.questions.length) renderQuestion();
    else finishQuiz();
  }

  function resultMessage(ratio) {
    if (ratio === 1) return "Score parfait ! Vous êtes une légende du jeu vidéo. 👑";
    if (ratio >= 0.8) return "Impressionnant, un vrai gamer confirmé ! 🔥";
    if (ratio >= 0.5) return "Pas mal du tout, encore un petit effort ! 💪";
    if (ratio >= 0.3) return "Il est temps de reprendre la manette… 🎮";
    return "Game over… mais on peut toujours insérer une pièce ! 🪙";
  }

  function finishQuiz() {
    stopTimer();
    const total = state.questions.length;
    const result = Leaderboard.add({
      name: state.player,
      score: state.score,
      correct: state.correct,
      total,
    });

    el.resultMessage.textContent = resultMessage(state.correct / total);
    el.resultScore.textContent = String(state.score);
    el.resultDetails.textContent = `${state.correct} bonne${state.correct > 1 ? "s" : ""} réponse${state.correct > 1 ? "s" : ""} sur ${total}`;
    el.resultRank.textContent = result.inTop
      ? `Vous êtes ${result.rank === 1 ? "1er" : `${result.rank}e`} au classement !`
      : `Pas encore dans le top ${Leaderboard.MAX_ENTRIES}… Retentez votre chance !`;

    renderLeaderboard(el.resultBoard, result.id);
    showScreen("result", el.resultTitle);
  }

  function goHome() {
    stopTimer();
    renderLeaderboard(el.homeBoard);
    showScreen("home");
    el.nameInput.focus({ preventScroll: true });
  }

  /* ---------- Événements ---------- */

  el.startForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = el.nameInput.value.trim().replace(/\s+/g, " ");
    if (!name) {
      el.nameError.hidden = false;
      el.nameInput.setAttribute("aria-invalid", "true");
      el.nameInput.focus();
      return;
    }
    el.nameError.hidden = true;
    el.nameInput.removeAttribute("aria-invalid");
    saveLastName(name);
    startQuiz(name);
  });

  el.nameInput.addEventListener("input", () => {
    if (el.nameInput.value.trim()) {
      el.nameError.hidden = true;
      el.nameInput.removeAttribute("aria-invalid");
    }
  });

  el.answers.addEventListener("click", (event) => {
    const btn = event.target.closest(".answer");
    if (btn) handleAnswer(Number(btn.dataset.index));
  });

  el.nextBtn.addEventListener("click", nextQuestion);
  el.replayBtn.addEventListener("click", () => startQuiz(state.player));
  el.homeBtn.addEventListener("click", goHome);

  el.resetBoard.addEventListener("click", () => {
    if (Leaderboard.getTop().length === 0) return;
    if (window.confirm("Effacer tous les scores du leaderboard ?")) {
      Leaderboard.clear();
      renderLeaderboard(el.homeBoard);
    }
  });

  // Raccourcis clavier : 1-4 ou A-D pour répondre pendant une question.
  document.addEventListener("keydown", (event) => {
    if (screens.quiz.hidden || state.answered) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toUpperCase();
    let index = ["1", "2", "3", "4"].indexOf(key);
    if (index === -1) index = KEY_LABELS.indexOf(key);
    if (index !== -1 && index < state.questions[state.index].answers.length) {
      event.preventDefault();
      handleAnswer(index);
    }
  });

  /* ---------- Initialisation ---------- */

  el.nameInput.value = loadLastName();
  renderLeaderboard(el.homeBoard);
})();
