'use strict';
/* ===================== CONFIG ===================== */
const CONFIG = {
  BACKEND_URL: 'https://override-board.override-board.workers.dev',
  SHARE_URL: 'https://thriver652.github.io/override/',
  ADS_EVERY_N_RUNS: 3,        // portal ad break frequency at game over
  VERSION: '1.2.0'
};

/* ===================== UTIL ===================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function mulberry32(seed){ let t = seed>>>0; return function(){ t += 0x6D2B79F5; let r = Math.imul(t ^ (t>>>15), 1|t); r ^= r + Math.imul(r ^ (r>>>7), 61|r); return ((r ^ (r>>>14))>>>0)/4294967296; }; }
function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
const todayKey = () => new Date().toISOString().slice(0,10);
const fmt = n => n.toLocaleString('en-US');

/* ===================== STORAGE ===================== */
const SAVE_KEY='override.save.v1';
const DEFAULT_SAVE = { best:0, runs:0, xp:0, level:1, theme:'neon', sound:true, dayStreak:0, lastDay:'', daily:{}, tag:'', maxCombo:0, unlocked:['neon'], bestNodes:0, liesCaught:0, typeStats:{}, ach:[], totalNodes:0, patchesUsed:0, firewalls:0 };
let save = loadSave();
function loadSave(){ try{ const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); return Object.assign({},DEFAULT_SAVE,s||{}); }catch(e){ return Object.assign({},DEFAULT_SAVE);} }
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(e){} }

/* ===================== THEMES ===================== */
const THEMES = [
  {id:'neon',   name:'NEON',     lvl:1,  a:'#00f0ff', b:'#ff2bd6', bg:'#05060a'},
  {id:'acid',   name:'ACID',     lvl:3,  a:'#b6ff00', b:'#ff6a00', bg:'#070a05'},
  {id:'ice',    name:'ICE',      lvl:5,  a:'#9ad5ff', b:'#ffffff', bg:'#040812'},
  {id:'blood',  name:'BLOOD',    lvl:8,  a:'#ff3b5c', b:'#ffb347', bg:'#0a0407'},
  {id:'void',   name:'VOID',     lvl:12, a:'#a78bfa', b:'#f472b6', bg:'#06040c'},
  {id:'gold',   name:'GOLD',     lvl:16, a:'#ffd23f', b:'#ff8a00', bg:'#0a0803'},
  {id:'matrix', name:'MATRIX',   lvl:20, a:'#39ff88', b:'#00c46a', bg:'#020805'},
  {id:'ghost',  name:'GHOST',    lvl:25, a:'#ffffff', b:'#8b8b8b', bg:'#000000'},
];
function applyTheme(id){
  const t = THEMES.find(x=>x.id===id) || THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--a',t.a); r.setProperty('--b',t.b); r.setProperty('--bg',t.bg);
  document.querySelector('meta[name=theme-color]').setAttribute('content',t.bg);
}

