let lastScore = localStorage.getItem("lastScore") || 0;

document.getElementById("lastScore").innerText =
"Прошлый результат: " + lastScore;

let maxNumber
let a,b
let correct
let score = 0

let time
let interval


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

document.getElementById("startScreen").style.display="none"
document.getElementById("game").style.display="block"

document.getElementById("answer").focus() // сразу открывает клавиатуру

document.getElementById("doll").classList.add("show")

setTimeout(()=>{

speak("Привет Аня! Давай сыграем с тобой в игру",()=>{

newTask()

})

},2000)

}


document.addEventListener("keydown", function(event){

if(event.key === "Enter"){

if(document.getElementById("startScreen").style.display !== "none"){
startGame()
}

}

})


function newTask(){

clearInterval(interval)

let operation = Math.random() < 0.5 ? "+" : "-"

if(operation=="+"){

a=random(maxNumber)
b=random(maxNumber)

while(a+b>20){
a=random(maxNumber)
b=random(maxNumber)
}

correct=a+b

document.getElementById("task").innerText=a+" + "+b

}

if(operation=="-"){

a=random(maxNumber)
b=random(maxNumber)

while(a-b<0){
a=random(maxNumber)
b=random(maxNumber)
}

correct=a-b

document.getElementById("task").innerText=a+" - "+b

}

time=25

updateTimer()

interval=setInterval(timerTick,1000)

}


function timerTick(){

time--

updateTimer()

if(time<=0){
lose()
}

}


function updateTimer(){

document.getElementById("timer").innerText="Время: "+time

}


function check(){

let user=parseInt(document.getElementById("answer").value)

if(user===correct){

score+=10

document.getElementById("score").innerText="Очки: "+score

speak("Правильно")

newTask()

document.getElementById("answer").value=""
document.getElementById("answer").focus()

}else{

lose()

}

}


function checkEnter(event){

if(event.key==="Enter"){
check()
}

}


function lose(){

clearInterval(interval)

localStorage.setItem("lastScore", score)

speak("Не правильно. Ты проиграла. Игра окончена.")

alert("Ты проиграла!")

location.reload()

}


function random(max){
return Math.floor(Math.random()*(max+1))
}