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
// ОБУЧЕНИЕ
// ======================
let taskBank = [];
let taskByKey = {};
let taskStats = JSON.parse(localStorage.getItem("taskStats") || "{}");

let taskStartTime = 0;
let lastTaskKey = "";

// очередь “повторов” на ближайшие задания (ощутимый эффект обучения)
let reviewQueue = [];

// настройки (можно подкрутить)
const REVIEW_PICK_CHANCE = 0.65;   // вероятность взять пример из очереди повторов
const REVIEW_QUEUE_MAX = 40;

// ---------- UI: топ проблемных + сброс ----------
function parseTaskKeyNumbers(key){
  // key вида "12 + 3" или "12 - 3"
  const m = key.match(/^(\d+)\s*[\+\-]\s*(\d+)$/);
  if(!m) return null;
  return { a: parseInt(m[1], 10), b: parseInt(m[2], 10) };
}

function getCurrentDifficulty(){
  const el = document.getElementById("difficulty");
  if(!el) return null;
  const v = parseInt(el.value, 10);
  return Number.isFinite(v) ? v : null;
}

function getProblemScoreByKey(key){
  const s = taskStats[key];
  if(!s) return 0;

  // Итоговая "проблемность": время + ошибки
  const timeSec = (s.avgMs || 0) / 1000;
  const wrong = s.wrong || 0;

  // можно менять веса:
  return timeSec * 4 + wrong * 25;
}

function getTopProblems(limit = 10, difficultyFilter = null){
  const keys = Object.keys(taskStats);

  const filtered = keys.filter(k => {
    const s = taskStats[k];
    if(!s || !s.attempts) return false;

    if(difficultyFilter == null) return true;

    const nums = parseTaskKeyNumbers(k);
    if(!nums) return true;
    return nums.a <= difficultyFilter && nums.b <= difficultyFilter;
  });

  filtered.sort((k1, k2) => getProblemScoreByKey(k2) - getProblemScoreByKey(k1));

  return filtered.slice(0, limit).map(k => ({
    key: k,
    ...taskStats[k],
    score: getProblemScoreByKey(k)
  }));
}

