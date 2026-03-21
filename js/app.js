/**
 * app.js — ThesisQuiz main application
 */

// ── State ─────────────────────────────────────────────────
let allQuestions = [];
let cardStates = {};  // id -> SR card state
let userState = {
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  dailyCorrect: 0,
  dailyTotal: 0,
  dailyGoal: 10,
  totalCorrect: 0,
  totalAnswered: 0,
};

// Quiz session
let session = {
  questions: [],
  current: 0,
  xp: 0,
  correct: 0,
  category: null,
  answered: false,
  selectedOption: null,
};

const CATEGORY_ICONS = {
  'ML y Audio': '&#129302;',
  'Hidraulica': '&#128167;',
  'Hidraulica Parker': '&#128167;',
  'Manufactura': '&#9881;',
  'Tesis Referencia': '&#128218;',
  'Paper TCM': '&#128196;',
  'Frances': '&#127467;',
  'English': '&#127468;',
  'General': '&#128218;',
};

const DAILY_QUIZ_SIZE = 10;
const XP_CORRECT = 10;
const XP_STREAK_BONUS = 5;
const XP_PERFECT_BONUS = 20;

// ── Persistence ───────────────────────────────────────────
function save() {
  localStorage.setItem('tq_user', JSON.stringify(userState));
  localStorage.setItem('tq_cards', JSON.stringify(cardStates));
}

function load() {
  try {
    const u = localStorage.getItem('tq_user');
    if (u) userState = { ...userState, ...JSON.parse(u) };
    const c = localStorage.getItem('tq_cards');
    if (c) cardStates = JSON.parse(c);
  } catch (e) {
    console.warn('Failed to load state:', e);
  }
}

// ── Date helpers ──────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function checkStreak() {
  const today = todayStr();
  if (userState.lastActiveDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (userState.lastActiveDate === yesterdayStr) {
    // Streak continues (will be incremented on first correct answer)
  } else if (userState.lastActiveDate !== today) {
    userState.streak = 0;
  }

  // Reset daily counters
  if (userState.lastActiveDate !== today) {
    userState.dailyCorrect = 0;
    userState.dailyTotal = 0;
  }
}

// ── Screen navigation ─────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Initialize cards ──────────────────────────────────────
function ensureCardState(q) {
  if (!cardStates[q.id]) {
    cardStates[q.id] = SR.newCard(q.id);
  }
  return cardStates[q.id];
}

