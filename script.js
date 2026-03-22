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


function speak(text, callback){

let speech = new SpeechSynthesisUtterance(text)

speech.rate = 0.65
speech.pitch = 0.25
speech.volume = 1

speech.onend = callback

speechSynthesis.speak(speech)

}


function startGame(){

maxNumber = parseInt(document.getElementById("difficulty").value)
gameMode = document.getElementById("mode").value

score = 0
document.getElementById("score").innerText = "Очки: 0"

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

document.getElementById("task").innerText = a + " + " + b

}

if(operation == "-"){

a = random(maxNumber)
b = random(maxNumber)

while(a - b < 0){
a = random(maxNumber)
b = random(maxNumber)
}

correct = a - b

document.getElementById("task").innerText = a + " - " + b

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

if(gameMode === "marathon"){

speak("Неправильно")
newTask()

}else{

lose()

}

}

}


function checkEnter(event){

if(event.key === "Enter"){
check()
}

}


function lose(){

clearInterval(interval)

localStorage.setItem("lastScore", score)

document.getElementById("doll").classList.add("show")

setTimeout(()=>{

speak("Не правильно. Ты проиграла. Игра окончена.", ()=>{

alert("Ты проиграла! Очки: " + score)
location.reload()

})

}, 500)

}


function finishMarathon(){

clearInterval(interval)

localStorage.setItem("lastScore", score)

document.getElementById("doll").classList.add("show")

setTimeout(()=>{

speak("Время вышло. Марафон окончен. Ты набрала " + score + " очков", ()=>{

alert("Марафон окончен! Очки: " + score)
location.reload()

})

}, 500)

}


function random(max){
return Math.floor(Math.random() * (max + 1))
}
