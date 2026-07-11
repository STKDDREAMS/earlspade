/* ============================================================
   earlspade — the sea game (Suika-style).
   Matter.js physics + canvas rendering. Mobile-first.

   Everything you'd want to tweak lives in the CONSTANTS block
   right below: physics feel, tier sizes/colors/points, timings,
   scene + box geometry, and the pixel FEATURES for each creature.
============================================================ */
(function(){
'use strict';
const { Engine, Bodies, Body, Composite, Events } = Matter;

/* ================= TUNABLES ================= */
/* physics feel */
const GRAVITY_Y       = 1.0;   // gentle gravity — creatures settle, don't slam
const RESTITUTION     = 0.2;   // low bounce so stacks calm down quickly
const FRICTION        = 0.5;   // sliding friction between creatures
const FRICTION_STATIC = 0.6;   // grip once resting
const AIR_FRICTION    = 0.01;  // slight drag stabilises tall stacks

/* pacing */
const DROP_COOLDOWN_MS = 500;   // min time between drops (no spamming)
const OVER_LINE_OFF    = 6;     // game-over line sits this far below the box rim
const OVER_SECONDS     = 2.0;   // continuous seconds over the line = game over
const BORN_GRACE_MS    = 800;   // a creature's own first moments don't count
                                // (so falling PAST the line doesn't insta-lose)
const MAX_SPAWN_TIER   = 4;     // tiers 0..4 can spawn as drops

/* scoring */
const MERGE_POINTS = [1,3,6,10,15,21,28,36,45,55,66]; // points for CREATING tier i
const WHALE_BONUS  = 500;       // two whale sharks vanish -> this bonus

/* ===== SCENE: a FIXED logical stage that simply ZOOMS to fit any
   screen (letterboxed, centered). Gameplay is pixel-identical on
   every device — the scene never reshapes with the screen ratio. */
const SCENE_W = 480;
const SCENE_H = 760;
/* the box: a small inset vessel sitting in open water — NOT the phone
   borders. Snug on purpose: losing should always be close. */
const WALL_T  = 12;
const BOX_W   = 344;
const BOX_H   = 412;
const BOX_L   = (SCENE_W - BOX_W) / 2;   // left outer edge
const BOX_R   = BOX_L + BOX_W;           // right outer edge
const BOX_BOTTOM = SCENE_H - 128;        // interior floor y (box sits higher)
const BOX_TOP    = BOX_BOTTOM - BOX_H;   // rim y
const IN_L = BOX_L + WALL_T;             // interior bounds
const IN_R = BOX_R - WALL_T;
/* the LEGEND: the whole evolution chain in a row under the box. The
   last two tiers hide behind a "?" secret box until the player has
   actually created them once (remembered in localStorage). */
const LEGEND_Y      = SCENE_H - 62;   // center y of the legend row
const LEGEND_R      = 15;             // mini disc radius
const LEGEND_GAP    = 40;             // spacing between chain entries
const SECRET_FROM   = 9;              // tiers 9+ are secret until made

/* ================= THE CAST =================
   11 round sea creatures, small -> big, ending on the whale shark.
   Every creature is a VISIBLE CIRCLE: the pixel disc is exactly the
   physics circle, with hand-placed features (eyes, claws, spikes,
   fins) stamped on top — some poking just past the rim.
   fill/dk/lt are the disc colors; feat is the feature overlay. */
const INK = '#161412';
const PAL = {
  K:INK, E:'#FFFFFF', W:'#F6F1E6', w:'#DDD8CC',
  B:'#2E5E8C', b:'#24496E', L:'#7FB2D9',
  T:'#35706B', t:'#5F9D96', a:'#A6D2CB',
  R:'#D70000', r:'#9E0000', P:'#E8849C', p:'#C4657E',
  G:'#E8B33C', g:'#C4922A', O:'#E88A2E', o:'#C46E1E',
  N:'#3E7C4F', n:'#2E5E3F', m:'#8FBF7A',
  V:'#7A5AA0', v:'#5E4380',
};

/* sprite grid: 24x24 cells, disc radius 10.5 cells centered at 12,12.
   Feature maps are {ox, oy, rows} stamped onto the disc canvas —
   '.' is transparent, any PAL letter paints, 'X' erases (for skirts). */
const GRID = 24, DISC_R = 10.5, CELL = 10;

const TIERS = [
  { name:'bubble',      r:15,  fill:'#A6D2CB', dk:'#7FB5AE', lt:'#CFE8E2',
    feat:{ ox:6, oy:5, rows:[ 'EEE..', 'EE...', 'E....' ] } },

  { name:'shrimp',      r:21,  fill:'#E8849C', dk:'#C4657E', lt:'#F2B8C6',
    feat:{ ox:0, oy:0, rows:[
      '.........K..K...........',
      '.........K..K...........',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '.......KK...KK..........',
      '.......KK...KK..........',
      '........................',
      '....p.......p...........',
      '....p..KKK..p...........',
      '....pp.....pp...........',
      '.....p.....p............',
      '.....pp...pp............',
    ] } },

  { name:'clam',        r:28,  fill:'#F6F1E6', dk:'#C9C0AE', lt:'#FFFFFF',
    feat:{ ox:0, oy:0, rows:[
      '........................',
      '........................',
      '...........KK...........',
      '..........KKK...........',
      '.......K..KK..K.........',
      '......KK..KK..KK........',
      '......K...KK...K........',
      '.....KK...KK...KK.......',
      '....KK....KK....KK......',
      '....K.....KK.....K......',
      '....K.....KK.....K......',
      '...KK.....KK.....KK.....',
      '...K......KK......K.....',
      '...K......KK......K.....',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '.........gGGg...........',
      '.........KKKK...........',
    ] } },

  { name:'crab',        r:35,  fill:'#D70000', dk:'#9E0000', lt:'#E8404B',
    feat:{ ox:0, oy:0, rows:[
      '......KK......KK........',
      '.....KEK......KEK.......',
      '.....KKK......KKK.......',
      '......K........K........',
      '........................',
      '........................',
      '........................',
      '........................',
      'RRK..................RRK',
      'RRRK................RRRK',
      'KRRR................RRRK',
      'RRK..................RRK',
      '........................',
      '........................',
      '......KK.....KK.........',
      '......KEK...KEK.........',
      '......KKK...KKK.........',
      '........................',
      '.......K.K.K.K..........',
    ] } },

  { name:'sea urchin',  r:44,  fill:'#7A5AA0', dk:'#5E4380', lt:'#9C7CC4',
    feat:{ ox:0, oy:0, rows:[
      '...........KK...........',
      '...........KK...........',
      '....KK.....KK.....KK....',
      '.....KK..........KK.....',
      '......KK........KK......',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '.........KK...KK........',
      'KKK......KK...KK.....KKK',
      'KKK..................KKK',
      '.........KKKKKK.........',
      '........................',
      '........................',
      '........................',
      '........................',
      '......KK........KK......',
      '.....KK..........KK.....',
      '....KK.....KK.....KK....',
      '...........KK...........',
      '...........KK...........',
    ] } },

  { name:'pufferfish',  r:54,  fill:'#E88A2E', dk:'#C46E1E', lt:'#F2AC5E',
    feat:{ ox:0, oy:0, rows:[
      '...........KK...........',
      '...........KK...........',
      '.....KK...........KK....',
      '......KK.........KK.....',
      '........................',
      '........................',
      '........................',
      '......KKK....KKK........',
      '......KEK....KEK........',
      '......KKK....KKK........',
      'KKK..................KKK',
      'KKK..................KKK',
      '..........KKK...........',
      '..........K.K...........',
      '..........KKK...........',
      '........................',
      '........................',
      '......KK.........KK.....',
      '.....KK...........KK....',
      '...........KK...........',
      '...........KK...........',
    ] } },

  { name:'jellyfish',   r:64,  fill:'#9C7CC4', dk:'#7A5AA0', lt:'#BFA6DC',
    feat:{ ox:0, oy:0, rows:[
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '.......KK.....KK........',
      '.......KEK...KEK........',
      '.......KKK...KKK........',
      '........................',
      '.........KKKK...........',
      '........................',
      '........................',
      '...vvv..vvv..vvv..vvv...',
      '........................',
      '...v.v...v....v...v.v...',
      '....v....v....v....v....',
      '....v...v......v...v....',
      '.........v....v.........',
      '....v.....v....v...v....',
      '..........v....v........',
      '.....v.............v....',
      '........................',
    ] } },

  { name:'moorish idol',r:76,  fill:'#F6F1E6', dk:'#C9C0AE', lt:'#FFFFFF',
    feat:{ ox:0, oy:0, rows:[
      '........KKK.............',
      '........KKK.............',
      '.......KKKGG............',
      '.......KKKGG............',
      '......KKKKGG............',
      '......KKKKGGG...........',
      '.....KKKKKGGG...........',
      '.....KKKKKGGG...........',
      '.....KKKK..GGG..........',
      '....KKKK...GGG..........',
      '....KKKK...GGG......KKK.',
      '.KK.KKKK...GGG......KKKK',
      'KEK.KKKK...GGG......KKKK',
      'KKK.KKKK...GGG......KKK.',
      '....KKKK...GGG..........',
      '....KKKKK..GGG..........',
      '.....KKKK..GGG..........',
      '.....KKKKKGGGG..........',
      '......KKKKGGG...........',
      '.......KKKGG............',
      '........KKK.............',
    ] } },

  { name:'sea turtle',  r:89,  fill:'#3E7C4F', dk:'#2E5E3F', lt:'#8FBF7A',
    feat:{ ox:0, oy:0, rows:[
      '........................',
      '........KKKKKKK.........',
      '......KK.......KK.......',
      '.....K...........K......',
      '....K..G..K..G....K.....',
      '...K...KKKKKKK.....K....',
      '...K..K.......K....K....',
      '..K..K....G....K....K...',
      '..K..K.........K..KKKKK.',
      '..K..K....G....K..KKEKK.',
      '..K...K.......K...KKKKK.',
      '...K...KKKKKKK.....KKK..',
      '...K.....G..........K...',
      '....K..G....G.....K.....',
      '.....K...........K......',
      '......KK.......KK.......',
      '........KKKKKKK.........',
      '..mm................m...',
      '..mmm..............mm...',
      '........................',
    ] } },

  { name:'eagle ray',   r:103, fill:'#4B84B4', dk:'#2E5E8C', lt:'#7FB2D9',
    feat:{ ox:0, oy:0, rows:[
      '........................',
      '........................',
      '........................',
      '.....KK......KK.........',
      '.....KEK....KEK.........',
      '.....KKK....KKK.........',
      '........................',
      '..EE........EE..........',
      '..EE........EE..........',
      '......EE........EE......',
      'bbb...EE........EE...bbb',
      'bbbb................bbbb',
      'bbbb.EE....EE....EEbbbbb',
      'bbb..EE....EE....EE..bbb',
      '........................',
      '...EE.....EE......EE....',
      '...EE.....EE......EE....',
      '........................',
      '........KKK.............',
      '..........KKK...........',
      '............KKK.........',
      '..............KKK.......',
      '................KK......',
      '........................',
    ] } },

  { name:'whale shark', r:118, fill:'#2E5E8C', dk:'#24496E', lt:'#7FB2D9',
    featClip:{ ox:0, oy:0, rows:[
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWW',
    ] },
    feat:{ ox:0, oy:0, rows:[
      '........................',
      '........................',
      '.....EE......EE.........',
      '........................',
      '..EE......EE......EE....',
      '........................',
      '......EE......EE........',
      '..EE..............EE....',
      '........................',
      '....EE.....EE.....EE....',
      '.....................KKK',
      '..KK.................KKK',
      '..KEK................KKK',
      '..KKK...............KKK.',
      '........................',
      '...KKKKKKKKK.........KKK',
      '............KK.......KKK',
      '.....................KKK',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
    ] } },
];
/* spawn odds for tiers 0..4 — favor the small ones */
const SPAWN_WEIGHTS = [5,3,2,1,1];

/* ===== sprite builder: a perfect pixel DISC (fill + ink outline +
   light/shade arcs) rasterised once per tier, features stamped on
   top. Drawn per frame with drawImage + imageSmoothing off, so the
   circle you SEE is exactly the circle the physics uses. ===== */
const SPRITES = TIERS.map(buildSprite);
function buildSprite(t){
  const cv = document.createElement('canvas');
  cv.width = cv.height = GRID * CELL;
  const g = cv.getContext('2d');
  const cpx = GRID * CELL / 2;              // center in px
  const Rpx = DISC_R * CELL;                // disc radius in px
  const ring = CELL * 1.05;                 // ink outline thickness

  /* SMOOTH round body: soft radial shading (light falls top-left)
     inside a clean ink ring. The pixels live ON TOP of this. */
  const grad = g.createRadialGradient(cpx - Rpx*0.35, cpx - Rpx*0.35, Rpx*0.15, cpx, cpx, Rpx);
  grad.addColorStop(0, t.lt);
  grad.addColorStop(0.55, t.fill);
  grad.addColorStop(1, t.dk);
  g.beginPath(); g.arc(cpx, cpx, Rpx - ring/2, 0, Math.PI*2);
  g.fillStyle = grad; g.fill();
  g.lineWidth = ring;
  g.strokeStyle = INK;
  g.stroke();

  const cx = GRID / 2, cy = GRID / 2;
  function stamp(f, clip){
    if(!f) return;
    if(clip){
      g.save();
      g.beginPath(); g.arc(cpx, cpx, Rpx - ring, 0, Math.PI*2);
      g.clip();                              // pixel layers clipped by the smooth circle
    }
    for(let ry = 0; ry < f.rows.length; ry++){
      const row = f.rows[ry];
      for(let rx = 0; rx < row.length; rx++){
        const ch = row[rx];
        if(ch === '.') continue;
        const x = f.ox + rx, y = f.oy + ry;
        if(x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        if(ch === 'X'){ g.clearRect(x*CELL, y*CELL, CELL, CELL); continue; }
        g.fillStyle = PAL[ch] || INK;
        g.fillRect(x*CELL, y*CELL, CELL, CELL);
      }
    }
    if(clip) g.restore();
  }
  stamp(t.featClip, true);   // clipped layer first (bellies, bands)
  stamp(t.feat, false);      // then free layer (claws, tails, spikes —
                             // allowed to hang a little past the edge)
  return cv;
}
/* the disc is 21 of 24 grid cells wide, so the sprite box must be
   drawn GRID/(2*DISC_R) larger than the collision diameter for the
   painted circle to line up exactly with the physics circle. */
const SPRITE_OVER = GRID / (2 * DISC_R);

/* the secret-tier disc: an ink circle with a paper "?" */
const SECRET_SPRITE = buildSprite({
  fill:'#161412', dk:'#161412', lt:'#3A342E',
  feat:{ ox:7, oy:5, rows:[
    '..WWWWW..',
    '.WW...WW.',
    '.....WW..',
    '....WW...',
    '....WW...',
    '.........',
    '....WW...',
    '....WW...',
  ] }
});

/* effects budgets (kept cheap for phones) */
const MAX_PARTICLES = 80;
const SHAKE_TIER    = 7;   // merges creating tier >= this shake the screen

/* localStorage keys */
const KEY_BEST  = 'earlspade_game_best_v1';
const KEY_NAME  = 'earlspade_player_v1';
const KEY_SOUND = 'earlspade_game_sound_v1';
const KEY_SEEN  = 'earlspade_game_seen_v1';   // furthest tier ever created

/* ================= STATE ================= */
const playEl  = document.getElementById('play');
const canvas  = document.getElementById('game');
const ctx     = canvas.getContext('2d');
const nextCv  = document.getElementById('nextPrev');
const nextCtx = nextCv.getContext('2d');

let engine, world;
let cssW = 0, cssH = 0;
let scale = 1, offX = 0, offY = 0;     // letterboxed zoom of the fixed scene
let running = false, over = false;
let score = 0, best = +(localStorage.getItem(KEY_BEST) || 0);
let maxMade = Math.min(TIERS.length - 1, +(localStorage.getItem(KEY_SEEN) || 0));
let heldTier = 0, nextTier = 0;
let aimX = SCENE_W / 2;
let canDrop = true, lastDrop = 0, dropped = false;
let bodies = [];
let overTimers = new Map();
let anyOverLine = false;
let particles = [], popups = [];
let shake = 0;
let popTweens = new Map();
let rafId = null, lastT = 0, acc = 0;
const STEP = 1000 / 60;
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
const sndDrop  = () => blip(180, 90, 0.1, 0.08);
const sndMerge = (tier) => blip(240 + tier * 60, 480 + tier * 80, 0.16, 0.1);
const sndBig   = () => { blip(320, 900, 0.35, 0.12); blip(200, 600, 0.5, 0.08); };

const muteBtn = document.getElementById('muteBtn');
function paintMute(){ muteBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); muteBtn.innerHTML = soundOn ? '&#9834;' : '&#215;'; }
muteBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem(KEY_SOUND, soundOn ? 'on' : 'off');
  paintMute();
});
paintMute();