/* ===================== RANKS & ACHIEVEMENTS ===================== */
const RANKS=[[1,'INTERN'],[3,'SCRIPT KIDDIE'],[5,'OPERATOR'],[8,'NETRUNNER'],[12,'GHOST'],[16,'ROOT'],[20,'OVERLORD'],[25,'THE GLITCH']];
function rankFor(level){ let r=RANKS[0]; for(const x of RANKS){ if(level>=x[0]) r=x; } return r; }
function nextRank(level){ return RANKS.find(x=>x[0]>level)||null; }
const ACH=[
  {id:'first',   name:'BOOTED',        desc:'finish your first run',            xp:50,  test:s=>s.runs>=1},
  {id:'n10',     name:'DEEP DIVE',     desc:'reach node 10',                    xp:100, test:s=>s.bestNodes>=10},
  {id:'n25',     name:'KERNEL ACCESS', desc:'reach node 25',                    xp:250, test:s=>s.bestNodes>=25},
  {id:'n50',     name:'ROOT ACCESS',   desc:'reach node 50',                    xp:600, test:s=>s.bestNodes>=50},
  {id:'combo10', name:'ON FIRE',       desc:'10 combo',                         xp:100, test:s=>s.maxCombo>=10},
  {id:'combo25', name:'UNSTOPPABLE',   desc:'25 combo',                         xp:300, test:s=>s.maxCombo>=25},
  {id:'lies10',  name:'LIE DETECTOR',  desc:'catch the AI lying 10 times',      xp:150, test:s=>s.liesCaught>=10},
  {id:'lies50',  name:'TRUST NOBODY',  desc:'catch the AI lying 50 times',      xp:400, test:s=>s.liesCaught>=50},
  {id:'fw',      name:'BREACHED',      desc:'clear a FIREWALL',                 xp:150, test:s=>s.firewalls>=1},
  {id:'streak3', name:'HABIT',         desc:'3-day streak',                     xp:150, test:s=>s.dayStreak>=3},
  {id:'streak7', name:'ADDICTED',      desc:'7-day streak',                     xp:400, test:s=>s.dayStreak>=7},
  {id:'patch',   name:'PATCHED',       desc:'use 5 patches',                    xp:100, test:s=>s.patchesUsed>=5},
  {id:'k5',      name:'5K CLUB',       desc:'score 5,000 in one run',           xp:200, test:s=>s.best>=5000},
  {id:'k20',     name:'20K CLUB',      desc:'score 20,000 in one run',          xp:500, test:s=>s.best>=20000},
];
function checkAchievements(){ const got=[]; for(const a of ACH){ if(!save.ach.includes(a.id) && a.test(save)){ save.ach.push(a.id); got.push(a);} } return got; }

/* ===================== PROGRESSION ===================== */
const xpForLevel = l => Math.round(200*Math.pow(l,1.4));
function addXp(amount){
  save.xp += amount; let leveled=[];
  while(save.xp >= xpForLevel(save.level)){ save.xp -= xpForLevel(save.level); save.level++; leveled.push(save.level); }
  const newlyUnlocked=[];
  THEMES.forEach(t=>{ if(save.level>=t.lvl && !save.unlocked.includes(t.id)){ save.unlocked.push(t.id); newlyUnlocked.push(t); } });
  persist(); return {leveled,newlyUnlocked};
}

/* ===================== AUDIO ===================== */
const Audio = (()=>{
  let ctx=null, master=null, muted=!save.sound, adMuted=false;
  function ensure(){ if(!ctx){ try{ ctx=new (window.AudioContext||window.webkitAudioContext)(); master=ctx.createGain(); master.gain.value=0.35; master.connect(ctx.destination);}catch(e){} } if(ctx&&ctx.state==='suspended') ctx.resume(); }
  function tone(f,dur=0.08,type='square',vol=1,slide=0){ if(!ctx||muted||adMuted) return; const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type; o.frequency.setValueAtTime(f,ctx.currentTime); if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide),ctx.currentTime+dur); g.gain.setValueAtTime(vol*0.5,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur); o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime+dur+0.02); }
  return {
    ensure,
    setMuted(m){ muted=m; }, setAdMuted(m){ adMuted=m; },
    tap(){ tone(880,0.05,'square',0.5); },
    ok(){ tone(660,0.07,'square',0.8); setTimeout(()=>tone(990,0.09,'square',0.8),60); },
    combo(n){ tone(660+Math.min(n,20)*40,0.06,'triangle',0.9); setTimeout(()=>tone(990+Math.min(n,20)*40,0.1,'triangle',0.9),50); },
    bad(){ tone(180,0.25,'sawtooth',1,-120); },
    tick(){ tone(1200,0.03,'sine',0.35); },
    go(){ tone(440,0.1,'square',0.8); setTimeout(()=>tone(880,0.18,'square',0.9),110); },
    over(){ [300,240,180,120].forEach((f,i)=>setTimeout(()=>tone(f,0.22,'sawtooth',1),i*140)); },
    level(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.16,'triangle',1),i*90)); }
  };
})();

