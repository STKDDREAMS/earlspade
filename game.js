/* ============================================================
   earlspade — the fruit game (Suika-style).
   Matter.js physics + canvas rendering. Mobile-first.

   Everything you'd want to tweak lives in the CONSTANTS block
   right below: physics feel, tier sizes/colors/points, timings.
============================================================ */
(function(){
'use strict';
const { Engine, Bodies, Body, Composite, Events } = Matter;

/* ================= TUNABLES ================= */
/* physics feel */
const GRAVITY_Y       = 1.0;   // gentle gravity — fruits settle, don't slam
const RESTITUTION     = 0.2;   // low bounce so stacks calm down quickly
const FRICTION        = 0.5;   // sliding friction between fruits
const FRICTION_STATIC = 0.6;   // grip once resting
const AIR_FRICTION    = 0.01;  // slight air drag stabilises tall stacks

/* pacing */
const DROP_COOLDOWN_MS = 500;   // min time between drops (no spamming)
const OVER_LINE_FRAC   = 0.14;  // game-over line, fraction of world height
const OVER_SECONDS     = 2.0;   // continuous seconds over the line = game over
const MAX_SPAWN_TIER   = 4;     // tiers 0..4 (1–5 human) can spawn as drops

/* scoring */
const MERGE_POINTS = [1,3,6,10,15,21,28,36,45,55,66]; // points for CREATING tier i (index 1..10 used)
const WATERMELON_BONUS = 500;   // two watermelons vanish -> this bonus

/* world: fixed logical width so gameplay is identical on every screen */
const WORLD_W = 420;
const WALL_T  = 12;             // wall thickness (visual + physical)

/* the 11 tiers: cherry -> watermelon.
   radius in world units; color is the flat circle; emoji is the face. */
const TIERS = [
  { name:'cherry',     r:15,  color:'#C22F3B', emoji:'🍒' },
  { name:'strawberry', r:21,  color:'#D7404F', emoji:'🍓' },
  { name:'grape',      r:28,  color:'#8656A8', emoji:'🍇' },
  { name:'dekopon',    r:35,  color:'#E8A23C', emoji:'🍊' },
  { name:'orange',     r:44,  color:'#E88A2E', emoji:'🍊' },
  { name:'apple',      r:54,  color:'#C22F3B', emoji:'🍎' },
  { name:'pear',       r:64,  color:'#A8B84B', emoji:'🍐' },
  { name:'peach',      r:76,  color:'#EFA3A8', emoji:'🍑' },
  { name:'pineapple',  r:89,  color:'#E3B84B', emoji:'🍍' },
  { name:'melon',      r:103, color:'#9BBF6A', emoji:'🍈' },
  { name:'watermelon', r:118, color:'#3E7C4F', emoji:'🍉' },
];
/* spawn odds for tiers 0..4 — favor the small ones */
const SPAWN_WEIGHTS = [5,3,2,1,1];

/* effects budgets (kept cheap for phones) */
const MAX_PARTICLES = 80;
const SHAKE_TIER    = 7;   // merges creating tier >= this shake the screen

/* localStorage keys */
const KEY_BEST  = 'earlspade_game_best_v1';
const KEY_NAME  = 'earlspade_player_v1';
const KEY_SOUND = 'earlspade_game_sound_v1';

/* ================= STATE ================= */
const playEl  = document.getElementById('play');
const canvas  = document.getElementById('game');
const ctx     = canvas.getContext('2d');
const nextCv  = document.getElementById('nextPrev');
const nextCtx = nextCv.getContext('2d');

let engine, world;
let cssW = 0, cssH = 0;        // canvas CSS size
let scale = 1;                  // css px per world unit
let WORLD_H = 600;              // set from container aspect
let running = false, over = false;
let score = 0, best = +(localStorage.getItem(KEY_BEST) || 0);
let heldTier = 0, nextTier = 0; // current aimed fruit + preview
let aimX = WORLD_W / 2;
let canDrop = true, lastDrop = 0, dropped = false;
let bodies = [];                // our fruit bodies (subset of world bodies)
let overTimers = new Map();     // body.id -> seconds its center has been over the line
let anyOverLine = false;
let particles = [], popups = [];
let shake = 0;
let popTweens = new Map();      // body.id -> birth time (scale-pop)
let rafId = null, lastT = 0, acc = 0;
const STEP = 1000 / 60;         // fixed physics step
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= AUDIO (synth, no files) ================= */
let actx = null;
let soundOn = (localStorage.getItem(KEY_SOUND) || 'on') === 'on';
function audio(){ if(!actx){ try{ actx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return actx; }
function blip(freq0, freq1, dur, gain){
  if(!soundOn) return;
  const a = audio(); if(!a) return;
  if(a.state === 'suspended') a.resume();
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq0, t);
  o.frequency.exponentialRampToValueAtTime(freq1, t + dur * 0.8);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const sndDrop  = () => blip(180, 90, 0.1, 0.08);              // soft thock
const sndMerge = (tier) => blip(240 + tier * 60, 480 + tier * 80, 0.16, 0.1); // pitch rises with tier
const sndBig   = () => { blip(320, 900, 0.35, 0.12); blip(200, 600, 0.5, 0.08); };

const muteBtn = document.getElementById('muteBtn');
function paintMute(){ muteBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); muteBtn.innerHTML = soundOn ? '&#9834;' : '&#215;'; }
muteBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem(KEY_SOUND, soundOn ? 'on' : 'off');
  paintMute();
});
paintMute();

/* ================= SIZING ================= */
function resize(){
  const r = playEl.getBoundingClientRect();
  cssW = r.width; cssH = r.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = cssW / WORLD_W;
}

/* world height derives from the container ONCE per run, so physics is
   consistent within a run even if browser chrome moves. */
function worldHeightFromContainer(){
  const r = playEl.getBoundingClientRect();
  return Math.max(520, WORLD_W * (r.height / r.width));
}

/* ================= WORLD SETUP ================= */
function buildWorld(){
  engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = GRAVITY_Y;
  world = engine.world;
  WORLD_H = worldHeightFromContainer();
  const opts = { isStatic: true, friction: FRICTION, restitution: 0 };
  Composite.add(world, [
    Bodies.rectangle(WORLD_W/2, WORLD_H + WALL_T/2, WORLD_W * 2, WALL_T, opts),          // floor
    Bodies.rectangle(-WALL_T/2 + WALL_T/2 - WALL_T/2, 0, 0, 0, opts),                     // (placeholder, unused)
    Bodies.rectangle(WALL_T/2 - WALL_T, WORLD_H/2, WALL_T*2, WORLD_H * 3, opts),          // left wall
    Bodies.rectangle(WORLD_W - WALL_T/2 + WALL_T, WORLD_H/2, WALL_T*2, WORLD_H * 3, opts) // right wall
  ]);
  Events.on(engine, 'collisionStart', onCollisions);
  Events.on(engine, 'collisionActive', onCollisions);
}

function fruitBody(tier, x, y){
  const t = TIERS[tier];
  const b = Bodies.circle(x, y, t.r, {
    restitution: RESTITUTION,
    friction: FRICTION,
    frictionStatic: FRICTION_STATIC,
    frictionAir: AIR_FRICTION,
    density: 0.0012,
  });
  b.tier = tier;
  b.merging = false;
  return b;
}

/* ================= MERGING ================= */
function onCollisions(ev){
  if(over) return;
  for(const pair of ev.pairs){
    const a = pair.bodyA, b = pair.bodyB;
    if(a.tier === undefined || b.tier === undefined) continue;
    if(a.tier !== b.tier) continue;
    if(a.merging || b.merging) continue;   // guard: 3 touching -> only one pair merges
    a.merging = b.merging = true;
    const tier = a.tier;
    const mx = (a.position.x + b.position.x) / 2;
    const my = (a.position.y + b.position.y) / 2;
    const vx = (a.velocity.x + b.velocity.x) / 2;
    const vy = (a.velocity.y + b.velocity.y) / 2;
    removeFruit(a); removeFruit(b);

    if(tier === TIERS.length - 1){
      /* two watermelons — clear them, big bonus, celebrate */
      addScore(WATERMELON_BONUS, mx, my);
      celebrate(mx, my);
      sndBig();
      shake = reduceMotion ? 0 : 14;
      continue;
    }
    const nt = tier + 1;
    const nb = fruitBody(nt, mx, my);
    Body.setVelocity(nb, { x: vx, y: vy });
    Composite.add(world, nb);
    bodies.push(nb);
    popTweens.set(nb.id, performance.now());
    addScore(MERGE_POINTS[nt], mx, my - TIERS[nt].r);
    burst(mx, my, TIERS[nt].color, Math.min(12, 5 + nt));
    sndMerge(nt);
    if(nt >= SHAKE_TIER && !reduceMotion) shake = Math.max(shake, 6);
  }
}
function removeFruit(b){
  Composite.remove(world, b);
  const i = bodies.indexOf(b);
  if(i > -1) bodies.splice(i, 1);
  overTimers.delete(b.id);
  popTweens.delete(b.id);
}

/* ================= SCORE / HUD ================= */
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
function addScore(n, x, y){
  score += n;
  scoreEl.textContent = score;
  if(score > best){ best = score; bestEl.textContent = best; localStorage.setItem(KEY_BEST, String(best)); }
  popups.push({ x, y, n, t: 0 });
}
bestEl.textContent = best;

/* ================= SPAWNING / AIMING ================= */
function rollSpawnTier(){
  const total = SPAWN_WEIGHTS.reduce((a,b)=>a+b,0);
  let r = Math.random() * total;
  for(let i = 0; i <= MAX_SPAWN_TIER; i++){ r -= SPAWN_WEIGHTS[i]; if(r < 0) return i; }
  return 0;
}
function paintNext(){
  const t = TIERS[nextTier];
  const s = nextCv.width;
  nextCtx.clearRect(0,0,s,s);
  drawFruitAt(nextCtx, s/2, s/2, s*0.42, nextTier);
}
function promoteNext(){
  heldTier = nextTier;
  nextTier = rollSpawnTier();
  paintNext();
}
function clampAim(x){
  const r = TIERS[heldTier].r;
  return Math.max(WALL_T + r, Math.min(WORLD_W - WALL_T - r, x));
}
function drop(){
  if(!canDrop || over) return;
  const now = performance.now();
  if(now - lastDrop < DROP_COOLDOWN_MS) return;
  lastDrop = now; canDrop = false;
  const x = clampAim(aimX);
  const b = fruitBody(heldTier, x, TIERS[heldTier].r + 6);
  Composite.add(world, b);
  bodies.push(b);
  sndDrop();
  if(!dropped){ dropped = true; document.getElementById('howto').classList.add('off'); }
  setTimeout(() => { promoteNext(); canDrop = true; }, DROP_COOLDOWN_MS);
}

/* ================= INPUT ================= */
/* Touch: drag anywhere on the play area to aim; release drops.
   Mouse: move to aim, click to drop. */
function eventWorldX(e){
  const r = canvas.getBoundingClientRect();
  // touchend has an EMPTY (but truthy) e.touches, so prefer touches only
  // when it actually has a point; else fall back to changedTouches / mouse.
  let cx;
  if(e.touches && e.touches.length)            cx = e.touches[0].clientX;
  else if(e.changedTouches && e.changedTouches.length) cx = e.changedTouches[0].clientX;
  else                                          cx = e.clientX;
  return (cx - r.left) / scale;
}
canvas.addEventListener('touchstart', e => { e.preventDefault(); aimX = clampAim(eventWorldX(e)); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); aimX = clampAim(eventWorldX(e)); }, { passive: false });
canvas.addEventListener('touchend',   e => { e.preventDefault(); if(e.changedTouches.length) aimX = clampAim(eventWorldX(e)); drop(); }, { passive: false });
canvas.addEventListener('mousemove', e => { aimX = clampAim(eventWorldX(e)); });
canvas.addEventListener('mousedown', e => { aimX = clampAim(eventWorldX(e)); drop(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

/* ================= EFFECTS ================= */
function burst(x, y, color, n){
  for(let i = 0; i < n && particles.length < MAX_PARTICLES; i++){
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
    particles.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 1.5, r: 2 + Math.random()*3, color, life: 1 });
  }
}
function celebrate(x, y){
  const colors = ['#D70000', '#E8B33C', '#5F9D96', '#EDE7DA'];
  for(let i = 0; i < 40 && particles.length < MAX_PARTICLES; i++){
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 3, r: 2.5 + Math.random()*3.5,
      color: colors[i % colors.length], life: 1.6 });
  }
}