// ── Home screen rendering ─────────────────────────────────
function renderHome() {
  checkStreak();

  // Streak & XP
  document.getElementById('streak-count').textContent = userState.streak;
  document.getElementById('total-xp').textContent = userState.xp;

  // Daily progress
  const pct = Math.min(100, (userState.dailyCorrect / userState.dailyGoal) * 100);
  document.getElementById('daily-progress-bar').style.width = pct + '%';
  document.getElementById('daily-progress-text').textContent =
    `${userState.dailyCorrect}/${userState.dailyGoal}`;

  // Categories
  const cats = {};
  allQuestions.forEach(q => {
    if (!cats[q.category]) cats[q.category] = { total: 0, due: 0, mastered: 0 };
    cats[q.category].total++;
    const cs = ensureCardState(q);
    if (SR.isDue(cs)) cats[q.category].due++;
    if (SR.isMastered(cs)) cats[q.category].mastered++;
  });

  const grid = document.getElementById('categories-grid');
  grid.innerHTML = '';
  const sortedCats = Object.entries(cats).sort((a, b) => b[1].due - a[1].due);

  for (const [name, data] of sortedCats) {
    const icon = CATEGORY_ICONS[name] || '&#128218;';
    const progressPct = data.total > 0 ? (data.mastered / data.total) * 100 : 0;
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-icon">${icon}</div>
      <div class="category-name">${name}</div>
      <div class="category-count">${data.due} pendientes / ${data.total}</div>
      <div class="category-progress">
        <div class="category-progress-fill" style="width:${progressPct}%"></div>
      </div>
    `;
    card.addEventListener('click', () => startCategoryQuiz(name));
    grid.appendChild(card);
  }

  // Stats
  let totalDue = 0, totalMastered = 0;
  allQuestions.forEach(q => {
    const cs = ensureCardState(q);
    if (SR.isDue(cs)) totalDue++;
    if (SR.isMastered(cs)) totalMastered++;
  });

  document.getElementById('stat-total').textContent = allQuestions.length;
  document.getElementById('stat-mastered').textContent = totalMastered;
  document.getElementById('stat-due').textContent = totalDue;

  const accuracy = userState.totalAnswered > 0
    ? Math.round((userState.totalCorrect / userState.totalAnswered) * 100) : 0;
  document.getElementById('stat-accuracy').textContent = accuracy + '%';

  // Review mistakes button
  const mistakes = allQuestions.filter(q => {
    const cs = cardStates[q.id];
    return cs && cs.streak === 0 && cs.reviews > 0;
  });
  const reviewBtn = document.getElementById('btn-review');
  const reviewCount = document.getElementById('review-count');
  if (mistakes.length > 0) {
    reviewBtn.style.display = 'block';
    reviewCount.textContent = mistakes.length;
  } else {
    reviewBtn.style.display = 'none';
  }
}

// ── Quiz selection ────────────────────────────────────────
function selectDailyQuestions() {
  // Priority: due cards first, then unseen, then random
  const due = [];
  const unseen = [];
  const rest = [];

  allQuestions.forEach(q => {
    const cs = ensureCardState(q);
    if (cs.reviews === 0) unseen.push(q);
    else if (SR.isDue(cs)) due.push(q);
    else rest.push(q);
  });

  shuffle(due);
  shuffle(unseen);
  shuffle(rest);

  const pool = [...due, ...unseen, ...rest];
  return pool.slice(0, DAILY_QUIZ_SIZE);
}

function selectCategoryQuestions(category) {
  const catQuestions = allQuestions.filter(q => q.category === category);
  const due = [];
  const unseen = [];
  const rest = [];

  catQuestions.forEach(q => {
    const cs = ensureCardState(q);
    if (cs.reviews === 0) unseen.push(q);
    else if (SR.isDue(cs)) due.push(q);
    else rest.push(q);
  });

  shuffle(due);
  shuffle(unseen);
  shuffle(rest);

  return [...due, ...unseen, ...rest].slice(0, DAILY_QUIZ_SIZE);
}

function selectMistakes() {
  const mistakes = allQuestions.filter(q => {
    const cs = cardStates[q.id];
    return cs && cs.streak === 0 && cs.reviews > 0;
  });
  shuffle(mistakes);
  return mistakes.slice(0, DAILY_QUIZ_SIZE);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Start quiz ────────────────────────────────────────────
function startQuiz(questions, categoryName) {
  if (questions.length === 0) return;

  session = {
    questions,
    current: 0,
    xp: 0,
    correct: 0,
    category: categoryName,
    answered: false,
    selectedOption: null,
  };

  showScreen('quiz');
  renderQuestion();
}

function startDailyQuiz() {
  startQuiz(selectDailyQuestions(), 'Quiz diario');
}

function startCategoryQuiz(category) {
  startQuiz(selectCategoryQuestions(category), category);
}

function startReviewQuiz() {
  startQuiz(selectMistakes(), 'Repaso de errores');
}

// ── Render question ───────────────────────────────────────
function renderQuestion() {
  const q = session.questions[session.current];
  session.answered = false;
  session.selectedOption = null;

  // Progress bar
  const pct = (session.current / session.questions.length) * 100;
  document.getElementById('quiz-progress-bar').style.width = pct + '%';
  document.getElementById('quiz-xp').textContent = '+' + session.xp + ' XP';

  // Category
  document.getElementById('quiz-category').textContent = q.category;

  // Decide presentation mode
  const mode = chooseMode(q);
  const area = document.getElementById('quiz-answer-area');
  const checkBtn = document.getElementById('btn-check');
  const feedback = document.getElementById('feedback-overlay');

  document.getElementById('quiz-footer').style.display = 'block';
  checkBtn.style.display = 'block';
  checkBtn.disabled = true;
  checkBtn.className = 'btn-primary btn-check';
  checkBtn.textContent = 'Verificar';
  feedback.className = 'feedback-overlay';

  if (mode === 'multiple_choice') {
    renderMultipleChoice(q, area, checkBtn);
  } else if (mode === 'true_false') {
    renderTrueFalse(q, area, checkBtn);
  } else if (mode === 'type') {
    renderTypeAnswer(q, area, checkBtn);
  } else {
    renderFlipCard(q, area, checkBtn);
  }
}

function chooseMode(q) {
  if (q.type === 'true_false') return 'true_false';
  if (q.type === 'image') return 'multiple_choice';  // images: always MC
  if (q.type === 'vocab' && q.answer.replace(/<[^>]+>/g, '').length < 40) {
    return Math.random() < 0.5 ? 'multiple_choice' : 'type';
  }
  if (q.type === 'concept') return 'multiple_choice';
  if (q.type === 'explain' || q.type === 'code') return 'flip';
  return Math.random() < 0.6 ? 'multiple_choice' : 'flip';
}

// ── Multiple choice ───────────────────────────────────────
function renderMultipleChoice(q, area, checkBtn) {
  document.getElementById('quiz-question').innerHTML = q.question;

  // Generate distractors from same category (strip HTML for length comparison)
  const plainLen = s => s.replace(/<[^>]+>/g, '').length;
  const sameCat = allQuestions.filter(
    x => x.category === q.category && x.id !== q.id && plainLen(x.answer) < 300
  );
  shuffle(sameCat);

  const options = [q.answer];
  for (const d of sameCat) {
    if (options.length >= 4) break;
    if (!options.includes(d.answer)) options.push(d.answer);
  }

  // If not enough, add from other categories
  if (options.length < 4) {
    const others = allQuestions.filter(
      x => x.id !== q.id && plainLen(x.answer) < 300 && !options.includes(x.answer)
    );
    shuffle(others);
    for (const d of others) {
      if (options.length >= 4) break;
      options.push(d.answer);
    }
  }

  shuffle(options);

  area.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = opt;  // Full content with HTML (images, bold, code)
    btn.dataset.answer = opt;
    btn.addEventListener('click', () => {
      area.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      session.selectedOption = opt;
      checkBtn.disabled = false;
    });
    area.appendChild(btn);
  });

  checkBtn.onclick = () => checkMultipleChoice(q);
}

function checkMultipleChoice(q) {
  if (session.answered) return;
  session.answered = true;

  const isCorrect = session.selectedOption === q.answer;
  const area = document.getElementById('quiz-answer-area');

  area.querySelectorAll('.option-btn').forEach(btn => {
    if (btn.dataset.answer === q.answer) btn.classList.add('correct');
    if (btn.classList.contains('selected') && !isCorrect) btn.classList.add('incorrect');
    btn.style.pointerEvents = 'none';
  });

  handleAnswer(q, isCorrect);
}

// ── True/False ────────────────────────────────────────────
function renderTrueFalse(q, area, checkBtn) {
  document.getElementById('quiz-question').innerHTML = q.question;

  area.innerHTML = '';
  ['Verdadero', 'Falso'].forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.dataset.answer = opt;
    btn.addEventListener('click', () => {
      area.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      session.selectedOption = opt;
      checkBtn.disabled = false;
    });
    area.appendChild(btn);
  });

  checkBtn.onclick = () => {
    if (session.answered) return;
    session.answered = true;

    const correct = q.answer.toLowerCase().trim();
    const isVerdadero = ['verdadero', 'true', 'v'].includes(correct);
    const correctLabel = isVerdadero ? 'Verdadero' : 'Falso';
    const isCorrect = session.selectedOption === correctLabel;

    area.querySelectorAll('.option-btn').forEach(btn => {
      if (btn.dataset.answer === correctLabel) btn.classList.add('correct');
      if (btn.classList.contains('selected') && !isCorrect) btn.classList.add('incorrect');
      btn.style.pointerEvents = 'none';
    });

    handleAnswer(q, isCorrect);
  };
}

// ── Type answer ───────────────────────────────────────────
function renderTypeAnswer(q, area, checkBtn) {
  document.getElementById('quiz-question').innerHTML = q.question;

  area.innerHTML = `<input type="text" class="answer-input" id="type-input"
    placeholder="Escribe tu respuesta..." autocomplete="off" spellcheck="false">`;

  const input = document.getElementById('type-input');
  input.focus();
  input.addEventListener('input', () => {
    checkBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !checkBtn.disabled) checkBtn.click();
  });

  checkBtn.onclick = () => {
    if (session.answered) return;
    session.answered = true;

    const userAnswer = input.value.trim().toLowerCase();
    const correctAnswer = q.answer.trim().toLowerCase();

    // Fuzzy match: allow minor differences
    const isCorrect = fuzzyMatch(userAnswer, correctAnswer);

    input.classList.add(isCorrect ? 'correct' : 'incorrect');
    input.disabled = true;

    handleAnswer(q, isCorrect);
  };
}

function fuzzyMatch(a, b) {
  if (a === b) return true;
  // Remove accents and compare
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalize(a) === normalize(b)) return true;
  // Allow 1-2 char difference for longer strings
  if (b.length > 5) {
    const dist = levenshtein(a, b);
    if (dist <= Math.ceil(b.length * 0.2)) return true;
  }
  return false;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// ── Flip card ─────────────────────────────────────────────
function renderFlipCard(q, area, checkBtn) {
  document.getElementById('quiz-question').innerHTML = '';

  area.innerHTML = `
    <div class="flip-container" id="flip-container">
      <div class="flip-card" id="flip-card">
        <div class="flip-front">${escapeHtml(q.question)}</div>
        <div class="flip-back">${escapeHtml(q.answer)}</div>
      </div>
    </div>
    <div class="flip-hint">Toca para voltear</div>
    <div class="rate-buttons" id="rate-buttons" style="display:none">
      <button class="rate-btn again" data-quality="0">No lo se</button>
      <button class="rate-btn hard" data-quality="1">Dificil</button>
      <button class="rate-btn good" data-quality="2">Bien</button>
      <button class="rate-btn easy" data-quality="3">Facil</button>
    </div>
  `;

  checkBtn.style.display = 'none';

  const flipContainer = document.getElementById('flip-container');
  const flipCard = document.getElementById('flip-card');
  const rateButtons = document.getElementById('rate-buttons');

  flipContainer.addEventListener('click', () => {
    flipCard.classList.toggle('flipped');
    if (flipCard.classList.contains('flipped')) {
      rateButtons.style.display = 'flex';
    }
  });

  rateButtons.querySelectorAll('.rate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const quality = parseInt(btn.dataset.quality);
      const isCorrect = quality >= 2;

      // Update SR
      const cs = ensureCardState(q);
      SR.review(cs, quality);

      // Update stats
      if (isCorrect) {
        session.correct++;
        session.xp += XP_CORRECT;
        userState.dailyCorrect++;
        userState.totalCorrect++;
      }
      userState.dailyTotal++;
      userState.totalAnswered++;

      // Mark active date
      const today = todayStr();
      if (userState.lastActiveDate !== today) {
        userState.streak++;
        userState.lastActiveDate = today;
      }

      save();

      // Next
      session.current++;
      if (session.current < session.questions.length) {
        renderQuestion();
      } else {
        showResults();
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Handle answer (for non-flip modes) ────────────────────
function handleAnswer(q, isCorrect) {
  // Update SR
  const cs = ensureCardState(q);
  const quality = SR.binaryToQuality(isCorrect);
  SR.review(cs, quality);

  // Update stats
  if (isCorrect) {
    session.correct++;
    session.xp += XP_CORRECT;
    userState.dailyCorrect++;
    userState.totalCorrect++;
  }
  userState.dailyTotal++;
  userState.totalAnswered++;

  // Mark active date & streak
  const today = todayStr();
  if (userState.lastActiveDate !== today) {
    userState.streak++;
    userState.lastActiveDate = today;
  }

  // Show feedback overlay (includes continue button)
  showFeedback(isCorrect, q.answer);

  // Update XP display
  document.getElementById('quiz-xp').textContent = '+' + session.xp + ' XP';

  // Hide footer, feedback overlay has the continue button
  document.getElementById('quiz-footer').style.display = 'none';

  save();
}

function showFeedback(isCorrect, correctAnswer) {
  const overlay = document.getElementById('feedback-overlay');
  const icon = document.getElementById('feedback-icon');
  const text = document.getElementById('feedback-text');
  const answer = document.getElementById('feedback-answer');

  overlay.className = 'feedback-overlay show ' + (isCorrect ? 'correct' : 'incorrect');
  icon.innerHTML = isCorrect ? '&#10004;' : '&#10008;';
  text.textContent = isCorrect ? 'Correcto!' : 'Incorrecto';
  answer.innerHTML = isCorrect ? '' : 'Respuesta: ' + correctAnswer;
}

function hideFeedback() {
  document.getElementById('feedback-overlay').className = 'feedback-overlay';
}

// ── Next question ─────────────────────────────────────────
function nextQuestion() {
  hideFeedback();
  session.current++;
  if (session.current < session.questions.length) {
    renderQuestion();
  } else {
    showResults();
  }
}

// ── Results ───────────────────────────────────────────────
function showResults() {
  // Perfect bonus
  if (session.correct === session.questions.length && session.questions.length > 0) {
    session.xp += XP_PERFECT_BONUS;
  }
  // Streak bonus
  if (userState.streak > 0) {
    session.xp += XP_STREAK_BONUS * Math.min(userState.streak, 10);
  }

  userState.xp += session.xp;
  save();

  document.getElementById('results-xp').textContent = '+' + session.xp + ' XP';
  document.getElementById('result-correct').textContent = session.correct;
  document.getElementById('result-total').textContent = session.questions.length;

  const accuracy = session.questions.length > 0
    ? Math.round((session.correct / session.questions.length) * 100) : 0;
  document.getElementById('result-accuracy').textContent = accuracy + '%';

  const streakDiv = document.getElementById('results-streak');
  if (userState.streak > 0) {
    streakDiv.innerHTML = `&#128293; Racha: ${userState.streak} dias`;
  } else {
    streakDiv.textContent = '';
  }

  showScreen('results');
}

