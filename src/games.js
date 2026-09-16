/* ===================== RUN STATE ===================== */
const Run = { active:false, daily:false, rng:Math.random, score:0, combo:0, maxCombo:0, lives:3, node:0, lastType:null, cleanup:null, timerRaf:0, resolved:false, timerPaused:false, dayKey:'' };
const arena=$('#arena'), instr=$('#instr'), aiMsg=$('#ai-msg'), timerBar=$('#timer-bar');

function speedFactor(n){ return clamp(1 - n*0.018, 0.42, 1); }        // duration multiplier
function tier(n){ return n<4?0 : n<10?1 : n<18?2 : n<30?3 : 4; }        // difficulty tier
function setInstr(html){ instr.innerHTML=html; }
function setAi(msg){ aiMsg.textContent=msg; }
function isLieNode(n){ return n>=6 && Run.rng()<clamp(0.12+n*0.008,0,0.35); }

const GLYPHS=['◆','●','▲','■','✦','◈','⬢','◉','✚','⌘','∆','Ω','λ','Ψ','Σ','⊕','⊗','⌬'];
const ODD_PAIRS=[['O','0'],['l','1'],['I','l'],['Z','2'],['S','5'],['B','8'],['◇','◈'],['●','◉'],['▲','∆'],['6','9'],['≡','☰'],['⊕','⊗'],['⬡','⬢'],['C','G'],['M','W'],['◐','◑']];

