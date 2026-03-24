// ======================
// ДАННЫЕ И ПЕРЕМЕННЫЕ
// ======================
let lastScore = localStorage.getItem("lastScore") || 0;
let playerName = localStorage.getItem("playerName") || "";

document.getElementById("lastScore").innerText = "Прошлый результат: " + lastScore;
document.getElementById("playerName").value = playerName;

let maxNumber;
let a, b;
let correct;
let score = 0;

let time;
let interval;

let gameMode = "normal";
let marathonDuration = 60;
let gameOver = false;
let mistakes = [];
let currentTaskText = "";

// ======================
// ОБУЧЕНИЕ (время/ошибки + разнесённые повторы)
// ======================
let taskBank = [];
let taskByKey = {};
let taskStats = JSON.parse(localStorage.getItem("taskStats") || "{}");

let taskStartTime = 0;
let lastTaskKey = "";

// План повторений: { key, due } — due сколько заданий должно пройти до повтора
let reviewPlan = [];

// настройки
const REVIEW_PICK_CHANCE = 0.55;
const REVIEW_PLAN_MAX = 60;
const MIN_REPEAT_GAP_TASKS = 2;

// ======================
// МЕНЮ: показать + автопрокрутка к "проблемным"
// (у тебя скроллит window, потому что startScreen position:relative)
// ======================
function showStartMenu() {
  const startScreen = document.getElementById("startScreen");
  const game = document.getElementById("game");
  const doll = document.getElementById("doll");

  if (game) game.style.display = "none";
  if (startScreen) startScreen.style.display = "flex";
  if (doll) doll.classList.remove("show");

  // снять фокус, чтобы браузер не "подскроллил" обратно
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }

  updateProblemsUI();
  renderLastMarathonBoxFromSession(); // если есть сохранённые ошибки марафона
}

function scrollMenuToProblemsHeaderAsync() {
  const problemsBox = document.getElementById("problemsBox");
  if (!problemsBox) return;

  const header = document.querySelector("#problemsBox h2") || problemsBox;

  const run = () => {
    // если блок скрыт — скроллить некуда
    if (getComputedStyle(problemsBox).display === "none") return;

    // хотим, чтобы заголовок оказался вверху экрана
    const y = header.getBoundingClientRect().top + window.scrollY - 10;
    window.scrollTo(0, Math.max(0, y));
  };

  // Несколько попыток (рендер, шрифты, перерасчёт высоты)
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
    setTimeout(run, 80);
    setTimeout(run, 250);
    setTimeout(run, 600);
  });

  window.addEventListener("load", run, { once: true });
  window.addEventListener("pageshow", run, { once: true });

  if (document.fonts?.ready) document.fonts.ready.then(run);
}

function returnToMenuAndScrollToProblems() {
  showStartMenu();
  scrollMenuToProblemsHeaderAsync();
}

// Эта функция вызывается из HTML кнопкой "Играть снова" и из lose()
function restartToMenu() {
  gameOver = true;
  clearInterval(interval);
  speechSynthesis.cancel();

  returnToMenuAndScrollToProblems();
}

// ======================
// UI: ТОП ПРОБЛЕМНЫХ + СБРОС ОБУЧЕНИЯ
// ======================
function parseTaskKeyNumbers(key) {
  const m = key.match(/^(\d+)\s*[\+\-]\s*(\d+)$/);
  if (!m) return null;
  return { a: parseInt(m[1], 10), b: parseInt(m[2], 10) };
}

function getCurrentDifficulty() {
  const el = document.getElementById("difficulty");
  if (!el) return null;
  const v = parseInt(el.value, 10);
  return Number.isFinite(v) ? v : null;
}

function getProblemScoreByKey(key) {
  const s = taskStats[key];
  if (!s) return 0;

  const timeSec = (s.avgMs || 0) / 1000;
  const wrong = s.wrong || 0;

  // "проблемность": время + ошибки
  return timeSec * 4 + wrong * 25;
}

function getTopProblems(limit = 10, difficultyFilter = null) {
  const keys = Object.keys(taskStats);

  const filtered = keys.filter((k) => {
    const s = taskStats[k];
    if (!s || !s.attempts) return false;

    if (difficultyFilter == null) return true;

    const nums = parseTaskKeyNumbers(k);
    if (!nums) return true;
    return nums.a <= difficultyFilter && nums.b <= difficultyFilter;
  });

  filtered.sort((k1, k2) => getProblemScoreByKey(k2) - getProblemScoreByKey(k1));

  return filtered.slice(0, limit).map((k) => ({
    key: k,
    ...taskStats[k],
    score: getProblemScoreByKey(k),
  }));
}

