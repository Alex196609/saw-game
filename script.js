let lastScore = localStorage.getItem("lastScore") || 0;
let playerName = localStorage.getItem("playerName") || "";

document.getElementById("lastScore").innerText =
  "Прошлый результат: " + lastScore;

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

// --- ОБУЧЕНИЕ (пункты 1-5) ---
let taskBank = [];
let taskStats = JSON.parse(localStorage.getItem("taskStats") || "{}");
let taskStartTime = 0;
let lastTaskKey = "";

function buildTaskBank(max) {
  const bank = [];

  for (let a = 0; a <= max; a++) {
    for (let b = 0; b <= max; b++) {
      // Сложение (как в твоей логике: сумма не больше 20)
      if (a + b <= 20) {
        const key = `${a} + ${b}`;
        bank.push({ key, a, b, op: "+", answer: a + b });
      }

      // Вычитание (без отрицательных)
      if (a - b >= 0) {
        const key = `${a} - ${b}`;
        bank.push({ key, a, b, op: "-", answer: a - b });
      }
    }
  }

  return bank;
}

function recordTaskResult(key, elapsedMs, isCorrect) {
  let s = taskStats[key];
  if (!s) {
    s = { attempts: 0, wrong: 0, avgMs: 0 };
  }

  s.attempts += 1;
  if (!isCorrect) s.wrong += 1;

  // EMA (экспоненциальное среднее) — быстрее подстраивается под игрока
  const alpha = 0.3;
  s.avgMs = (s.attempts === 1)
    ? elapsedMs
    : (s.avgMs * (1 - alpha) + elapsedMs * alpha);

  taskStats[key] = s;
  localStorage.setItem("taskStats", JSON.stringify(taskStats));
}

function getTaskWeight(task) {
  const s = taskStats[task.key];
  if (!s) return 1.0; // новый пример тоже должен выпадать

  // Чем больше среднее время — тем выше вес
  const timeFactor = Math.min(5, s.avgMs / 1500); // ~1.5с = норм, выше => чаще

  // Чем больше доля ошибок — тем выше вес
  const wrongRate = s.attempts ? (s.wrong / s.attempts) : 0;
  const wrongFactor = 1 + wrongRate * 6; // 1..7

  // Итоговый вес (время + ошибки)
  return 0.6 + timeFactor + wrongFactor;
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
// --- /ОБУЧЕНИЕ ---


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

  if (inputName === "") {
    playerName = "Игрок";
  } else {
    playerName = inputName;
  }

  localStorage.setItem("playerName", playerName);
}

function startGame() {
  savePlayerName();

  maxNumber = parseInt(document.getElementById("difficulty").value, 10);
  gameMode = document.getElementById("mode").value;

  // (п.3) собираем банк заданий для "обучающего" выбора
  taskBank = buildTaskBank(maxNumber);

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

  if (gameMode === "normal") {
    clearInterval(interval);
  }

  // (п.4) выбираем пример так, чтобы сложные/ошибочные выпадали чаще
  let t = weightedPick(taskBank);

  // защита от повтора 2 раза подряд
  if (taskBank.length > 1 && t.key === lastTaskKey) {
    t = weightedPick(taskBank);
  }
  lastTaskKey = t.key;

  a = t.a;
  b = t.b;
  correct = t.answer;
  currentTaskText = t.key;

  document.getElementById("task").innerText = currentTaskText;

  document.getElementById("answer").value = "";
  document.getElementById("answer").focus();

  // старт измерения времени решения
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
    if (gameMode === "marathon") {
      finishMarathon();
    } else {
      lose();
    }
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

  // (п.5) записываем: сколько думал + правильно/неправильно
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
      mistakes.push({
        task: currentTaskText,
        userAnswer: user,
        correctAnswer: correct,
      });

      speak("Неправильно");
      newTask();
    } else {
      lose();
    }
  }
}

function checkEnter(event) {
  if (gameOver) return;

  if (event.key === "Enter") {
    check();
  }
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
      location.reload();
    });
  }, 500);
}

function showMistakes() {
  let box = document.getElementById("mistakesBox");
  let list = document.getElementById("mistakesList");

  if (mistakes.length === 0) {
    list.innerHTML =
      '<div class="mistakeItem">Ошибок не было. Отличный результат!</div>';
  } else {
    let html = "";

    for (let i = 0; i < mistakes.length; i++) {
      html += `
        <div class="mistakeItem">
          <div><strong>Пример:</strong> ${mistakes[i].task}</div>
          <div><strong>Твой ответ:</strong> ${mistakes[i].userAnswer}</div>
          <div><strong>Правильный ответ:</strong> ${mistakes[i].correctAnswer}</div>
        </div>
      `;
    }

    list.innerHTML = html;
  }

  box.style.display = "block";
}

function finishMarathon() {
  if (gameOver) return;

  gameOver = true;
  clearInterval(interval);
  disableGameControls();

  localStorage.setItem("lastScore", score);

  document.getElementById("doll").classList.remove("show");
  document.getElementById("task").innerText = "Марафон окончен";
  document.getElementById("answer").value = "";
  document.getElementById("timer").innerText = "Время вышло";

  document.getElementById("answer").style.display = "none";
  document.getElementById("checkButton").style.display = "none";

  showMistakes();

  speechSynthesis.cancel();

  setTimeout(() => {
    speak("Время вышло. Марафон окончен. Ты набрала " + score + " очков");
  }, 500);
}

// оставил твою функцию random (сейчас она не нужна, но пусть будет)
function random(max) {
  return Math.floor(Math.random() * (max + 1));
}
