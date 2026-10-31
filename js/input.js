// ── KOTA MATI — touch, keyboard, mouse & tilt input ───────────────────
import { clamp } from './config.js';

const STICK_R = 62;

function blankStick(side) {
  return { side, id: null, active: false, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.queued = new Set();
    this.sticks = { move: blankStick('move'), aim: blankStick('aim') };
    this.pointer = { x: 0, y: 0, down: false, active: false };
    this.tilt = {
      enabled: false, supported: false, gotEvent: false, base: null,
      raw: { x: 0, y: 0 }, smooth: { x: 0, y: 0 }, sens: 1,
    };
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') this.pointer.down = false;
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      const map = {
        KeyR: 'reload', KeyE: 'interact', KeyQ: 'swap', KeyF: 'flash',
        Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5',
        Escape: 'pause', KeyP: 'pause',
      };
      if (map[e.code]) { this.queued.add(map[e.code]); e.preventDefault(); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const orient = () => {
      this.tilt.base = null;
      if (screen.orientation) screen.orientation.addEventListener('change', () => { this.tilt.base = null; });
    };
    orient();

    if (typeof DeviceOrientationEvent !== 'undefined') this.tilt.supported = true;
  }

  _rect() { return this.canvas.getBoundingClientRect(); }

  _down(e) {
    const r = this._rect();
    if (e.pointerType === 'mouse') {
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
      this.pointer.down = true;
      this.pointer.active = true;
      return;
    }
    const side = e.clientX - r.left < r.width * 0.5 ? 'move' : 'aim';
    const s = this.sticks[side];
    if (s.id !== null) return;
    s.id = e.pointerId;
    s.active = true;
    s.ox = e.clientX - r.left;
    s.oy = e.clientY - r.top;
    s.x = s.ox; s.y = s.oy; s.dx = 0; s.dy = 0; s.mag = 0;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  _move(e) {
    const r = this._rect();
    if (e.pointerType === 'mouse') {
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
      this.pointer.active = true;
      return;
    }
    for (const side of ['move', 'aim']) {
      const s = this.sticks[side];
      if (s.id !== e.pointerId) continue;
      let dx = (e.clientX - r.left) - s.ox;
      let dy = (e.clientY - r.top) - s.oy;
      const m = Math.hypot(dx, dy);
      if (m > STICK_R) { dx = (dx / m) * STICK_R; dy = (dy / m) * STICK_R; }
      s.x = s.ox + dx;
      s.y = s.oy + dy;
      s.mag = Math.min(1, m / STICK_R);
      s.dx = m > 0.001 ? dx / (STICK_R * Math.max(s.mag, 0.001)) * s.mag : 0;
      s.dy = m > 0.001 ? dy / (STICK_R * Math.max(s.mag, 0.001)) * s.mag : 0;
      const l = Math.hypot(s.dx, s.dy) || 1;
      s.dx /= l; s.dy /= l;
    }
  }

  _up(e) {
    if (e.pointerType === 'mouse') { this.pointer.down = false; return; }
    for (const side of ['move', 'aim']) {
      const s = this.sticks[side];
      if (s.id !== e.pointerId) continue;
      s.id = null; s.active = false; s.mag = 0; s.dx = 0; s.dy = 0;
    }
  }

  press(action) { this.queued.add(action); }
  consume(action) {
    if (!this.queued.has(action)) return false;
    this.queued.delete(action);
    return true;
  }
  clearQueue() { this.queued.clear(); }

  update(dt) {
    const t = this.tilt;
    if (!t.enabled) return;
    const k = 1 - Math.exp(-dt * 10);
    t.smooth.x += (t.raw.x - t.smooth.x) * k;
    t.smooth.y += (t.raw.y - t.smooth.y) * k;
  }

  tiltVector() {
    const t = this.tilt;
    if (!t.enabled || !t.base) return { x: 0, y: 0, mag: 0 };
    let x = t.smooth.x, y = t.smooth.y;
    const dead = 0.14;
    const m = Math.hypot(x, y);
    if (m < dead) return { x: 0, y: 0, mag: 0 };
    const scaled = clamp((m - dead) / (1 - dead), 0, 1);
    x = (x / m) * scaled;
    y = (y / m) * scaled;
    return { x, y, mag: scaled };
  }

  getMove() {
    const s = this.sticks.move;
    if (s.active && s.mag > 0.08) return { x: s.dx, y: s.dy, mag: s.mag };
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l, mag: 1 };
    }
    const tv = this.tiltVector();
    if (tv.mag > 0.05) return tv;
    return { x: 0, y: 0, mag: 0 };
  }

  isSprinting() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
      (this.sticks.move.active && this.sticks.move.mag > 0.93);
  }

  isFiring() {
    if (this.pointer.down) return true;
    const a = this.sticks.aim;
    return a.active && a.mag > 0.34;
  }

  aimStick() {
    const a = this.sticks.aim;
    return a.active && a.mag > 0.12 ? a : null;
  }

  // ── tilt / gyro ────────────────────────────────────────────────────
  _onOrientation(e) {
    if (e.beta == null && e.gamma == null) return;
    this.tilt.gotEvent = true;
    const angle = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) | 0;
    const b = e.beta || 0, g = e.gamma || 0;
    let rx, ry;
    if (angle === 90) { rx = -b; ry = g; }
    else if (angle === 180) { rx = -g; ry = -b; }
    else if (angle === 270 || angle === -90) { rx = b; ry = -g; }
    else { rx = g; ry = b; }
    if (!this.tilt.base) this.tilt.base = { x: rx, y: ry };
    const dx = (rx - this.tilt.base.x) / 22;
    const dy = (ry - this.tilt.base.y) / 22;
    const norm = Math.hypot(dx, dy);
    const scale = norm > 1 ? 1 / norm : 1;
    this.tilt.raw.x = dx * scale * this.tilt.sens;
    this.tilt.raw.y = dy * scale * this.tilt.sens;
  }

  calibrateTilt() {
    this.tilt.base = null;
    this.tilt.raw.x = 0; this.tilt.raw.y = 0;
    this.tilt.smooth.x = 0; this.tilt.smooth.y = 0;
  }

  async enableTilt() {
    if (this.tilt.enabled) return { ok: true };
    if (typeof DeviceOrientationEvent === 'undefined') {
      return { ok: false, message: 'Perangkat tidak mendukung sensor gerak.' };
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return { ok: false, message: 'Izin sensor ditolak.' };
      }
    } catch (err) {
      return { ok: false, message: 'Izin sensor gagal. Coba lagi.' };
    }
    this._orientHandler = (e) => this._onOrientation(e);
    window.addEventListener('deviceorientation', this._orientHandler, true);
    this.tilt.enabled = true;
    this.tilt.gotEvent = false;
    this.calibrateTilt();
    await new Promise((r) => setTimeout(r, 1000));
    if (!this.tilt.gotEvent) {
      this.disableTilt();
      return { ok: false, message: 'Sensor gerak tidak terdeteksi. Tilt hanya untuk HP/tablet.' };
    }
    return { ok: true, message: 'Tilt aktif. Miringkan HP untuk bergerak.' };
  }

  disableTilt() {
    this.tilt.enabled = false;
    if (this._orientHandler) {
      window.removeEventListener('deviceorientation', this._orientHandler, true);
      this._orientHandler = null;
    }
  }
}
