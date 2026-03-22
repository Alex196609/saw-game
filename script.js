let lastScore = localStorage.getItem("lastScore") || 0;

document.getElementById("lastScore").innerText =
"Прошлый результат: " + lastScore;

let maxNumber
let a, b
let correct
let score = 0

let time
let interval

let gameMode = "normal"
let marathonDuration = 60
let gameOver = false
let mistakes = []
let currentTaskText = ""
function speak(text, callback){

let speech = new SpeechSynthesisUtterance(text)

speech.rate = 0.65
speech.pitch = 0.25
speech.volume = 1

speech.onend = callback

speechSynthesis.speak(speech)

}

function disableGameControls(){
  document.getElementById("answer").disabled = true
  document.getElementById("checkButton").disabled = true
  document.getElementById("answer").blur()
}

function enableGameControls(){
  document.getElementById("answer").disabled = false
  document.getElementById("checkButton").disabled = false
}

function startGame(){

maxNumber = parseInt(document.getElementById("difficulty").value)
gameMode = document.getElementById("mode").value

score = 0
document.getElementById("score").innerText = "Очки: 0"

gameOver = false
enableGameControls()

document.getElementById("answer").style.display = "inline-block"
document.getElementById("checkButton").style.display = "inline-block"  

mistakes = []
currentTaskText = ""
document.getElementById("mistakesList").innerHTML = ""
document.getElementById("mistakesBox").style.display = "none"
  
document.getElementById("startScreen").style.display = "none"
document.getElementById("game").style.display = "block"

document.getElementById("answer").focus()

document.getElementById("doll").classList.add("show")

setTimeout(()=>{

if(gameMode === "marathon"){

speak("Привет Аня! Начинаем марафон. У тебя одна минута. Набери как можно больше очков", ()=>{

time = marathonDuration
updateTimer()
interval = setInterval(timerTick, 1000)

newTask()

})

}else{

speak("Привет Аня! Давай сыграем с тобой в игру", ()=>{

newTask()

})

}

}, 2000)

}


document.addEventListener("keydown", function(event){

if(event.key === "Enter"){

if(document.getElementById("startScreen").style.display !== "none"){
startGame()
}

}

})


function newTask(){

document.getElementById("doll").classList.remove("show")

if(gameOver){
  return
}
  
if(gameMode === "normal"){
clearInterval(interval)
}

let operation = Math.random() < 0.5 ? "+" : "-"

if(operation == "+"){

a = random(maxNumber)
b = random(maxNumber)

while(a + b > 20){
a = random(maxNumber)
b = random(maxNumber)
}

correct = a + b
currentTaskText = a + " + " + b

document.getElementById("task").innerText = currentTaskText

}

if(operation == "-"){

a = random(maxNumber)
b = random(maxNumber)

while(a - b < 0){
a = random(maxNumber)
b = random(maxNumber)
}

correct = a - b
currentTaskText = a + " - " + b

document.getElementById("task").innerText = currentTaskText

}

document.getElementById("answer").value = ""
document.getElementById("answer").focus()

if(gameMode === "normal"){
time = 25
updateTimer()
interval = setInterval(timerTick, 1000)
}

}


function timerTick(){

  if(gameOver){
  return
}
  
time--

updateTimer()

if(time <= 0){

if(gameMode === "marathon"){
finishMarathon()
}else{
lose()
}

}

}


function updateTimer(){

if(gameMode === "marathon"){
document.getElementById("timer").innerText = "Марафон: " + time
}else{
document.getElementById("timer").innerText = "Время: " + time
}

}


function check(){

  if(gameOver){
    return
  }
  
  let user = parseInt(document.getElementById("answer").value)

  if(isNaN(user)){
    return
  }

  if(user === correct){

    score += 10
    document.getElementById("score").innerText = "Очки: " + score

    speak("Правильно")
    newTask()

  }else{

    score = Math.max(0, score - 10)
    document.getElementById("score").innerText = "Очки: " + score

    if(gameMode === "marathon"){

      mistakes.push({
        task: currentTaskText,
        userAnswer: user,
        correctAnswer: correct
      })

      speak("Неправильно")
      newTask()

    }else{

      lose()

    }

  }

}


function checkEnter(event){

if(gameOver){
  return
}

if(event.key === "Enter"){
  check()
}

}


function lose(){

if(gameOver){
  return
}

gameOver = true
clearInterval(interval)
disableGameControls()

localStorage.setItem("lastScore", score)

document.getElementById("doll").classList.add("show")
document.getElementById("task").innerText = "Игра окончена"
document.getElementById("answer").value = ""

speechSynthesis.cancel()

setTimeout(()=>{

speak("Не правильно. Ты проиграла. Игра окончена.", ()=>{

alert("Ты проиграла! Очки: " + score)
location.reload()

})

}, 500)

}

function showMistakes(){

let box = document.getElementById("mistakesBox")
let list = document.getElementById("mistakesList")

if(mistakes.length === 0){
  list.innerHTML = '<div class="mistakeItem">Ошибок не было. Отличный результат!</div>'
}else{
  let html = ""

  for(let i = 0; i < mistakes.length; i++){
    html += `
      <div class="mistakeItem">
        <div><strong>Пример:</strong> ${mistakes[i].task}</div>
        <div><strong>Твой ответ:</strong> ${mistakes[i].userAnswer}</div>
        <div><strong>Правильный ответ:</strong> ${mistakes[i].correctAnswer}</div>
      </div>
    `
  }

  list.innerHTML = html
}

box.style.display = "block"
}

function finishMarathon(){

if(gameOver){
  return
}

gameOver = true
clearInterval(interval)
disableGameControls()

localStorage.setItem("lastScore", score)

document.getElementById("doll").classList.remove("show")
document.getElementById("task").innerText = "Марафон окончен"
document.getElementById("answer").value = ""
document.getElementById("timer").innerText = "Время вышло"

document.getElementById("answer").style.display = "none"
document.getElementById("checkButton").style.display = "none"

showMistakes()

speechSynthesis.cancel()

setTimeout(()=>{

speak("Время вышло. Марафон окончен. Ты набрала " + score + " очков")

}, 500)

}

function random(max){
return Math.floor(Math.random() * (max + 1))
}