function updateProblemsUI() {
  const box = document.getElementById("problemsBox");
  const list = document.getElementById("problemsList");
  if (!box || !list) return;

  const diff = getCurrentDifficulty();
  const top = getTopProblems(10, diff);

  if (top.length === 0) {
    box.style.display = "none";
    list.innerHTML = "";
    return;
  }

  box.style.display = "block";

  let html = "";
  for (const item of top) {
    const attempts = item.attempts || 0;
    const wrong = item.wrong || 0;
    const avgSec = ((item.avgMs || 0) / 1000).toFixed(1);
    const wrongRate = attempts ? Math.round((wrong / attempts) * 100) : 0;

    html += `
      <div style="padding:8px; border:1px solid rgba(255,255,255,.12); border-radius:8px; margin-bottom:8px;">
        <div><strong>${item.key}</strong></div>
        <div style="font-size:14px;">
          Среднее время: <strong>${avgSec}с</strong>,
          попыток: ${attempts},
          ошибок: <strong>${wrong}</strong> (${wrongRate}%)
        </div>
      </div>
    `;
  }

  list.innerHTML = html;
}

function resetLearning() {
  localStorage.removeItem("taskStats");
  taskStats = {};
  reviewPlan = [];
  updateProblemsUI();
  alert("Обучение сброшено: статистика времени/ошибок очищена.");
}

// ======================
// МАРАФОН: сохранить ошибки и показать их в меню
// ======================
function saveLastMarathonToSession() {
  try {
    const payload = {
      score,
      mistakes,
      at: Date.now(),
    };
    sessionStorage.setItem("lastMarathon", JSON.stringify(payload));
  } catch (e) {
    // ignore
  }
}

