/* ============================================================
   ZONA MATI — 2D apocalypse survival shooter
   Vanilla canvas game. Touch + tilt + keyboard/mouse.
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- tiny utils ---------------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
  const normAngle = (a) => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };
  const angleLerp = (a, b, t) => a + normAngle(b - a) * t;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------------- DOM ---------------- */
  const canvas = $('#game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const minimap = $('#minimap');
  const mctx = minimap.getContext('2d');
  const body = document.body;

  const ui = {
    hpFill: $('#hpFill'), hpText: $('#hpText'), staFill: $('#staFill'),
    hungerFill: $('#hungerFill'), thirstFill: $('#thirstFill'),
    foodCount: $('#foodCount'), waterCount: $('#waterCount'), medCount: $('#medCount'),
    dayText: $('#dayText'), clockText: $('#clockText'),
    objectiveText: $('#objectiveText'), objectiveDist: $('#objectiveDist'),
    compassArrow: $('#compassArrow'), threatText: $('#threatText'),
    killsText: $('#killsText'), scoreText: $('#scoreText'),
    weaponBar: $('#weaponBar'), prompt: $('#prompt'), promptText: $('#promptText'),
    promptKey: $('#promptKey'), toasts: $('#toasts'),
    crosshair: $('#crosshair'), hitmarker: $('#hitmarker'),
    damageFlash: $('#damageFlash'), tiltBadge: $('#tiltBadge'), tiltDot: $('#tiltDot'),
    startScreen: $('#startScreen'), pauseScreen: $('#pauseScreen'),
    deathScreen: $('#deathScreen'), winScreen: $('#winScreen'),
    deathStats: $('#deathStats'), winStats: $('#winStats'), bestText: $('#bestText'),
    btnFood: $('#btnFood'), btnWater: $('#btnWater'), btnMed: $('#btnMed'),
    btnInteract: $('#btnInteract'), btnReload: $('#btnReload'),
    moveZone: $('#moveZone'), aimZone: $('#aimZone'),
    moveBase: $('#moveBase'), aimBase: $('#aimBase'),
    moveKnob: $('#moveKnob'), aimKnob: $('#aimKnob'),
  };

  const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (isTouch) body.classList.add('touch');

  /* ---------------- canvas / camera ---------------- */
  let W = 1, H = 1, DPR = 1, zoom = 1;
  let vignette = null;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    zoom = clamp(Math.min(W, H) / 620, 0.78, 1.3);
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.7, 'rgba(0,0,0,0.16)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  const cam = { x: 1760, y: 1450, tx: 1760, ty: 1450 };

  /* ---------------- game state ---------------- */
  const world = { w: 3600, h: 2600 };
  const EVAC = { x: 1760, y: 140, r: 74 };
  const START = { x: 1760, y: 1450 };

  const game = {
    mode: 'menu', time: 0, runTime: 0, score: 0, kills: 0, fuel: 0,
    day: 1, night: false, cycle: 0, nightAmount: 0,
    spawnTimer: 8, shake: 0, reload: 0, reloadWeapon: null,
    current: 'pistol', best: { time: 0, kills: 0, score: 0 },
    promptTarget: null, lastHurt: -10, menuT: 0, ambientT: 0,
  };

  const player = {
    x: START.x, y: START.y, r: 11, angle: -Math.PI / 2,
    hp: 100, maxHp: 100, hunger: 100, thirst: 100, stamina: 100,
    speed: 190, sprintSpeed: 305,
    inv: { food: 1, water: 1, med: 1 },
    fireCd: 0, muzzle: 0, swing: 0, walk: 0, hitFlash: 0,
    invuln: 0, sprinting: false, moving: false, healGlow: 0,
  };

  const input = {
    keys: new Set(), mx: 0, my: 0, mouseActive: false, firing: false,
    touchMoveX: 0, touchMoveY: 0, touchMoveMag: 0,
    touchAimX: 1, touchAimY: 0, touchAimActive: false, touchFiring: false,
    tiltX: 0, tiltY: 0, tiltEnabled: false,
  };

  const solids = [];
  const buildings = [];
  const containers = [];
  const props = [];
  const lamps = [];
  const paths = [];
  const groundDecals = [];
  const bloodDecals = [];
  const enemies = [];
  const bullets = [];
  const particles = [];
  const drops = [];
  const corpses = [];
  const floaters = [];

  /* ---------------- weapons ---------------- */
  const WEAPON_ORDER = ['knife', 'pistol', 'shotgun', 'smg', 'rifle'];
  const ICONS = {
    knife: '<svg viewBox="0 0 32 18" fill="currentColor"><path d="M3 13 20 4h8l-6 6-14 6z"/><path d="M2 15h7v2H2z"/></svg>',
    pistol: '<svg viewBox="0 0 32 18" fill="currentColor"><path d="M3 5h22v4h-8l-2 6h-5l1-6H3z"/><path d="M18 9h4v6h-4z"/></svg>',
    shotgun: '<svg viewBox="0 0 32 18" fill="currentColor"><path d="M2 7h21v3H2z"/><path d="M21 8h9v2h-9z"/><path d="M8 10h5l-1 6H7z"/></svg>',
    smg: '<svg viewBox="0 0 32 18" fill="currentColor"><path d="M4 6h18v4h-7l-1 6h-4l1-6H4z"/><path d="M9 10h4v7H9z"/><path d="M22 7h6v2h-6z"/></svg>',
    rifle: '<svg viewBox="0 0 32 18" fill="currentColor"><path d="M2 7h27v3H2z"/><path d="M7 10h5l-1 6H6z"/><rect x="14" y="4" width="7" height="3" rx="1"/><path d="M27 6h3v5h-3z"/></svg>',
  };

  const WEAPON_DEFS = {
    knife: { name: 'Pisau', short: 'PISAU', icon: 'knife', melee: true, damage: 40, range: 56, arc: 1.5, cooldown: 0.34 },
    pistol: { name: 'Pistol', short: 'PISTOL', icon: 'pistol', damage: 19, speed: 1550, cooldown: 0.27, magSize: 12, reserve: 60, reload: 1.15, spread: 0.03, pellets: 1, shake: 2.2, ammoGive: 16 },
    shotgun: { name: 'Shotgun', short: 'SHOTGUN', icon: 'shotgun', damage: 12, speed: 1300, cooldown: 0.82, magSize: 6, reserve: 30, reload: 1.75, spread: 0.19, pellets: 7, shake: 6.5, ammoGive: 10 },
    smg: { name: 'SMG', short: 'SMG', icon: 'smg', damage: 10, speed: 1650, cooldown: 0.085, magSize: 30, reserve: 120, reload: 1.35, spread: 0.075, pellets: 1, shake: 1.4, ammoGive: 40 },
    rifle: { name: 'Rifle', short: 'RIFLE', icon: 'rifle', damage: 40, speed: 2200, cooldown: 0.42, magSize: 10, reserve: 50, reload: 1.7, spread: 0.012, pellets: 1, shake: 4.2, ammoGive: 16 },
  };

  let weapons = {};

  function createWeapons() {
    const w = {};
    for (const id of WEAPON_ORDER) {
      const d = WEAPON_DEFS[id];
      w[id] = {
        ...d,
        owned: id === 'knife' || id === 'pistol',
        mag: id === 'pistol' ? d.magSize : 0,
        reserve: id === 'pistol' ? d.reserve : 0,
      };
    }
    return w;
  }

  function ownedGuns() {
    return WEAPON_ORDER.filter((id) => weapons[id].owned && !weapons[id].melee);
  }

  /* ---------------- procedural audio ---------------- */
  let actx = null, master = null, noiseBuf = null, muted = false;

  function initAudio() {
    if (actx) {
      if (actx.state === 'suspended') actx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.34;
    master.connect(actx.destination);
    const len = Math.floor(actx.sampleRate * 0.4);
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = muted ? 0 : 0.34;
    updateSoundButtons();
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!actx) return;
    const t = actx.currentTime + (delay || 0);
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(dur, vol, filterType, freq, q, slideTo) {
    if (!actx || !noiseBuf) return;
    const t = actx.currentTime;
    const s = actx.createBufferSource();
    s.buffer = noiseBuf;
    const f = actx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q || 1;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur + 0.03);
  }

  function sfx(name, param) {
    if (!actx || muted) return;
    switch (name) {
      case 'pistol':
        noise(0.13, 0.5, 'lowpass', 2400, 0.7, 420);
        tone(150, 0.1, 'triangle', 0.28, 45);
        break;
      case 'shotgun':
        noise(0.32, 0.75, 'lowpass', 1500, 0.8, 180);
        tone(92, 0.22, 'sawtooth', 0.38, 34);
        break;
      case 'smg':
        noise(0.08, 0.36, 'lowpass', 3000, 0.6, 600);
        tone(190, 0.05, 'square', 0.12, 80);
        break;
      case 'rifle':
        noise(0.2, 0.6, 'lowpass', 2000, 0.9, 250);
        tone(120, 0.16, 'sawtooth', 0.3, 38);
        break;
      case 'knife':
        noise(0.12, 0.22, 'bandpass', 1800, 2, 700);
        break;
      case 'empty':
        noise(0.04, 0.15, 'highpass', 2800, 1);
        break;
      case 'reload':
        noise(0.045, 0.16, 'highpass', 2200, 1);
        noise(0.05, 0.18, 'highpass', 1600, 1);
        if (actx) {
          tone(420, 0.04, 'square', 0.08, 220, 0.02);
          tone(560, 0.05, 'square', 0.09, 260, 0.24);
        }
        break;
      case 'switch':
        tone(320, 0.04, 'square', 0.07, 480);
        break;
      case 'pickup':
        tone(620, 0.08, 'sine', 0.16, 880);
        tone(930, 0.12, 'sine', 0.13, 1240, 0.06);
        break;
      case 'loot':
        noise(0.08, 0.18, 'bandpass', 900, 1.2, 1600);
        tone(520, 0.08, 'triangle', 0.12, 780, 0.03);
        break;
      case 'hurt':
        noise(0.16, 0.32, 'lowpass', 700, 1, 120);
        tone(110, 0.2, 'sawtooth', 0.2, 55);
        break;
      case 'hit':
        tone(1300, 0.03, 'square', 0.1, 800);
        break;
      case 'kill':
        noise(0.18, 0.24, 'lowpass', 500, 1, 90);
        tone(75, 0.2, 'sine', 0.2, 40);
        break;
      case 'heal':
        tone(440, 0.12, 'sine', 0.14, 660);
        tone(660, 0.2, 'sine', 0.12, 990, 0.1);
        break;
      case 'eat':
        noise(0.07, 0.16, 'bandpass', 700, 2);
        noise(0.09, 0.14, 'bandpass', 500, 2);
        break;
      case 'fuel':
        tone(330, 0.15, 'square', 0.13, 330);
        tone(494, 0.2, 'square', 0.12, 494, 0.14);
        tone(660, 0.35, 'triangle', 0.14, 660, 0.28);
        break;
      case 'growl':
        tone(rand(55, 80), 0.4, 'sawtooth', 0.07, rand(35, 55));
        break;
      case 'spit':
        noise(0.16, 0.25, 'bandpass', 600, 1.5, 240);
        break;
      case 'win':
        tone(392, 0.3, 'triangle', 0.18);
        tone(523, 0.35, 'triangle', 0.18, 523, 0.18);
        tone(659, 0.5, 'triangle', 0.18, 659, 0.38);
        tone(784, 0.8, 'sine', 0.16, 784, 0.6);
        break;
      case 'lose':
        tone(220, 0.6, 'sawtooth', 0.18, 90);
        tone(110, 1.1, 'triangle', 0.2, 45, 0.25);
        break;
    }
  }

  /* ---------------- world helpers ---------------- */
  function addSolid(x, y, w, h, kind) {
    if (w <= 0 || h <= 0) return null;
    const s = { x, y, w, h, kind: kind || 'wall' };
    solids.push(s);
    return s;
  }

  function circleRect(x, y, r, s) {
    const cx = clamp(x, s.x, s.x + s.w);
    const cy = clamp(y, s.y, s.y + s.h);
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
  }

  function pointFree(x, y, r) {
    if (x < 40 + r || y < 40 + r || x > world.w - 40 - r || y > world.h - 40 - r) return false;
    for (let i = 0; i < solids.length; i++) if (circleRect(x, y, r, solids[i])) return false;
    return true;
  }

  function insideBuilding(x, y) {
    for (const b of buildings) {
      if (x > b.interior.x && x < b.interior.x + b.interior.w && y > b.interior.y && y < b.interior.y + b.interior.h) return b;
    }
    return null;
  }

  function moveCircle(ent, dx, dy, r) {
    if (dx) {
      ent.x += dx;
      for (let i = 0; i < solids.length; i++) {
        const s = solids[i];
        if (!circleRect(ent.x, ent.y, r, s)) continue;
        if (dx > 0) ent.x = Math.min(ent.x, s.x - r);
        else ent.x = Math.max(ent.x, s.x + s.w + r);
      }
    }
    if (dy) {
      ent.y += dy;
      for (let i = 0; i < solids.length; i++) {
        const s = solids[i];
        if (!circleRect(ent.x, ent.y, r, s)) continue;
        if (dy > 0) ent.y = Math.min(ent.y, s.y - r);
        else ent.y = Math.max(ent.y, s.y + s.h + r);
      }
    }
    ent.x = clamp(ent.x, 42 + r, world.w - 42 - r);
    ent.y = clamp(ent.y, 42 + r, world.h - 42 - r);
  }

  function segRectT(x1, y1, x2, y2, s) {
    const dx = x2 - x1, dy = y2 - y1;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < s.x || x1 > s.x + s.w) return -1;
    } else {
      let t1 = (s.x - x1) / dx, t2 = (s.x + s.w - x1) / dx;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dy) < 1e-9) {
      if (y1 < s.y || y1 > s.y + s.h) return -1;
    } else {
      let t1 = (s.y - y1) / dy, t2 = (s.y + s.h - y1) / dy;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    return tmin;
  }

  function segCircleT(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return -1;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / a;
    t = clamp(t, 0, 1);
    const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
    return px * px + py * py <= r * r ? t : -1;
  }

  function lineBlocked(x1, y1, x2, y2) {
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (s.kind === 'trunk') continue;
      if (segRectT(x1, y1, x2, y2, s) >= 0) return true;
    }
    return false;
  }

  // Line-of-sight test that ignores the solid the target point sits inside.
  // Loot containers are solid, so without this every container would block its own prompt.
  function lineBlockedExceptTarget(x1, y1, x2, y2) {
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (s.kind === 'trunk') continue;
      if (x2 >= s.x && x2 <= s.x + s.w && y2 >= s.y && y2 <= s.y + s.h) continue;
      if (segRectT(x1, y1, x2, y2, s) >= 0) return true;
    }
    return false;
  }

  /* ---------------- world construction ---------------- */
  const roads = [
    { x: 0, y: 1180, w: 3600, h: 200, dir: 'h' },
    { x: 1680, y: 0, w: 160, h: 2600, dir: 'v' },
    { x: 0, y: 1980, w: 3600, h: 130, dir: 'h' },
  ];

  function makeBuilding(def) {
    const b = { ...def, t: 18, walls: [], roofAlpha: 1, inside: false };
    const t = b.t;
    const dw = b.doorWidth || 100;
    const at = b.doorAt == null ? 0.5 : b.doorAt;
    let start = 0, end = 0, cx = 0, cy = 0;

    if (b.doorSide === 'top' || b.doorSide === 'bottom') {
      cx = b.x + b.w * at;
      start = clamp(cx - dw / 2, b.x + 26, b.x + b.w - 26 - dw);
      end = start + dw;
      cx = (start + end) / 2;
      cy = b.doorSide === 'top' ? b.y : b.y + b.h;
    } else {
      cy = b.y + b.h * at;
      start = clamp(cy - dw / 2, b.y + 26, b.y + b.h - 26 - dw);
      end = start + dw;
      cy = (start + end) / 2;
      cx = b.doorSide === 'left' ? b.x : b.x + b.w;
    }

    b.door = { side: b.doorSide, start, end, cx, cy, width: dw };
    b.interior = { x: b.x + t, y: b.y + t, w: b.w - t * 2, h: b.h - t * 2 };

    function wall(x, y, w, h) {
      if (w <= 0 || h <= 0) return;
      b.walls.push({ x, y, w, h });
      addSolid(x, y, w, h, 'wall');
    }

    if (b.doorSide === 'top') {
      wall(b.x, b.y, start - b.x, t);
      wall(end, b.y, b.x + b.w - end, t);
    } else wall(b.x, b.y, b.w, t);

    if (b.doorSide === 'bottom') {
      wall(b.x, b.y + b.h - t, start - b.x, t);
      wall(end, b.y + b.h - t, b.x + b.w - end, t);
    } else wall(b.x, b.y + b.h - t, b.w, t);

    if (b.doorSide === 'left') {
      wall(b.x, b.y, t, start - b.y);
      wall(b.x, end, t, b.y + b.h - end);
    } else wall(b.x, b.y, t, b.h);

    if (b.doorSide === 'right') {
      wall(b.x + b.w - t, b.y, t, start - b.y);
      wall(b.x + b.w - t, end, t, b.y + b.h - end);
    } else wall(b.x + b.w - t, b.y, t, b.h);

    buildings.push(b);
    return b;
  }

  function addLoot(b, rx, ry, w, h, kind, lootType, label) {
    const c = {
      x: b.x + rx, y: b.y + ry, w, h, kind, loot: lootType, label,
      looted: false, glow: 0, bob: Math.random() * TAU,
    };
    containers.push(c);
    addSolid(c.x + 2, c.y + 2, c.w - 4, c.h - 4, 'loot');
    return c;
  }

  function addProp(kind, x, y, w, h, solid, extra) {
    const p = { kind, x, y, w, h, ...(extra || {}) };
    props.push(p);
    if (solid) addSolid(x + (extra && extra.pad ? extra.pad : 0), y + (extra && extra.pad ? extra.pad : 0), w - (extra && extra.pad ? extra.pad * 2 : 0), h - (extra && extra.pad ? extra.pad * 2 : 0), kind);
    return p;
  }

  const PALETTES = {
    house: { roof: '#5b4034', wall: '#7a5a45', floor: '#4a3a2d', sign: '#e8c88f' },
    store: { roof: '#394a46', wall: '#5c716a', floor: '#3b4642', sign: '#b7f0d8' },
    clinic: { roof: '#4b545c', wall: '#84949d', floor: '#4a545b', sign: '#c7ecff' },
    police: { roof: '#2f3b55', wall: '#52617e', floor: '#333c4e', sign: '#a9c6ff' },
    warehouse: { roof: '#4c4430', wall: '#736a4e', floor: '#3d382b', sign: '#e5d8a8' },
    apartment: { roof: '#4a3b42', wall: '#6f5963', floor: '#42343a', sign: '#f0c2d2' },
    garage: { roof: '#403b35', wall: '#625a50', floor: '#38332e', sign: '#e0d6c6' },
    diner: { roof: '#53402f', wall: '#7c6047', floor: '#443528', sign: '#ffd9a3' },
    bigwarehouse: { roof: '#3d4640', wall: '#5f6e63', floor: '#353e39', sign: '#c6e8cd' },
    gas: { roof: '#4b3a33', wall: '#76584c', floor: '#3e322c', sign: '#ffc2a1' },
  };

  function buildWorld() {
    const P = PALETTES;

    /* ---- north-west: house ---- */
    let b = makeBuilding({ id: 'house', name: 'RUMAH AMAN', x: 300, y: 260, w: 420, h: 330, doorSide: 'bottom', doorAt: 0.5, ...P.house });
    addLoot(b, 42, 42, 58, 32, 'weaponcase', 'weapon:shotgun', 'Peti senjata');
    addLoot(b, 42, 200, 40, 46, 'fridge', 'mixed', 'Kulkas');
    addLoot(b, 330, 48, 44, 36, 'crate', 'ammo', 'Kotak amunisi');
    addLoot(b, 330, 130, 34, 40, 'medcab', 'med', 'Lemari obat');
    addProp('bed', b.x + 270, b.y + 145, 105, 68, true);
    addProp('table', b.x + 60, b.y + 60, 80, 48, true);
    addProp('couch', b.x + 60, b.y + 150, 90, 38, true);

    /* ---- north-west: mini market ---- */
    b = makeBuilding({ id: 'store', name: 'MINI MARKET', x: 930, y: 230, w: 540, h: 390, doorSide: 'bottom', doorAt: 0.55, ...P.store });
    addLoot(b, 40, 70, 140, 30, 'shelf', 'food', 'Rak makanan');
    addLoot(b, 360, 70, 140, 30, 'shelf', 'water', 'Rak minuman');
    addLoot(b, 40, 150, 140, 30, 'shelf', 'mixed', 'Rak barang');
    addLoot(b, 360, 150, 140, 30, 'shelf', 'food', 'Rak makanan');
    addLoot(b, 40, 230, 140, 30, 'shelf', 'mixed', 'Rak barang');
    addLoot(b, 360, 230, 140, 30, 'shelf', 'water', 'Rak minuman');
    addLoot(b, 460, 300, 44, 64, 'fridge', 'mixed', 'Kulkas minuman');
    addLoot(b, 40, 300, 150, 36, 'counter', 'med', 'Meja kasir');
    addLoot(b, 460, 70, 44, 36, 'crate', 'ammo', 'Kotak amunisi');

    /* ---- north-west: small warehouse ---- */
    b = makeBuilding({ id: 'shed', name: 'GUDANG KECIL', x: 1220, y: 760, w: 300, h: 270, doorSide: 'right', doorAt: 0.5, ...P.warehouse });
    addLoot(b, 30, 40, 44, 36, 'crate', 'ammo', 'Peti amunisi');
    addLoot(b, 30, 100, 44, 36, 'crate', 'mixed', 'Peti barang');
    addLoot(b, 90, 40, 44, 36, 'crate', 'med', 'Peti medis');
    addLoot(b, 160, 200, 100, 30, 'shelf', 'mixed', 'Rak gudang');

    /* ---- north-east: clinic ---- */
    b = makeBuilding({ id: 'clinic', name: 'KLINIK', x: 2060, y: 250, w: 470, h: 360, doorSide: 'bottom', doorAt: 0.5, ...P.clinic });
    addLoot(b, 40, 60, 78, 104, 'bed', 'med', 'Kasur pasien');
    addLoot(b, 40, 200, 78, 104, 'bed', 'mixed', 'Kasur pasien');
    addLoot(b, 380, 60, 34, 46, 'medcab', 'med', 'Lemari obat');
    addLoot(b, 380, 130, 34, 46, 'medcab', 'med', 'Lemari obat');
    addLoot(b, 380, 250, 36, 46, 'fuel', 'fuel', 'Bensin');
    addLoot(b, 170, 50, 110, 38, 'counter', 'med', 'Meja perawat');
    addLoot(b, 380, 320, 44, 36, 'crate', 'ammo', 'Kotak amunisi');

    /* ---- north-east: police station ---- */
    b = makeBuilding({ id: 'police', name: 'KANTOR POLISI', x: 2760, y: 260, w: 560, h: 430, doorSide: 'bottom', doorAt: 0.5, ...P.police });
    addLoot(b, 70, 320, 60, 32, 'weaponcase', 'weapon:smg', 'Peti senjata');
    addLoot(b, 470, 320, 36, 46, 'fuel', 'fuel', 'Bensin');
    addLoot(b, 380, 60, 44, 36, 'crate', 'ammo', 'Kotak amunisi');
    addLoot(b, 460, 50, 42, 80, 'locker', 'mixed', 'Loker');
    addLoot(b, 460, 150, 42, 80, 'locker', 'med', 'Loker');
    addLoot(b, 70, 60, 110, 44, 'desk', 'ammo', 'Meja kerja');
    addLoot(b, 200, 60, 110, 44, 'desk', 'mixed', 'Meja kerja');
    addProp('couch', b.x + 200, b.y + 210, 100, 40, true);

    /* ---- north-east: warehouse ---- */
    b = makeBuilding({ id: 'ne_warehouse', name: 'GUDANG', x: 2050, y: 780, w: 520, h: 330, doorSide: 'left', doorAt: 0.5, ...P.warehouse });
    addLoot(b, 60, 40, 44, 36, 'crate', 'ammo', 'Peti amunisi');
    addLoot(b, 60, 100, 44, 36, 'crate', 'mixed', 'Peti barang');
    addLoot(b, 120, 40, 44, 36, 'crate', 'ammo', 'Peti amunisi');
    addLoot(b, 300, 60, 140, 30, 'shelf', 'mixed', 'Rak gudang');
    addLoot(b, 300, 140, 140, 30, 'shelf', 'food', 'Rak makanan');
    addLoot(b, 400, 250, 44, 36, 'crate', 'med', 'Peti medis');
    addLoot(b, 100, 250, 34, 40, 'medcab', 'med', 'Lemari obat');

    /* ---- south-west: apartment ---- */
    b = makeBuilding({ id: 'apartment', name: 'APARTEMEN', x: 280, y: 1490, w: 470, h: 420, doorSide: 'bottom', doorAt: 0.5, ...P.apartment });
    addLoot(b, 40, 50, 90, 70, 'bed', 'mixed', 'Kasur');
    addLoot(b, 300, 50, 90, 70, 'bed', 'med', 'Kasur');
    addLoot(b, 40, 180, 40, 60, 'locker', 'food', 'Lemari');
    addLoot(b, 390, 180, 40, 60, 'locker', 'water', 'Lemari');
    addLoot(b, 200, 120, 80, 50, 'table', 'mixed', 'Meja');
    addProp('couch', b.x + 40, b.y + 300, 100, 38, true);
    addProp('table', b.x + 320, b.y + 300, 70, 46, true);

    /* ---- south-west: garage ---- */
    b = makeBuilding({ id: 'garage', name: 'BENGKEL', x: 1050, y: 1560, w: 390, h: 320, doorSide: 'bottom', doorAt: 0.5, ...P.garage });
    addLoot(b, 50, 50, 150, 90, 'lift', 'mixed', 'Mobil rusak');
    addLoot(b, 300, 50, 40, 40, 'tire', 'ammo', 'Tumpukan ban');
    addLoot(b, 300, 110, 40, 40, 'tire', 'mixed', 'Tumpukan ban');
    addLoot(b, 300, 200, 40, 60, 'locker', 'med', 'Lemari alat');
    addLoot(b, 60, 200, 44, 36, 'crate', 'ammo', 'Kotak amunisi');

    /* ---- south-west: diner ---- */
    b = makeBuilding({ id: 'diner', name: 'WARUNG', x: 300, y: 2180, w: 430, h: 300, doorSide: 'top', doorAt: 0.5, ...P.diner });
    addLoot(b, 50, 80, 140, 40, 'counter', 'food', 'Meja warung');
    addLoot(b, 300, 80, 100, 30, 'shelf', 'water', 'Rak minuman');
    addLoot(b, 300, 160, 100, 30, 'shelf', 'food', 'Rak makanan');
    addLoot(b, 60, 200, 80, 50, 'table', 'mixed', 'Meja');
    addLoot(b, 300, 240, 44, 44, 'fridge', 'water', 'Kulkas');

    /* ---- south-east: big warehouse ---- */
    b = makeBuilding({ id: 'big_warehouse', name: 'GUDANG BESAR', x: 2000, y: 1450, w: 640, h: 470, doorSide: 'left', doorAt: 0.5, ...P.bigwarehouse });
    addLoot(b, 470, 150, 60, 32, 'weaponcase', 'weapon:rifle', 'Peti senjata');
    addLoot(b, 500, 340, 36, 46, 'fuel', 'fuel', 'Bensin');
    addLoot(b, 100, 60, 160, 40, 'shelf', 'ammo', 'Rak amunisi');
    addLoot(b, 320, 60, 160, 40, 'shelf', 'mixed', 'Rak barang');
    addLoot(b, 100, 320, 160, 40, 'shelf', 'food', 'Rak makanan');
    addLoot(b, 320, 320, 160, 40, 'shelf', 'mixed', 'Rak barang');
    addLoot(b, 470, 60, 44, 36, 'crate', 'ammo', 'Peti amunisi');
    addLoot(b, 540, 240, 34, 40, 'medcab', 'med', 'Lemari obat');

    /* ---- south-east: gas station ---- */
    b = makeBuilding({ id: 'gas', name: 'SPBU', x: 2850, y: 1540, w: 420, h: 360, doorSide: 'bottom', doorAt: 0.5, ...P.gas });
    addLoot(b, 50, 60, 120, 30, 'shelf', 'food', 'Rak makanan');
    addLoot(b, 50, 140, 120, 30, 'shelf', 'water', 'Rak minuman');
    addLoot(b, 300, 60, 90, 40, 'counter', 'med', 'Meja kasir');
    addLoot(b, 320, 220, 44, 60, 'fridge', 'mixed', 'Kulkas');
    addLoot(b, 50, 260, 44, 36, 'crate', 'ammo', 'Kotak amunisi');

    /* ---- paths from doors to roads ---- */
    for (const bld of buildings) {
      const d = bld.door;
      let x2 = d.cx, y2 = d.cy;
      if (d.side === 'bottom') {
        y2 = bld.y + bld.h;
        if (y2 < 1180) y2 = 1180;
        else if (y2 < 1980) y2 = 1980;
        else y2 = 2110;
      } else if (d.side === 'top') {
        y2 = bld.y;
        if (y2 > 2110) y2 = 2110;
        else if (y2 > 1380) y2 = 1980;
        else y2 = 1380;
      } else if (d.side === 'left') {
        x2 = bld.x;
        x2 = x2 < 1680 ? 1680 : x2 > 1840 ? 1840 : x2;
      } else {
        x2 = bld.x + bld.w;
        x2 = x2 < 1680 ? 1680 : x2 > 1840 ? 1840 : x2;
      }
      paths.push({ x1: d.cx, y1: d.cy, x2, y2, w: 52 });
    }

    /* ---- boundary ---- */
    addSolid(0, 0, world.w, 34, 'boundary');
    addSolid(0, world.h - 34, world.w, 34, 'boundary');
    addSolid(0, 0, 34, world.h, 'boundary');
    addSolid(world.w - 34, 0, 34, world.h, 'boundary');

    /* ---- cars ---- */
    const cars = [
      [600, 1235, 112, 52], [2050, 1270, 124, 54], [2910, 1235, 112, 52],
      [940, 2015, 112, 50], [2500, 2030, 116, 50],
      [1692, 2250, 58, 112], [1710, 610, 58, 112],
      [1910, 1250, 150, 62],
    ];
    for (const c of cars) addProp('car', c[0], c[1], c[2], c[3], true);

    /* ---- lamps ---- */
    const lampSpots = [
      [300, 1150], [800, 1150], [1300, 1150], [2000, 1150], [2500, 1150], [3100, 1150],
      [1660, 300], [1660, 800], [1660, 1600], [1660, 2300],
      [1860, 600], [1860, 1400], [1860, 2100],
      [400, 1960], [1100, 1960], [2400, 1960], [3100, 1960],
    ];
    for (const l of lampSpots) {
      const p = addProp('lamp', l[0], l[1], 12, 12, false);
      lamps.push(p);
    }

    /* ---- barrels / dumpsters ---- */
    const barrels = [
      [760, 690], [800, 690], [1600, 990], [1900, 990], [2600, 1190],
      [3350, 1450], [1500, 2110], [2750, 2120], [2210, 1180], [1250, 700],
    ];
    for (const p of barrels) addProp('barrel', p[0], p[1], 26, 26, true);
    addProp('dumpster', 790, 640, 70, 42, true);
    addProp('dumpster', 2630, 1195, 70, 42, true);
    addProp('dumpster', 2610, 2120, 70, 42, true);

    /* ---- evac camp ---- */
    addProp('tent', 1590, 230, 74, 86, true);
    addProp('tent', 1836, 230, 74, 86, true);
    addProp('sandbag', 1600, 150, 66, 28, true);
    addProp('sandbag', 1854, 150, 66, 28, true);
    addProp('crate', 1596, 340, 44, 36, true);
    addProp('crate', 1860, 340, 44, 36, true);

    /* ---- trees (deterministic) ---- */
    const rng = mulberry32(918273);
    const trees = [];
    let tries = 0;
    while (trees.length < 58 && tries < 900) {
      tries++;
      const x = 70 + rng() * (world.w - 140);
      const y = 70 + rng() * (world.h - 140);
      const r = 20 + rng() * 16;
      if (insideBuilding(x, y)) continue;
      if (x > 1640 && x < 1880) continue;
      if (y > 1140 && y < 1420) continue;
      if (y > 1940 && y < 2150) continue;
      if (dist(x, y, START.x, START.y) < 150 || dist(x, y, EVAC.x, EVAC.y) < 180) continue;
      let nearPath = false;
      for (const p of paths) if (segCircleT(p.x1, p.y1, p.x2, p.y2, x, y, 48) >= 0) { nearPath = true; break; }
      if (nearPath) continue;
      if (!pointFree(x, y, r + 8)) continue;
      let near = false;
      for (const t of trees) if (dist(x, y, t.x, t.y) < 70) { near = true; break; }
      if (near) continue;
      trees.push({ x, y, r });
      addProp('tree', x - r, y - r, r * 2, r * 2, false, { cx: x, cy: y, r, seed: rng() });
      addSolid(x - 8, y - 8, 16, 16, 'trunk');
    }

    /* ---- ground debris decals ---- */
    for (let i = 0; i < 260; i++) {
      const x = 50 + rng() * (world.w - 100);
      const y = 50 + rng() * (world.h - 100);
      if (insideBuilding(x, y)) continue;
      groundDecals.push({
        x, y, r: 2 + rng() * 7, a: rng() * TAU,
        type: rng() < 0.45 ? 'paper' : rng() < 0.55 ? 'rubble' : 'stain',
        v: rng(),
      });
    }
  }

  /* ---------------- texture patterns ---------------- */
  function makePattern(base, specks, size, colors) {
    const c = document.createElement('canvas');
    c.width = c.height = size || 128;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, c.width, c.height);
    const rng = mulberry32(1337 + specks);
    for (let i = 0; i < specks; i++) {
      g.globalAlpha = 0.12 + rng() * 0.24;
      g.fillStyle = colors[(rng() * colors.length) | 0];
      const r = 0.6 + rng() * 2.4;
      g.beginPath();
      g.arc(rng() * c.width, rng() * c.height, r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    return ctx.createPattern(c, 'repeat');
  }

  let dirtPattern = null, asphaltPattern = null, floorPattern = null;
  function initPatterns() {
    dirtPattern = makePattern('#24241e', 260, 128, ['#171712', '#3a382c', '#4b4636', '#2c2a22']);
    asphaltPattern = makePattern('#24272a', 220, 128, ['#171a1c', '#33383b', '#3e4244', '#1d2022']);
    floorPattern = makePattern('#3b352c', 90, 64, ['#2c2822', '#4a4236', '#554b3b']);
  }

  /* ---------------- drawing: ground ---------------- */
  function drawGround(view) {
    ctx.fillStyle = dirtPattern;
    ctx.fillRect(view.x, view.y, view.w, view.h);

    ctx.save();
    ctx.globalAlpha = 0.5;
    for (const d of groundDecals) {
      if (d.x < view.x || d.y < view.y || d.x > view.x + view.w || d.y > view.y + view.h) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      if (d.type === 'paper') {
        ctx.fillStyle = d.v > 0.5 ? '#a99f86' : '#7c7564';
        ctx.fillRect(-d.r, -d.r * 0.6, d.r * 2, d.r * 1.2);
      } else if (d.type === 'rubble') {
        ctx.fillStyle = '#4a463c';
        ctx.beginPath();
        ctx.moveTo(-d.r, d.r * 0.5);
        ctx.lineTo(-d.r * 0.3, -d.r * 0.8);
        ctx.lineTo(d.r * 0.8, -d.r * 0.2);
        ctx.lineTo(d.r * 0.4, d.r * 0.8);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#17150f';
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 1.8, d.r, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();

    // paths
    for (const p of paths) {
      if (Math.min(p.x1, p.x2) > view.x + view.w || Math.max(p.x1, p.x2) < view.x) continue;
      if (Math.min(p.y1, p.y2) > view.y + view.h || Math.max(p.y1, p.y2) < view.y) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(92,80,58,0.62)';
      ctx.lineWidth = p.w;
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(128,112,82,0.18)';
      ctx.lineWidth = p.w * 0.55;
      ctx.stroke();
      ctx.restore();
    }

    // roads
    for (const r of roads) {
      if (r.x > view.x + view.w || r.y > view.y + view.h || r.x + r.w < view.x || r.y + r.h < view.y) continue;
      ctx.fillStyle = asphaltPattern;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(160,160,150,0.12)';
      ctx.lineWidth = 5;
      ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      // center markings
      ctx.save();
      ctx.strokeStyle = 'rgba(220,196,130,0.22)';
      ctx.lineWidth = 3;
      ctx.setLineDash([34, 40]);
      ctx.beginPath();
      if (r.dir === 'h') {
        ctx.moveTo(r.x + 20, r.y + r.h / 2);
        ctx.lineTo(r.x + r.w - 20, r.y + r.h / 2);
      } else {
        ctx.moveTo(r.x + r.w / 2, r.y + 20);
        ctx.lineTo(r.x + r.w / 2, r.y + r.h - 20);
      }
      ctx.stroke();
      ctx.restore();
    }

    // crosswalk stripes at main intersection
    ctx.save();
    ctx.fillStyle = 'rgba(210,206,188,0.14)';
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(1680 + i * 22, 1194, 12, 46);
      ctx.fillRect(1680 + i * 22, 1340, 12, 46);
    }
    ctx.restore();

    // boundary fence shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 8;
    ctx.strokeRect(34, 34, world.w - 68, world.h - 68);
  }

  function drawBlood(view) {
    ctx.save();
    for (const d of bloodDecals) {
      if (d.x < view.x || d.y < view.y || d.x > view.x + view.w || d.y > view.y + view.h) continue;
      ctx.globalAlpha = d.a;
      ctx.fillStyle = d.color || '#4a1010';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.62, d.rot, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- drawing: buildings ---------------- */
  function drawBuildingBase(b, view) {
    if (b.x > view.x + view.w || b.y > view.y + view.h || b.x + b.w < view.x || b.y + b.h < view.y) return;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    rr(ctx, b.x + 12, b.y + 16, b.w, b.h, 8);
    ctx.fill();

    // interior floor
    ctx.fillStyle = b.floor;
    ctx.fillRect(b.interior.x, b.interior.y, b.interior.w, b.interior.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.interior.x, b.interior.y, b.interior.w, b.interior.h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let x = b.interior.x + 32; x < b.interior.x + b.interior.w; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, b.interior.y); ctx.lineTo(x, b.interior.y + b.interior.h); ctx.stroke();
    }
    for (let y = b.interior.y + 32; y < b.interior.y + b.interior.h; y += 64) {
      ctx.beginPath(); ctx.moveTo(b.interior.x, y); ctx.lineTo(b.interior.x + b.interior.w, y); ctx.stroke();
    }
    // interior ambient stain
    const g = ctx.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, 10, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * 0.65);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(b.interior.x, b.interior.y, b.interior.w, b.interior.h);
    ctx.restore();

    // walls
    for (const w of b.walls) {
      ctx.fillStyle = b.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(w.x, w.y, w.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(w.x, w.y + w.h - 3, w.w, 3);
    }

    // windows on outer walls
    ctx.fillStyle = 'rgba(130,190,210,0.28)';
    if (b.door.side !== 'top') {
      const n = Math.max(1, Math.floor(b.w / 150));
      for (let i = 0; i < n; i++) {
        const wx = b.x + 40 + i * ((b.w - 80) / Math.max(1, n - 1 || 1));
        ctx.fillRect(wx - 14, b.y + 3, 28, 12);
      }
    }
    if (b.door.side !== 'bottom') {
      const n = Math.max(1, Math.floor(b.w / 150));
      for (let i = 0; i < n; i++) {
        const wx = b.x + 40 + i * ((b.w - 80) / Math.max(1, n - 1 || 1));
        ctx.fillRect(wx - 14, b.y + b.h - 15, 28, 12);
      }
    }
    if (b.door.side !== 'left') {
      const n = Math.max(1, Math.floor(b.h / 150));
      for (let i = 0; i < n; i++) {
        const wy = b.y + 40 + i * ((b.h - 80) / Math.max(1, n - 1 || 1));
        ctx.fillRect(b.x + 3, wy - 14, 12, 28);
      }
    }
    if (b.door.side !== 'right') {
      const n = Math.max(1, Math.floor(b.h / 150));
      for (let i = 0; i < n; i++) {
        const wy = b.y + 40 + i * ((b.h - 80) / Math.max(1, n - 1 || 1));
        ctx.fillRect(b.x + b.w - 15, wy - 14, 12, 28);
      }
    }

    // door threshold
    const d = b.door;
    ctx.save();
    ctx.fillStyle = 'rgba(255,209,102,0.16)';
    if (d.side === 'bottom' || d.side === 'top') {
      ctx.fillRect(d.start, d.cy - 5, d.width, 10);
    } else {
      ctx.fillRect(d.cx - 5, d.start, 10, d.width);
    }
    ctx.restore();

    // door frame glow
    ctx.strokeStyle = 'rgba(255,190,110,0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (d.side === 'bottom' || d.side === 'top') {
      ctx.moveTo(d.start, d.cy);
      ctx.lineTo(d.start, d.cy + (d.side === 'bottom' ? -18 : 18));
      ctx.moveTo(d.end, d.cy);
      ctx.lineTo(d.end, d.cy + (d.side === 'bottom' ? -18 : 18));
    } else {
      ctx.moveTo(d.cx, d.start);
      ctx.lineTo(d.cx + (d.side === 'right' ? -18 : 18), d.start);
      ctx.moveTo(d.cx, d.end);
      ctx.lineTo(d.cx + (d.side === 'right' ? -18 : 18), d.end);
    }
    ctx.stroke();
  }

  function drawRoof(b) {
    if (b.roofAlpha < 0.02) return;
    ctx.save();
    ctx.globalAlpha = b.roofAlpha;

    const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.4, b.y + b.h);
    g.addColorStop(0, shade(b.roof, 1.24));
    g.addColorStop(0.55, b.roof);
    g.addColorStop(1, shade(b.roof, 0.72));
    ctx.fillStyle = g;
    rr(ctx, b.x, b.y, b.w, b.h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    rr(ctx, b.x + 5, b.y + 5, b.w - 10, b.h - 10, 5);
    ctx.stroke();

    // roof ribs
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    for (let x = b.x + 26; x < b.x + b.w - 10; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, b.y + 8);
      ctx.lineTo(x, b.y + b.h - 8);
      ctx.stroke();
    }

    // vents / AC
    const vx = b.x + b.w * 0.22, vy = b.y + b.h * 0.24;
    ctx.fillStyle = 'rgba(18,20,20,0.55)';
    rr(ctx, vx, vy, 42, 28, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,210,205,0.18)';
    for (let i = 0; i < 3; i++) ctx.fillRect(vx + 5 + i * 12, vy + 6, 7, 16);

    ctx.fillStyle = 'rgba(18,20,20,0.4)';
    rr(ctx, b.x + b.w * 0.65, b.y + b.h * 0.16, 30, 24, 4);
    ctx.fill();

    // skylight
    ctx.fillStyle = 'rgba(140,190,210,0.16)';
    rr(ctx, b.x + b.w * 0.48, b.y + b.h * 0.55, b.w * 0.2, b.h * 0.16, 4);
    ctx.fill();

    // sign
    const signW = Math.min(b.w * 0.64, 270);
    const signH = 40;
    const sx = b.x + (b.w - signW) / 2;
    const sy = b.door.side === 'top' ? b.y + 14 : b.y + b.h - signH - 14;
    ctx.fillStyle = 'rgba(8,10,11,0.82)';
    rr(ctx, sx, sy, signW, signH, 5);
    ctx.fill();
    ctx.strokeStyle = b.sign;
    ctx.globalAlpha = b.roofAlpha * 0.45;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = b.roofAlpha;
    ctx.fillStyle = b.sign;
    ctx.font = '900 21px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.name, b.x + b.w / 2, sy + signH / 2 + 1);

    // hazard stripe at door edge
    if (b.roofAlpha > 0.5) {
      ctx.globalAlpha = b.roofAlpha * 0.5;
      ctx.fillStyle = '#d8b25a';
      const dw = Math.min(90, b.door.width);
      if (b.door.side === 'bottom') ctx.fillRect(b.door.cx - dw / 2, b.y + b.h - 7, dw, 4);
      else if (b.door.side === 'top') ctx.fillRect(b.door.cx - dw / 2, b.y + 3, dw, 4);
      else if (b.door.side === 'left') ctx.fillRect(b.x + 3, b.door.cy - dw / 2, 4, dw);
      else ctx.fillRect(b.x + b.w - 7, b.door.cy - dw / 2, 4, dw);
    }

    ctx.restore();
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) * f, 0, 255) | 0;
    const g = clamp(((n >> 8) & 255) * f, 0, 255) | 0;
    const b = clamp((n & 255) * f, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }

  /* ---------------- drawing: props ---------------- */
  function drawProp(p) {
    switch (p.kind) {
      case 'tree': {
        const cx = p.cx, cy = p.cy, r = p.r, s = p.seed || 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.28, cy + r * 0.42, r * 1.05, r * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3a2b1d';
        ctx.fillRect(cx - 5, cy - 4, 10, r * 0.85);
        ctx.fillStyle = '#1c2b18';
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.68, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#26371d';
        ctx.beginPath();
        ctx.arc(cx + r * 0.35, cy - r * 0.25, r * 0.6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#304525';
        ctx.beginPath();
        ctx.arc(cx + r * 0.02, cy - r * 0.55, r * 0.72, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(120,150,80,${0.18 + s * 0.15})`;
        ctx.beginPath();
        ctx.arc(cx - r * 0.18, cy - r * 0.68, r * 0.38, 0, TAU);
        ctx.fill();
        break;
      }
      case 'car': {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        rr(ctx, p.x + 7, p.y + 9, p.w, p.h, 12);
        ctx.fill();
        const body = p.w > p.h ? '#5a4c42' : '#4b443e';
        ctx.fillStyle = body;
        rr(ctx, p.x, p.y, p.w, p.h, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // windows
        ctx.fillStyle = 'rgba(90,130,145,0.24)';
        if (p.w > p.h) {
          rr(ctx, p.x + p.w * 0.26, p.y + 8, p.w * 0.28, p.h - 16, 4);
          ctx.fill();
          rr(ctx, p.x + p.w * 0.58, p.y + 8, p.w * 0.16, p.h - 16, 4);
          ctx.fill();
          ctx.fillStyle = '#1a1b1c';
          ctx.fillRect(p.x + 12, p.y - 2, 16, 6);
          ctx.fillRect(p.x + p.w - 28, p.y - 2, 16, 6);
          ctx.fillRect(p.x + 12, p.y + p.h - 4, 16, 6);
          ctx.fillRect(p.x + p.w - 28, p.y + p.h - 4, 16, 6);
        } else {
          rr(ctx, p.x + 8, p.y + p.h * 0.26, p.w - 16, p.h * 0.28, 4);
          ctx.fill();
          rr(ctx, p.x + 8, p.y + p.h * 0.58, p.w - 16, p.h * 0.16, 4);
          ctx.fill();
          ctx.fillStyle = '#1a1b1c';
          ctx.fillRect(p.x - 2, p.y + 12, 6, 16);
          ctx.fillRect(p.x - 2, p.y + p.h - 28, 6, 16);
          ctx.fillRect(p.x + p.w - 4, p.y + 12, 6, 16);
          ctx.fillRect(p.x + p.w - 4, p.y + p.h - 28, 6, 16);
        }
        // rust / damage
        ctx.fillStyle = 'rgba(126,76,38,0.28)';
        ctx.beginPath();
        ctx.arc(p.x + p.w * 0.4, p.y + p.h * 0.7, 7, 0, TAU);
        ctx.fill();
        break;
      }
      case 'barrel': {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(p.x + 16, p.y + 19, 15, 8, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#5a4632';
        ctx.beginPath();
        ctx.arc(p.x + 13, p.y + 13, 13, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#2e251c';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(190,150,60,0.28)';
        ctx.fillRect(p.x + 5, p.y + 6, 16, 3);
        ctx.fillRect(p.x + 5, p.y + 16, 16, 3);
        break;
      }
      case 'lamp': {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(p.x + 3, p.y + 3, 9, 9);
        ctx.fillStyle = '#3d4145';
        ctx.fillRect(p.x + 2, p.y + 2, 8, 8);
        ctx.fillStyle = '#8a7a5a';
        ctx.beginPath();
        ctx.arc(p.x + 6, p.y + 6, 3, 0, TAU);
        ctx.fill();
        break;
      }
      case 'dumpster': {
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        rr(ctx, p.x + 5, p.y + 7, p.w, p.h, 4);
        ctx.fill();
        ctx.fillStyle = '#3d4a42';
        rr(ctx, p.x, p.y, p.w, p.h, 4);
        ctx.fill();
        ctx.fillStyle = '#2a332e';
        ctx.fillRect(p.x + 4, p.y + 6, p.w - 8, p.h - 12);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(p.x + 8, p.y + 3, p.w - 16, 3);
        break;
      }
      case 'tent': {
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.beginPath();
        ctx.moveTo(p.x + 6, p.y + p.h);
        ctx.lineTo(p.x + p.w / 2 + 8, p.y + 10);
        ctx.lineTo(p.x + p.w + 8, p.y + p.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4d5a42';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + p.h);
        ctx.lineTo(p.x + p.w / 2, p.y);
        ctx.lineTo(p.x + p.w, p.y + p.h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.moveTo(p.x + p.w / 2 - 12, p.y + p.h);
        ctx.lineTo(p.x + p.w / 2, p.y + 26);
        ctx.lineTo(p.x + p.w / 2 + 12, p.y + p.h);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'sandbag': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(p.x + 3, p.y + 6, p.w, p.h);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i % 2 ? '#6c6046' : '#7b6e50';
          ctx.beginPath();
          ctx.ellipse(p.x + 12 + i * 22, p.y + p.h * 0.55, 13, 9, 0, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'bed': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        rr(ctx, p.x + 4, p.y + 5, p.w, p.h, 5);
        ctx.fill();
        ctx.fillStyle = '#6b5a48';
        rr(ctx, p.x, p.y, p.w, p.h, 5);
        ctx.fill();
        ctx.fillStyle = '#8e826d';
        rr(ctx, p.x + 4, p.y + 4, p.w - 8, p.h - 8, 4);
        ctx.fill();
        ctx.fillStyle = '#b5ab95';
        rr(ctx, p.x + 7, p.y + 7, p.w - 14, 18, 4);
        ctx.fill();
        break;
      }
      case 'table': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        rr(ctx, p.x + 4, p.y + 5, p.w, p.h, 4);
        ctx.fill();
        ctx.fillStyle = '#5a4632';
        rr(ctx, p.x, p.y, p.w, p.h, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(p.x + 4, p.y + 4, p.w - 8, 3);
        break;
      }
      case 'couch': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        rr(ctx, p.x + 4, p.y + 5, p.w, p.h, 8);
        ctx.fill();
        ctx.fillStyle = '#4b4a40';
        rr(ctx, p.x, p.y, p.w, p.h, 8);
        ctx.fill();
        ctx.fillStyle = '#5b5a4e';
        rr(ctx, p.x + 6, p.y + 6, p.w - 12, p.h - 12, 6);
        ctx.fill();
        break;
      }
      case 'crate': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(p.x + 3, p.y + 5, p.w, p.h);
        ctx.fillStyle = '#5d4a2e';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#3a2d1b';
        ctx.lineWidth = 3;
        ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
        ctx.beginPath();
        ctx.moveTo(p.x + 4, p.y + 4);
        ctx.lineTo(p.x + p.w - 4, p.y + p.h - 4);
        ctx.moveTo(p.x + p.w - 4, p.y + 4);
        ctx.lineTo(p.x + 4, p.y + p.h - 4);
        ctx.stroke();
        break;
      }
    }
  }

  /* ---------------- drawing: containers ---------------- */
  function drawContainer(c) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 3 + c.bob);
    if (!c.looted) {
      ctx.save();
      ctx.globalAlpha = c.kind === 'fuel' ? 0.28 + pulse * 0.22 : 0.12 + pulse * 0.08;
      ctx.fillStyle = c.kind === 'fuel' ? '#ffd166' : '#ffcf7a';
      ctx.beginPath();
      ctx.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w * 0.9, c.h * 0.9, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    const x = c.x, y = c.y, w = c.w, h = c.h;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 3, y + 4, w, h);

    switch (c.kind) {
      case 'crate':
      case 'weaponcase': {
        ctx.fillStyle = c.kind === 'weaponcase' ? '#3e4632' : '#5d4a2e';
        rr(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.strokeStyle = c.kind === 'weaponcase' ? '#23291b' : '#3a2d1b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = c.kind === 'weaponcase' ? 'rgba(180,210,140,0.35)' : 'rgba(255,220,150,0.18)';
        if (c.looted) ctx.fillRect(x + 5, y + 5, w - 10, h * 0.3);
        else {
          ctx.fillRect(x + 5, y + 5, w - 10, 3);
          ctx.fillRect(x + 5, y + h - 8, w - 10, 3);
          ctx.fillRect(x + w / 2 - 2, y + 8, 4, h - 16);
        }
        if (c.kind === 'weaponcase' && !c.looted) {
          ctx.fillStyle = '#d8c48a';
          ctx.fillRect(x + 8, y + h / 2 - 2, w - 16, 3);
        }
        break;
      }
      case 'shelf': {
        ctx.fillStyle = '#4a3b28';
        rr(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.fillStyle = '#2c2419';
        ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
        if (!c.looted) {
          const cols = ['#b35c3c', '#d1a247', '#6d8b52', '#b9b09a', '#8b5a3c'];
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = cols[i % cols.length];
            ctx.fillRect(x + 6 + i * ((w - 12) / 6), y + 6, (w - 14) / 7, h - 12);
          }
        }
        ctx.fillStyle = '#5c4a30';
        ctx.fillRect(x, y + h / 2 - 1, w, 2);
        break;
      }
      case 'fridge': {
        ctx.fillStyle = '#8b918c';
        rr(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = '#5a605c';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x + 4, y + 4, w - 8, 3);
        ctx.fillStyle = '#3f4542';
        ctx.fillRect(x + w - 9, y + 10, 3, h * 0.22);
        if (c.looted) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(x + 5, y + 6, w - 10, h - 12);
        }
        break;
      }
      case 'medcab': {
        ctx.fillStyle = '#c8cbc4';
        rr(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.fillStyle = '#b33a35';
        ctx.fillRect(x + w / 2 - 3, y + 8, 6, h - 16);
        ctx.fillRect(x + 6, y + h / 2 - 3, w - 12, 6);
        if (c.looted) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
        }
        break;
      }
      case 'fuel': {
        ctx.fillStyle = '#8e2f22';
        rr(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = '#4a1810';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#d9a52e';
        ctx.fillRect(x + 4, y + 4, w - 8, 6);
        ctx.fillStyle = '#2e1b14';
        ctx.fillRect(x + w / 2 - 3, y + 12, 6, h - 20);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 5, y + 13, 3, h - 22);
        if (c.looted) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
        }
        break;
      }
      case 'bed': {
        ctx.fillStyle = '#6b5a48';
        rr(ctx, x, y, w, h, 5);
        ctx.fill();
        ctx.fillStyle = '#8e826d';
        rr(ctx, x + 4, y + 4, w - 8, h - 8, 4);
        ctx.fill();
        ctx.fillStyle = '#b5ab95';
        rr(ctx, x + 7, y + 7, w - 14, 18, 4);
        ctx.fill();
        break;
      }
      case 'locker': {
        ctx.fillStyle = '#4e5b57';
        rr(ctx, x, y, w, h, 3);
        ctx.fill();
        ctx.strokeStyle = '#2f3936';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#2f3936';
        ctx.fillRect(x + w / 2 - 1, y + 4, 2, h - 8);
        ctx.fillStyle = '#a9b4ae';
        ctx.fillRect(x + w / 2 - 6, y + h * 0.45, 3, 8);
        ctx.fillRect(x + w / 2 + 3, y + h * 0.45, 3, 8);
        break;
      }
      case 'desk':
      case 'counter':
      case 'table': {
        ctx.fillStyle = c.kind === 'counter' ? '#5b4630' : '#554433';
        rr(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 4, y + 4, w - 8, 3);
        if (!c.looted) {
          ctx.fillStyle = '#b9b09a';
          ctx.fillRect(x + 8, y + 8, 12, 8);
          ctx.fillStyle = '#7d9c5c';
          ctx.fillRect(x + 24, y + 10, 9, 6);
        }
        break;
      }
      case 'tire': {
        ctx.fillStyle = '#232323';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#0f0f0f';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 5, 0, TAU);
        ctx.fill();
        break;
      }
      case 'lift': {
        ctx.fillStyle = '#3b3e40';
        rr(ctx, x, y, w, h, 6);
        ctx.fill();
        ctx.fillStyle = '#5b5f62';
        rr(ctx, x + 10, y + 8, w - 20, h - 16, 10);
        ctx.fill();
        ctx.fillStyle = '#323638';
        ctx.fillRect(x + w * 0.3, y + 12, w * 0.2, h - 24);
        ctx.fillRect(x + w * 0.55, y + 12, w * 0.12, h - 24);
        break;
      }
    }

    if (!c.looted) {
      ctx.save();
      ctx.globalAlpha = 0.75 + pulse * 0.25;
      ctx.fillStyle = c.kind === 'fuel' ? '#ffd166' : '#ffe0a3';
      ctx.beginPath();
      ctx.arc(c.x + c.w - 3, c.y + 3, c.kind === 'fuel' ? 3.5 : 2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- drawing: entities ---------------- */
  function drawPlayer() {
    const w = weapons[game.current];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(player.x + 3, player.y + 6, 13, 7, 0, 0, TAU);
    ctx.fill();

    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    const bob = Math.sin(player.walk * 11) * 2.2;
    // legs
    ctx.fillStyle = '#2c2f27';
    rr(ctx, -8, -7 + bob, 13, 6, 3); ctx.fill();
    rr(ctx, -8, 1 - bob, 13, 6, 3); ctx.fill();
    // backpack
    ctx.fillStyle = '#3b3d30';
    rr(ctx, -13, -6, 8, 12, 3); ctx.fill();
    // body
    ctx.fillStyle = player.hitFlash > 0 ? '#ffd9cf' : '#566043';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 9, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // shoulder pads
    ctx.fillStyle = '#6b7351';
    ctx.beginPath();
    ctx.arc(1, -7, 4.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1, 7, 4.5, 0, TAU);
    ctx.fill();
    // arms
    ctx.strokeStyle = '#4d563c';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, -5);
    ctx.lineTo(15, -3);
    ctx.moveTo(4, 5);
    ctx.lineTo(15, 3);
    ctx.stroke();
    // head
    ctx.fillStyle = '#c99a6d';
    ctx.beginPath();
    ctx.arc(5, 0, 6.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2f261d';
    ctx.beginPath();
    ctx.arc(3, 0, 5.2, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    // gun
    const gunLen = w.melee ? 13 : w.icon === 'shotgun' ? 28 : w.icon === 'rifle' ? 31 : w.icon === 'smg' ? 21 : 18;
    ctx.fillStyle = '#1c1e20';
    rr(ctx, 10, -2.4, gunLen, 4.8, 1.5);
    ctx.fill();
    if (!w.melee) {
      ctx.fillStyle = '#353a3c';
      ctx.fillRect(11, -4.5, 7, 2.5);
    }
    // muzzle flash
    if (player.muzzle > 0) {
      const mx = 10 + gunLen;
      const a = player.muzzle * 12;
      ctx.save();
      ctx.globalAlpha = clamp(player.muzzle * 5, 0, 1);
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx + 14 + a, -7 - a * 0.4);
      ctx.lineTo(mx + 8, 0);
      ctx.lineTo(mx + 14 + a, 7 + a * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(mx + 3, 0, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // knife swing
    if (player.swing > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(player.swing * 3, 0, 0.9);
      ctx.strokeStyle = '#e9e3cf';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(8, 0, 30, -0.9, 0.9);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(e.x + 2, e.y + 5, e.r * 1.1, e.r * 0.55, 0, 0, TAU);
    ctx.fill();

    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    const flash = e.hitFlash > 0;
    const bodyCol = flash ? '#ffe1d6' : e.color;

    if (e.type === 'brute') {
      ctx.fillStyle = flash ? '#fff' : '#3b2b21';
      rr(ctx, -e.r * 1.1, -e.r, e.r * 1.2, e.r * 2, 6);
      ctx.fill();
    }

    // legs
    const bob = Math.sin(e.walk * 10) * (e.type === 'runner' ? 3.5 : 2);
    ctx.fillStyle = flash ? '#fff' : '#2b2a22';
    rr(ctx, -e.r * 0.7, -e.r * 0.65 + bob, e.r * 0.9, e.r * 0.5, 3); ctx.fill();
    rr(ctx, -e.r * 0.7, e.r * 0.15 - bob, e.r * 0.9, e.r * 0.5, 3); ctx.fill();

    // arms reaching
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = e.type === 'brute' ? 6 : 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.r * 0.3, -e.r * 0.6);
    ctx.lineTo(e.r * 1.5, -e.r * 0.35 + Math.sin(e.walk * 9) * 2);
    ctx.moveTo(e.r * 0.3, e.r * 0.6);
    ctx.lineTo(e.r * 1.5, e.r * 0.35 - Math.sin(e.walk * 9) * 2);
    ctx.stroke();

    // body
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r * 0.95, e.r * 0.82, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // tattered shirt
    ctx.fillStyle = flash ? '#fff' : e.type === 'raider' ? '#4f3a32' : '#3c4a35';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(-1, 0, e.r * 0.7, e.r * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // head
    ctx.fillStyle = flash ? '#fff' : e.type === 'raider' ? '#b78c68' : '#8da36b';
    ctx.beginPath();
    ctx.arc(e.r * 0.62, 0, e.r * 0.5, 0, TAU);
    ctx.fill();
    // eyes
    if (e.type !== 'raider') {
      ctx.fillStyle = e.type === 'spitter' ? '#b8ff6b' : '#ffd166';
      ctx.beginPath();
      ctx.arc(e.r * 0.88, -e.r * 0.2, 1.6, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.r * 0.88, e.r * 0.2, 1.6, 0, TAU);
      ctx.fill();
    }
    // raider bandana + gun
    if (e.type === 'raider') {
      ctx.fillStyle = '#7d2e2b';
      ctx.fillRect(e.r * 0.35, -e.r * 0.52, e.r * 0.65, e.r * 0.25);
      ctx.fillStyle = '#1c1e20';
      rr(ctx, e.r * 0.9, -2, 16, 4, 1);
      ctx.fill();
    }
    // spitter sac
    if (e.type === 'spitter') {
      ctx.fillStyle = flash ? '#fff' : 'rgba(126,210,90,0.55)';
      ctx.beginPath();
      ctx.arc(-e.r * 0.3, 0, e.r * 0.55, 0, TAU);
      ctx.fill();
    }
    // brute scars
    if (e.type === 'brute') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.5, -e.r * 0.4);
      ctx.lineTo(e.r * 0.2, e.r * 0.4);
      ctx.stroke();
    }
    ctx.restore();

    if (e.hp < e.maxHp) {
      const bw = e.r * 2.2;
      const bx = e.x - bw / 2, by = e.y - e.r - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = e.hp / e.maxHp > 0.45 ? '#8fc45a' : '#e05a3a';
      ctx.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
  }

  function drawDrop(d) {
    const bob = Math.sin(game.time * 4 + d.bob) * 2.5;
    ctx.save();
    ctx.translate(d.x, d.y + bob);
    ctx.globalAlpha = d.life < 5 ? 0.45 + 0.4 * Math.sin(game.time * 12) : 1;
    const col = d.type === 'ammo' ? '#e0b45e' : d.type === 'food' ? '#d08a4a' : d.type === 'water' ? '#59c3ff' : d.type === 'med' ? '#ff5a5a' : '#ffd166';
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
    g.addColorStop(0, col + '88');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    if (d.type === 'ammo') {
      ctx.fillRect(-5, -6, 3, 12);
      ctx.fillRect(2, -6, 3, 12);
      ctx.fillStyle = '#7a5a2a';
      ctx.fillRect(-5, -7, 3, 3);
      ctx.fillRect(2, -7, 3, 3);
    } else if (d.type === 'food') {
      rr(ctx, -6, -6, 12, 12, 2); ctx.fill();
      ctx.fillStyle = '#8e5a2e';
      ctx.fillRect(-6, -2, 12, 2);
    } else if (d.type === 'water') {
      rr(ctx, -4, -7, 8, 14, 3); ctx.fill();
      ctx.fillStyle = '#d9f1ff';
      ctx.fillRect(-3, -9, 6, 3);
    } else if (d.type === 'med') {
      rr(ctx, -6, -6, 12, 12, 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2, -5, 4, 10);
      ctx.fillRect(-5, -2, 10, 4);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCorpse(c) {
    ctx.save();
    ctx.globalAlpha = clamp(c.life / 3, 0, 0.85);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x + 2, c.y + 4, c.r * 1.2, c.r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.color || '#3f4a35';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.r * 0.9, c.r * 0.65, c.rot, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#6b7d52';
    ctx.beginPath();
    ctx.arc(c.x + Math.cos(c.rot) * c.r * 0.6, c.y + Math.sin(c.rot) * c.r * 0.6, c.r * 0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBullet(b) {
    ctx.save();
    if (b.hostile) {
      ctx.fillStyle = b.acid ? 'rgba(150,240,90,0.35)' : 'rgba(255,90,60,0.3)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = b.acid ? '#b9ff74' : '#ff9a72';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = b.color || 'rgba(255,220,150,0.9)';
      ctx.lineWidth = b.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size * 0.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a * (p.alpha == null ? 1 : p.alpha);
      ctx.fillStyle = p.color;
      if (p.shape === 'smoke') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU);
        ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.shape === 'shell') {
        ctx.fillRect(p.x, p.y, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floaters) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `900 ${f.size || 13}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = f.color || '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  function drawEvac() {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 2.4);
    const ready = game.fuel >= 3;
    ctx.save();
    ctx.translate(EVAC.x, EVAC.y);
    ctx.fillStyle = ready ? 'rgba(126,217,87,0.12)' : 'rgba(255,209,102,0.08)';
    ctx.beginPath();
    ctx.arc(0, 0, EVAC.r + pulse * 8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = ready ? 'rgba(126,217,87,0.75)' : 'rgba(255,209,102,0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.arc(0, 0, EVAC.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ready ? 'rgba(126,217,87,0.18)' : 'rgba(255,209,102,0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, EVAC.r * 0.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ready ? '#c9ffb0' : '#ffe6a6';
    ctx.font = '900 26px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EVAC', 0, -8);
    ctx.font = '800 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(ready ? 'SIAP BERANGKAT' : 'BUTUH 3 BENSIN', 0, 16);
    ctx.restore();
  }

  function drawFuelBeacons(view) {
    for (const c of containers) {
      if (c.loot !== 'fuel' || c.looted) continue;
      if (c.x < view.x || c.y < view.y || c.x > view.x + view.w || c.y > view.y + view.h) continue;
      const t = game.time * 2 + c.bob;
      const pulse = 0.5 + 0.5 * Math.sin(t);
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.25 + pulse * 0.25;
      const g = ctx.createLinearGradient(cx, cy - 160, cx, cy);
      g.addColorStop(0, 'rgba(255,209,102,0)');
      g.addColorStop(1, 'rgba(255,209,102,0.8)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 5, cy - 160, 10, 160);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(cx, cy - 160 - pulse * 6, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- drawing: composition ---------------- */
  const drawList = [];
  function drawWorld(view) {
    drawGround(view);

    for (const b of buildings) drawBuildingBase(b, view);
    drawBlood(view);
    drawEvac();

    drawList.length = 0;
    for (const p of props) {
      if (p.x + p.w < view.x - 60 || p.x > view.x + view.w + 60 || p.y + p.h < view.y - 60 || p.y > view.y + view.h + 60) continue;
      drawList.push({ y: p.y + p.h, type: 'prop', o: p });
    }
    for (const c of containers) {
      if (c.x + c.w < view.x - 40 || c.x > view.x + view.w + 40 || c.y + c.h < view.y - 40 || c.y > view.y + view.h + 40) continue;
      drawList.push({ y: c.y + c.h, type: 'loot', o: c });
    }
    for (const d of drops) drawList.push({ y: d.y + 8, type: 'drop', o: d });
    for (const c of corpses) drawList.push({ y: c.y + 6, type: 'corpse', o: c });
    for (const e of enemies) {
      if (e.x < view.x - 80 || e.y < view.y - 80 || e.x > view.x + view.w + 80 || e.y > view.y + view.h + 80) continue;
      drawList.push({ y: e.y + e.r, type: 'enemy', o: e });
    }
    if (game.mode !== 'menu') drawList.push({ y: player.y + 12, type: 'player', o: player });

    drawList.sort((a, b) => a.y - b.y);
    for (const d of drawList) {
      if (d.type === 'prop') drawProp(d.o);
      else if (d.type === 'loot') drawContainer(d.o);
      else if (d.type === 'drop') drawDrop(d.o);
      else if (d.type === 'corpse') drawCorpse(d.o);
      else if (d.type === 'enemy') drawEnemy(d.o);
      else if (d.type === 'player') drawPlayer();
    }

    for (const b of bullets) drawBullet(b);
    drawParticles();
    drawFloaters();

    for (const b of buildings) drawRoof(b);
    drawFuelBeacons(view);
  }

  function drawScreenFX(ox, oy) {
    const night = game.nightAmount;
    if (night > 0.01) {
      ctx.fillStyle = `rgba(9,13,28,${0.58 * night})`;
      ctx.fillRect(0, 0, W, H);

      const toScreen = (x, y) => ({ x: (x - cam.x) * zoom + W / 2 + ox, y: (y - cam.y) * zoom + H / 2 + oy });
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // player glow
      const pp = toScreen(player.x, player.y);
      let g = ctx.createRadialGradient(pp.x, pp.y, 2, pp.x, pp.y, 175 * zoom);
      g.addColorStop(0, `rgba(255,190,120,${0.14 * night})`);
      g.addColorStop(0.45, `rgba(255,160,90,${0.06 * night})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(pp.x - 190 * zoom, pp.y - 190 * zoom, 380 * zoom, 380 * zoom);

      // street lamps
      for (const l of lamps) {
        const sp = toScreen(l.x + 6, l.y + 6);
        if (sp.x < -160 || sp.y < -160 || sp.x > W + 160 || sp.y > H + 160) continue;
        g = ctx.createRadialGradient(sp.x, sp.y, 2, sp.x, sp.y, 130 * zoom);
        g.addColorStop(0, `rgba(255,196,110,${0.28 * night})`);
        g.addColorStop(0.35, `rgba(255,160,80,${0.11 * night})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sp.x - 140 * zoom, sp.y - 140 * zoom, 280 * zoom, 280 * zoom);
      }

      // evac glow
      const ep = toScreen(EVAC.x, EVAC.y);
      const ready = game.fuel >= 3;
      g = ctx.createRadialGradient(ep.x, ep.y, 2, ep.x, ep.y, 150 * zoom);
      g.addColorStop(0, ready ? `rgba(126,217,87,${0.28 * night})` : `rgba(255,209,102,${0.12 * night})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ep.x - 160 * zoom, ep.y - 160 * zoom, 320 * zoom, 320 * zoom);

      // muzzle light
      if (player.muzzle > 0) {
        const mp = toScreen(player.x + Math.cos(player.angle) * 30, player.y + Math.sin(player.angle) * 30);
        g = ctx.createRadialGradient(mp.x, mp.y, 2, mp.x, mp.y, 100 * zoom);
        g.addColorStop(0, `rgba(255,220,140,${0.35 * clamp(player.muzzle * 6, 0, 1)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(mp.x - 110 * zoom, mp.y - 110 * zoom, 220 * zoom, 220 * zoom);
      }
      ctx.restore();
    }

    // subtle warm/cold grade
    if (game.nightAmount < 0.99) {
      ctx.fillStyle = `rgba(255,140,70,${0.025 * (1 - game.nightAmount)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // vignette
    if (vignette) {
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sh = game.shake;
    const ox = sh > 0.1 ? rand(-sh, sh) : 0;
    const oy = sh > 0.1 ? rand(-sh, sh) : 0;

    ctx.save();
    ctx.translate(W / 2 + ox, H / 2 + oy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    const view = {
      x: cam.x - W / (2 * zoom) - 90,
      y: cam.y - H / (2 * zoom) - 90,
      w: W / zoom + 180,
      h: H / zoom + 180,
    };
    drawWorld(view);
    ctx.restore();

    drawScreenFX(ox, oy);
  }

  /* ---------------- minimap ---------------- */
  function drawMinimap() {
    const mw = minimap.width, mh = minimap.height;
    const sx = mw / world.w, sy = mh / world.h;
    mctx.clearRect(0, 0, mw, mh);
    mctx.fillStyle = '#0a0d0f';
    mctx.fillRect(0, 0, mw, mh);

    mctx.fillStyle = 'rgba(90,100,100,0.25)';
    for (const r of roads) mctx.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy);

    for (const b of buildings) {
      const hasFuel = containers.some((c) => !c.looted && c.loot === 'fuel' && c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.h);
      mctx.fillStyle = hasFuel ? 'rgba(255,209,102,0.55)' : 'rgba(130,145,150,0.28)';
      mctx.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
      mctx.strokeStyle = hasFuel ? 'rgba(255,209,102,0.8)' : 'rgba(200,210,210,0.18)';
      mctx.lineWidth = 1;
      mctx.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    }

    // evac
    const ready = game.fuel >= 3;
    mctx.fillStyle = ready ? 'rgba(126,217,87,0.85)' : 'rgba(255,209,102,0.55)';
    mctx.beginPath();
    mctx.arc(EVAC.x * sx, EVAC.y * sy, 4, 0, TAU);
    mctx.fill();

    // fuel
    for (const c of containers) {
      if (c.loot !== 'fuel' || c.looted) continue;
      mctx.fillStyle = '#ffd166';
      mctx.beginPath();
      mctx.arc((c.x + c.w / 2) * sx, (c.y + c.h / 2) * sy, 2.6, 0, TAU);
      mctx.fill();
    }

    // enemies near
    for (const e of enemies) {
      if (dist(e.x, e.y, player.x, player.y) > 900) continue;
      mctx.fillStyle = e.type === 'raider' ? '#ff8a5c' : '#e05a3a';
      mctx.beginPath();
      mctx.arc(e.x * sx, e.y * sy, 1.7, 0, TAU);
      mctx.fill();
    }

    // player arrow
    const px = player.x * sx, py = player.y * sy;
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(player.angle + Math.PI / 2);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -5);
    mctx.lineTo(3.5, 4);
    mctx.lineTo(0, 2.5);
    mctx.lineTo(-3.5, 4);
    mctx.closePath();
    mctx.fill();
    mctx.restore();

    // frame
    mctx.strokeStyle = 'rgba(255,255,255,0.1)';
    mctx.strokeRect(0.5, 0.5, mw - 1, mh - 1);
    mctx.fillStyle = 'rgba(255,255,255,0.4)';
    mctx.font = '800 12px ui-sans-serif, system-ui, sans-serif';
    mctx.textAlign = 'left';
    mctx.fillText('N', 6, 14);
  }

  /* ---------------- particles / decals / drops ---------------- */
  function spawnParticle(x, y, opts) {
    if (particles.length > 620) particles.shift();
    particles.push({
      x, y,
      vx: opts.vx || 0, vy: opts.vy || 0,
      life: opts.life || 0.5, maxLife: opts.life || 0.5,
      size: opts.size || 2, color: opts.color || '#fff',
      shape: opts.shape || 'dot', alpha: opts.alpha == null ? 1 : opts.alpha,
      drag: opts.drag == null ? 0.92 : opts.drag,
      gravity: opts.gravity || 0,
    });
  }

  function bloodBurst(x, y, angle, amount) {
    for (let i = 0; i < amount; i++) {
      const a = angle + rand(-0.9, 0.9);
      const sp = rand(30, 160);
      spawnParticle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.65), size: rand(1.5, 4),
        color: Math.random() < 0.35 ? '#8e1f1f' : '#4f1010',
        drag: 0.9, gravity: 30,
      });
    }
    if (bloodDecals.length > 150) bloodDecals.shift();
    bloodDecals.push({ x, y, r: rand(5, 13), rot: rand(0, TAU), a: rand(0.22, 0.48), color: '#3d0d0d' });
  }

  function sparks(x, y, angle, color) {
    for (let i = 0; i < 5; i++) {
      const a = angle + Math.PI + rand(-0.8, 0.8);
      const sp = rand(40, 170);
      spawnParticle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.1, 0.3), size: rand(1, 2.4),
        color: color || '#ffd27a', shape: 'spark', drag: 0.86,
      });
    }
  }

  function smokePuff(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      spawnParticle(x + rand(-6, 6), y + rand(-6, 6), {
        vx: rand(-18, 18), vy: rand(-30, -8),
        life: rand(0.5, 1.2), size: rand(4, 10),
        color: color || 'rgba(130,120,105,0.4)', shape: 'smoke', drag: 0.94,
      });
    }
  }

  function addFloater(x, y, text, color, size) {
    if (floaters.length > 30) floaters.shift();
    floaters.push({ x, y, text, color: color || '#fff', size: size || 12, life: 0.8, maxLife: 0.8, vy: -38 });
  }

  function spawnDrop(x, y, type) {
    drops.push({ x, y, type, life: 34, bob: rand(0, TAU), vx: rand(-30, 30), vy: rand(-30, 30) });
  }

  function giveAmmo(amount, id) {
    const guns = ownedGuns();
    if (!guns.length) return;
    const target = id && weapons[id] && weapons[id].owned ? id : pick(guns);
    weapons[target].reserve += amount;
    toast(`+${amount} peluru ${weapons[target].name}`, 'good');
    updateWeaponBar(true);
  }

  function addConsumable(kind, n) {
    const max = 9;
    const before = player.inv[kind];
    player.inv[kind] = clamp(player.inv[kind] + n, 0, max);
    return player.inv[kind] - before;
  }

  /* ---------------- navigation flow field ---------------- */
  const CELL = 32;
  let gridCols = 0, gridRows = 0, blockedGrid = null, flowGrid = null, flowTimer = 0, flowCell = -1;

  function buildNavGrid() {
    gridCols = Math.ceil(world.w / CELL);
    gridRows = Math.ceil(world.h / CELL);
    blockedGrid = new Uint8Array(gridCols * gridRows);
    flowGrid = new Int32Array(gridCols * gridRows);
    for (const s of solids) {
      const x0 = Math.max(0, Math.floor(s.x / CELL));
      const y0 = Math.max(0, Math.floor(s.y / CELL));
      const x1 = Math.min(gridCols - 1, Math.floor((s.x + s.w - 1) / CELL));
      const y1 = Math.min(gridRows - 1, Math.floor((s.y + s.h - 1) / CELL));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blockedGrid[y * gridCols + x] = 1;
    }
  }

  function freeCellNear(cx, cy) {
    cx = clamp(cx, 0, gridCols - 1);
    cy = clamp(cy, 0, gridRows - 1);
    if (!blockedGrid[cy * gridCols + cx]) return cy * gridCols + cx;
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= gridCols || y >= gridRows) continue;
          if (!blockedGrid[y * gridCols + x]) return y * gridCols + x;
        }
      }
    }
    return -1;
  }

  function rebuildFlow() {
    if (!flowGrid) return;
    flowGrid.fill(-1);
    const cx = Math.floor(player.x / CELL);
    const cy = Math.floor(player.y / CELL);
    const start = freeCellNear(cx, cy);
    if (start < 0) return;
    flowCell = start;
    flowGrid[start] = 0;
    const q = new Int32Array(gridCols * gridRows);
    let head = 0, tail = 0;
    q[tail++] = start;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (head < tail) {
      const idx = q[head++];
      const d = flowGrid[idx];
      const x = idx % gridCols, y = (idx / gridCols) | 0;
      for (let i = 0; i < 8; i++) {
        const nx = x + dirs[i][0], ny = y + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows) continue;
        const ni = ny * gridCols + nx;
        if (blockedGrid[ni] || flowGrid[ni] >= 0) continue;
        if (i >= 4) {
          if (blockedGrid[y * gridCols + nx] || blockedGrid[ny * gridCols + x]) continue;
        }
        flowGrid[ni] = d + 1;
        q[tail++] = ni;
      }
    }
  }

  function flowAngle(e) {
    if (!flowGrid) return angleTo(e.x, e.y, player.x, player.y);
    const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
    if (cx < 0 || cy < 0 || cx >= gridCols || cy >= gridRows) return angleTo(e.x, e.y, player.x, player.y);
    const idx = cy * gridCols + cx;
    let best = flowGrid[idx] < 0 ? Infinity : flowGrid[idx];
    let bx = -1, by = -1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = 0; i < 8; i++) {
      const nx = cx + dirs[i][0], ny = cy + dirs[i][1];
      if (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows) continue;
      const d = flowGrid[ny * gridCols + nx];
      if (d >= 0 && d < best) {
        best = d; bx = nx; by = ny;
      }
    }
    if (bx < 0) return angleTo(e.x, e.y, player.x, player.y);
    return angleTo(e.x, e.y, bx * CELL + CELL / 2, by * CELL + CELL / 2);
  }

  /* ---------------- enemy spawning ---------------- */
  const ENEMY_TYPES = {
    walker: { hp: 40, speed: 52, r: 13, damage: 7, score: 10, color: '#7c945c', name: 'Walker' },
    runner: { hp: 28, speed: 96, r: 11, damage: 6, score: 14, color: '#93a65d', name: 'Runner' },
    brute: { hp: 170, speed: 42, r: 20, damage: 20, score: 40, color: '#86664c', name: 'Brute' },
    spitter: { hp: 58, speed: 46, r: 14, damage: 9, score: 25, color: '#86a86b', name: 'Spitter' },
    raider: { hp: 68, speed: 80, r: 12, damage: 7, score: 30, color: '#a47d60', name: 'Raider' },
  };

  function chooseEnemyType() {
    const weights = [['walker', 60], ['runner', game.night ? 34 : 13]];
    if (game.day >= 2) {
      weights.push(['spitter', game.night ? 15 : 8]);
      weights.push(['raider', 11]);
    }
    if (game.day >= 3) weights.push(['brute', game.night ? 13 : 6]);
    let total = 0;
    for (const w of weights) total += w[1];
    let r = Math.random() * total;
    for (const w of weights) {
      r -= w[1];
      if (r <= 0) return w[0];
    }
    return 'walker';
  }

  function spawnEnemy(type, px, py) {
    type = type || chooseEnemyType();
    const def = ENEMY_TYPES[type];
    let x = px, y = py;
    if (x == null) {
      let ok = false;
      for (let i = 0; i < 50; i++) {
        const a = rand(0, TAU);
        const rr2 = rand(620, 1000);
        x = player.x + Math.cos(a) * rr2;
        y = player.y + Math.sin(a) * rr2;
        if (!pointFree(x, y, def.r + 4)) continue;
        if (insideBuilding(x, y)) continue;
        if (dist(x, y, EVAC.x, EVAC.y) < 120) continue;
        ok = true;
        break;
      }
      if (!ok) {
        x = clamp(player.x + rand(-900, 900), 60, world.w - 60);
        y = clamp(player.y + rand(-700, 700), 60, world.h - 60);
      }
    }
    const hpScale = 1 + 0.14 * (game.day - 1);
    const dmgScale = 1 + 0.12 * (game.day - 1);
    const e = {
      type, x, y, r: def.r,
      hp: def.hp * hpScale, maxHp: def.hp * hpScale,
      speed: def.speed * (1 + 0.018 * (game.day - 1)),
      damage: def.damage * dmgScale,
      score: def.score, color: def.color,
      angle: rand(0, TAU), walk: rand(0, TAU),
      attackCd: rand(0.4, 1.4), shootCd: rand(0.8, 2.2),
      hitFlash: 0, los: false, losTimer: 0, kx: 0, ky: 0,
      dead: false, lunge: 0,
    };
    enemies.push(e);
    smokePuff(x, y, 'rgba(80,70,55,0.35)', 4);
    if (Math.random() < 0.25) sfx('growl');
    return e;
  }

  function spawnBurst(count) {
    for (let i = 0; i < count; i++) spawnEnemy(chooseEnemyType());
  }

  /* ---------------- combat ---------------- */
  function unlockWeapon(id) {
    const w = weapons[id];
    if (!w) return;
    if (w.owned) {
      w.reserve += w.ammoGive || 20;
      toast(`+${w.ammoGive || 20} peluru ${w.name}`, 'good');
    } else {
      w.owned = true;
      w.mag = w.magSize;
      w.reserve = w.reserve || 0;
      game.current = id;
      game.reload = 0;
      toast(`${w.name.toUpperCase()} ditemukan!`, 'good', 2800);
      sfx('pickup');
      if (navigator.vibrate) navigator.vibrate([15, 40, 20]);
    }
    updateWeaponBar(true);
  }

  function selectWeapon(id) {
    if (game.mode !== 'playing') return;
    const w = weapons[id];
    if (!w || !w.owned) {
      toast('Senjata masih terkunci', 'warn');
      return;
    }
    if (game.current === id) return;
    game.current = id;
    game.reload = 0;
    game.reloadWeapon = null;
    player.fireCd = Math.max(player.fireCd, 0.14);
    sfx('switch');
    updateWeaponBar(true);
  }

  function cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((id) => weapons[id].owned);
    const idx = owned.indexOf(game.current);
    const next = owned[(idx + dir + owned.length) % owned.length];
    selectWeapon(next);
  }

  function startReload() {
    const w = weapons[game.current];
    if (!w || w.melee || game.reload > 0) return;
    if (w.mag >= w.magSize || w.reserve <= 0) {
      if (w.reserve <= 0) toast('Peluru habis!', 'bad');
      return;
    }
    game.reload = w.reload;
    game.reloadWeapon = game.current;
    sfx('reload');
    updateWeaponBar(true);
  }

  function finishReload() {
    const id = game.reloadWeapon || game.current;
    const w = weapons[id];
    if (!w) return;
    const need = w.magSize - w.mag;
    const take = Math.min(need, w.reserve);
    w.mag += take;
    w.reserve -= take;
    game.reload = 0;
    game.reloadWeapon = null;
    updateWeaponBar(true);
  }

  function aimAssist(angle) {
    let best = angle;
    let bestDiff = 0.2;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist(player.x, player.y, e.x, e.y);
      if (d > 760) continue;
      const a = angleTo(player.x, player.y, e.x, e.y);
      const diff = Math.abs(normAngle(a - angle));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = a;
      }
    }
    return best;
  }

  function tryShoot() {
    const w = weapons[game.current];
    if (!w || game.reload > 0 || player.fireCd > 0) return;
    if (w.melee) {
      player.fireCd = w.cooldown;
      player.swing = 0.2;
      sfx('knife');
      const hit = [];
      for (const e of enemies) {
        if (e.dead) continue;
        const d = dist(player.x, player.y, e.x, e.y);
        if (d > w.range + e.r) continue;
        const a = angleTo(player.x, player.y, e.x, e.y);
        if (Math.abs(normAngle(a - player.angle)) > w.arc / 2) continue;
        hit.push(e);
      }
      for (const e of hit) damageEnemy(e, w.damage, angleTo(player.x, player.y, e.x, e.y), true);
      if (hit.length) {
        game.shake = Math.min(8, game.shake + 2.4);
        if (navigator.vibrate) navigator.vibrate(10);
      }
      return;
    }

    if (w.mag <= 0) {
      if (w.reserve > 0) startReload();
      else {
        sfx('empty');
        player.fireCd = 0.35;
      }
      return;
    }

    let angle = player.angle;
    if (input.touchFiring) angle = aimAssist(angle);
    const pellets = w.pellets || 1;
    const muzzleX = player.x + Math.cos(angle) * 24;
    const muzzleY = player.y + Math.sin(angle) * 24;

    for (let i = 0; i < pellets; i++) {
      const a = angle + rand(-w.spread, w.spread) * (pellets > 1 ? 1 : 0.6);
      bullets.push({
        x: muzzleX, y: muzzleY,
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        damage: w.damage, life: 0.72, size: w.icon === 'rifle' ? 2.2 : 1.8,
        hostile: false, acid: false, color: '#ffe6a8', angle: a, dead: false,
      });
    }
    w.mag--;
    player.fireCd = w.cooldown;
    player.muzzle = 0.07;
    game.shake = Math.min(16, game.shake + w.shake);
    sfx(w.icon === 'shotgun' ? 'shotgun' : w.icon === 'rifle' ? 'rifle' : w.icon === 'smg' ? 'smg' : 'pistol');
    for (let i = 0; i < (w.icon === 'shotgun' ? 9 : 3); i++) {
      spawnParticle(muzzleX, muzzleY, {
        vx: Math.cos(angle) * rand(80, 260) + rand(-50, 50),
        vy: Math.sin(angle) * rand(80, 260) + rand(-50, 50),
        life: rand(0.08, 0.2), size: rand(1, 3), color: '#ffd27a', shape: 'spark', drag: 0.9,
      });
    }
    if (navigator.vibrate) navigator.vibrate(w.icon === 'shotgun' ? 22 : 8);
    updateWeaponBar(true);
  }

  function damageEnemy(e, dmg, angle, melee) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hitFlash = 0.12;
    e.kx += Math.cos(angle) * (melee ? 90 : 34);
    e.ky += Math.sin(angle) * (melee ? 90 : 34);
    bloodBurst(e.x, e.y, angle, dmg > 25 ? 9 : 5);
    addFloater(e.x + rand(-4, 4), e.y - e.r - 8, `${Math.round(dmg)}`, dmg >= 30 ? '#ffd166' : '#fff0d0', dmg >= 30 ? 15 : 11);
    sfx('hit');
    const hm = ui.hitmarker;
    hm.classList.add('on');
    setTimeout(() => hm.classList.remove('on'), 90);
    if (e.hp <= 0) killEnemy(e, angle);
  }

  function killEnemy(e, angle) {
    if (e.dead) return;
    e.dead = true;
    game.kills++;
    game.score += e.score;
    bloodBurst(e.x, e.y, angle || 0, 14);
    if (bloodDecals.length > 150) bloodDecals.shift();
    bloodDecals.push({ x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), r: rand(9, 20), rot: rand(0, TAU), a: 0.4, color: '#370b0b' });
    corpses.push({ x: e.x, y: e.y, r: e.r, rot: angle || 0, color: e.color, life: 14 });
    smokePuff(e.x, e.y, 'rgba(90,80,60,0.3)', 3);
    sfx('kill');
    if (navigator.vibrate) navigator.vibrate(12);

    const roll = Math.random();
    if (e.type === 'brute') {
      spawnDrop(e.x, e.y, 'med');
      spawnDrop(e.x + 10, e.y + 6, 'ammo');
    } else if (roll < 0.42) {
      spawnDrop(e.x, e.y, 'ammo');
    } else if (roll < 0.62) {
      spawnDrop(e.x, e.y, 'food');
    } else if (roll < 0.82) {
      spawnDrop(e.x, e.y, 'water');
    } else if (roll < 0.92) {
      spawnDrop(e.x, e.y, 'med');
    }
  }

  function damagePlayer(amount, fromAngle) {
    if (game.mode !== 'playing' || player.invuln > 0) return;
    player.hp -= amount;
    player.invuln = 0.7;
    player.hitFlash = 0.16;
    game.shake = Math.min(18, game.shake + 6);
    bloodBurst(player.x, player.y, fromAngle + Math.PI, 6);
    addFloater(player.x, player.y - 20, `-${Math.round(amount)}`, '#ff8a7a', 14);
    sfx('hurt');
    if (navigator.vibrate) navigator.vibrate(45);
    ui.damageFlash.classList.add('on');
    setTimeout(() => ui.damageFlash.classList.remove('on'), 80);
    if (player.hp <= 0) {
      player.hp = 0;
      loseGame();
    }
  }

  function useItem(kind) {
    if (game.mode !== 'playing') return;
    if (player.inv[kind] <= 0) {
      toast(kind === 'food' ? 'Tidak ada makanan' : kind === 'water' ? 'Tidak ada minuman' : 'Tidak ada obat', 'warn');
      return;
    }
    if (kind === 'food') {
      if (player.hunger >= 98) { toast('Masih kenyang', 'warn'); return; }
      player.inv.food--;
      player.hunger = clamp(player.hunger + 34, 0, 100);
      player.hp = clamp(player.hp + 4, 0, player.maxHp);
      toast('Makanan kaleng dimakan', 'good');
      sfx('eat');
    } else if (kind === 'water') {
      if (player.thirst >= 98) { toast('Belum haus', 'warn'); return; }
      player.inv.water--;
      player.thirst = clamp(player.thirst + 42, 0, 100);
      player.stamina = clamp(player.stamina + 12, 0, 100);
      toast('Air mineral diminum', 'good');
      sfx('eat');
    } else {
      if (player.hp >= player.maxHp - 1) { toast('Darah masih penuh', 'warn'); return; }
      player.inv.med--;
      player.hp = clamp(player.hp + 45, 0, player.maxHp);
      player.healGlow = 1;
      for (let i = 0; i < 10; i++) spawnParticle(player.x + rand(-12, 12), player.y + rand(-12, 12), {
        vx: rand(-20, 20), vy: rand(-50, -15), life: rand(0.4, 0.8), size: rand(1.5, 3), color: '#9dff8a', drag: 0.93,
      });
      toast('Obat digunakan (+45 HP)', 'good');
      sfx('heal');
    }
    updateInventoryUI();
  }

  function interact() {
    if (game.mode !== 'playing') return;
    const c = game.promptTarget;
    if (!c) return;
    lootContainer(c);
  }

  function lootContainer(c) {
    if (!c || c.looted) return;
    c.looted = true;
    c.glow = 1;
    sfx('loot');
    for (let i = 0; i < 8; i++) spawnParticle(c.x + c.w / 2, c.y + c.h / 2, {
      vx: rand(-60, 60), vy: rand(-90, -20), life: rand(0.3, 0.7),
      size: rand(1.5, 3.5), color: '#ffd166', drag: 0.92, gravity: 60,
    });

    if (c.loot === 'fuel') {
      game.fuel++;
      sfx('fuel');
      toast(`BENSIN ${game.fuel}/3 diambil!`, 'good', 3000);
      addFloater(c.x + c.w / 2, c.y - 10, '+ BENSIN', '#ffd166', 16);
      updateObjective();
      spawnBurst(3 + game.day);
      if (navigator.vibrate) navigator.vibrate([20, 50, 20, 50, 30]);
      if (game.fuel >= 3) {
        setTimeout(() => toast('Semua bensin! Capai zona EVAC di utara.', 'warn', 4200), 700);
      }
      return;
    }

    if (c.loot.startsWith('weapon:')) {
      unlockWeapon(c.loot.slice(7));
      return;
    }

    switch (c.loot) {
      case 'ammo':
        giveAmmo(randInt(12, 24));
        break;
      case 'food':
        addConsumable('food', randInt(1, 2));
        toast('+ Makanan kaleng', 'good');
        break;
      case 'water':
        addConsumable('water', randInt(1, 2));
        toast('+ Air mineral', 'good');
        break;
      case 'med':
        addConsumable('med', 1);
        toast('+ Obat', 'good');
        break;
      default: {
        const roll = Math.random();
        if (roll < 0.3) { giveAmmo(randInt(8, 18)); }
        else if (roll < 0.55) { addConsumable('food', 1); toast('+ Makanan kaleng', 'good'); }
        else if (roll < 0.8) { addConsumable('water', 1); toast('+ Air mineral', 'good'); }
        else { addConsumable('med', 1); toast('+ Obat', 'good'); }
      }
    }
    updateInventoryUI();
  }

  function nearestLoot() {
    let best = null, bd = 78;
    for (const c of containers) {
      if (c.looted) continue;
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const d = dist(player.x, player.y, cx, cy);
      if (d >= bd) continue;
      if (lineBlockedExceptTarget(player.x, player.y, cx, cy)) continue;
      bd = d;
      best = c;
    }
    return best;
  }

  /* ---------------- update: world / player ---------------- */
  const DAY_LEN = 125;
  const NIGHT_LEN = 82;

  function updateDay(dt) {
    game.cycle += dt;
    if (!game.night && game.cycle >= DAY_LEN) {
      game.night = true;
      game.cycle = 0;
      toast('Malam tiba. Gerombolan keluar...', 'bad', 3400);
      sfx('growl');
    } else if (game.night && game.cycle >= NIGHT_LEN) {
      game.night = false;
      game.day++;
      game.cycle = 0;
      toast(`Hari ${game.day} — matahari terbit`, 'good', 3000);
      sfx('heal');
    }
    const target = game.night ? 1 : 0;
    game.nightAmount = lerp(game.nightAmount, target, 1 - Math.exp(-dt * 0.75));
  }

  function updatePlayer(dt) {
    let mx = 0, my = 0;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mx -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mx += 1;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) my -= 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) my += 1;
    mx += input.touchMoveX;
    my += input.touchMoveY;
    mx += input.tiltX * 0.9;
    my += input.tiltY * 0.9;

    let mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
    player.moving = mag > 0.06;

    const wantSprint = (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') || input.touchMoveMag > 0.9) && player.moving;
    player.sprinting = wantSprint && player.stamina > 1;
    const spd = player.sprinting ? player.sprintSpeed : player.speed;

    if (player.moving) {
      moveCircle(player, mx * spd * dt, my * spd * dt, player.r);
      player.walk += dt * (player.sprinting ? 1.8 : 1.1);
      if (Math.random() < dt * 9) {
        spawnParticle(player.x + rand(-7, 7), player.y + 6 + rand(-3, 3), {
          vx: rand(-12, 12), vy: rand(-10, 4), life: rand(0.2, 0.45),
          size: rand(1.5, 3), color: 'rgba(130,118,96,0.32)', shape: 'smoke', drag: 0.9,
        });
      }
    }
    player.stamina = clamp(player.stamina + (player.sprinting ? -21 : 14) * dt, 0, 100);

    // aim
    let desired = player.angle;
    if (input.mouseActive && !input.touchAimActive) {
      const wx = cam.x + (input.mx - W / 2) / zoom;
      const wy = cam.y + (input.my - H / 2) / zoom;
      desired = angleTo(player.x, player.y, wx, wy);
    } else if (Math.hypot(input.touchAimX, input.touchAimY) > 0.15) {
      desired = Math.atan2(input.touchAimY, input.touchAimX);
    }
    player.angle = angleLerp(player.angle, desired, 1 - Math.exp(-dt * 19));

    // weapons
    player.fireCd = Math.max(0, player.fireCd - dt);
    player.muzzle = Math.max(0, player.muzzle - dt);
    player.swing = Math.max(0, player.swing - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.healGlow = Math.max(0, player.healGlow - dt);
    if (game.reload > 0) {
      game.reload -= dt;
      if (game.reload <= 0) finishReload();
    }
    if (input.firing || input.touchFiring) {
      const w = weapons[game.current];
      if (w && !w.melee && w.mag <= 0 && w.reserve > 0 && game.reload <= 0) startReload();
      else tryShoot();
    }

    // survival needs
    player.hunger = clamp(player.hunger - dt * 0.24, 0, 100);
    player.thirst = clamp(player.thirst - dt * 0.34, 0, 100);
    if (player.hunger <= 0) {
      player.hp -= dt * 1.1;
      if (Math.random() < dt * 0.14) toast('Kamu kelaparan!', 'bad');
    }
    if (player.thirst <= 0) {
      player.hp -= dt * 1.5;
      if (Math.random() < dt * 0.16) toast('Kamu kehausan!', 'bad');
    }
    if (player.hp <= 0) {
      player.hp = 0;
      loseGame();
      return;
    }
    if (player.hp < 30) body.classList.add('low-hp');
    else body.classList.remove('low-hp');

    if (game.fuel >= 3 && dist(player.x, player.y, EVAC.x, EVAC.y) < EVAC.r * 0.72) winGame();
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); continue; }
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.shootCd = Math.max(0, e.shootCd - dt);
      e.lunge = Math.max(0, e.lunge - dt);
      e.losTimer -= dt;
      const ed = dist(e.x, e.y, player.x, player.y);
      if (e.losTimer <= 0) {
        e.los = ed < 880 && !lineBlocked(e.x, e.y, player.x, player.y);
        e.losTimer = 0.2 + Math.random() * 0.22;
      }

      let desired;
      if (e.los && ed < 820) desired = angleTo(e.x, e.y, player.x, player.y);
      else desired = flowAngle(e);

      let moveScale = 1;
      if (e.type === 'spitter') {
        if (ed < 250) { desired = angleTo(player.x, player.y, e.x, e.y); moveScale = 0.9; }
        else if (ed < 430 && e.los) {
          moveScale = 0.18;
          if (e.shootCd <= 0) {
            const a = angleTo(e.x, e.y, player.x, player.y) + rand(-0.05, 0.05);
            bullets.push({
              x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16,
              vx: Math.cos(a) * 330, vy: Math.sin(a) * 330,
              damage: e.damage * 0.9, life: 2.6, size: 5.5,
              hostile: true, acid: true, color: '#b9ff74', angle: a, dead: false,
            });
            e.shootCd = rand(2.1, 2.9);
            sfx('spit');
            for (let k = 0; k < 5; k++) spawnParticle(e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, {
              vx: Math.cos(a) * rand(30, 90) + rand(-25, 25), vy: Math.sin(a) * rand(30, 90) + rand(-25, 25),
              life: rand(0.2, 0.45), size: rand(1.5, 3), color: '#a8e86a', drag: 0.9,
            });
          }
        }
      } else if (e.type === 'raider') {
        if (ed < 190) { desired = angleTo(player.x, player.y, e.x, e.y); moveScale = 0.8; }
        else if (ed < 540 && e.los) {
          moveScale = 0.22;
          if (e.shootCd <= 0) {
            const a = angleTo(e.x, e.y, player.x, player.y) + rand(-0.08, 0.08);
            bullets.push({
              x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16,
              vx: Math.cos(a) * 960, vy: Math.sin(a) * 960,
              damage: e.damage, life: 1.4, size: 2.4,
              hostile: true, acid: false, color: '#ff9a72', angle: a, dead: false,
            });
            e.shootCd = rand(1.2, 1.9);
            sfx('pistol');
          }
        }
      }

      // separation
      let sepX = 0, sepY = 0;
      for (let j = 0; j < enemies.length; j++) {
        if (j === i) continue;
        const o = enemies[j];
        const dx = e.x - o.x, dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        const minD = e.r + o.r + 6;
        if (d2 > 0.01 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          sepX += (dx / d) * (1 - d / minD);
          sepY += (dy / d) * (1 - d / minD);
        }
      }

      const spd = e.speed * (game.night ? 1.06 : 1) * moveScale;
      e.kx *= Math.exp(-7 * dt);
      e.ky *= Math.exp(-7 * dt);
      const vx = Math.cos(desired) * spd + sepX * 90 + e.kx;
      const vy = Math.sin(desired) * spd + sepY * 90 + e.ky;
      moveCircle(e, vx * dt, vy * dt, e.r);
      e.walk += dt * (1 + spd / 90);
      e.angle = angleLerp(e.angle, angleTo(e.x, e.y, player.x, player.y), 1 - Math.exp(-dt * 7));

      if (ed < e.r + player.r + 10 && e.attackCd <= 0) {
        damagePlayer(e.damage, angleTo(player.x, player.y, e.x, e.y));
        e.attackCd = e.type === 'runner' ? 0.9 : e.type === 'brute' ? 1.5 : 1.12;
        e.lunge = 0.22;
        e.kx += Math.cos(desired) * 25;
        e.ky += Math.sin(desired) * 25;
      }
      if (Math.random() < dt * 0.025) sfx('growl');
    }
    for (let i = corpses.length - 1; i >= 0; i--) {
      corpses[i].life -= dt;
      if (corpses[i].life <= 0) corpses.splice(i, 1);
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.dead) { bullets.splice(i, 1); continue; }
      const x1 = b.x, y1 = b.y;
      const x2 = x1 + b.vx * dt, y2 = y1 + b.vy * dt;
      let bestT = 1, hitEnemy = null, hitSolid = null;

      if (b.hostile) {
        const t = segCircleT(x1, y1, x2, y2, player.x, player.y, player.r + 2);
        if (t >= 0 && t < bestT) { bestT = t; hitEnemy = 'player'; }
      } else {
        for (const e of enemies) {
          if (e.dead) continue;
          const t = segCircleT(x1, y1, x2, y2, e.x, e.y, e.r + 2);
          if (t >= 0 && t < bestT) { bestT = t; hitEnemy = e; }
        }
      }

      for (let s = 0; s < solids.length; s++) {
        const t = segRectT(x1, y1, x2, y2, solids[s]);
        if (t >= 0 && t < bestT) { bestT = t; hitSolid = solids[s]; hitEnemy = null; }
      }

      if (bestT < 1) {
        const hx = x1 + (x2 - x1) * bestT;
        const hy = y1 + (y2 - y1) * bestT;
        if (hitEnemy === 'player') {
          damagePlayer(b.damage, Math.atan2(b.vy, b.vx));
          if (b.acid) {
            for (let k = 0; k < 6; k++) spawnParticle(hx, hy, {
              vx: rand(-60, 60), vy: rand(-60, 60), life: rand(0.2, 0.5),
              size: rand(1.5, 3), color: '#b9ff74', drag: 0.9,
            });
          }
        } else if (hitEnemy) {
          damageEnemy(hitEnemy, b.damage, Math.atan2(b.vy, b.vx), false);
          if (b.acid) {
            for (let k = 0; k < 5; k++) spawnParticle(hx, hy, {
              vx: rand(-50, 50), vy: rand(-50, 50), life: rand(0.2, 0.45),
              size: rand(1.5, 3), color: '#b9ff74', drag: 0.9,
            });
          }
        } else if (hitSolid) {
          sparks(hx, hy, Math.atan2(b.vy, b.vx), b.acid ? '#b9ff74' : '#ffd27a');
          if (b.acid) {
            if (bloodDecals.length > 150) bloodDecals.shift();
            bloodDecals.push({ x: hx, y: hy, r: rand(5, 10), rot: rand(0, TAU), a: 0.28, color: '#3d5c1d' });
          }
        }
        b.dead = true;
        continue;
      }

      b.x = x2;
      b.y = y2;
      b.life -= dt;
      if (b.life <= 0 || b.x < 30 || b.y < 30 || b.x > world.w - 30 || b.y > world.h - 30) b.dead = true;
    }
  }

  function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.exp(-5 * dt);
      d.vy *= Math.exp(-5 * dt);
      const dd = dist(d.x, d.y, player.x, player.y);
      if (dd < 78 && dd > 1) {
        const pull = (1 - dd / 78) * 300;
        d.x += ((player.x - d.x) / dd) * pull * dt;
        d.y += ((player.y - d.y) / dd) * pull * dt;
      }
      if (dd < 27) {
        if (d.type === 'ammo') giveAmmo(randInt(6, 14));
        else {
          addConsumable(d.type, 1);
          toast(d.type === 'food' ? '+ Makanan' : d.type === 'water' ? '+ Air' : '+ Obat', 'good');
          updateInventoryUI();
        }
        sfx('pickup');
        for (let k = 0; k < 6; k++) spawnParticle(d.x, d.y, {
          vx: rand(-40, 40), vy: rand(-60, -10), life: rand(0.2, 0.5),
          size: rand(1, 2.5), color: '#ffe2a0', drag: 0.9,
        });
        drops.splice(i, 1);
        continue;
      }
      if (d.life <= 0) drops.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  function updateBuildings(dt) {
    for (const b of buildings) {
      const inside = player.x > b.interior.x && player.x < b.interior.x + b.interior.w && player.y > b.interior.y && player.y < b.interior.y + b.interior.h;
      b.inside = inside;
      b.roofAlpha = lerp(b.roofAlpha, inside ? 0 : 1, 1 - Math.exp(-dt * 9));
    }
  }

  function updateCamera(dt, instant) {
    let tx, ty;
    if (game.mode === 'menu') {
      tx = 1800 + Math.cos(game.menuT * 0.055) * 560;
      ty = 1280 + Math.sin(game.menuT * 0.043) * 330;
    } else {
      tx = player.x + Math.cos(player.angle) * 34;
      ty = player.y + Math.sin(player.angle) * 34;
    }
    const halfW = W / (2 * zoom), halfH = H / (2 * zoom);
    tx = clamp(tx, halfW + 20, world.w - halfW - 20);
    ty = clamp(ty, halfH + 20, world.h - halfH - 20);
    if (instant) {
      cam.x = tx; cam.y = ty;
    } else {
      const k = 1 - Math.exp(-dt * 7);
      cam.x = lerp(cam.x, tx, k);
      cam.y = lerp(cam.y, ty, k);
    }
  }

  function updateGame(dt) {
    game.runTime += dt;
    updateDay(dt);
    flowTimer -= dt;
    if (flowTimer <= 0) { rebuildFlow(); flowTimer = 0.38; }
    updatePlayer(dt);
    if (game.mode !== 'playing') return;
    updateEnemies(dt);
    updateBullets(dt);
    updateDrops(dt);
    updateParticles(dt);
    updateBuildings(dt);
    updateCamera(dt, false);
    game.shake *= Math.exp(-8 * dt);

    const maxAlive = Math.min(30, 5 + game.day * 3 + (game.night ? 5 : 0));
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      if (enemies.length < maxAlive) {
        spawnEnemy();
        if (game.night && Math.random() < 0.45) spawnEnemy();
      }
      const base = game.night ? Math.max(1.5, 4.2 - game.day * 0.2) : Math.max(3.4, 7.0 - game.day * 0.35);
      game.spawnTimer = base * rand(0.7, 1.3);
    }

    updateHUD();
  }

  function updateMenu(dt) {
    game.menuT += dt;
    updateCamera(dt, false);
    updateParticles(dt);
    game.nightAmount = 0.55 + Math.sin(game.menuT * 0.18) * 0.12;
  }

  /* ---------------- UI ---------------- */
  let weaponSig = '';
  const wslotEls = [];

  function buildWeaponBar() {
    ui.weaponBar.innerHTML = WEAPON_ORDER.map((id, i) => {
      const w = WEAPON_DEFS[id];
      return `<button class="wslot" type="button" data-w="${id}"><span class="key">${i + 1}</span>${ICONS[w.icon]}<span class="wname">${w.short}</span><span class="wammo">—</span></button>`;
    }).join('');
    wslotEls.length = 0;
    ui.weaponBar.querySelectorAll('.wslot').forEach((el) => {
      wslotEls.push(el);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectWeapon(el.dataset.w);
      });
    });
  }

  function updateWeaponBar(force) {
    if (!wslotEls.length) buildWeaponBar();
    const sig = WEAPON_ORDER.map((id) => {
      const w = weapons[id];
      return `${id}:${w.owned ? 1 : 0}:${w.mag}:${w.reserve}:${game.current === id ? 1 : 0}:${game.reload > 0 && game.reloadWeapon === id ? 1 : 0}`;
    }).join('|');
    if (!force && sig === weaponSig) return;
    weaponSig = sig;
    WEAPON_ORDER.forEach((id, i) => {
      const w = weapons[id];
      const el = wslotEls[i];
      if (!el) return;
      el.classList.toggle('active', game.current === id);
      el.classList.toggle('locked', !w.owned);
      el.classList.toggle('reloading', game.reload > 0 && game.reloadWeapon === id);
      const ammo = el.querySelector('.wammo');
      if (!w.owned) ammo.textContent = '—';
      else if (w.melee) ammo.textContent = '∞';
      else if (game.reload > 0 && game.reloadWeapon === id) ammo.textContent = 'ISI…';
      else ammo.textContent = `${w.mag}/${w.reserve}`;
      el.classList.toggle('empty-mag', w.owned && !w.melee && w.mag === 0);
    });
  }

  function updateInventoryUI() {
    ui.foodCount.textContent = player.inv.food;
    ui.waterCount.textContent = player.inv.water;
    ui.medCount.textContent = player.inv.med;
    ui.btnFood.classList.toggle('empty', player.inv.food <= 0);
    ui.btnWater.classList.toggle('empty', player.inv.water <= 0);
    ui.btnMed.classList.toggle('empty', player.inv.med <= 0);
  }

  function updateObjective() {
    if (game.fuel >= 3) ui.objectiveText.textContent = 'Capai zona evakuasi di utara';
    else ui.objectiveText.textContent = `Cari bensin ${game.fuel}/3`;
  }

  function toast(text, kind, dur) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    ui.toasts.appendChild(el);
    while (ui.toasts.children.length > 4) ui.toasts.removeChild(ui.toasts.firstChild);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, dur || 2300);
  }

  function nearestFuel() {
    let best = null, bd = Infinity;
    for (const c of containers) {
      if (c.loot !== 'fuel' || c.looted) continue;
      const d = dist(player.x, player.y, c.x + c.w / 2, c.y + c.h / 2);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function updateHUD() {
    ui.hpFill.style.transform = `scaleX(${clamp(player.hp / player.maxHp, 0, 1)})`;
    ui.staFill.style.transform = `scaleX(${clamp(player.stamina / 100, 0, 1)})`;
    ui.hungerFill.style.transform = `scaleX(${clamp(player.hunger / 100, 0, 1)})`;
    ui.thirstFill.style.transform = `scaleX(${clamp(player.thirst / 100, 0, 1)})`;
    ui.hpText.textContent = Math.ceil(player.hp);

    updateWeaponBar(false);

    if (game.runTime - (game.lastClock || 0) > 0.22) {
      game.lastClock = game.runTime;
      let h, m;
      if (!game.night) {
        const f = game.cycle / DAY_LEN;
        const mins = 6 * 60 + f * 12 * 60;
        h = Math.floor(mins / 60) % 24;
        m = Math.floor(mins % 60);
      } else {
        const f = game.cycle / NIGHT_LEN;
        const mins = 18 * 60 + f * 12 * 60;
        h = Math.floor(mins / 60) % 24;
        m = Math.floor(mins % 60);
      }
      ui.dayText.textContent = `HARI ${game.day}`;
      ui.clockText.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      let near = 0;
      for (const e of enemies) if (dist(e.x, e.y, player.x, player.y) < 760) near++;
      ui.threatText.textContent = near >= 7 ? 'BAHAYA' : near >= 2 ? 'WASPADA' : 'TENANG';
      ui.threatText.classList.toggle('hot', near >= 7);
      ui.killsText.textContent = `${game.kills} KILL`;
      ui.scoreText.textContent = `${game.score} PTS`;
    }

    // objective / compass
    const target = game.fuel >= 3 ? EVAC : nearestFuel();
    if (target) {
      const tx = target.x + (target.w ? target.w / 2 : 0);
      const ty = target.y + (target.h ? target.h / 2 : 0);
      const d = dist(player.x, player.y, tx, ty);
      const a = angleTo(player.x, player.y, tx, ty);
      ui.compassArrow.style.transform = `rotate(${(a * 180) / Math.PI + 90}deg)`;
      ui.objectiveDist.textContent = `${Math.max(1, Math.round(d / 10))}m`;
    } else {
      ui.objectiveDist.textContent = '—';
    }

    // loot prompt
    const c = nearestLoot();
    if (c !== game.promptTarget) {
      game.promptTarget = c;
      if (c) {
        ui.promptText.textContent = c.kind === 'fuel' ? 'Ambil bensin' : c.kind === 'weaponcase' ? 'Buka peti senjata' : `Buka ${c.label.toLowerCase()}`;
        ui.promptKey.textContent = isTouch ? 'AMBIL' : 'E';
        ui.prompt.classList.remove('hidden');
      } else {
        ui.prompt.classList.add('hidden');
      }
    }
    ui.btnInteract.classList.toggle('ready', !!c);

    if (input.tiltEnabled) {
      ui.tiltDot.style.transform = `translate(${input.tiltX * 4}px, ${input.tiltY * 4}px)`;
    }

    if (game.runTime - (game.lastMap || 0) > 0.08) {
      game.lastMap = game.runTime;
      drawMinimap();
    }
  }

  function statHTML(items) {
    return items.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  function fillStats(el) {
    el.innerHTML = statHTML([
      [fmtTime(game.runTime), 'Bertahan'],
      [game.kills, 'Terbunuh'],
      [game.score, 'Poin'],
      [`Hari ${game.day}`, 'Tercapai'],
    ]);
  }

  function loadBest() {
    try {
      const raw = localStorage.getItem('zonamati.best.v1');
      if (raw) {
        const b = JSON.parse(raw);
        if (b && typeof b === 'object') game.best = { time: b.time || 0, kills: b.kills || 0, score: b.score || 0 };
      }
    } catch (e) { /* ignore */ }
    updateBestText();
  }

  function saveBest() {
    const b = game.best;
    if (game.runTime > b.time) b.time = game.runTime;
    if (game.kills > b.kills) b.kills = game.kills;
    if (game.score > b.score) b.score = game.score;
    try { localStorage.setItem('zonamati.best.v1', JSON.stringify(b)); } catch (e) { /* ignore */ }
    updateBestText();
  }

  function updateBestText() {
    const b = game.best;
    if (!b || (!b.time && !b.kills && !b.score)) ui.bestText.textContent = 'Rekor: —';
    else ui.bestText.textContent = `Rekor: ${fmtTime(b.time)} • ${b.kills} kill • ${b.score} poin`;
  }

  function showOnly(screen) {
    for (const s of [ui.startScreen, ui.pauseScreen, ui.deathScreen, ui.winScreen]) s.classList.add('hidden');
    if (screen) screen.classList.remove('hidden');
  }

  /* ---------------- game flow ---------------- */
  function resetGame() {
    enemies.length = 0;
    bullets.length = 0;
    particles.length = 0;
    drops.length = 0;
    corpses.length = 0;
    floaters.length = 0;
    bloodDecals.length = 0;
    game.fuel = 0;
    game.kills = 0;
    game.score = 0;
    game.runTime = 0;
    game.day = 1;
    game.night = false;
    game.cycle = 0;
    game.nightAmount = 0;
    game.spawnTimer = 14;
    game.shake = 0;
    game.reload = 0;
    game.reloadWeapon = null;
    game.current = 'pistol';
    game.promptTarget = null;
    game.lastClock = 0;
    game.lastMap = 0;
    game.menuT = 0;

    player.x = START.x;
    player.y = START.y;
    player.angle = -Math.PI / 2;
    player.hp = 100;
    player.hunger = 100;
    player.thirst = 100;
    player.stamina = 100;
    player.inv = { food: 1, water: 1, med: 1 };
    player.fireCd = 0;
    player.muzzle = 0;
    player.swing = 0;
    player.walk = 0;
    player.hitFlash = 0;
    player.invuln = 0;
    player.sprinting = false;
    player.moving = false;
    player.healGlow = 0;

    weapons = createWeapons();
    for (const c of containers) c.looted = false;
    for (const b of buildings) { b.roofAlpha = 1; b.inside = false; }
    body.classList.remove('low-hp');
    ui.prompt.classList.add('hidden');
    ui.toasts.innerHTML = '';
    input.firing = false;
    input.touchFiring = false;
    input.touchAimActive = false;
    input.touchAimX = 1;
    input.touchAimY = 0;
    updateWeaponBar(true);
    updateInventoryUI();
    updateObjective();
    drawMinimap();
    updateCamera(0, true);
  }

  function startGame() {
    initAudio();
    resetGame();
    game.mode = 'playing';
    body.classList.remove('paused');
    body.classList.add('playing');
    showOnly(null);
    updateCamera(0, true);
    toast('Cari 3 bensin. Bertahan sampai evakuasi.', 'warn', 3600);
  }

  function pauseGame() {
    if (game.mode !== 'playing') return;
    game.mode = 'paused';
    body.classList.remove('playing');
    body.classList.add('paused');
    showOnly(ui.pauseScreen);
    input.firing = false;
    input.touchFiring = false;
    input.touchMoveX = 0;
    input.touchMoveY = 0;
    input.touchMoveMag = 0;
    input.keys.clear();
  }

  function resumeGame() {
    if (game.mode !== 'paused') return;
    game.mode = 'playing';
    body.classList.remove('paused');
    body.classList.add('playing');
    showOnly(null);
  }

  function loseGame() {
    if (game.mode !== 'playing') return;
    game.mode = 'dead';
    body.classList.remove('playing', 'paused', 'low-hp');
    input.firing = false;
    input.touchFiring = false;
    fillStats(ui.deathStats);
    showOnly(ui.deathScreen);
    saveBest();
    sfx('lose');
  }

  function winGame() {
    if (game.mode !== 'playing') return;
    game.mode = 'win';
    game.score += 250 + game.fuel * 100;
    body.classList.remove('playing', 'paused', 'low-hp');
    input.firing = false;
    input.touchFiring = false;
    fillStats(ui.winStats);
    showOnly(ui.winScreen);
    saveBest();
    sfx('win');
    if (navigator.vibrate) navigator.vibrate([30, 60, 30, 60, 80]);
  }

  function backToMenu() {
    resetGame();
    game.mode = 'menu';
    body.classList.remove('playing', 'paused', 'low-hp');
    showOnly(ui.startScreen);
    updateBestText();
  }

  /* ---------------- input ---------------- */
  function updateCrosshair() {
    if (!ui.crosshair) return;
    ui.crosshair.style.left = input.mx + 'px';
    ui.crosshair.style.top = input.my + 'px';
  }

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') {
        if (game.mode === 'playing') pauseGame();
        else if (game.mode === 'paused') resumeGame();
        return;
      }
      if ((game.mode === 'menu') && (e.code === 'Enter' || e.code === 'Space')) {
        startGame();
        return;
      }
      if (game.mode !== 'playing') return;
      input.keys.add(e.code);
      if (e.code === 'KeyR') startReload();
      else if (e.code === 'KeyE') interact();
      else if (e.code === 'KeyF') useItem('food');
      else if (e.code === 'KeyG') useItem('water');
      else if (e.code === 'KeyQ') useItem('med');
      else if (e.code === 'KeyP') pauseGame();
      else if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 5) selectWeapon(WEAPON_ORDER[n - 1]);
      }
    });
    window.addEventListener('keyup', (e) => input.keys.delete(e.code));

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        input.mx = e.clientX;
        input.my = e.clientY;
        input.mouseActive = true;
        updateCrosshair();
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && game.mode === 'playing') {
        initAudio();
        input.firing = true;
        e.preventDefault();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') input.firing = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (game.mode !== 'playing') return;
      e.preventDefault();
      cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    // touch sticks
    setupStick(ui.moveZone, ui.moveBase, ui.moveKnob, (x, y, mag) => {
      input.touchMoveX = x;
      input.touchMoveY = y;
      input.touchMoveMag = mag;
    }, () => {
      input.touchMoveX = 0;
      input.touchMoveY = 0;
      input.touchMoveMag = 0;
    });

    setupStick(ui.aimZone, ui.aimBase, ui.aimKnob, (x, y, mag) => {
      input.touchAimX = x;
      input.touchAimY = y;
      input.touchAimActive = true;
      input.touchFiring = mag > 0.2;
    }, () => {
      input.touchAimActive = false;
      input.touchFiring = false;
    });

    const press = (el, fn) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        initAudio();
        fn();
      });
    };
    press(ui.btnInteract, interact);
    press(ui.btnReload, startReload);
    press(ui.btnFood, () => useItem('food'));
    press(ui.btnWater, () => useItem('water'));
    press(ui.btnMed, () => useItem('med'));

    $('#pauseBtn').addEventListener('click', (e) => { e.preventDefault(); pauseGame(); });
    $('#startBtn').addEventListener('click', startGame);
    $('#resumeBtn').addEventListener('click', resumeGame);
    $('#restartBtn').addEventListener('click', startGame);
    $('#quitBtn').addEventListener('click', backToMenu);
    $('#retryBtn').addEventListener('click', startGame);
    $('#deathQuitBtn').addEventListener('click', backToMenu);
    $('#winRetryBtn').addEventListener('click', startGame);
    $('#winQuitBtn').addEventListener('click', backToMenu);
    $('#tiltStartBtn').addEventListener('click', toggleTilt);
    $('#tiltPauseBtn').addEventListener('click', toggleTilt);
    $('#calibrateBtn').addEventListener('click', () => {
      if (!input.tiltEnabled) { toast('Aktifkan tilt terlebih dahulu', 'warn'); return; }
      calibrateTilt();
    });
    $('#soundStartBtn').addEventListener('click', toggleMute);
    $('#soundPauseBtn').addEventListener('click', toggleMute);

    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.mode === 'playing') pauseGame();
    });
  }

  function setupStick(zone, base, knob, onChange, onEnd) {
    let pid = null, ox = 0, oy = 0;
    const resetKnob = () => { knob.style.transform = 'translate(-50%,-50%)'; };

    zone.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      pid = e.pointerId;
      try { zone.setPointerCapture(pid); } catch (err) { /* ignore */ }
      const rect = zone.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      base.style.left = ox + 'px';
      base.style.top = oy + 'px';
      base.classList.add('active');
      resetKnob();
      onChange(0, 0, 0);
      e.preventDefault();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const rect = zone.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      let dx = px - ox, dy = py - oy;
      const max = base.offsetWidth * 0.27 || 30;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      const nx = dx / max, ny = dy / max;
      const mag = Math.min(1, Math.hypot(nx, ny));
      knob.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
      onChange(nx, ny, mag);
      e.preventDefault();
    });

    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      base.classList.remove('active');
      resetKnob();
      onEnd();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  /* ---------------- tilt ---------------- */
  let tiltBase = null, tiltRaw = { x: 0, y: 0 };

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const ax = a.x || 0, ay = a.y || 0;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let sx = ax, sy = ay;
    if (angle === 90) { sx = ay; sy = -ax; }
    else if (angle === 180) { sx = -ax; sy = -ay; }
    else if (angle === 270) { sx = -ay; sy = ax; }
    const rawX = -sx;
    const rawY = sy;
    if (!tiltBase) {
      tiltBase = { x: rawX, y: rawY };
      tiltRaw.x = 0; tiltRaw.y = 0;
      return;
    }
    tiltRaw.x = lerp(tiltRaw.x, rawX - tiltBase.x, 0.22);
    tiltRaw.y = lerp(tiltRaw.y, rawY - tiltBase.y, 0.22);
    const map = (v) => {
      const dead = 0.65;
      const s = Math.sign(v) * Math.max(0, Math.abs(v) - dead);
      return clamp(s / 4.6, -1, 1);
    };
    input.tiltX = map(tiltRaw.x);
    input.tiltY = map(tiltRaw.y);
  }

  function calibrateTilt() {
    tiltBase = null;
    tiltRaw = { x: 0, y: 0 };
    input.tiltX = 0;
    input.tiltY = 0;
    toast('Tilt dikalibrasi — pegang perangkat senyaman mungkin.', 'good', 2800);
  }

  async function toggleTilt() {
    if (input.tiltEnabled) {
      window.removeEventListener('devicemotion', onMotion);
      input.tiltEnabled = false;
      input.tiltX = 0;
      input.tiltY = 0;
      updateTiltUI();
      toast('Tilt dimatikan', 'warn');
      return;
    }
    if (!('DeviceMotionEvent' in window)) {
      toast('Sensor gerak tidak tersedia di perangkat ini', 'bad', 2800);
      return;
    }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') {
          toast('Izin gerak ditolak. Tilt tetap nonaktif.', 'bad', 3000);
          return;
        }
      } catch (err) {
        toast('Izin gerak gagal diminta.', 'bad', 3000);
        return;
      }
    }
    window.addEventListener('devicemotion', onMotion);
    input.tiltEnabled = true;
    tiltBase = null;
    tiltRaw = { x: 0, y: 0 };
    input.tiltX = 0;
    input.tiltY = 0;
    updateTiltUI();
    toast('Tilt aktif — miringkan perangkat untuk bergerak.', 'good', 3200);
  }

  function updateTiltUI() {
    const label = input.tiltEnabled ? 'TILT: AKTIF' : 'TILT: NONAKTIF';
    const a = $('#tiltStartBtn'), b = $('#tiltPauseBtn');
    if (a) a.textContent = label;
    if (b) b.textContent = label;
    ui.tiltBadge.classList.toggle('hidden', !input.tiltEnabled);
  }

  function updateSoundButtons() {
    const label = muted ? 'SUARA: NONAKTIF' : 'SUARA: AKTIF';
    const a = $('#soundStartBtn'), b = $('#soundPauseBtn');
    if (a) a.textContent = label;
    if (b) b.textContent = label;
  }

  function toggleMute() {
    initAudio();
    setMuted(!muted);
    if (!muted) sfx('pickup');
  }

  /* ---------------- boot ---------------- */
  function init() {
    resize();
    initPatterns();
    buildWorld();
    buildNavGrid();
    loadBest();
    bindInput();
    updateTiltUI();
    updateSoundButtons();
    resetGame();
    game.mode = 'menu';
    showOnly(ui.startScreen);
    updateCamera(0, true);
    drawMinimap();
    requestAnimationFrame(loop);
  }

  let lastFrame = 0;
  function loop(now) {
    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;
    game.time += dt;

    if (game.mode === 'playing') updateGame(dt);
    else if (game.mode === 'menu') updateMenu(dt);
    else updateParticles(dt * 0.15);

    render();
    requestAnimationFrame(loop);
  }

  init();
})();
