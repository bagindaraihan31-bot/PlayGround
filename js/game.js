// ── KOTA MATI — game core ────────────────────────────────────────────
import {
  TILE, WORLD_PX, WEAPONS, WEAPON_ORDER, AMMO, ZOMBIES, ITEMS,
  BUILDING_TYPES, CONTAINERS, TAU, clamp, lerp, rand, randInt, choice,
  angleDiff, dist,
} from './config.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.sfx = new Sfx();
    this.state = 'menu';
    this.time = 0;
    this.lastTs = performance.now();
    this.zoom = 1;
    this.cam = { x: WORLD_PX / 2, y: WORLD_PX / 2 };
    this.shake = 0;
    this.hurtFlash = 0;
    this.hudTimer = 0;
    this.minimapTimer = 0;
    this.nextId = 1;
    this.groanT = 6;
    this.nearContainer = null;
    this.settings = this.loadSettings();
    this.best = this.loadBest();
    this.bindUI();
    this.applySettings();
    this.preview();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });
    requestAnimationFrame((ts) => this.frame(ts));
  }

  // ── boot / menu ─────────────────────────────────────────────────────
  preview() {
    this.world = new World();
    const start = this.world.findStart();
    this.player = this.createPlayer(start);
    const b = start.building;
    if (b && b.door) this.player.aim = Math.atan2(b.door.y - start.y, b.door.x - start.x);
    this.player.moveAngle = this.player.aim;
    this.zombies = []; this.bullets = []; this.particles = []; this.decals = [];
    this.loot = []; this.damageTexts = [];
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.clampCam();
    this.state = 'menu';
    $('app').dataset.state = 'menu';
    $('bestScore').textContent = this.best.score;
    $('bestWave').textContent = this.best.wave;
    this.syncTiltUI();
  }

  createPlayer(start) {
    return {
      x: start.x, y: start.y, r: 13,
      aim: -Math.PI / 2, moveAngle: -Math.PI / 2,
      hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
      hunger: 100, thirst: 100,
      boostT: 0, walk: 0, moving: false,
      weapons: ['golok', 'pistol'], weapon: 'pistol',
      mags: { pistol: 12 }, mag: 12,
      ammo: { '9mm': 60, '12ga': 0, '7.62': 0 },
      items: { food: 1, water: 1, energy: 0, medkit: 0 },
      cd: 0, reloading: false, reloadT: 0, reloadDur: 0,
      flash: 0, hurtT: 0, invuln: 0,
      kills: 0,
    };
  }

  startRun() {
    this.sfx.init();
    this.sfx.resume();
    this.sfx.setEnabled(this.settings.sound);
    if (this.settings.tilt && !this.input.tilt.enabled) {
      this.input.enableTilt().then((r) => {
        if (!r.ok) this.toast(r.message, 'warn');
      });
    }
    if (navigator.maxTouchPoints > 0) {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      }
    }
    this.reset();
    $('menu').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('dead').classList.add('hidden');
    $('app').dataset.state = 'playing';
    this.state = 'playing';
    this.banner('BERTAHAN HIDUP', 'Gelombang 1 datang. Cari senjata di gedung.');
    this.sfx.wave();
    setTimeout(() => {
      if (this.state !== 'playing') return;
      if (navigator.maxTouchPoints > 0) this.toast('Kiri = gerak · Kanan = bidik & tembak · Dekati peti untuk loot', 'good', 4200);
    }, 1300);
  }

  reset() {
    this.world = new World();
    const start = this.world.findStart();
    this.player = this.createPlayer(start);
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.zombies = []; this.bullets = []; this.particles = []; this.decals = [];
    this.loot = []; this.damageTexts = [];
    this.wave = 1;
    this.phase = 'fight';
    this.waveBudget = 8;
    this.spawnT = 3.5;
    this.breakT = 0;
    this.score = 0;
    this.kills = 0;
    this.survived = 0;
    this.shake = 0;
    this.hurtFlash = 0;
    this.nearContainer = null;
    this.fieldT = 0;
    this.groanT = 7;
    this.time = 0;
    this.hudDirty = true;
    this.renderWeapons();
    this.clampCam();
  }

  // ── settings & ui wiring ────────────────────────────────────────────
  loadSettings() {
    try {
      return Object.assign(
        { sound: true, haptics: true, tilt: false, sens: 1 },
        JSON.parse(localStorage.getItem('kotamati-settings') || '{}'),
      );
    } catch { return { sound: true, haptics: true, tilt: false, sens: 1 }; }
  }
  saveSettings() {
    try { localStorage.setItem('kotamati-settings', JSON.stringify(this.settings)); } catch { /* private mode */ }
  }
  loadBest() {
    try { return JSON.parse(localStorage.getItem('kotamati-best') || '{"score":0,"wave":0}'); }
    catch { return { score: 0, wave: 0 }; }
  }
  saveBest() {
    if (this.score > this.best.score) this.best.score = Math.floor(this.score);
    if (this.wave > this.best.wave) this.best.wave = this.wave;
    try { localStorage.setItem('kotamati-best', JSON.stringify(this.best)); } catch { /* private mode */ }
  }

  applySettings() {
    this.sfx.setEnabled(this.settings.sound);
    this.input.tilt.sens = this.settings.sens;
    const st = $('soundToggle');
    if (st) st.classList.toggle('on', this.settings.sound);
    const ht = $('hapticToggle');
    if (ht) ht.classList.toggle('on', this.settings.haptics);
    const sens = $('sensRange');
    if (sens) { sens.value = this.settings.sens; $('sensVal').textContent = Number(this.settings.sens).toFixed(1) + '×'; }
    this.syncTiltUI();
  }

  syncTiltUI() {
    const on = this.input.tilt.enabled;
    const btn = $('tiltBtn');
    if (btn) {
      btn.classList.toggle('on', on);
      btn.textContent = on ? 'TILT/GYRO: AKTIF' : 'TILT/GYRO: NONAKTIF';
    }
    const pt = $('tiltToggle');
    if (pt) pt.classList.toggle('on', on);
  }

  async toggleTilt() {
    if (this.input.tilt.enabled) {
      this.input.disableTilt();
      this.settings.tilt = false;
      this.saveSettings();
      this.toast('Tilt dimatikan.', 'warn');
      this.syncTiltUI();
      return;
    }
    const res = await this.input.enableTilt();
    if (res.ok) {
      this.settings.tilt = true;
      this.saveSettings();
      this.toast(res.message || 'Tilt aktif.', 'good');
    } else {
      this.settings.tilt = false;
      this.saveSettings();
      this.toast(res.message, 'warn');
    }
    this.syncTiltUI();
  }

  bindUI() {
    $('startBtn').addEventListener('click', () => this.startRun());
    $('tiltBtn').addEventListener('click', () => this.toggleTilt());
    $('pauseBtn').addEventListener('click', () => this.togglePause());
    $('resumeBtn').addEventListener('click', () => this.togglePause());
    $('restartBtn').addEventListener('click', () => { $('pause').classList.add('hidden'); this.startRun(); });
    $('menuBtn').addEventListener('click', () => this.toMenu());
    $('retryBtn').addEventListener('click', () => this.startRun());
    $('deadMenuBtn').addEventListener('click', () => this.toMenu());
    $('tiltToggle').addEventListener('click', () => this.toggleTilt());
    $('soundToggle').addEventListener('click', () => {
      this.settings.sound = !this.settings.sound;
      this.saveSettings(); this.applySettings(); this.sfx.click();
    });
    $('hapticToggle').addEventListener('click', () => {
      this.settings.haptics = !this.settings.haptics;
      this.saveSettings(); this.applySettings();
    });
    $('sensRange').addEventListener('input', (e) => {
      this.settings.sens = Number(e.target.value);
      this.input.tilt.sens = this.settings.sens;
      $('sensVal').textContent = this.settings.sens.toFixed(1) + '×';
      this.saveSettings();
    });
    $('calibrateBtn').addEventListener('click', () => {
      this.input.calibrateTilt();
      this.toast('Tilt dikalibrasi ulang.', 'good');
    });
    $('interactBtn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.interact();
    });
    $('reloadBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.press('reload'); });
    $('swapBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.press('swap'); });
    document.querySelectorAll('[data-use]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.useItem(btn.dataset.use);
      });
    });
  }

  toMenu() {
    this.state = 'menu';
    $('app').dataset.state = 'menu';
    $('pause').classList.add('hidden');
    $('dead').classList.add('hidden');
    $('menu').classList.remove('hidden');
    this.preview();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      $('app').dataset.state = 'paused';
      $('pause').classList.remove('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
      $('pauseStats').textContent = `Gelombang ${this.wave} · ${this.kills} kill · skor ${Math.floor(this.score)}`;
      this.input.clearQueue();
      this.input.keys.clear();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      $('app').dataset.state = 'playing';
      $('pause').classList.add('hidden');
      this.input.clearQueue();
      this.lastTs = performance.now();
    }
  }

  // ── main loop ───────────────────────────────────────────────────────
  frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    if (this.state === 'menu' || this.state === 'paused') this.time += dt * 0.25;
    else this.time += dt;
    this.input.update(dt);

    if (this.input.consume('pause') && (this.state === 'playing' || this.state === 'paused')) this.togglePause();

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu') this.updateMenu(dt);

    this.renderer.draw(this);
    if (this.state === 'playing') this.updateHud(dt);

    requestAnimationFrame((t) => this.frame(t));
  }

  updateMenu(dt) {
    this.time += dt * 0.2;
    const p = this.player;
    p.aim += dt * 0.12;
    const t = performance.now() / 1000;
    p.moving = false;
    const ang = Math.sin(t * 0.35) * 0.5;
    this.cam.x = p.x + Math.cos(ang) * 60;
    this.cam.y = p.y + Math.sin(ang) * 60;
    this.clampCam();
  }

  update(dt) {
    this.survived += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.updatePlayer(dt);
    this.updateBullets(dt);
    this.updateZombies(dt);
    this.updateParticles(dt);
    this.updateLoot(dt);
    this.updateWave(dt);

    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.world.computeField(this.player.x, this.player.y);
      this.fieldT = 0.5;
    }

    this.groanT -= dt;
    if (this.groanT <= 0) {
      if (this.zombies.length) this.sfx.groan();
      this.groanT = rand(5, 10);
    }
    this.clampCam();
  }

  // ── player ──────────────────────────────────────────────────────────
  updatePlayer(dt) {
    const p = this.player;
    const inp = this.input;
    const move = inp.getMove();
    const moving = move.mag > 0.1;
    let sprint = inp.isSprinting() && moving && p.stamina > 2;

    if (sprint) {
      p.stamina = Math.max(0, p.stamina - 26 * dt);
      if (p.stamina <= 0) sprint = false;
    } else {
      p.stamina = Math.min(p.maxStamina, p.stamina + 15 * dt);
    }

    const speed = 176 * (sprint ? 1.55 : 1) * (p.boostT > 0 ? 1.14 : 1) * (p.reloading ? 0.82 : 1) * (p.hunger < 15 || p.thirst < 15 ? 0.88 : 1);
    if (moving) {
      p.moveAngle = Math.atan2(move.y, move.x);
      const res = this.world.resolveCircle(
        p.x + move.x * speed * dt,
        p.y + move.y * speed * dt,
        p.r,
      );
      p.x = res.x; p.y = res.y;
      p.walk += dt * (sprint ? 13 : 9);
      p.moving = true;
    } else {
      p.moving = false;
      p.walk += dt * 3;
    }

    // aim
    let targetAim = p.aim;
    const stick = inp.aimStick();
    if (stick) {
      targetAim = Math.atan2(stick.dy, stick.dx);
    } else if (inp.pointer.active) {
      const mx = inp.pointer.x - this.renderer.w / 2;
      const my = inp.pointer.y - this.renderer.h / 2;
      const wx = this.cam.x + mx / this.zoom;
      const wy = this.cam.y + my / this.zoom;
      targetAim = Math.atan2(wy - p.y, wx - p.x);
    }
    p.aim += angleDiff(targetAim, p.aim) * Math.min(1, dt * (stick ? 26 : 16));

    // timers
    p.cd = Math.max(0, p.cd - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.boostT = Math.max(0, p.boostT - dt);

    if (p.reloading) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) this.finishReload();
    }

    // actions
    if (inp.consume('reload')) this.startReload();
    if (inp.consume('swap')) this.nextWeapon();
    if (inp.consume('interact')) this.interact();
    for (let i = 1; i <= 5; i++) {
      if (inp.consume('w' + i)) {
        const id = WEAPON_ORDER[i - 1];
        if (p.weapons.includes(id)) this.selectWeapon(id);
      }
    }
    if (inp.isFiring()) this.tryShoot();

    // survival sim
    p.hunger = Math.max(0, p.hunger - dt * 0.32);
    p.thirst = Math.max(0, p.thirst - dt * 0.46);
    if (p.hunger <= 0 || p.thirst <= 0) {
      const drain = (p.hunger <= 0 && p.thirst <= 0) ? 3.4 : 1.7;
      p.hp -= drain * dt;
      if (Math.random() < dt * 2) this.hurtFlash = Math.max(this.hurtFlash, 0.25);
      if (p.hp <= 0) { this.die('Kelaparan & kehausan'); return; }
    } else if (p.hunger > 55 && p.thirst > 55 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + dt * 0.7);
    }

    // near container
    this.nearContainer = this.world.nearestContainer(p.x, p.y, 78);
    if (this.nearContainer) {
      if (!this.world.hasLOS(p.x, p.y, this.nearContainer.x, this.nearContainer.y)) this.nearContainer = null;
    }
    this.updateRoofs(dt);

    // camera
    const look = 44;
    const tx = p.x + Math.cos(p.aim) * look;
    const ty = p.y + Math.sin(p.aim) * look;
    const k = 1 - Math.exp(-dt * 7);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  updateRoofs(dt) {
    for (const b of this.world.buildings) {
      const inside = this.player.x > (b.x - 0.6) * TILE && this.player.x < (b.x + b.w + 0.6) * TILE &&
        this.player.y > (b.y - 0.6) * TILE && this.player.y < (b.y + b.h + 0.6) * TILE;
      const target = inside ? 0 : 0.96;
      b.roofAlpha += (target - b.roofAlpha) * Math.min(1, dt * 9);
      if (Math.abs(b.roofAlpha - target) < 0.01) b.roofAlpha = target;
    }
  }

  // ── weapons ─────────────────────────────────────────────────────────
  currentWeapon() { return WEAPONS[this.player.weapon]; }

  selectWeapon(id) {
    if (!this.player.weapons.includes(id) || this.player.weapon === id) return;
    const p = this.player;
    const prev = p.weapon;
    p.mags[prev] = p.mag;
    p.weapon = id;
    p.mag = p.mags[id] ?? (WEAPONS[id].melee ? 0 : WEAPONS[id].mag);
    p.reloading = false;
    p.cd = Math.max(p.cd, 0.12);
    this.sfx.swap();
    this.renderWeapons();
    this.updateHud(0);
  }

  nextWeapon() {
    const owned = this.player.weapons;
    const i = owned.indexOf(this.player.weapon);
    this.selectWeapon(owned[(i + 1) % owned.length]);
  }

  startReload() {
    const p = this.player;
    const w = this.currentWeapon();
    if (w.melee || p.reloading) return;
    if (p.mag >= w.mag) return;
    if ((p.ammo[w.ammo] || 0) <= 0) {
      this.sfx.empty();
      if (!this._noAmmoT || this.time - this._noAmmoT > 3) {
        this._noAmmoT = this.time;
        this.toast('Amunisi ' + AMMO[w.ammo].name + ' habis', 'warn');
      }
      return;
    }
    p.reloading = true;
    p.reloadT = w.reload;
    p.reloadDur = w.reload;
    this.sfx.reload();
  }

  finishReload() {
    const p = this.player;
    const w = this.currentWeapon();
    p.reloading = false;
    if (w.melee) return;
    const need = w.mag - p.mag;
    const take = Math.min(need, p.ammo[w.ammo] || 0);
    p.mag += take;
    p.mags[w.id] = p.mag;
    p.ammo[w.ammo] -= take;
    this.sfx.reload();
  }

  tryShoot() {
    const p = this.player;
    const w = this.currentWeapon();
    if (p.reloading || p.cd > 0) return;

    if (w.melee) {
      if (p.stamina < w.stamina) return;
      p.stamina -= w.stamina;
      p.cd = w.cd;
      p.flash = 0.06;
      this.sfx.swing();
      this.shake = Math.max(this.shake, 2);
      let hit = false;
      for (const z of this.zombies) {
        if (z.dead) continue;
        const d = dist(p.x, p.y, z.x, z.y);
        if (d > w.range + z.r) continue;
        const a = Math.atan2(z.y - p.y, z.x - p.x);
        if (Math.abs(angleDiff(a, p.aim)) > w.arc / 2) continue;
        this.hitZombie(z, w.dmg, a, 90);
        hit = true;
      }
      if (hit) this.sfx.hit();
      this.particles.push({ x: p.x + Math.cos(p.aim) * 40, y: p.y + Math.sin(p.aim) * 40, vx: 0, vy: 0, life: 0.18, maxLife: 0.18, size: 16, color: 'rgba(200,230,210,0.35)', kind: 'ring' });
      return;
    }

    if (p.mag <= 0) {
      p.cd = 0.3;
      this.sfx.empty();
      if ((p.ammo[w.ammo] || 0) > 0) {
        this.startReload();
      } else if (!this._noAmmoT || this.time - this._noAmmoT > 3) {
        this._noAmmoT = this.time;
        this.toast('Amunisi ' + AMMO[w.ammo].name + ' habis — pakai Golok atau cari loot.', 'warn', 2200);
      }
      return;
    }

    p.mag--;
    p.mags[w.id] = p.mag;
    p.cd = w.cd;
    p.flash = 0.055;
    const movingSpread = p.moving ? 1.35 : 1;
    const spread = w.spread * movingSpread;
    for (let i = 0; i < (w.pellets || 1); i++) {
      const a = p.aim + rand(-spread, spread);
      const spd = w.speed * rand(0.94, 1.06);
      const bx = p.x + Math.cos(a) * 22;
      const by = p.y + Math.sin(a) * 22;
      this.bullets.push({
        x: bx, y: by, px: bx, py: by,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        dmg: w.dmg, life: w.range / spd, pierce: w.pierce || 0, hits: [],
        color: 'rgba(255,224,150,0.85)',
      });
    }
    const kick = w.id === 'shotgun' ? 6 : w.id === 'rifle' ? 4 : w.id === 'smg' ? 1.6 : 2.6;
    this.shake = Math.max(this.shake, kick);
    this.sfx.shoot(w.id);
    this.haptic(w.id === 'shotgun' ? 16 : 7);
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: p.x + Math.cos(p.aim) * 28, y: p.y + Math.sin(p.aim) * 28,
        vx: Math.cos(p.aim) * rand(40, 150) + rand(-40, 40),
        vy: Math.sin(p.aim) * rand(40, 150) + rand(-40, 40),
        life: rand(0.12, 0.3), maxLife: 0.3, size: rand(2, 5),
        color: 'rgba(255,210,140,0.5)', kind: 'smoke',
      });
    }
    if (w.id !== 'shotgun') {
      const side = p.aim + Math.PI / 2;
      this.particles.push({
        x: p.x + Math.cos(p.aim) * 18, y: p.y + Math.sin(p.aim) * 18,
        vx: Math.cos(side) * rand(30, 90), vy: Math.sin(side) * rand(30, 90) - 60,
        life: 0.6, maxLife: 0.6, size: 2, color: '#d8b25c', kind: 'shell', rot: rand(0, TAU),
      });
    }
    if (p.mag === 0) setTimeout(() => { if (this.state === 'playing') this.startReload(); }, 240);
  }

  addWeapon(id) {
    const p = this.player;
    if (!WEAPONS[id] || WEAPONS[id].melee) return false;
    if (!p.weapons.includes(id)) {
      p.weapons.push(id);
      p.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
      p.mags[id] = WEAPONS[id].mag;
      p.ammo[WEAPONS[id].ammo] = Math.min(AMMO[WEAPONS[id].ammo].max, (p.ammo[WEAPONS[id].ammo] || 0) + 24);
      this.selectWeapon(id);
      this.renderWeapons();
      this.toast('SENJATA BARU · ' + WEAPONS[id].name, 'weapon', 3200);
      this.banner('SENJATA BARU', WEAPONS[id].name + ' — ' + WEAPONS[id].desc, 'small');
      return true;
    }
    this.addAmmo(WEAPONS[id].ammo, 24);
    return false;
  }

  addAmmo(type, amount) {
    const p = this.player;
    p.ammo[type] = Math.min(AMMO[type].max, (p.ammo[type] || 0) + amount);
  }

  renderWeapons() {
    const p = this.player;
    const wrap = $('weaponSlots');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const id of p.weapons) {
      const el = document.createElement('span');
      el.className = 'wslot' + (id === p.weapon ? ' active' : '');
      el.textContent = WEAPONS[id].name;
      wrap.appendChild(el);
    }
  }

  // ── combat ──────────────────────────────────────────────────────────
  updateBullets(dt) {
    const ctx = this;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      if (b.life <= 0) { this.bullets.splice(i, 1); continue; }
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 9));
      const sx = (b.vx * dt) / steps, sy = (b.vy * dt) / steps;
      b.px = b.x; b.py = b.y;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += sx; b.y += sy;
        if (b.x < 0 || b.y < 0 || b.x > WORLD_PX || b.y > WORLD_PX) { dead = true; break; }
        if (this.world.solidAt(b.x, b.y)) {
          this.impact(b.x, b.y);
          dead = true; break;
        }
        for (const z of this.zombies) {
          if (z.dead || b.hits.includes(z.id)) continue;
          const rr = z.r + 3;
          if ((z.x - b.x) ** 2 + (z.y - b.y) ** 2 < rr * rr) {
            b.hits.push(z.id);
            this.hitZombie(z, b.dmg, Math.atan2(b.vy, b.vx), 26);
            if (b.pierce > 0) { b.pierce--; }
            else { dead = true; }
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  impact(x, y) {
    this.sfx.hit();
    for (let i = 0; i < 5; i++) {
      const a = rand(0, TAU);
      this.particles.push({
        x, y, vx: Math.cos(a) * rand(20, 110), vy: Math.sin(a) * rand(20, 110),
        life: rand(0.12, 0.32), maxLife: 0.32, size: rand(1, 2.4),
        color: 'rgba(220,220,200,0.7)', kind: 'spark',
      });
    }
  }

  hitZombie(z, dmg, dir, knock) {
    z.hp -= dmg;
    z.flash = 0.1;
    z.kx += Math.cos(dir) * knock;
    z.ky += Math.sin(dir) * knock;
    this.damageTexts.push({
      x: z.x + rand(-6, 6), y: z.y - z.r - 6,
      text: String(Math.round(dmg)), color: dmg >= 30 ? '#ffd479' : '#ff9f8a',
      life: 0.7, maxLife: 0.7,
    });
    for (let i = 0; i < 5; i++) {
      const a = dir + rand(-0.9, 0.9);
      this.particles.push({
        x: z.x, y: z.y, vx: Math.cos(a) * rand(30, 160), vy: Math.sin(a) * rand(30, 160),
        life: rand(0.2, 0.5), maxLife: 0.5, size: rand(1.5, 3.5),
        color: i % 3 === 0 ? '#7f1d1d' : '#b32626', kind: 'blood',
      });
    }
    if (Math.random() < 0.35) this.decals.push({ x: z.x + rand(-8, 8), y: z.y + rand(-8, 8), r: rand(3, 6), rot: rand(0, TAU), color: 'rgba(90,16,16,0.45)', alpha: 1, corpse: false });
    if (z.hp <= 0) this.killZombie(z, dir);
    else this.sfx.hit();
  }

  killZombie(z, dir) {
    z.dead = true;
    this.kills++;
    const mult = 1 + (this.wave - 1) * 0.06;
    const pts = Math.round(ZOMBIES[z.type].score * mult);
    this.score += pts;
    this.sfx.splat();
    this.haptic(12);
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      this.particles.push({
        x: z.x, y: z.y, vx: Math.cos(a) * rand(40, 220), vy: Math.sin(a) * rand(40, 220),
        life: rand(0.25, 0.7), maxLife: 0.7, size: rand(2, 4.5),
        color: i % 4 === 0 ? '#5c1010' : '#9c2020', kind: 'blood',
      });
    }
    this.particles.push({ x: z.x, y: z.y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, size: 12, color: 'rgba(255,120,80,0.35)', kind: 'ring' });
    this.decals.push({
      x: z.x, y: z.y, r: z.r * rand(0.9, 1.4), rot: rand(0, TAU),
      color: 'rgba(66,12,12,0.55)', alpha: 1, corpse: true,
    });
    if (this.decals.length > 190) this.decals.shift();
    this.damageTexts.push({ x: z.x, y: z.y - 24, text: '+' + pts, color: '#ffd98a', life: 0.9, maxLife: 0.9 });

    const dropChance = z.type === 'brute' ? 0.75 : z.type === 'runner' ? 0.24 : 0.18;
    if (Math.random() < dropChance) {
      const roll = Math.random();
      let kind = 'ammo';
      if (roll < 0.3) kind = 'food';
      else if (roll < 0.55) kind = 'water';
      else if (roll < 0.7) kind = 'medkit';
      else if (roll < 0.85) kind = 'energy';
      this.loot.push({
        x: z.x + rand(-10, 10), y: z.y + rand(-10, 10), kind,
        ammoType: choice(['9mm', '12ga', '7.62']),
        amount: kind === 'ammo' ? randInt(10, 26) : 1,
        seed: rand(0, TAU), life: 45,
      });
    }
  }

  updateZombies(dt) {
    const p = this.player;
    for (const z of this.zombies) {
      if (z.dead) continue;
      z.flash = Math.max(0, z.flash - dt);
      z.cd = Math.max(0, z.cd - dt);
      if (z.spawnT > 0) { z.spawnT -= dt; continue; }
      const dx = p.x - z.x, dy = p.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      let dir = null;
      if (d < 430 && this.world.hasLOS(z.x, z.y, p.x, p.y)) {
        dir = { x: dx / d, y: dy / d };
      } else {
        dir = this.world.fieldDir(z.x, z.y);
        if (!dir) dir = { x: dx / d, y: dy / d };
      }
      // slight wobble so the horde doesn't march in perfect lines
      const wob = Math.sin(this.time * 2.2 + z.id * 1.7) * 0.13;
      const ca = Math.cos(wob), sa = Math.sin(wob);
      const vx = dir.x * ca - dir.y * sa;
      const vy = dir.x * sa + dir.y * ca;
      let spd = z.speed;
      if (d > 700) spd *= 1.18;
      z.x += vx * spd * dt + z.kx * dt;
      z.y += vy * spd * dt + z.ky * dt;
      z.kx *= Math.max(0, 1 - dt * 6);
      z.ky *= Math.max(0, 1 - dt * 6);
      const res = this.world.resolveCircle(z.x, z.y, z.r);
      z.x = res.x; z.y = res.y;
      z.moving = true;
      z.walk += dt * (z.type === 'runner' ? 4.2 : 2.2) * (spd / 60);
      const nd = dist(z.x, z.y, p.x, p.y);
      if (nd < z.r + p.r + 7 && z.cd <= 0) {
        z.cd = ZOMBIES[z.type].atk;
        this.damagePlayer(z.dmg, z);
      }
    }

    // separation
    const arr = this.zombies;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r - 2;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.42;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }

    const deadCount = this.zombies.filter((z) => z.dead).length;
    if (deadCount > 0) this.zombies = this.zombies.filter((z) => !z.dead);
  }

  damagePlayer(dmg, z) {
    const p = this.player;
    if (p.invuln > 0) return;
    p.hp -= dmg;
    p.invuln = 0.35;
    p.hurtT = 0.3;
    this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 6);
    this.sfx.hurt();
    this.haptic(26);
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU);
      this.particles.push({
        x: p.x, y: p.y, vx: Math.cos(a) * rand(30, 130), vy: Math.sin(a) * rand(30, 130),
        life: rand(0.2, 0.5), maxLife: 0.5, size: rand(1.5, 3),
        color: '#b32626', kind: 'blood',
      });
    }
    if (p.hp <= 0) this.die('DIMAKAN ZOMBIE');
  }

  die(reason) {
    if (this.state === 'dead') return;
    this.player.hp = 0;
    this.state = 'dead';
    $('app').dataset.state = 'dead';
    this.saveBest();
    this.sfx.wave();
    this.input.keys.clear();
    $('deadReason').textContent = reason;
    $('deadStats').innerHTML =
      `<div><span>GELOMBANG</span><b>${this.wave}</b></div>` +
      `<div><span>KILL</span><b>${this.kills}</b></div>` +
      `<div><span>SKOR</span><b>${Math.floor(this.score)}</b></div>` +
      `<div><span>BERTAHAN</span><b>${this.fmtTime(this.survived)}</b></div>`;
    $('bestDead').textContent = `Rekor skor ${this.best.score} · gelombang ${this.best.wave}`;
    $('dead').classList.remove('hidden');
    $('interactBtn').classList.add('hidden');
  }

  updateWave(dt) {
    if (this.phase === 'fight') {
      this.spawnT -= dt;
      const cap = Math.min(52, 12 + this.wave * 3);
      if (this.spawnT <= 0 && this.waveBudget > 0 && this.zombies.length < cap) {
        this.spawnZombie();
        this.waveBudget--;
        this.spawnT = Math.max(0.28, 1.3 - this.wave * 0.055) * rand(0.72, 1.25);
      }
      if (this.waveBudget <= 0 && this.zombies.length === 0) {
        this.phase = 'break';
        this.breakT = 20;
        this.banner('GELOMBANG ' + this.wave + ' SELESAI', 'JEDA 20 DETIK — LOOT GEDUNG SEKARANG');
        this.toast('Gelombang bersih. Waktunya loot!', 'good');
      }
    } else {
      this.breakT -= dt;
      if (this.breakT <= 0) {
        this.wave++;
        this.phase = 'fight';
        this.waveBudget = 6 + this.wave * 4;
        this.spawnT = 1.4;
        this.banner('GELOMBANG ' + this.wave, 'Mereka datang lebih banyak…');
        this.sfx.wave();
      }
    }
  }

  spawnZombie() {
    const p = this.player;
    const pos = this.world.randomSpawn(p.x, p.y, 760, 1150);
    const roll = Math.random();
    let key = 'walker';
    if (this.wave >= 2 && roll < 0.3) key = 'runner';
    if (this.wave >= 4 && roll > 0.86) key = 'brute';
    const base = ZOMBIES[key];
    const hpScale = 1 + (this.wave - 1) * 0.11;
    const spdScale = 1 + Math.min(0.3, (this.wave - 1) * 0.035);
    this.zombies.push({
      id: this.nextId++, type: key,
      x: pos.x, y: pos.y, r: base.r,
      hp: base.hp * hpScale, maxHp: base.hp * hpScale,
      speed: base.speed * spdScale, dmg: base.dmg,
      cd: rand(0.3, 1.2), flash: 0, walk: rand(0, 10),
      kx: 0, ky: 0, moving: false, spawnT: 0.2, dead: false,
    });
  }

  // ── loot, items, interaction ────────────────────────────────────────
  updateLoot(dt) {
    const p = this.player;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const it = this.loot[i];
      it.life -= dt;
      if (it.life <= 0) { this.loot.splice(i, 1); continue; }
      if ((it.x - p.x) ** 2 + (it.y - p.y) ** 2 < 34 * 34) {
        this.collect(it);
        this.loot.splice(i, 1);
      }
    }
  }

  collect(it) {
    const p = this.player;
    if (it.kind === 'ammo') {
      this.addAmmo(it.ammoType, it.amount);
      this.toast(`+${it.amount} ${AMMO[it.ammoType].short}`, 'ammo', 1400);
    } else {
      p.items[it.kind] = (p.items[it.kind] || 0) + 1;
      this.toast('+' + ITEMS[it.kind].name, 'good', 1400);
    }
    this.sfx.pickup();
    this.haptic(6);
    this.particles.push({ x: it.x, y: it.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, size: 8, color: 'rgba(255,220,140,0.5)', kind: 'ring' });
  }

  interact() {
    if (this.state !== 'playing') return;
    if (this.nearContainer) {
      this.openContainer(this.nearContainer);
    } else {
      this.toast('Dekati peti, kulkas, atau lemari untuk membukanya.', 'warn', 1800);
    }
  }

  openContainer(c) {
    if (c.opened) return;
    c.opened = true;
    this.sfx.pickup();
    this.haptic(12);
    const b = this.world.buildings[c.building];
    this.particles.push({ x: c.x, y: c.y, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 16, color: 'rgba(255,210,130,0.5)', kind: 'ring' });
    const weights = {};
    const addW = (src, mult = 1) => {
      for (const k in src) weights[k] = (weights[k] || 0) + src[k] * mult;
    };
    addW(CONTAINERS[c.kind].loot, 1);
    addW(b.def.loot, 0.4);
    const drops = randInt(2, 3);
    const gained = [];
    for (let i = 0; i < drops; i++) {
      const picked = this.weighted(weights);
      if (picked === 'ammo') {
        const type = choice(this.player.weapons.filter((w) => !WEAPONS[w].melee).map((w) => WEAPONS[w].ammo).concat(['9mm']));
        const amt = randInt(12, 30);
        this.addAmmo(type, amt);
        gained.push(`+${amt} ${AMMO[type].short}`);
      } else if (picked === 'weapon') {
        const locked = ['smg', 'shotgun', 'rifle'].filter((id) => !this.player.weapons.includes(id));
        if (locked.length) {
          const id = choice(locked);
          this.addWeapon(id);
        } else {
          const type = choice(['9mm', '12ga', '7.62']);
          const amt = randInt(20, 40);
          this.addAmmo(type, amt);
          gained.push(`+${amt} ${AMMO[type].short}`);
        }
      } else {
        const n = picked === 'medkit' ? 1 : randInt(1, 2);
        this.player.items[picked] = Math.min(99, (this.player.items[picked] || 0) + n);
        gained.push(`+${n} ${ITEMS[picked].name}`);
      }
    }
    for (const g of gained) this.toast(g, g.startsWith('SENJATA') ? 'weapon' : 'good', 2400);
    this.damageTexts.push({ x: c.x, y: c.y - 22, text: 'LOOT!', color: '#ffe0a0', life: 1, maxLife: 1, vy: -18 });
    this.updateHud(0);
  }

  weighted(weights) {
    let sum = 0;
    for (const k in weights) sum += weights[k];
    let r = Math.random() * sum;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return Object.keys(weights)[0];
  }

  useItem(kind) {
    if (this.state !== 'playing') return;
    const p = this.player;
    const item = ITEMS[kind];
    if (!item) return;
    if ((p.items[kind] || 0) <= 0) { this.toast('Tidak punya ' + item.name, 'warn', 1600); this.sfx.empty(); return; }
    if (kind === 'medkit' && p.hp >= p.maxHp - 0.5) { this.toast('HP masih penuh', 'warn', 1400); return; }
    if (kind === 'food' && p.hunger >= 99) { this.toast('Kenyang masih penuh', 'warn', 1400); return; }
    if (kind === 'water' && p.thirst >= 99) { this.toast('Haus masih penuh', 'warn', 1400); return; }
    if (kind === 'energy' && p.thirst >= 99 && p.stamina >= 99) { this.toast('Masih segar', 'warn', 1400); return; }

    p.items[kind]--;
    let msg = '';
    if (kind === 'food') { p.hunger = Math.min(100, p.hunger + item.hunger); msg = '+' + item.hunger + ' kenyang'; this.sfx.eat(); }
    else if (kind === 'water') { p.thirst = Math.min(100, p.thirst + item.thirst); msg = '+' + item.thirst + ' hidrasi'; this.sfx.drink(); }
    else if (kind === 'energy') {
      p.thirst = Math.min(100, p.thirst + item.thirst);
      p.stamina = Math.min(p.maxStamina, p.stamina + item.stamina);
      p.boostT = Math.max(p.boostT, item.boost);
      msg = 'Energi! +lari 9 detik';
      this.sfx.drink();
    } else {
      p.hp = Math.min(p.maxHp, p.hp + item.hp);
      msg = '+' + item.hp + ' HP';
      this.sfx.heal();
    }
    this.toast(item.name + ' · ' + msg, 'good', 1800);
    this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, size: 14, color: item.color, kind: 'ring' });
    this.updateHud(0);
  }

  // ── particles ───────────────────────────────────────────────────────
  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 2.5);
      p.vy *= Math.max(0, 1 - dt * 2.5);
      if (p.kind === 'blood' || p.kind === 'shell') p.vy += 240 * dt;
      if (p.kind === 'shell') p.rot = (p.rot || 0) + dt * 18;
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const d = this.damageTexts[i];
      d.life -= dt;
      d.y += (d.vy || -26) * dt;
      if (d.life <= 0) this.damageTexts.splice(i, 1);
    }
  }

  // ── camera & viewport ───────────────────────────────────────────────
  clampCam() {
    const hw = this.renderer.w / 2 / this.zoom;
    const hh = this.renderer.h / 2 / this.zoom;
    this.cam.x = hw * 2 >= WORLD_PX ? WORLD_PX / 2 : clamp(this.cam.x, hw, WORLD_PX - hw);
    this.cam.y = hh * 2 >= WORLD_PX ? WORLD_PX / 2 : clamp(this.cam.y, hh, WORLD_PX - hh);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.zoom = clamp(Math.sqrt(w * h) / 720, 0.72, 1.55);
    this.renderer.resize(w, h, dpr);
    this.clampCam();
  }

  haptic(ms) {
    if (this.settings.haptics && navigator.vibrate) navigator.vibrate(ms);
  }

  fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ── hud ─────────────────────────────────────────────────────────────
  updateHud(dt) {
    const p = this.player;
    this.hudTimer -= dt;
    const fast = this.hudTimer <= 0;
    if (fast) this.hudTimer = 0.1;

    const hpPct = clamp(p.hp / p.maxHp, 0, 1) * 100;
    $('barHp').style.width = hpPct + '%';
    $('barHp').style.background = hpPct < 30 ? 'linear-gradient(90deg,#ff4d4d,#ff8a5b)' : 'linear-gradient(90deg,#e2594e,#ff8a65)';
    $('barStam').style.width = clamp(p.stamina / p.maxStamina, 0, 1) * 100 + '%';
    $('barFood').style.width = clamp(p.hunger, 0, 100) + '%';
    $('barWater').style.width = clamp(p.thirst, 0, 100) + '%';
    $('hpNum').textContent = Math.max(0, Math.ceil(p.hp));

    const w = this.currentWeapon();
    if (fast) {
      $('weaponName').textContent = w.name;
      if (w.melee) {
        $('ammoMag').textContent = '∞';
        $('ammoRes').textContent = ' / melee';
      } else if (p.reloading) {
        const pct = Math.round((1 - p.reloadT / p.reloadDur) * 100);
        $('ammoMag').textContent = 'ISI';
        $('ammoRes').textContent = ' ' + pct + '%';
      } else {
        $('ammoMag').textContent = p.mag;
        $('ammoRes').textContent = ' / ' + (p.ammo[w.ammo] || 0);
      }
      $('score').textContent = Math.floor(this.score);
      if (this.phase === 'fight') {
        $('waveLabel').textContent = 'GELOMBANG ' + this.wave;
        $('waveSub').textContent = this.waveBudget > 0 ? `${this.zombies.length} aktif · ${this.waveBudget} tersisa` : `${this.zombies.length} aktif`;
      } else {
        $('waveLabel').textContent = 'JEDA';
        $('waveSub').textContent = `gelombang ${this.wave + 1} dalam ${Math.ceil(this.breakT)}s`;
      }
      // quickbar
      for (const kind of ['food', 'water', 'energy', 'medkit']) {
        const el = document.getElementById('cnt-' + kind);
        if (el) el.textContent = p.items[kind] || 0;
        const btn = document.querySelector(`[data-use="${kind}"]`);
        if (btn) btn.classList.toggle('empty', !p.items[kind]);
      }
      $('lowhp').classList.toggle('show', p.hp < 32 && this.state === 'playing');
      $('lowfood').classList.toggle('show', this.state === 'playing' && (p.hunger < 20 || p.thirst < 20));
    }

    $('hurt').style.opacity = String(this.hurtFlash * 0.6);
    $('hurt').style.background = `radial-gradient(ellipse at center, rgba(120,0,0,0) 35%, rgba(150,10,10,${0.55 * this.hurtFlash}) 100%)`;

    const showInteract = !!this.nearContainer && this.state === 'playing';
    const ib = $('interactBtn');
    ib.classList.toggle('hidden', !showInteract);
    if (showInteract) {
      $('interactLabel').textContent = 'BUKA ' + (CONTAINERS[this.nearContainer.kind]?.name || 'PETI').toUpperCase();
    }
    $('reloadBtn').classList.toggle('attention', !w.melee && p.mag === 0 && !p.reloading && (p.ammo[w.ammo] || 0) > 0);

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.15;
      this.drawMinimap();
    }
  }

  drawMinimap() {
    const cv = $('minimap');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const size = cv.width;
    const s = size / WORLD_PX;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(5,9,12,0.85)';
    ctx.fillRect(0, 0, size, size);
    // blocks
    for (const b of this.world.buildings) {
      ctx.fillStyle = b.roofAlpha < 0.5 ? 'rgba(120,220,190,0.45)' : 'rgba(90,110,105,0.45)';
      ctx.fillRect(b.x * TILE * s, b.y * TILE * s, b.w * TILE * s, b.h * TILE * s);
    }
    // loot
    for (const c of this.world.containers) {
      if (c.opened) continue;
      if (dist(c.x, c.y, this.player.x, this.player.y) > 800) continue;
      ctx.fillStyle = 'rgba(255,205,110,0.8)';
      ctx.fillRect(c.x * s - 1, c.y * s - 1, 2.5, 2.5);
    }
    // zombies
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (dist(z.x, z.y, this.player.x, this.player.y) > 1400) continue;
      ctx.fillStyle = 'rgba(255,80,70,0.9)';
      ctx.beginPath();
      ctx.arc(z.x * s, z.y * s, z.type === 'brute' ? 2.6 : 1.7, 0, TAU);
      ctx.fill();
    }
    // player
    const p = this.player;
    ctx.save();
    ctx.translate(p.x * s, p.y * s);
    ctx.rotate(p.aim);
    ctx.fillStyle = '#9ef0d2';
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-2, 0); ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(140,230,200,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  // ── messages ────────────────────────────────────────────────────────
  toast(text, kind = '', ms = 2100) {
    const wrap = $('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    wrap.appendChild(el);
    while (wrap.children.length > 5) wrap.removeChild(wrap.firstChild);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  banner(title, sub = '', mode = '') {
    const el = $('banner');
    el.className = 'banner show ' + mode;
    el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { el.className = 'banner ' + mode; }, mode === 'small' ? 1800 : 2800);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});