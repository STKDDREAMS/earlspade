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
const OVER_LINE_OFF    = 6;     // game-over line sits this far below the box rim
const OVER_SECONDS     = 2.0;   // continuous seconds over the line = game over
const MAX_SPAWN_TIER   = 4;     // tiers 0..4 (1–5 human) can spawn as drops

/* scoring */
const MERGE_POINTS = [1,3,6,10,15,21,28,36,45,55,66]; // points for CREATING tier i (index 1..10 used)
const WATERMELON_BONUS = 500;   // two watermelons vanish -> this bonus

/* world: fixed logical width so gameplay is identical on every screen */
const WORLD_W = 420;
const WALL_T  = 12;             // wall thickness (visual + physical)
/* the CONTAINER is deliberately small — like the real melon game the
   box is snug (about 1.28x taller than wide) so it fills fast and
   losing is always close. Everything above the box rim is open water
   where the next creature hovers. */
const BOX_ASPECT = 1.28;        // box height = WORLD_W * this

/* the 11 tiers: SEA CREATURES, small -> big, ending on the whale shark
   (the brand's hero creature). Physics stays a circle of radius r —
   that's what keeps stacking stable — and each creature's pixel sprite
   is drawn over it. `art` is the pixel map (see PALETTE + buildSprite),
   `over` scales the sprite box relative to the collision circle so
   wide creatures (wings, claws) can overhang a little. */
const PALETTE = {
  K:'#161412',           // ink outline
  W:'#F6F1E6', w:'#DDD8CC',
  B:'#2E5E8C', b:'#4B84B4', L:'#7FB2D9', l:'#A9CBE4',
  T:'#35706B', t:'#5F9D96', a:'#A6D2CB',
  R:'#D70000', r:'#9E0000',
  P:'#E8849C', p:'#F2B8C6',
  G:'#E8B33C', g:'#C4922A',
  N:'#2E5E3F', n:'#4E8B5B', m:'#8FBF7A',
  V:'#7A5AA0', v:'#9C7CC4',
  O:'#E88A2E',
  E:'#FFFFFF',           // eye white
};
const ART = {
bubble: [
"...KKKK...",
".KKaaaaKK.",
".KaaEEaaK.",
"KaaEWWaaaK",
"KaaEWWaaaK",
"KaaaaaaaaK",
".KaaaaaaK.",
".KKaaaaKK.",
"...KKKK...",
],
shrimp: [
"....KKKK....",
"..KKPppPKK..",
".KPpPPPPpPK.",
"KPpPKEKPPPK.",
"KPPPKKKPPpK.",
".KPPPPPPpK..",
"..KKPPPPK...",
"..KpPPPK....",
".KPPPpK.....",
".KppPK......",
"..KKK.......",
],
shell: [
"....KKKKK....",
"..KKwWWWwKK..",
".KwWKWWWKWwK.",
"KwWWKWWWKWWwK",
"KWWWKWWWKWWWK",
"KwWWKWWWKWWwK",
".KwWKWWWKWwK.",
"..KKwWWWwKK..",
"...KKKKKKK...",
"....KGgGK....",
".....KKK.....",
],
crab: [
"KKK.......KKK",
"KrRK.....KRrK",
"KRRK.....KRRK",
".KRKKKKKKKRK.",
"..KRRRRRRRK..",
".KRREKREKRRK.",
"KRRREKREKRRRK",
"KRrRRRRRRRrRK",
".KRRRRRRRRRK.",
"..KKKKKKKKK..",
".KK.KK.KK.KK.",
],
seahorse: [
"....KKKK....",
"...KGgGGK...",
"..KGGEKGGK..",
"..KGGKKGKK..",
"...KGGGGKgK.",
"....KGGK.KK.",
"...KGGGK....",
"..KGGGGK....",
".KGgGGK.....",
".KGGGK......",
".KgGGGK.....",
"..KGGGGK....",
"...KGgGK....",
"....KKGK....",
".....KK.....",
],
puffer: [
"..K..KK..K..",
".KOK KK KOK.".replace(' ','.').replace(' ','.'),
"..KOOOOOOK..",
".KOEKOOEKOK.",
"KOOOOOOOOOOK",
"KOOOKOOKOOOK",
".KOOOOOOOOK.",
"..KOOOOOOK..",
".KOK.KK.KOK.",
"..K..KK..K..",
],
jellyfish: [
"....KKKKK....",
"..KKvVVVvKK..",
".KvVVVVVVVvK.",
"KvVVEKVKEVVvK",
"KVVVKKVKKVVVK",
"KVVVVVVVVVVVK",
".KKKKKKKKKKK.",
".KvK.KvK.KvK.",
".KVK.KVK.KVK.",
"..KvK.KvK....",
"..KVK.KVK....",
"...K...K.....",
],
idol: [
"........KKK...",
".......KWWK...",
"......KWWK....",
".....KWWK.....",
"..KKKWWKKKK...",
".KWWKKWWKGGK..",
"KWWWKKWWKGGKK.",
"KWEKKKWWKGGKBK",
"KWWWKKWWKGGKK.",
".KWWKKWWKGGK..",
"..KKKKKKKKK...",
],
turtle: [
"....KKKKKK....",
"..KKnNNNNnKK..",
".KnNGNNGNNnK..",
"KnNNNNNNNNNnK.",
"KNGNNGGNNGNNKK",
"KnNNNNNNNNNnKEK",
".KnNGNNGNNnK.KK",
"..KKnNNNnKK...",
"..K.KKKK.K....",
".KK......KK...",
],
ray: [
"K...........K",
"KK.........KK",
"KbK.......KbK",
"KbbK..K..KbbK",
"KbbbKKBKKbbbK",
".KbbBBEBBbbK.",
".KbBBBBBBBbK.",
"..KbBWBWBbK..",
"...KbBBBbK...",
"....KbBbK....",
".....KbK.....",
".....KbK.....",
".....KbK.....",
"......K......",
],
whale: [
"....KKKKKKKKK.......",
"..KKBBBBBBBBBKK.....",
".KBBWBBWBBWBBBBK.KK.",
"KBBBBBBBBBBBBBBKKBK.",
"KBEKBWBBWBBWBBBBBBK.",
"KBKKBBBBBBBBBBBBBK..",
"KBBBBBBBBBBBBBBBBK..",
"KWWWBBWBBWBBBBBBBBK.",
".KWWWWWWWWWBBBKKKBK.",
"..KKWWWWWWWWBK...KK.",
"....KKKKKKKKK.......",
],
};
const TIERS = [
  { name:'bubble',     r:15,  art:'bubble',    over:1.00 },
  { name:'shrimp',     r:21,  art:'shrimp',    over:1.05 },
  { name:'shell',      r:28,  art:'shell',     over:1.02 },
  { name:'crab',       r:35,  art:'crab',      over:1.15 },
  { name:'seahorse',   r:44,  art:'seahorse',  over:1.05 },
  { name:'puffer',     r:54,  art:'puffer',    over:1.08 },
  { name:'jellyfish',  r:64,  art:'jellyfish', over:1.05 },
  { name:'moorish idol',r:76, art:'idol',      over:1.08 },
  { name:'turtle',     r:89,  art:'turtle',    over:1.10 },
  { name:'eagle ray',  r:103, art:'ray',       over:1.15 },
  { name:'whale shark',r:118, art:'whale',     over:1.10 },
];