/* ===================== FX (particles + shake) ===================== */
const FX = (()=>{
  const c=$('#fx'), x=c.getContext('2d'); let parts=[], running=false;
  function resize(){ c.width=innerWidth*devicePixelRatio; c.height=innerHeight*devicePixelRatio; x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }
  addEventListener('resize',resize); resize();
  function burst(px,py,color,n=18,speed=6){ for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, s=speed*(0.4+Math.random()); parts.push({x:px,y:py,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,c:color,r:2+Math.random()*3}); } if(!running){running=true; requestAnimationFrame(loop);} }
  function loop(){ x.clearRect(0,0,innerWidth,innerHeight); parts=parts.filter(p=>p.l>0); for(const p of parts){ p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.vx*=0.98; p.l-=0.03; x.globalAlpha=Math.max(0,p.l); x.fillStyle=p.c; x.fillRect(p.x,p.y,p.r,p.r);} x.globalAlpha=1; if(parts.length) requestAnimationFrame(loop); else running=false; }
  function shake(){ const app=$('#app'); app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake'); }
  function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  return {burst,shake,cssVar};
})();

/* ===================== TOAST / SCREENS ===================== */
let toastT; function toast(msg,ms=1600){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),ms); }
function show(id){ $$('.screen').forEach(s=>s.classList.toggle('active',s.id===id)); }

/* ===================== AI ANTAGONIST SCRIPT ===================== */
const AI = {
  home: [
    "A rogue AI has locked you out. It thinks you're slow.",
    "I've watched 40,000 humans try this today. You won't be different.",
    "Your reaction time is adorable. Please, proceed.",
    "I process 10 billion ops a second. You process… vibes.",
    "The daily breach resets at midnight UTC. So does your dignity.",
    "Warning: I lie sometimes. Read carefully. Or don't. Faster for me.",
    "Come back to lose again? Loyalty. I respect it.",
  ],
  start: ["Initialising. Try to keep up.","Handshake accepted. Mistake.","Let's see what a human is worth.","Three integrity points. I'd say make them count, but…"],
  ok: ["Fine.","Lucky.","Noted.","Acceptable.","Hm.","Don't get comfortable.","Even a broken clock…","Statistically, that happens.","Cute.","…"],
  bad: ["There it is.","Predictable.","Was that deliberate?","My toaster does better.","Integrity dropping. Like your focus.","Blink and you miss it. You blinked.","That one was free, and you still…","Humans.","I'll pretend I didn't see that.","Beautiful failure."],
  speed: ["Increasing clock speed.","Faster now. Try to stay conscious.","Latency reduced. Yours isn't.","Let's remove the training wheels.","Overclocking.","Node throughput up 20%."],
  lie: ["I might be lying now.","Read the instruction. Twice.","Trust nothing.","Not everything I say is true.","Opposite day? You decide."],
  over: ["Connection terminated. Come back when you've evolved.","I have your reaction times logged. They're not great.","Impressive. For a mammal.","You lasted longer than 60% of players. The 40% were bots I ran for fun.","That's it? I was just warming up.","Your best is safe. For now. Someone in Jakarta is beating it as we speak.","Retry. It's what your kind does.","I've already forgotten you. Try again anyway."],
  best: ["…That's a new record. Recalculating my opinion of you.","New best. I did not expect that. I'm updating my model.","Personal best. Don't let it go to your head — I'm not."],
  daily: ["Same run for every human on Earth. No excuses.","Daily breach. One attempt. Everyone gets my exact sequence.","Today's breach is seeded. Your luck isn't a factor. Only you are."]
};
const pick = (arr,rng=Math.random)=>arr[Math.floor(rng()*arr.length)];