// ── Event listeners ───────────────────────────────────────
function initEvents() {
  // Daily quiz
  document.getElementById('btn-daily').addEventListener('click', startDailyQuiz);

  // Review mistakes
  document.getElementById('btn-review').addEventListener('click', startReviewQuiz);

  // Quit quiz
  document.getElementById('btn-quit').addEventListener('click', () => {
    hideFeedback();
    showScreen('home');
    renderHome();
  });

  // Next question
  document.getElementById('btn-next').addEventListener('click', nextQuestion);

  // Results
  document.getElementById('btn-home').addEventListener('click', () => {
    showScreen('home');
    renderHome();
  });

  document.getElementById('btn-again').addEventListener('click', () => {
    if (session.category === 'Quiz diario') {
      startDailyQuiz();
    } else if (session.category === 'Repaso de errores') {
      startReviewQuiz();
    } else {
      startCategoryQuiz(session.category);
    }
  });
}

// ── Load questions ────────────────────────────────────────
async function loadQuestions() {
  try {
    const resp = await fetch('data/questions.json');
    allQuestions = await resp.json();
    console.log(`Loaded ${allQuestions.length} questions`);
  } catch (e) {
    console.error('Failed to load questions:', e);
    allQuestions = [];
  }
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  }

  load();
  await loadQuestions();
  initEvents();

  // Splash -> Home after loading animation
  setTimeout(() => {
    showScreen('home');
    renderHome();
  }, 1800);
}

init();