/* ===================== MICROGAMES ===================== */
const GAMES = {
  /* tap the lit cell (lie: tap any unlit) */
  tap: { base:2200, min:0, setup(ctx){
    const t=tier(ctx.node), cols=t>=2?4:3, n=cols*cols, lie=ctx.lie;
    setInstr(lie? `<span class="lie">TAP</span> the lit one → tap <span class="hi">ANY OTHER</span>` : `TAP the <span class="hi">LIT</span> one`);
    const g=document.createElement('div'); g.className=`grid c${cols}`; const on=Math.floor(ctx.rng()*n);
    for(let i=0;i<n;i++){ const c=document.createElement('button'); c.className='cell'+(i===on?' on':''); c.textContent=pick(GLYPHS,ctx.rng);
      c.onclick=e=>{ const ok = lie? i!==on : i===on; c.classList.add(ok?'hit':'miss'); ctx.done(ok,e); }; g.appendChild(c); }
    arena.appendChild(g);
  }},
  /* odd one out */
  odd: { base:2600, setup(ctx){
    const t=tier(ctx.node), cols=t>=3?4:3, n=cols*cols, pair=pick(ODD_PAIRS,ctx.rng), flip=ctx.rng()<0.5;
    const base=flip?pair[0]:pair[1], odd=flip?pair[1]:pair[0], oi=Math.floor(ctx.rng()*n);
    setInstr(`find the <span class="hi">ODD</span> one`);
    const g=document.createElement('div'); g.className=`grid c${cols}`;
    for(let i=0;i<n;i++){ const c=document.createElement('button'); c.className='cell'; c.textContent=i===oi?odd:base; c.onclick=e=>{ c.classList.add(i===oi?'hit':'miss'); ctx.done(i===oi,e); }; g.appendChild(c); }
    arena.appendChild(g);
  }},
  /* stop the sweeping cursor inside the zone */
  bar: { base:3200, setup(ctx){
    const t=tier(ctx.node); const zoneW=clamp(0.26-t*0.045,0.09,0.3), zoneX=0.08+ctx.rng()*(0.84-zoneW); const speed=0.9+t*0.35; // sweeps per second
    setInstr(`STOP it in the <span class="hi">ZONE</span> — tap`);
    const w=document.createElement('div'); w.className='bar-wrap'; w.innerHTML=`<div class="bar-zone" style="left:${zoneX*100}%;width:${zoneW*100}%"></div><div class="bar-cursor"></div>`;
    const tapAny=document.createElement('div'); tapAny.className='tap-any'; arena.appendChild(w); arena.appendChild(tapAny);
    const cur=w.querySelector('.bar-cursor'); const t0=performance.now(); let raf, pos=0;
    (function loop(){ const el=(performance.now()-t0)/1000*speed; pos = el%2<1 ? el%1 : 1-(el%1); cur.style.left=`calc(${pos*100}% - 3px)`; raf=requestAnimationFrame(loop); })();
    ctx.onCleanup(()=>cancelAnimationFrame(raf));
    tapAny.onpointerdown=e=>{ cancelAnimationFrame(raf); const ok=pos>=zoneX && pos<=zoneX+zoneW; cur.style.background=ok?'var(--ok)':'var(--bad)'; ctx.done(ok,e); };
  }},
  /* memorize a sequence, then reproduce it */
  seq: { base:3800, setup(ctx){
    const t=tier(ctx.node), len=3+Math.min(t,3), opts=4+Math.min(t,2); const pool=[]; while(pool.length<opts){ const g=pick(GLYPHS,ctx.rng); if(!pool.includes(g)) pool.push(g); }
    const seq=Array.from({length:len},()=>pool[Math.floor(ctx.rng()*opts)]);
    setInstr(`<span class="hi">MEMORIZE</span>`); ctx.pauseTimer();
    const s=document.createElement('div'); s.className='seq'; s.textContent=seq.join(' '); arena.appendChild(s);
    const showMs=clamp(650+len*260-t*80,900,1800);
    const to=setTimeout(()=>{ s.remove(); setInstr(`REPEAT the <span class="hi">SEQUENCE</span>`); ctx.resumeTimer();
      const g=document.createElement('div'); g.className=`grid c${opts>4?3:2}`; let idx=0;
      pool.forEach(gl=>{ const c=document.createElement('button'); c.className='cell'; c.textContent=gl; c.onclick=e=>{ if(gl===seq[idx]){ idx++; Audio.tap(); c.classList.add('hit'); setTimeout(()=>c.classList.remove('hit'),120); if(idx===len) ctx.done(true,e);} else { c.classList.add('miss'); ctx.done(false,e);} }; g.appendChild(c); });
      arena.appendChild(g); }, showMs);
    ctx.onCleanup(()=>clearTimeout(to));
  }},
  /* tap numbered nodes in order (lie: reverse) */
  order: { base:3400, setup(ctx){
    const t=tier(ctx.node), n=3+Math.min(t,3), lie=ctx.lie; const decoys=t>=2?2:0;
    setInstr(lie? `tap <span class="lie">1→${n}</span> → go <span class="hi">${n}→1</span>` : `tap <span class="hi">1 → ${n}</span> in order`);
    const W=arena.clientWidth, H=arena.clientHeight, placed=[]; let next=lie?n:1;
    function place(){ for(let k=0;k<60;k++){ const x=40+ctx.rng()*(W-110), y=40+ctx.rng()*(H-120); if(placed.every(p=>Math.hypot(p.x-x,p.y-y)>78)){ placed.push({x,y}); return {x,y}; } } const p={x:ctx.rng()*(W-70),y:ctx.rng()*(H-70)}; placed.push(p); return p; }
    for(let i=1;i<=n;i++){ const b=document.createElement('button'); b.className='node'; b.textContent=i; const p=place(); b.style.left=p.x+'px'; b.style.top=p.y+'px';
      b.onclick=e=>{ if(i===next){ b.classList.add('done'); Audio.tap(); next+= lie?-1:1; if(lie? next<1 : next>n) ctx.done(true,e); } else { b.classList.add('miss'); ctx.done(false,e);} }; arena.appendChild(b); }
    for(let d=0;d<decoys;d++){ const b=document.createElement('button'); b.className='node decoy'; b.textContent=pick(['?','#','×','!'],ctx.rng); const p=place(); b.style.left=p.x+'px'; b.style.top=p.y+'px'; b.onclick=e=>ctx.done(false,e); arena.appendChild(b); }
  }},
  /* arrow: press/swipe that direction (lie: opposite) */
  arrow: { base:1900, setup(ctx){
    const dirs=[['↑','up'],['↓','down'],['←','left'],['→','right']]; const opp={up:'down',down:'up',left:'right',right:'left'};
    const [sym,dir]=pick(dirs,ctx.rng); const lie=ctx.lie; const want=lie?opp[dir]:dir;
    setInstr(lie? `go <span class="lie">that way</span> → go <span class="hi">OPPOSITE</span>` : `<span class="hi">SWIPE</span> or press that way`);
    const a=document.createElement('div'); a.className='arrow'+(lie?' lie':''); a.textContent=sym; arena.appendChild(a);
    const pad=document.createElement('div'); pad.className='dpad';
    [['←','left'],['↑','up'],['↓','down'],['→','right']].forEach(([s,d])=>{ const b=document.createElement('button'); b.textContent=s; b.onclick=e=>answer(d,e); pad.appendChild(b); }); arena.appendChild(pad);
    function answer(d,e){ ctx.done(d===want,e); }
    const key=e=>{ const m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'}[e.key]; if(m){ e.preventDefault(); answer(m,e);} };
    addEventListener('keydown',key); ctx.onCleanup(()=>removeEventListener('keydown',key));
    let sx,sy; arena.onpointerdown=e=>{ if(e.target.closest('.dpad')) return; sx=e.clientX; sy=e.clientY; };
    arena.onpointerup=e=>{ if(sx==null||e.target.closest('.dpad')) return; const dx=e.clientX-sx, dy=e.clientY-sy; if(Math.hypot(dx,dy)<24) return; answer(Math.abs(dx)>Math.abs(dy)? (dx>0?'right':'left') : (dy>0?'down':'up'), e); sx=null; };
    ctx.onCleanup(()=>{ arena.onpointerdown=null; arena.onpointerup=null; });
  }},
  /* true / false math */
  math: { base:2600, setup(ctx){
    const t=tier(ctx.node); const a=2+Math.floor(ctx.rng()*(7+t*2)), b=2+Math.floor(ctx.rng()*(7+t*2)); const op=pick(t>=1?['+','×','−']:['+','×'],ctx.rng);
    const real = op==='+'?a+b: op==='×'?a*b: a-b; const truthy=ctx.rng()<0.5; const shown = truthy? real : real + pick([-3,-2,-1,1,2,3,10,-10],ctx.rng);
    setInstr(`<span class="hi">${a} ${op} ${b} = ${shown}</span>`);
    const row=document.createElement('div'); row.className='choice-row';
    [['TRUE',true],['FALSE',false]].forEach(([l,v])=>{ const c=document.createElement('button'); c.className='choice'; c.textContent=l; c.onclick=e=>{ const ok=v===truthy; c.classList.add(ok?'hit':'miss'); ctx.done(ok,e); }; row.appendChild(c); });
    arena.appendChild(row);
  }},
  /* stroop: tap the COLOR the word is shown in, not the word */
  stroop: { base:2400, setup(ctx){
    const cols=[['CYAN','#00f0ff'],['PINK','#ff2bd6'],['LIME','#39ff88'],['GOLD','#ffd23f'],['RED','#ff3b5c'],['WHITE','#ffffff']];
    const word=pick(cols,ctx.rng), ink=pick(cols,ctx.rng), lie=ctx.lie; const want = lie? word : ink;
    setInstr(lie? `tap what it <span class="hi">SAYS</span>` : `tap the <span class="hi">COLOR</span> it's in`);
    const w=document.createElement('div'); w.className='bigword color'; w.style.setProperty('--word-col',ink[1]); w.textContent=word[0]; w.style.marginBottom='18px';
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px;width:100%'; wrap.appendChild(w);
    const opts=[want]; while(opts.length<3){ const o=pick(cols,ctx.rng); if(!opts.includes(o)) opts.push(o); } opts.sort(()=>ctx.rng()-0.5);
    const row=document.createElement('div'); row.className='choice-row'; opts.forEach(o=>{ const c=document.createElement('button'); c.className='choice'; c.textContent=o[0]; c.style.color=o[1]; c.onclick=e=>{ const ok=o===want; c.classList.add(ok?'hit':'miss'); ctx.done(ok,e); }; row.appendChild(c); });
    wrap.appendChild(row); arena.appendChild(wrap);
  }},
  /* hold to fill, release at the line */
  hold: { base:3600, setup(ctx){
    const t=tier(ctx.node); const line=0.35+ctx.rng()*0.5, tol=clamp(0.09-t*0.015,0.035,0.1), rate=0.55+t*0.18; // fill per second
    setInstr(`<span class="hi">HOLD</span> to fill · release at the line`);
    const w=document.createElement('div'); w.className='bar-wrap'; w.innerHTML=`<div class="bar-fill"></div><div class="bar-line" style="left:${line*100}%"></div>`;
    const fill=w.querySelector('.bar-fill'); const tapAny=document.createElement('div'); tapAny.className='tap-any'; arena.appendChild(w); arena.appendChild(tapAny);
    let holding=false, v=0, last=0, raf, ended=false;
    function loop(ts){ if(holding){ v+= (ts-last)/1000*rate; fill.style.width=(v*100)+'%'; if(v>=1){ finish(false); return; } } last=ts; raf=requestAnimationFrame(loop); }
    function finish(ok,e){ if(ended) return; ended=true; cancelAnimationFrame(raf); fill.style.background=ok?'var(--ok)':'var(--bad)'; ctx.done(ok,e); }
    tapAny.onpointerdown=e=>{ holding=true; last=performance.now(); raf=requestAnimationFrame(loop); tapAny.setPointerCapture(e.pointerId); };
    tapAny.onpointerup=e=>{ if(!holding) return; holding=false; finish(Math.abs(v-line)<=tol,e); };
    ctx.onCleanup(()=>cancelAnimationFrame(raf));
  }},
};
const GAME_KEYS=Object.keys(GAMES);
const EARLY=['tap','odd','math','arrow'];

/* ===================== RUN LOOP ===================== */
function startRun(daily){
  Audio.ensure();
  Object.assign(Run,{active:true,daily,score:0,combo:0,maxCombo:0,lives:3,node:0,lastType:null,resolved:false,dayKey:todayKey()});
  Run.rng = daily ? mulberry32(hashStr('override:'+Run.dayKey)) : Math.random;
  $$('#integrity i').forEach(i=>i.classList.remove('off'));
  updateHud(); show('game'); Portal.gameplayStart();
  countdown().then(nextNode);
}
async function countdown(){
  clearArena(); setInstr(''); setAi(pick(Run.daily?AI.daily:AI.start));
  for(const n of ['3','2','1','GO']){ clearArena(); const c=document.createElement('div'); c.className='count'; c.textContent=n; arena.appendChild(c); n==='GO'?Audio.go():Audio.tick(); await sleep(n==='GO'?350:500); }
}
function clearArena(){ if(Run.cleanup){ Run.cleanup.forEach(f=>{try{f()}catch(e){}}); } Run.cleanup=[]; arena.innerHTML=''; arena.onpointerdown=null; arena.onpointerup=null; cancelAnimationFrame(Run.timerRaf); }
function updateHud(){ $('#score').textContent=fmt(Run.score); $('#node').textContent='NODE '+(Run.node||1); const mult=comboMult(); $('#combo').textContent= Run.combo>=3? `${Run.combo} COMBO ×${mult.toFixed(1)}`:''; }
function comboMult(){ return 1 + Math.floor(Run.combo/5)*0.5; }

function nextNode(){
  if(!Run.active) return;
  Run.node++; Run.resolved=false; clearArena();
  const n=Run.node;
  let key; do{ key = n<=3 ? pick(EARLY,Run.rng) : pick(GAME_KEYS,Run.rng); }while(key===Run.lastType);
  Run.lastType=key;
  const lie = ['tap','order','arrow','stroop'].includes(key) && isLieNode(n);
  if(n>1 && n%5===0){ setAi(pick(AI.speed,Run.rng)); toast('⚡ SPEED UP',700); } else if(lie && Run.rng()<0.6){ setAi(pick(AI.lie,Run.rng)); }
  updateHud();
  const g=GAMES[key]; const dur=g.base*speedFactor(n);
  let t0=performance.now(); Run.timerPaused=false;
  const ctx={ node:n, rng:Run.rng, lie, onCleanup(f){Run.cleanup.push(f);}, done:(ok,e)=>resolve(ok,e), pauseTimer(){Run.timerPaused=true;}, resumeTimer(){Run.timerPaused=false; t0=performance.now(); } };
  g.setup(ctx);
  let ticked=false;
  (function tick(){ if(Run.resolved||!Run.active) return; if(Run.timerPaused){ timerBar.style.transform='scaleX(1)'; Run.timerRaf=requestAnimationFrame(tick); return; }
    const left=1-(performance.now()-t0)/dur; timerBar.style.transform=`scaleX(${Math.max(0,left)})`;
    if(left<0.3 && !ticked){ ticked=true; Audio.tick(); }
    if(left<=0){ resolve(false,null,true); return; } Run.timerRaf=requestAnimationFrame(tick); })();
  Run._t0=()=>t0; Run._dur=dur;
}
function resolve(ok,e,timeout){
  if(Run.resolved||!Run.active) return; Run.resolved=true; Run.timerPaused=false;
  cancelAnimationFrame(Run.timerRaf); (Run.cleanup||[]).forEach(f=>{try{f()}catch(_){}}); Run.cleanup=[];
  const left = timeout?0: clamp(1-(performance.now()-Run._t0())/Run._dur,0,1);
  const px = e&&e.clientX? e.clientX : innerWidth/2, py = e&&e.clientY? e.clientY : innerHeight/2;
  if(ok){
    Run.combo++; Run.maxCombo=Math.max(Run.maxCombo,Run.combo);
    const pts=Math.round((100 + left*100) * comboMult() * (1+Run.node*0.03));
    Run.score+=pts; arena.classList.remove('flash-ok'); void arena.offsetWidth; arena.classList.add('flash-ok');
    Run.combo>=3? Audio.combo(Run.combo): Audio.ok(); FX.burst(px,py,FX.cssVar('--a'),14+Math.min(Run.combo,20));
    if(Run.node%3===0) setAi(pick(AI.ok,Run.rng));
    floatText('+'+pts, px, py);
  } else {
    Run.combo=0; Run.lives--; $$('#integrity i')[Run.lives]?.classList.add('off');
    arena.classList.remove('flash-bad'); void arena.offsetWidth; arena.classList.add('flash-bad'); FX.shake(); Audio.bad(); FX.burst(px,py,FX.cssVar('--bad'),24,8);
    setAi(timeout?'Too slow.':pick(AI.bad,Run.rng)); if(navigator.vibrate) try{navigator.vibrate(60)}catch(_){}
  }
  updateHud();
  if(Run.lives<=0){ setTimeout(gameOver,600); return; }
  setTimeout(nextNode, ok?260:520);
}
function floatText(txt,x,y){ const d=document.createElement('div'); d.textContent=txt; d.style.cssText=`position:fixed;left:${x}px;top:${y}px;transform:translate(-50%,-50%);font:900 22px var(--mono);color:var(--warn);z-index:8;pointer-events:none;transition:all .6s ease-out;text-shadow:0 0 10px var(--warn)`; document.body.appendChild(d); requestAnimationFrame(()=>{ d.style.top=(y-70)+'px'; d.style.opacity='0'; }); setTimeout(()=>d.remove(),650); }

/* ===================== GAME OVER ===================== */
let lastResult=null;
async function gameOver(){
  Run.active=false; clearArena(); Portal.gameplayStop(); Audio.over();
  const nodes=Run.node-1; const isBest=Run.score>save.best;
  save.runs++; if(isBest) save.best=Run.score; save.maxCombo=Math.max(save.maxCombo,Run.maxCombo);
  // day streak
  const today=todayKey(); if(save.lastDay!==today){ const y=new Date(Date.now()-864e5).toISOString().slice(0,10); save.dayStreak = save.lastDay===y ? save.dayStreak+1 : 1; save.lastDay=today; }
  if(Run.daily){ save.daily[today]={score:Run.score,nodes,submitted:false}; }
  const gained=Math.round(Run.score/30 + nodes*4); const prog=addXp(gained); persist();
  lastResult={score:Run.score,nodes,daily:Run.daily,combo:Run.maxCombo,best:isBest};
  $('#over-eyebrow').textContent = Run.daily? '// DAILY BREACH COMPLETE' : isBest? '// NEW RECORD LOGGED' : '// CONNECTION TERMINATED';
  $('#over-score').textContent=fmt(Run.score); $('#over-sub').textContent=`${nodes} nodes breached`;
  $('#over-taunt').textContent = isBest? pick(AI.best) : pick(AI.over);
  $('#o-best').textContent=fmt(save.best); $('#o-combo').textContent=Run.maxCombo; $('#o-xp').textContent='+'+gained;
  const need=xpForLevel(save.level); $('#xp-label').textContent=`LVL ${save.level} · ${save.xp}/${need}`; $('#xp-fill').style.width='0%'; setTimeout(()=>$('#xp-fill').style.width=(save.xp/need*100)+'%',80);
  const un=$('#unlock-note'); un.textContent = prog.newlyUnlocked.length? `🔓 THEME UNLOCKED: ${prog.newlyUnlocked.map(t=>t.name).join(', ')}` : prog.leveled.length? `▲ LEVEL ${save.level}` : '';
  if(prog.leveled.length){ Audio.level(); Portal.happytime(); }
  const ds=$('#daily-submit'); ds.classList.toggle('hidden', !(Run.daily && Backend.enabled())); $('#submit-status').textContent=''; $('#name-input').value=save.tag||'';
  $('#btn-again').textContent = Run.daily? 'ENDLESS RUN' : 'AGAIN';
  show('over'); refreshHome();
  if(save.runs % CONFIG.ADS_EVERY_N_RUNS===0) await Portal.adBreak();
}

/* ===================== SHARE ===================== */
async function shareResult(){
  if(!lastResult) return; const r=lastResult;
  const bars='▮'.repeat(Math.min(10,Math.ceil(r.nodes/3)))+'▯'.repeat(Math.max(0,10-Math.ceil(r.nodes/3)));
  const text=`OVERRIDE ${r.daily?'DAILY BREACH '+todayKey():''}\n${bars} ${fmt(r.score)} pts · ${r.nodes} nodes${r.combo>=5?' · '+r.combo+'x combo':''}\nThink you can beat the AI? ${CONFIG.SHARE_URL}`;
  const file = await renderCard(r).catch(()=>null);
  try{
    if(file && navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file],text}); return; }
    if(navigator.share){ await navigator.share({text}); return; }
  }catch(e){ if(e&&e.name==='AbortError') return; }
  try{ await navigator.clipboard.writeText(text); toast('COPIED — paste it anywhere'); }catch(e){ toast('Share not supported here'); }
}
async function renderCard(r){
  const c=document.createElement('canvas'); c.width=1080; c.height=1350; const x=c.getContext('2d');
  const a=FX.cssVar('--a'), b=FX.cssVar('--b'), bg=FX.cssVar('--bg');
  x.fillStyle=bg; x.fillRect(0,0,1080,1350);
  const g=x.createRadialGradient(540,-100,50,540,-100,900); g.addColorStop(0,a+'55'); g.addColorStop(1,'transparent'); x.fillStyle=g; x.fillRect(0,0,1080,1350);
  x.textAlign='center'; x.fillStyle='#7d879e'; x.font='600 34px monospace'; x.fillText(r.daily?'// DAILY BREACH '+todayKey():'// CONNECTION TERMINATED',540,180);
  x.font='900 150px sans-serif'; x.fillStyle=a; x.fillText('OVER',540-160,340); x.fillStyle=b; x.fillText('RIDE',540+170,340);
  x.fillStyle='#fff'; x.font='900 260px sans-serif'; x.fillText(fmt(r.score),540,720);
  x.fillStyle='#7d879e'; x.font='600 40px monospace'; x.fillText(`${r.nodes} NODES BREACHED · ${r.combo}x COMBO`,540,800);
  x.fillStyle=a; x.font='800 44px sans-serif'; x.fillText('think you can beat the AI?',540,1000);
  x.fillStyle='#7d879e'; x.font='600 34px monospace'; x.fillText(CONFIG.SHARE_URL.replace(/^https?:\/\//,''),540,1160);
  const blob=await new Promise(res=>c.toBlob(res,'image/png')); return new File([blob],'override.png',{type:'image/png'});
}

/* ===================== HOME / BOARD / THEMES ===================== */
function refreshHome(){
  $('#s-best').textContent=fmt(save.best); $('#s-streak').textContent=save.dayStreak; $('#s-runs').textContent=save.runs; $('#home-level').textContent='LVL '+save.level;
  $('#home-taunt').textContent=pick(AI.home); $('#btn-sound').textContent=save.sound?'🔊':'🔇';
  const d=save.daily[todayKey()]; $('#daily-sub').textContent = d? `done today · ${fmt(d.score)} pts` : 'same run for everyone · 1 attempt';
}
async function refreshStats(){ const s=await Backend.stats(todayKey()); $('#players-today').textContent = s&&s.players? `${fmt(s.players)} HUMANS BREACHED TODAY` : ''; }
async function openBoard(){
  show('board'); $('#board-date').textContent='// '+todayKey()+' UTC'; const list=$('#board-list'); list.innerHTML='<li class="muted">loading…</li>';
  if(!Backend.enabled()){ list.innerHTML='<li class="muted">global board offline — play the daily run for your local score</li>'; $('#board-note').textContent=''; return; }
  const s=await Backend.stats(todayKey());
  if(!s){ list.innerHTML='<li class="muted">could not reach the board</li>'; return; }
  list.innerHTML=''; (s.top||[]).forEach((e,i)=>{ const li=document.createElement('li'); if(save.tag&&e.name===save.tag) li.classList.add('me'); li.innerHTML=`<span class="rank">${String(i+1).padStart(2,'0')}</span><span class="nm">${escapeHtml(e.name)}</span><span class="sc">${fmt(e.score)}</span>`; list.appendChild(li); });
  if(!s.top||!s.top.length) list.innerHTML='<li class="muted">nobody yet — be first</li>';
  $('#board-note').textContent=`${fmt(s.players||0)} players today · resets midnight UTC`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderThemes(){
  const g=$('#theme-grid'); g.innerHTML='';
  THEMES.forEach(t=>{ const locked=!save.unlocked.includes(t.id); const d=document.createElement('button'); d.className='theme'+(locked?' locked':'')+(save.theme===t.id?' sel':'');
    d.innerHTML=`<div class="sw"><i style="background:${t.a}"></i><i style="background:${t.b}"></i><i style="background:${t.bg};border:1px solid #333"></i></div><b>${t.name}</b><span>${locked?'UNLOCK AT LVL '+t.lvl:'UNLOCKED'}</span>`;
    d.onclick=()=>{ if(locked){ toast(`reach LVL ${t.lvl}`); return; } save.theme=t.id; persist(); applyTheme(t.id); renderThemes(); Audio.tap(); }; g.appendChild(d); });
}

/* ===================== WIRING ===================== */
$('#btn-play').onclick=()=>startRun(false);
$('#btn-daily').onclick=()=>{ const d=save.daily[todayKey()]; if(d){ toast(`already breached today: ${fmt(d.score)}`); openBoard(); return; } startRun(true); };
$('#btn-board').onclick=openBoard; $('#btn-board-back').onclick=()=>show('home');
$('#btn-themes').onclick=()=>{ renderThemes(); show('themes'); }; $('#btn-themes-back').onclick=()=>show('home');
$('#btn-sound').onclick=()=>{ save.sound=!save.sound; Audio.setMuted(!save.sound); persist(); refreshHome(); Audio.ensure(); Audio.tap(); };
$('#btn-again').onclick=()=>startRun(false); $('#btn-home').onclick=()=>{ refreshHome(); show('home'); refreshStats(); };
$('#btn-share').onclick=shareResult;
$('#btn-submit').onclick=async()=>{ const name=$('#name-input').value.trim().replace(/[^\w\-]/g,'').slice(0,12); if(!name){ toast('enter a tag'); return; } const d=save.daily[todayKey()]; if(!d||d.submitted){ toast('already submitted'); return; }
  $('#submit-status').textContent='sending…'; const r=await Backend.submit(todayKey(),name,d.score,d.nodes);
  if(r&&r.ok){ d.submitted=true; save.tag=name; persist(); $('#submit-status').textContent=`on the board · rank #${r.rank||'?'}`; toast('SUBMITTED'); } else { $('#submit-status').textContent='failed: '+(r&&r.reason||'unknown'); } };
addEventListener('keydown',e=>{ if(e.key===' '&&!Run.active&&$('#home').classList.contains('active')){ e.preventDefault(); startRun(false);} });
document.addEventListener('visibilitychange',()=>{ if(document.hidden&&Run.active){ Run.lives=0; gameOver(); } });
document.addEventListener('contextmenu',e=>e.preventDefault());

applyTheme(save.theme); Audio.setMuted(!save.sound); refreshHome(); refreshStats(); Portal.init();