/* ===================== PORTAL SDK ADAPTER ===================== */
const Portal = (()=>{
  const q = new URLSearchParams(location.search).get('portal');
  const host = location.hostname;
  // CrazyGames serves games on several domains (crazygames.com, 1001juegos.com, …) inside an iframe, so try their SDK whenever
  // we're embedded or on a CrazyGames host; the SDK reports environment 'disabled' elsewhere and we stay in 'none' mode.
  const embedded = (()=>{ try{ return window.self!==window.top; }catch(e){ return true; } })();
  const kind = q || (host.includes('poki')?'poki': (host.includes('crazygames') || embedded)?'crazygames':'none');
  let sdk=null, ready=false, lastMidgame=0, kindOut=kind;
  function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  async function init(){
    try{
      if(kind==='crazygames'){
        await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
        await window.CrazyGames.SDK.init(); sdk=window.CrazyGames.SDK;
        ready = sdk.environment!=='disabled'; if(!ready) kindOut='none';
        if(ready){ try{ sdk.game.loadingStart(); sdk.game.loadingStop(); }catch(e){} }
      } else if(kind==='poki'){
        await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
        await window.PokiSDK.init(); sdk=window.PokiSDK; ready=true; sdk.gameLoadingFinished();
      }
    }catch(e){ ready=false; }
  }
  function pauseForAd(){ Audio.setAdMuted(true); }
  function resumeAfterAd(){ Audio.setAdMuted(false); }
  return {
    get kind(){ return kindOut; }, init, isReady:()=>ready,
    gameplayStart(){ try{ if(!ready) return; kind==='crazygames'? sdk.game.gameplayStart() : sdk.gameplayStart(); }catch(e){} },
    gameplayStop(){ try{ if(!ready) return; kind==='crazygames'? sdk.game.gameplayStop() : sdk.gameplayStop(); }catch(e){} },
    happytime(){ try{ if(!ready) return; if(kind==='crazygames') sdk.game.happytime(); }catch(e){} },
    /* midgame ad at a natural pause; respects the 3-minute cooldown CrazyGames enforces */
    async adBreak(){
      if(!ready) return; if(Date.now()-lastMidgame<180000) return; lastMidgame=Date.now();
      pauseForAd();
      try{
        if(kind==='crazygames'){ await new Promise(res=>sdk.ad.requestAd('midgame',{adStarted:pauseForAd,adFinished:res,adError:res})); }
        else { await sdk.commercialBreak(pauseForAd); }
      }catch(e){}
      resumeAfterAd();
    },
    /* rewarded ad; resolves true only when the player actually watched it. Off-portal: free (so the feature is testable). */
    async rewarded(){
      if(!ready) return {ok:true,free:true};
      pauseForAd(); let ok=false;
      try{
        if(kind==='crazygames'){ ok = await new Promise(res=>sdk.ad.requestAd('rewarded',{adStarted:pauseForAd,adFinished:()=>res(true),adError:()=>res(false)})); }
        else { ok = await sdk.rewardedBreak(pauseForAd); }
      }catch(e){ ok=false; }
      resumeAfterAd(); return {ok,free:false};
    }
  };
})();

/* ===================== TELEMETRY (privacy-light: no IDs beyond a per-page-load session id) ===================== */
const Telemetry = (()=>{
  const sid = Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
  let errCount=0;
  function send(type,data={}){
    if(!CONFIG.BACKEND_URL) return;
    try{
      const body=JSON.stringify(Object.assign({type,sid,portal:Portal.kind,v:CONFIG.VERSION},data));
      // text/plain is CORS-safelisted, so the beacon goes cross-origin without a preflight; the worker parses the body as JSON regardless.
      let sent=false;
      try{ if(navigator.sendBeacon) sent=navigator.sendBeacon(`${CONFIG.BACKEND_URL}/event`, new Blob([body],{type:'text/plain'})); }catch(e){ sent=false; }
      if(!sent) fetch(`${CONFIG.BACKEND_URL}/event`,{method:'POST',headers:{'content-type':'text/plain'},body,keepalive:true,mode:'cors'}).catch(()=>{});
    }catch(e){}
  }
  addEventListener('error',e=>{ if(errCount++<5) send('error',{msg:`${e.message} @${(e.filename||'').split('/').pop()}:${e.lineno}`}); });
  addEventListener('unhandledrejection',e=>{ if(errCount++<5) send('error',{msg:'promise: '+String(e.reason&&e.reason.message||e.reason).slice(0,200)}); });
  return {send};
})();

/* ===================== BACKEND ===================== */
const Backend = {
  enabled: ()=>!!CONFIG.BACKEND_URL,
  async stats(day){ if(!this.enabled()) return null; try{ const r=await fetch(`${CONFIG.BACKEND_URL}/stats?day=${day}`,{cache:'no-store'}); return r.ok? await r.json():null; }catch(e){ return null; } },
  async submit(day,name,score,nodes){ if(!this.enabled()) return {ok:false,reason:'no backend'}; try{ const r=await fetch(`${CONFIG.BACKEND_URL}/submit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({day,name,score,nodes,v:CONFIG.VERSION})}); return await r.json(); }catch(e){ return {ok:false,reason:'network'}; } }
};