/* ================= GAME OVER ================= */
function checkOverLine(dt){
  const lineY = WORLD_H * OVER_LINE_FRAC;
  anyOverLine = false;
  for(const b of bodies){
    if(b.position.y - 0 < lineY && b.speed < 4){
      anyOverLine = true;
      const t = (overTimers.get(b.id) || 0) + dt;
      overTimers.set(b.id, t);
      if(t >= OVER_SECONDS){ endGame(); return; }
    }else{
      overTimers.delete(b.id);
    }
  }
}

/* ================= RENDER ================= */
function drawFruitAt(c, x, y, r, tier){
  const t = TIERS[tier];
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = t.color; c.fill();
  c.lineWidth = Math.max(1.5, r * 0.06);
  c.strokeStyle = 'rgba(22,20,18,.55)'; c.stroke();
  c.font = `${Math.round(r * 1.1)}px serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(t.emoji, x, y + r * 0.05);
}
function render(now){
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.save();
  if(shake > 0){
    ctx.translate((Math.random()-.5) * shake, (Math.random()-.5) * shake);
    shake *= 0.85; if(shake < .4) shake = 0;
  }
  ctx.save();
  ctx.scale(scale, scale);

  /* walls + floor (ink) */
  ctx.fillStyle = '#161412';
  ctx.fillRect(0, 0, WALL_T, WORLD_H);
  ctx.fillRect(WORLD_W - WALL_T, 0, WALL_T, WORLD_H);
  ctx.fillRect(0, WORLD_H - 2, WORLD_W, 2);

  /* game-over line — subtle dashes; red flash while threatened */
  const lineY = WORLD_H * OVER_LINE_FRAC;
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = anyOverLine
    ? (Math.floor(now / 180) % 2 ? 'rgba(215,0,0,.85)' : 'rgba(215,0,0,.25)')
    : 'rgba(22,20,18,.18)';
  ctx.beginPath(); ctx.moveTo(WALL_T, lineY); ctx.lineTo(WORLD_W - WALL_T, lineY); ctx.stroke();
  ctx.restore();

  /* aim guide + held fruit (only when droppable) */
  if(!over){
    const hx = clampAim(aimX), hr = TIERS[heldTier].r;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = '#161412'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx, hr * 2 + 10); ctx.lineTo(hx, WORLD_H - 4); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = canDrop ? 1 : 0.45;
    drawFruitAt(ctx, hx, hr + 6, hr, heldTier);
    ctx.globalAlpha = 1;
  }

  /* fruits (with scale-pop on fresh merges) */
  for(const b of bodies){
    let r = TIERS[b.tier].r;
    const born = popTweens.get(b.id);
    if(born !== undefined){
      const p = (now - born) / 220;                 // 220ms pop
      if(p >= 1){ popTweens.delete(b.id); }
      else { r *= 1 + 0.22 * Math.sin(Math.min(1, p) * Math.PI); }
    }
    drawFruitAt(ctx, b.position.x, b.position.y, r, b.tier);
  }

  /* particles */
  for(let i = particles.length - 1; i >= 0; i--){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.025;
    if(p.life <= 0){ particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.r/2, p.y - p.r/2, p.r, p.r);   // square = pixel confetti
  }
  ctx.globalAlpha = 1;

  /* score popups */
  ctx.font = '13px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  for(let i = popups.length - 1; i >= 0; i--){
    const p = popups[i];
    p.t += 0.02;
    if(p.t >= 1){ popups.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - p.t;
    ctx.fillStyle = '#161412';
    ctx.fillText('+' + p.n, p.x, p.y - p.t * 46);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.restore();
}

/* ================= MAIN LOOP ================= */
/* fixed-step physics with an accumulator; dt capped so a hitch can't
   explode the simulation. */
function loop(now){
  rafId = requestAnimationFrame(loop);
  if(!lastT) lastT = now;
  let dt = now - lastT;
  lastT = now;
  if(dt > 100) dt = 100;         // tab was busy — don't fast-forward
  acc += dt;
  let steps = 0;
  while(acc >= STEP && steps < 3){ // cap catch-up work per frame
    Engine.update(engine, STEP);
    checkOverLine(STEP / 1000);
    acc -= STEP; steps++;
  }
  if(steps === 3) acc = 0;
  render(now);
}
function pause(){ if(rafId){ cancelAnimationFrame(rafId); rafId = null; lastT = 0; acc = 0; } }
function resume(){ if(!rafId && running) rafId = requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { document.hidden ? pause() : resume(); });

/* ================= GAME OVER FLOW / LEADERBOARD ================= */
const overDialog = document.getElementById('overDialog');
const finalScoreEl = document.getElementById('finalScore');
const lbStatus = document.getElementById('lbStatus');
const lbList = document.getElementById('lbList');
const nameRow = document.getElementById('nameRow');
const nameInput = document.getElementById('nameInput');
const submitBtn = document.getElementById('submitBtn');
const againBtn = document.getElementById('againBtn');

function endGame(){
  if(over) return;
  over = true;
  running = false;
  blip(300, 80, 0.5, 0.1);
  finalScoreEl.textContent = score;
  overDialog.classList.add('show');
  loadBoard();
}

async function fetchBoard(){
  const res = await fetch('/api/leaderboard', { cache: 'no-store' });
  if(!res.ok) throw new Error('offline');
  const data = await res.json();
  if(!Array.isArray(data)) throw new Error('offline');
  return data;
}
function renderBoard(rows, meName){
  lbList.innerHTML = '';
  rows.forEach(r => {
    const div = document.createElement('div');
    div.className = 'lb-row' + (meName && r.name === meName ? ' me' : '');
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = r.rank;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.score;
    div.append(rk, nm, sc);
    lbList.appendChild(div);
  });
  lbList.style.display = 'block';
}
async function loadBoard(){
  lbStatus.textContent = 'loading the board…';
  lbStatus.style.display = 'block';
  lbList.style.display = 'none';
  nameRow.style.display = 'none';
  try{
    const rows = await fetchBoard();
    const qualifies = score > 0 && (rows.length < 10 || score > rows[rows.length - 1].score);
    if(rows.length){ renderBoard(rows); lbStatus.style.display = 'none'; }
    else { lbStatus.textContent = 'no scores yet — be first'; }
    if(qualifies){
      nameRow.style.display = 'flex';
      nameInput.value = (localStorage.getItem(KEY_NAME) || '');
      submitBtn.disabled = false;
      submitBtn.textContent = 'SAVE';
    }
  }catch(e){
    lbStatus.textContent = 'leaderboard offline';
  }
}
async function submitScore(){
  const name = nameInput.value.trim().slice(0, 16);
  if(!name){ nameInput.focus(); return; }
  submitBtn.disabled = true;                    // no double submits
  submitBtn.textContent = '…';
  localStorage.setItem(KEY_NAME, name);
  try{
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score })
    });
    if(!res.ok) throw new Error('bad');
    const rows = await fetchBoard();
    renderBoard(rows, name);
    lbStatus.style.display = 'none';
    nameRow.style.display = 'none';
  }catch(e){
    lbStatus.textContent = 'couldn’t save — leaderboard offline';
    lbStatus.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'RETRY';
  }
}
submitBtn.addEventListener('click', submitScore);
nameInput.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); submitScore(); } });
/* keep the input visible above the mobile keyboard (dialog already sits
   in the upper half; nudge it into view when focus opens the keyboard) */
nameInput.addEventListener('focus', () => {
  setTimeout(() => { try{ nameInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); }catch(e){} }, 250);
});

/* ================= RESET / START ================= */
function reset(){
  if(engine){ Events.off(engine); Engine.clear(engine); }
  bodies = []; overTimers.clear(); popTweens.clear();
  particles = []; popups = [];
  score = 0; scoreEl.textContent = '0';
  over = false; shake = 0; canDrop = true; lastDrop = 0;
  overDialog.classList.remove('show');
  buildWorld();
  heldTier = rollSpawnTier();
  nextTier = rollSpawnTier();
  paintNext();
  aimX = WORLD_W / 2;
  running = true;
  if(!rafId) rafId = requestAnimationFrame(loop);
}
againBtn.addEventListener('click', reset);

window.addEventListener('resize', () => { resize(); }, { passive: true });

/* debug hooks for automated testing only (?debug=1) */
if(location.search.includes('debug=1')){
  window.__suika = {
    spawn(tier, x, y){ const b = fruitBody(tier, x, y); Composite.add(world, b); bodies.push(b); return b.id; },
    stuck(tier, x, y){ const b = fruitBody(tier, x, y); Body.setStatic(b, true); Composite.add(world, b); bodies.push(b); return b.id; },
    state(){ return { score, over, tiers: bodies.map(b => b.tier), n: bodies.length, canDrop }; },
    drop(x){ aimX = x; lastDrop = 0; canDrop = true; drop(); },
    forceAim(x){ aimX = x; },
    worldH(){ return WORLD_H; }
  };
}

/* go */
resize();
reset();
})();