/* ================= SIZING (fixed scene, zoomed) ================= */
function resize(){
  const r = playEl.getBoundingClientRect();
  cssW = r.width; cssH = r.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* zoom the fixed scene to fit, centered (letterboxed) */
  scale = Math.min(cssW / SCENE_W, cssH / SCENE_H);
  offX = (cssW - SCENE_W * scale) / 2;
  offY = (cssH - SCENE_H * scale) / 2;
}

/* ================= WORLD SETUP ================= */
function buildWorld(){
  engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = GRAVITY_Y;
  world = engine.world;
  const opts = { isStatic: true, friction: FRICTION, restitution: 0 };
  Composite.add(world, [
    Bodies.rectangle((BOX_L+BOX_R)/2, BOX_BOTTOM + WALL_T/2, BOX_W + WALL_T*2, WALL_T, opts),  // floor
    Bodies.rectangle(BOX_L + WALL_T/2, BOX_TOP + BOX_H/2 - 200, WALL_T, BOX_H + 400, opts),    // left wall (extends up)
    Bodies.rectangle(BOX_R - WALL_T/2, BOX_TOP + BOX_H/2 - 200, WALL_T, BOX_H + 400, opts),    // right wall
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
  b.bornAt = performance.now();   // grace period for the over-line rule
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
      addScore(WHALE_BONUS, mx, my);
      celebrate(mx, my);
      sndBig();
      shake = reduceMotion ? 0 : 14;
      continue;
    }
    const nt = tier + 1;
    if(nt > maxMade){                       // legend unlock (persists)
      maxMade = nt;
      try{ localStorage.setItem(KEY_SEEN, String(maxMade)); }catch(e){}
    }
    const nb = fruitBody(nt, mx, my);
    Body.setVelocity(nb, { x: vx, y: vy });
    Composite.add(world, nb);
    bodies.push(nb);
    popTweens.set(nb.id, performance.now());
    addScore(MERGE_POINTS[nt], mx, my - TIERS[nt].r);
    burst(mx, my, TIERS[nt].fill, Math.min(12, 5 + nt));
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
  const s = nextCv.width;
  nextCtx.clearRect(0,0,s,s);
  drawFruitAt(nextCtx, s/2, s/2, s*0.42, nextTier, 0);
}
function promoteNext(){
  heldTier = nextTier;
  nextTier = rollSpawnTier();
  paintNext();
}
function clampAim(x){
  const r = TIERS[heldTier].r;
  return Math.max(IN_L + r, Math.min(IN_R - r, x));
}
function heldY(){ return Math.min(BOX_TOP - TIERS[heldTier].r - 14, 150); }
function drop(){
  if(!canDrop || over) return;
  const now = performance.now();
  if(now - lastDrop < DROP_COOLDOWN_MS) return;
  lastDrop = now; canDrop = false;
  const x = clampAim(aimX);
  const b = fruitBody(heldTier, x, heldY());
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
  let cx;
  if(e.touches && e.touches.length)                    cx = e.touches[0].clientX;
  else if(e.changedTouches && e.changedTouches.length) cx = e.changedTouches[0].clientX;
  else                                                 cx = e.clientX;
  return (cx - r.left - offX) / scale;
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

/* ================= GAME OVER (strict) =================
   THE RULE: once a creature has existed longer than its birth grace,
   any moment its center is above the line COUNTS toward its 2s timer.
   There is NO settle/speed condition — jostling the pile by spamming
   drops cannot stop the clock. If it's over the line, you lose. */
function checkOverLine(dt){
  const lineY = BOX_TOP + OVER_LINE_OFF;
  const now = performance.now();
  anyOverLine = false;
  for(const b of bodies){
    if(now - b.bornAt < BORN_GRACE_MS) continue;   // still falling in
    if(b.position.y < lineY){
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
  const d = r * 2 * SPRITE_OVER;
  c.save();
  c.translate(x, y);
  if(angle) c.rotate(angle);
  c.imageSmoothingEnabled = true;   // smooth round bodies (pixels are big enough to stay crisp)
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
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  /* the vessel: ink walls + floor + rim lips, inset in open paper */
  ctx.fillStyle = INK;
  ctx.fillRect(BOX_L, BOX_TOP, WALL_T, BOX_H + WALL_T);
  ctx.fillRect(BOX_R - WALL_T, BOX_TOP, WALL_T, BOX_H + WALL_T);
  ctx.fillRect(BOX_L, BOX_BOTTOM, BOX_W, WALL_T);
  ctx.fillRect(BOX_L - 4, BOX_TOP, WALL_T + 8, 4);
  ctx.fillRect(BOX_R - WALL_T - 4, BOX_TOP, WALL_T + 8, 4);

  /* game-over line — subtle dashes; red flash while threatened */
  const lineY = BOX_TOP + OVER_LINE_OFF;
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = anyOverLine
    ? (Math.floor(now / 180) % 2 ? 'rgba(215,0,0,.85)' : 'rgba(215,0,0,.25)')
    : 'rgba(22,20,18,.18)';
  ctx.beginPath(); ctx.moveTo(IN_L, lineY); ctx.lineTo(IN_R, lineY); ctx.stroke();
  ctx.restore();

  /* aim guide + held creature */
  if(!over){
    const hx = clampAim(aimX), hr = TIERS[heldTier].r, hy = heldY();
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx, hy + hr + 4); ctx.lineTo(hx, BOX_BOTTOM - 2); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = canDrop ? 1 : 0.45;
    drawFruitAt(ctx, hx, hy, hr, heldTier, 0);
    ctx.globalAlpha = 1;
  }

  /* creatures (with scale-pop on fresh merges) */
  for(const b of bodies){
    let r = TIERS[b.tier].r;
    const born = popTweens.get(b.id);
    if(born !== undefined){
      const p = (now - born) / 220;
      if(p >= 1){ popTweens.delete(b.id); }
      else { r *= 1 + 0.22 * Math.sin(Math.min(1, p) * Math.PI); }
    }
    drawFruitAt(ctx, b.position.x, b.position.y, r, b.tier, b.angle);
  }

  /* THE LEGEND — the whole chain under the box; secret tiers show
     the "?" box until the player has created them once. */
  {
    const startX = SCENE_W/2 - LEGEND_GAP * (TIERS.length - 1) / 2;
    ctx.imageSmoothingEnabled = true;
    for(let i = 0; i < TIERS.length; i++){
      const lx = startX + i * LEGEND_GAP;
      const secret = i >= SECRET_FROM && i > maxMade;
      const spr = secret ? SECRET_SPRITE : SPRITES[i];
      const d = LEGEND_R * 2 * SPRITE_OVER;
      ctx.drawImage(spr, lx - d/2, LEGEND_Y - d/2, d, d);
    }
  }

  /* particles (square = pixel confetti) */
  for(let i = particles.length - 1; i >= 0; i--){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.025;
    if(p.life <= 0){ particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.r/2, p.y - p.r/2, p.r, p.r);
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
    ctx.fillStyle = INK;
    ctx.fillText('+' + p.n, p.x, p.y - p.t * 46);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.restore();
}

/* ================= MAIN LOOP ================= */
function loop(now){
  rafId = requestAnimationFrame(loop);
  if(!lastT) lastT = now;
  let dt = now - lastT;
  lastT = now;
  if(dt > 100) dt = 100;
  acc += dt;
  let steps = 0;
  while(acc >= STEP && steps < 3){
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
  submitBtn.disabled = true;
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
  aimX = SCENE_W / 2;
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
    ageAll(ms){ bodies.forEach(b => { b.bornAt -= ms; }); },
    state(){ return { score, over, tiers: bodies.map(b => b.tier), n: bodies.length, canDrop }; },
    drop(x){ aimX = x; lastDrop = 0; canDrop = true; drop(); },
    forceAim(x){ aimX = x; },
    box(){ return { top: BOX_TOP, bottom: BOX_BOTTOM, inL: IN_L, inR: IN_R, sceneW: SCENE_W, sceneH: SCENE_H }; },
    maxMade(){ return maxMade; },
    clearSeen(){ maxMade = 0; try{ localStorage.removeItem('earlspade_game_seen_v1'); }catch(e){} },
    worldH(){ return BOX_BOTTOM; },
    boxTop(){ return BOX_TOP; }
  };
}

/* go */
resize();
reset();
})();