function updateProblemsUI(){
  const box = document.getElementById("problemsBox");
  const list = document.getElementById("problemsList");
  if(!box || !list) return;

  const diff = getCurrentDifficulty();
  const top = getTopProblems(10, diff);

  if(top.length === 0){
    box.style.display = "none";
    list.innerHTML = "";
    return;
  }

  box.style.display = "block";

  let html = "";
  for(const item of top){
    const attempts = item.attempts || 0;
    const wrong = item.wrong || 0;
    const avgSec = ((item.avgMs || 0) / 1000).toFixed(1);
    const wrongRate = attempts ? Math.round((wrong / attempts) * 100) : 0;

    html += `
      <div style="padding:8px; border:1px solid rgba(0,0,0,.15); border-radius:8px; margin-bottom:8px;">
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

function resetLearning(){
  localStorage.removeItem("taskStats");
  taskStats = {};
  reviewQueue = [];
  updateProblemsUI();
  alert("Обучение сброшено: статистика времени/ошибок очищена.");
}
// ---------- /UI ----------


function buildTaskBank(max){
  const bank = [];

  for(let a = 0; a <= max; a++){
    for(let b = 0; b <= max; b++){

      // Сложение (как у тебя: сумма не больше 20)
      if(a + b <= 20){
        const key = `${a} + ${b}`;
        bank.push({ key, a, b, op: "+", answer: a + b });
      }

      // Вычитание (без отрицательных)
      if(a - b >= 0){
        const key = `${a} - ${b}`;
        bank.push({ key, a, b, op: "-", answer: a - b });
      }
    }
  }

  return bank;
}

function rebuildTaskMaps(){
  taskByKey = {};
  for(const t of taskBank){
    taskByKey[t.key] = t;
  }
}

function pushToReviewQueue(key, count){
  for(let i = 0; i < count; i++){
    reviewQueue.push(key);
  }
  if(reviewQueue.length > REVIEW_QUEUE_MAX){
    reviewQueue = reviewQueue.slice(reviewQueue.length - REVIEW_QUEUE_MAX);
  }
}

function recordTaskResult(key, elapsedMs, isCorrect){
  let s = taskStats[key];
  if(!s){
    s = { attempts: 0, wrong: 0, avgMs: 0 };
  }

  s.attempts += 1;
  if(!isCorrect) s.wrong += 1;

  // EMA — быстрее подстраивается под игрока
  const alpha = 0.35;
  s.avgMs = (s.attempts === 1)
    ? elapsedMs
    : (s.avgMs * (1 - alpha) + elapsedMs * alpha);

  taskStats[key] = s;
  localStorage.setItem("taskStats", JSON.stringify(taskStats));

  // короткий “повтор” (чтобы обучение было заметно)
  if(!isCorrect){
    pushToReviewQueue(key, 8);
  }else{
    if(elapsedMs > 18000) pushToReviewQueue(key, 5);
    else if(elapsedMs > 12000) pushToReviewQueue(key, 3);
    else if(elapsedMs > 8000) pushToReviewQueue(key, 1);
  }

  updateProblemsUI();
}

function getTaskWeight(task){
  const s = taskStats[task.key];
  if(!s) return 1.0;

  const timeSec = (s.avgMs || 0) / 1000;

  const timeScore = Math.min(90, timeSec * 3.5);  // 25s -> ~87.5
  const wrongScore = Math.min(140, (s.wrong || 0) * 45);

  return 1 + timeScore + wrongScore;              // обычно 1..200+
}

function weightedPick(bank){
  let total = 0;
  for(const t of bank) total += getTaskWeight(t);

  let r = Math.random() * total;
  for(const t of bank){
    r -= getTaskWeight(t);
    if(r <= 0) return t;
  }

  return bank[bank.length - 1];
}

function pickTask(){
  // 1) очередь повторов
  if(reviewQueue.length > 0 && Math.random() < REVIEW_PICK_CHANCE){
    let key = reviewQueue.shift();

    // избегаем повтора 2 раза подряд
    if(key === lastTaskKey && reviewQueue.length > 0){
      key = reviewQueue.shift();
    }

    const t = taskByKey[key];
    if(t) return t;
  }

  // 2) иначе — взвешенный выбор по статистике
  return weightedPick(taskBank);
}

// ======================
// ОСТАЛЬНАЯ ИГРА
// ======================

function speak(text, callback){
  let speech = new SpeechSynthesisUtterance(text);

  speech.rate = 0.65;
  speech.pitch = 0.25;
  speech.volume = 1;

  speech.onend = callback;
  speechSynthesis.speak(speech);
}

function disableGameControls(){
  document.getElementById("answer").disabled = true;
  document.getElementById("checkButton").disabled = true;
  document.getElementById("answer").blur();
}

function enableGameControls(){
  document.getElementById("answer").disabled = false;
  document.getElementById("checkButton").disabled = false;
}

function savePlayerName(){
  let inputName = document.getElementById("playerName").value.trim();

  if(inputName === ""){
    playerName = "Игрок";
  }else{
    playerName = inputName;
  }

  localStorage.setItem("playerName", playerName);
}

function startGame(){
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

  // очередь повторов — с чистого листа на новую игру (статистика taskStats не сбрасывается)
  reviewQueue = [];
  lastTaskKey = "";

  setTimeout(()=>{
    if(gameMode === "marathon"){
      speak(
        "Привет " + playerName + "! Начинаем марафон. У тебя одна минута. Набери как можно больше очков",
        ()=>{
          time = marathonDuration;
          updateTimer();
          interval = setInterval(timerTick, 1000);
          newTask();
        }
      );
    }else{
      speak("Привет " + playerName + "! Давай сыграем с тобой в игру", ()=>{
        newTask();
      });
    }
  }, 2000);
}

document.addEventListener("keydown", function(event){
  if(event.key === "Enter"){
    if(document.getElementById("startScreen").style.display !== "none"){
      startGame();
    }
  }
});

function newTask(){
  document.getElementById("doll").classList.remove("show");

  if(gameOver) return;

  if(gameMode === "normal"){
    clearInterval(interval);
  }

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

  if(gameMode === "normal"){
    time = 25;
    updateTimer();
    interval = setInterval(timerTick, 1000);
  }
}

function timerTick(){
  if(gameOver) return;

  time--;
  updateTimer();

  if(time <= 0){
    if(gameMode === "marathon"){
      finishMarathon();
    }else{
      lose();
    }
  }
}

function updateTimer(){
  if(gameMode === "marathon"){
    document.getElementById("timer").innerText = "Марафон: " + time;
  }else{
    document.getElementById("timer").innerText = "Время: " + time;
  }
}

function check(){
  if(gameOver) return;

  let user = parseInt(document.getElementById("answer").value, 10);
  if(isNaN(user)) return;

  const elapsedMs = performance.now() - taskStartTime;
  const isCorrect = (user === correct);

  // обучение
  recordTaskResult(currentTaskText, elapsedMs, isCorrect);

  if(isCorrect){
    score += 10;
    document.getElementById("score").innerText = "Очки: " + score;

    speak("Правильно");
    newTask();
  }else{
    score = Math.max(0, score - 10);
    document.getElementById("score").innerText = "Очки: " + score;

    if(gameMode === "marathon"){
      mistakes.push({
        task: currentTaskText,
        userAnswer: user,
        correctAnswer: correct
      });

      speak("Неправильно");
      newTask();
    }else{
      lose();
    }
  }
}

function checkEnter(event){
  if(gameOver) return;
  if(event.key === "Enter") check();
}

function lose(){
  if(gameOver) return;

  gameOver = true;
  clearInterval(interval);
  disableGameControls();

  localStorage.setItem("lastScore", score);

  document.getElementById("doll").classList.add("show");
  document.getElementById("task").innerText = "Игра окончена";
  document.getElementById("answer").value = "";

  speechSynthesis.cancel();

  setTimeout(()=>{
    speak("Не правильно. Ты проиграла. Игра окончена.", ()=>{
      alert("Ты проиграла! Очки: " + score);
      location.reload();
    });
  }, 500);
}

function showMistakes(){
  let box = document.getElementById("mistakesBox");
  let list = document.getElementById("mistakesList");

  if(mistakes.length === 0){
    list.innerHTML = '<div class="mistakeItem">Ошибок не было. Отличный результат!</div>';
  }else{
    let html = "";
    for(let i = 0; i < mistakes.length; i++){
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

function finishMarathon(){
  if(gameOver) return;

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

  setTimeout(()=>{
    speak("Время вышло. Марафон окончен. Ты набрала " + score + " очков");
  }, 500);
}

// ======================
// ИНИЦИАЛИЗАЦИЯ UI
// ======================
(function initLearningUI(){
  const resetBtn = document.getElementById("resetLearningButton");
  if(resetBtn){
    resetBtn.addEventListener("click", resetLearning);
  }

  const diffEl = document.getElementById("difficulty");
  if(diffEl){
    diffEl.addEventListener("change", updateProblemsUI);
  }

  updateProblemsUI();
})();