/* Each sprite is rasterised ONCE onto an offscreen canvas (8px per
   pixel-cell, comfortably above any on-screen size), then stamped with
   drawImage each frame — cheap, and with imageSmoothing disabled the
   pixels stay razor sharp at any scale. */
const SPRITES = TIERS.map(t => buildSprite(ART[t.art]));
function buildSprite(rows){
  const CELL = 8;
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const size = Math.max(w, h);                 // square canvas, art centered
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * CELL;
  const g = cv.getContext('2d');
  const ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
  for(let y = 0; y < h; y++){
    const row = rows[y];
    for(let x = 0; x < row.length; x++){
      const ch = row[x];
      if(ch === '.' || ch === ' ') continue;
      g.fillStyle = PALETTE[ch] || '#000';
      g.fillRect((ox + x) * CELL, (oy + y) * CELL, CELL, CELL);
    }
  }
  return cv;
}
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
let BOX_TOP = 0;               // world y of the container rim
function buildWorld(){
  engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = GRAVITY_Y;
  world = engine.world;
  WORLD_H = worldHeightFromContainer();
  /* the box hangs from the floor up; rim sits BOX_ASPECT * width above
     it (clamped so there's always headroom to aim above the rim). */
  const boxH = Math.min(WORLD_W * BOX_ASPECT, WORLD_H - 150);
  BOX_TOP = WORLD_H - boxH;
  const opts = { isStatic: true, friction: FRICTION, restitution: 0 };
  Composite.add(world, [
    Bodies.rectangle(WORLD_W/2, WORLD_H + WALL_T/2, WORLD_W * 2, WALL_T, opts),          // floor
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
  const lineY = BOX_TOP + OVER_LINE_OFF;
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
function drawFruitAt(c, x, y, r, tier, angle){
  const s = SPRITES[tier];
  const d = r * 2 * TIERS[tier].over;
  c.save();
  c.translate(x, y);
  if(angle) c.rotate(angle);
  c.imageSmoothingEnabled = false;             // razor-sharp pixels
  c.drawImage(s, -d/2, -d/2, d, d);
  c.restore();
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

  /* the container: ink walls from the rim down + floor; a small lip
     marks the rim so the box reads as a vessel sitting in open water */
  ctx.fillStyle = '#161412';
  ctx.fillRect(0, BOX_TOP, WALL_T, WORLD_H - BOX_TOP);
  ctx.fillRect(WORLD_W - WALL_T, BOX_TOP, WALL_T, WORLD_H - BOX_TOP);
  ctx.fillRect(0, WORLD_H - 4, WORLD_W, 4);
  ctx.fillRect(0, BOX_TOP, WALL_T * 2, 4);
  ctx.fillRect(WORLD_W - WALL_T * 2, BOX_TOP, WALL_T * 2, 4);

  /* game-over line — subtle dashes; red flash while threatened */
  const lineY = BOX_TOP + OVER_LINE_OFF;
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
    drawFruitAt(ctx, b.position.x, b.position.y, r, b.tier, b.angle);
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
    worldH(){ return WORLD_H; },
    boxTop(){ return BOX_TOP; }
  };
}

/* go */
resize();
reset();
})();