function renderLastMarathonBoxFromSession() {
  const startScreen = document.getElementById("startScreen");
  const problemsBox = document.getElementById("problemsBox");
  if (!startScreen || !problemsBox) return;

  // удалить старый блок, если есть
  const old = document.getElementById("lastMarathonBox");
  if (old) old.remove();

  const raw = sessionStorage.getItem("lastMarathon");
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  // если ошибок нет — всё равно можно показать итог
  const box = document.createElement("div");
  box.id = "lastMarathonBox";
  box.style.cssText =
    "max-width:650px;width:100%;box-sizing:border-box;margin:12px auto 0;padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:10px;background:#111;text-align:left;";

  let html = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div style="font-weight:700;">Последний марафон</div>
      <button type="button" id="closeMarathonBoxBtn" style="padding:6px 10px;font-size:14px;">Закрыть</button>
    </div>
    <div style="margin-top:8px;">Очки: <strong>${data.score ?? 0}</strong></div>`;

  const ms = Array.isArray(data.mistakes) ? data.mistakes : [];
  if (ms.length > 0) {
    html += `<div style="margin-top:10px;font-weight:700;">Ошибки:</div>`;
    html += `<div style="margin-top:6px;display:flex;flex-direction:column;gap:8px;">`;
    for (const m of ms.slice(0, 20)) {
      html += `
        <div style="padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#1a1a1a;">
          <div><strong>${m.task}</strong></div>
          <div style="font-size:14px;">Твой ответ: ${m.userAnswer} — Правильно: ${m.correctAnswer}</div>
        </div>
      `;
    }
    html += `</div>`;
    if (ms.length > 20) {
      html += `<div style="margin-top:8px;font-size:13px;opacity:.8;">Показаны первые 20 ошибок.</div>`;
    }
  } else {
    html += `<div style="margin-top:10px;">Ошибок не было.</div>`;
  }

  box.innerHTML = html;

  startScreen.insertBefore(box, problemsBox);

  const btn = document.getElementById("closeMarathonBoxBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      sessionStorage.removeItem("lastMarathon");
      box.remove();
    });
  }
}

// ======================
// ГЕНЕРАЦИЯ И ВЫБОР ЗАДАНИЙ
// ======================
function buildTaskBank(max) {
  const bank = [];

  for (let a = 0; a <= max; a++) {
    for (let b = 0; b <= max; b++) {
      // сложение (твое ограничение суммы <= 20)
      if (a + b <= 20) {
        const key = `${a} + ${b}`;
        bank.push({ key, a, b, op: "+", answer: a + b });
      }

      // вычитание (без отрицательных)
      if (a - b >= 0) {
        const key = `${a} - ${b}`;
        bank.push({ key, a, b, op: "-", answer: a - b });
      }
    }
  }
  return bank;
}

function rebuildTaskMaps() {
  taskByKey = {};
  for (const t of taskBank) taskByKey[t.key] = t;
}

function trimReviewPlan() {
  if (reviewPlan.length > REVIEW_PLAN_MAX) {
    reviewPlan = reviewPlan.slice(reviewPlan.length - REVIEW_PLAN_MAX);
  }
}

function tickReviewPlan() {
  for (const item of reviewPlan) {
    if (item.due > 0) item.due -= 1;
  }

  // не даём примеру появиться сразу после самого себя
  for (const item of reviewPlan) {
    if (item.due <= 0 && item.key === lastTaskKey) item.due = 1;
  }
}

function scheduleReview(key, delays) {
  for (const d of delays) {
    reviewPlan.push({ key, due: Math.max(MIN_REPEAT_GAP_TASKS, d) });
  }
  trimReviewPlan();
}

function recordTaskResult(key, elapsedMs, isCorrect) {
  let s = taskStats[key];
  if (!s) s = { attempts: 0, wrong: 0, avgMs: 0 };

  s.attempts += 1;
  if (!isCorrect) s.wrong += 1;

  // EMA — быстрее подстраивается под игрока
  const alpha = 0.35;
  s.avgMs = s.attempts === 1 ? elapsedMs : (s.avgMs * (1 - alpha) + elapsedMs * alpha);

  taskStats[key] = s;
  localStorage.setItem("taskStats", JSON.stringify(taskStats));

  // разнесённые повторы (не подряд)
  if (!isCorrect) {
    scheduleReview(key, [2, 5, 9, 14]);
  } else {
    if (elapsedMs > 18000) scheduleReview(key, [3, 7, 12]);
    else if (elapsedMs > 12000) scheduleReview(key, [3, 9]);
    else if (elapsedMs > 8000) scheduleReview(key, [4]);
  }

  updateProblemsUI();
}

function getTaskWeight(task) {
  const s = taskStats[task.key];
  if (!s) return 1.0;

  const timeSec = (s.avgMs || 0) / 1000;

  const timeScore = Math.min(90, timeSec * 3.5);
  const wrongScore = Math.min(140, (s.wrong || 0) * 45);

  return 1 + timeScore + wrongScore;
}

function weightedPick(bank) {
  let total = 0;
  for (const t of bank) total += getTaskWeight(t);

  let r = Math.random() * total;
  for (const t of bank) {
    r -= getTaskWeight(t);
    if (r <= 0) return t;
  }

  return bank[bank.length - 1];
}

function pickWeightedAvoidLast() {
  let t = weightedPick(taskBank);

  for (let i = 0; i < 6 && taskBank.length > 1 && t.key === lastTaskKey; i++) {
    t = weightedPick(taskBank);
  }
  return t;
}

function pickReviewTaskIfReady() {
  const readyIdx = [];
  for (let i = 0; i < reviewPlan.length; i++) {
    if (reviewPlan[i].due <= 0 && reviewPlan[i].key !== lastTaskKey) readyIdx.push(i);
  }
  if (readyIdx.length === 0) return null;

  const idx = readyIdx[Math.floor(Math.random() * readyIdx.length)];
  const key = reviewPlan[idx].key;
  reviewPlan.splice(idx, 1);

  return taskByKey[key] || null;
}

function pickTask() {
  tickReviewPlan();

  if (Math.random() < REVIEW_PICK_CHANCE) {
    const reviewTask = pickReviewTaskIfReady();
    if (reviewTask) return reviewTask;
  }

  return pickWeightedAvoidLast();
}

// ======================
// ИГРА
// ======================
function speak(text, callback) {
  let speech = new SpeechSynthesisUtterance(text);

  speech.rate = 0.65;
  speech.pitch = 0.25;
  speech.volume = 1;

  speech.onend = callback;
  speechSynthesis.speak(speech);
}

function disableGameControls() {
  document.getElementById("answer").disabled = true;
  document.getElementById("checkButton").disabled = true;
  document.getElementById("answer").blur();
}

function enableGameControls() {
  document.getElementById("answer").disabled = false;
  document.getElementById("checkButton").disabled = false;
}

function savePlayerName() {
  let inputName = document.getElementById("playerName").value.trim();
  playerName = inputName === "" ? "Игрок" : inputName;
  localStorage.setItem("playerName", playerName);
}

function startGame() {
  // при старте новой игры прошлый марафонный блок можно оставить,
  // но чтобы не путал — уберём:
  // sessionStorage.removeItem("lastMarathon");

  savePlayerName();

  maxNumber = parseInt(document.getElementById("difficulty").value, 10);
  gameMode = document.getElementById("mode").value;

  score = 0;
  document.getElementById("score").innerText = "Очки: 0";

  gameOver = false;
  enableGameControls();

  document.getElementById("answer").style.display = "inline-block";
  document.getElementById("checkButton").style.display = "inline-block";

  mistakes = [];
  currentTaskText = "";
  document.getElementById("mistakesList").innerHTML = "";
  document.getElementById("mistakesBox").style.display = "none";

  document.getElementById("startScreen").style.display = "none";
  document.getElementById("game").style.display = "block";

  document.getElementById("answer").focus();
  document.getElementById("doll").classList.add("show");

  taskBank = buildTaskBank(maxNumber);
  rebuildTaskMaps();

  reviewPlan = [];
  lastTaskKey = "";

  setTimeout(() => {
    if (gameMode === "marathon") {
      speak(
        "Привет " +
          playerName +
          "! Начинаем марафон. У тебя одна минута. Набери как можно больше очков",
        () => {
          time = marathonDuration;
          updateTimer();
          interval = setInterval(timerTick, 1000);
          newTask();
        }
      );
    } else {
      speak("Привет " + playerName + "! Давай сыграем с тобой в игру", () => {
        newTask();
      });
    }
  }, 2000);
}

document.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    if (document.getElementById("startScreen").style.display !== "none") {
      startGame();
    }
  }
});

function newTask() {
  document.getElementById("doll").classList.remove("show");

  if (gameOver) return;

  if (gameMode === "normal") clearInterval(interval);

  const t = pickTask();

  a = t.a;
  b = t.b;
  correct = t.answer;
  currentTaskText = t.key;
  lastTaskKey = t.key;

  document.getElementById("task").innerText = currentTaskText;

  document.getElementById("answer").value = "";
  document.getElementById("answer").focus();

  taskStartTime = performance.now();

  if (gameMode === "normal") {
    time = 25;
    updateTimer();
    interval = setInterval(timerTick, 1000);
  }
}

function timerTick() {
  if (gameOver) return;

  time--;
  updateTimer();

  if (time <= 0) {
    if (gameMode === "marathon") finishMarathon();
    else lose();
  }
}

function updateTimer() {
  if (gameMode === "marathon") {
    document.getElementById("timer").innerText = "Марафон: " + time;
  } else {
    document.getElementById("timer").innerText = "Время: " + time;
  }
}

function check() {
  if (gameOver) return;

  let user = parseInt(document.getElementById("answer").value, 10);
  if (isNaN(user)) return;

  const elapsedMs = performance.now() - taskStartTime;
  const isCorrect = user === correct;

  recordTaskResult(currentTaskText, elapsedMs, isCorrect);

  if (isCorrect) {
    score += 10;
    document.getElementById("score").innerText = "Очки: " + score;

    speak("Правильно");
    newTask();
  } else {
    score = Math.max(0, score - 10);
    document.getElementById("score").innerText = "Очки: " + score;

    if (gameMode === "marathon") {
      mistakes.push({ task: currentTaskText, userAnswer: user, correctAnswer: correct });
      speak("Неправильно");
      newTask();
    } else {
      lose();
    }
  }
}

function checkEnter(event) {
  if (gameOver) return;
  if (event.key === "Enter") check();
}

function lose() {
  if (gameOver) return;

  gameOver = true;
  clearInterval(interval);
  disableGameControls();

  localStorage.setItem("lastScore", score);

  document.getElementById("doll").classList.add("show");
  document.getElementById("task").innerText = "Игра окончена";
  document.getElementById("answer").value = "";

  speechSynthesis.cancel();

  setTimeout(() => {
    speak("Не правильно. Ты проиграла. Игра окончена.", () => {
      alert("Ты проиграла! Очки: " + score);
      // ВОТ ТУТ автопрокрутка к "Самые проблемные примеры"
      restartToMenu();
    });
  }, 500);
}

function finishMarathon() {
  if (gameOver) return;

  gameOver = true;
  clearInterval(interval);
  disableGameControls();

  localStorage.setItem("lastScore", score);

  // сохраним ошибки марафона и покажем их в меню
  saveLastMarathonToSession();

  speechSynthesis.cancel();

  setTimeout(() => {
    speak("Время вышло. Марафон окончен. Ты набрала " + score + " очков", () => {
      // ВОТ ТУТ автопрокрутка к "Самые проблемные примеры"
      restartToMenu();
    });
  }, 200);
}

// ======================
// ИНИЦИАЛИЗАЦИЯ UI
// ======================
(function initLearningUI() {
  const resetBtn = document.getElementById("resetLearningButton");
  if (resetBtn) resetBtn.addEventListener("click", resetLearning);

  const diffEl = document.getElementById("difficulty");
  if (diffEl) diffEl.addEventListener("change", () => {
    updateProblemsUI();
    renderLastMarathonBoxFromSession();
  });

  updateProblemsUI();
  renderLastMarathonBoxFromSession();
})();
