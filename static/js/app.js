// ELEMENTS
const welcomeScreen = document.getElementById('welcome-screen');
const chatScreen    = document.getElementById('chat-screen');
const welcomeInput  = document.getElementById('welcome-input');
const welcomeSend   = document.getElementById('welcome-send');
const textInput     = document.getElementById('text-input');
const sendBtn       = document.getElementById('send-btn');
const chatWindow    = document.getElementById('chat-window');
const micBtn        = document.getElementById('mic-btn');

// 1) START CHAT
function startChat(initialText=null) {
  welcomeScreen.style.display = 'none';
  chatScreen.style.display    = 'flex';
  document.body.classList.add('chatting');
  if (initialText) sendMessage(initialText);
  textInput.focus();
}
welcomeSend.addEventListener('click', () => {
  const txt = welcomeInput.value.trim();
  if (!txt) return;
  startChat(txt);
});
welcomeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') startChat(welcomeInput.value.trim());
});

// 2) CANVAS BG
const canvas = document.getElementById('bg');
const ctx    = canvas.getContext('2d');
let w,h,cx,cy, circles=[];
function initCanvas(){
  w=canvas.width=window.innerWidth;
  h=canvas.height=window.innerHeight;
  cx=w/2; cy=h/2;
  circles=[];
  for(let i=0;i<12;i++){
    circles.push({
      r:50+Math.random()*200,
      a:Math.random()*Math.PI*2,
      s:0.002+Math.random()*0.006,
      sz:2+Math.random()*3,
      ph:Math.random()*Math.PI*2
    });
  }
}
window.addEventListener('resize', initCanvas);
function draw(){
  ctx.clearRect(0,0,w,h);
  ctx.globalCompositeOperation='lighter';
  circles.forEach(c=>{
    c.a+=c.s;
    const x = cx + Math.cos(c.a + c.ph)*c.r;
    const y = cy + Math.sin(c.a + c.ph)*c.r;
    ctx.beginPath();
    ctx.arc(x,y,c.sz,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,255,0,0.6)';
    ctx.lineWidth=1.5;
    ctx.stroke();
  });
  requestAnimationFrame(draw);
}
initCanvas();
draw();

// 3) CHAT APPEND & SEND
function appendMessage(txt, cls){
  const el = document.createElement('div');
  el.className = 'message ' + cls;
  el.textContent = txt;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function sendMessage(txt){
  appendMessage(txt, 'user');
  fetch('/chat', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ text: txt })
  })
  .then(r=>r.json())
  .then(data=>{
    appendMessage(data.reply, 'bot');
  });
}

sendBtn.addEventListener('click',()=>{
  const txt = textInput.value.trim();
  if (!txt) return;
  textInput.value = '';
  sendMessage(txt);
});
textInput.addEventListener('keydown', e=>{
  if(e.key==='Enter') sendBtn.click();
});

// 4) LIVE SPEECH RECOGNITION
let recognizing = false;
let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRec();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    recognizing = true;
    micBtn.classList.add('listening');
  };
  recognition.onend = () => {
    recognizing = false;
    micBtn.classList.remove('listening');
  };
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        const text = event.results[i][0].transcript.trim();
        textInput.value = '';
        recognition.stop();
        sendMessage(text);
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    textInput.value = interim;
  };

  micBtn.addEventListener('click', () => {
    if (recognizing) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
} else {
  micBtn.disabled = true;
  micBtn.textContent = 'No Mic';
}
