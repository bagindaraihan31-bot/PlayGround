// ── KOTA MATI — procedural city world ────────────────────────────────
import { TILE, MAP, WORLD_PX, T, BUILDING_TYPES, CONTAINERS, TAU, clamp, mulberry32, randInt, choice } from './config.js';

const BLOCK = 17; // 3 road + 1 sidewalk + 12 lot + 1 sidewalk

export class World {
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.tiles = new Uint8Array(MAP * MAP);
    this.buildings = [];
    this.containers = [];
    this.cars = [];
    this.lamps = [];
    this.props = [];
    this._field = null;
    this._queue = null;
    this._nextContainerId = 1;
    this.generate();
  }

  // ── basics ──────────────────────────────────────────────────────────
  idx(x, y) { return y * MAP + x; }
  tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) return T.WALL;
    return this.tiles[ty * MAP + tx];
  }
  setTile(tx, ty, t) {
    if (tx >= 0 && ty >= 0 && tx < MAP && ty < MAP) this.tiles[ty * MAP + tx] = t;
  }
  solid(tx, ty) {
    const t = this.tileAt(tx, ty);
    return t === T.WALL || t === T.CAR;
  }
  solidAt(px, py) { return this.solid(Math.floor(px / TILE), Math.floor(py / TILE)); }

  walkableTile(tx, ty) {
    const t = this.tileAt(tx, ty);
    return t === T.ROAD || t === T.SIDEWALK || t === T.GRASS || t === T.FLOOR;
  }

  circleFree(px, py, r) {
    const x0 = Math.floor((px - r) / TILE), x1 = Math.floor((px + r) / TILE);
    const y0 = Math.floor((py - r) / TILE), y1 = Math.floor((py + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.solid(tx, ty)) continue;
        const cx = clamp(px, tx * TILE, tx * TILE + TILE);
        const cy = clamp(py, ty * TILE, ty * TILE + TILE);
        if ((px - cx) ** 2 + (py - cy) ** 2 < r * r) return false;
      }
    }
    return true;
  }

  resolveCircle(x, y, r) {
    let nx = x, ny = y;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.floor((nx - r) / TILE), x1 = Math.floor((nx + r) / TILE);
      const y0 = Math.floor((ny - r) / TILE), y1 = Math.floor((ny + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.solid(tx, ty)) continue;
          const rx = tx * TILE, ry = ty * TILE;
          const cx = clamp(nx, rx, rx + TILE), cy = clamp(ny, ry, ry + TILE);
          let dx = nx - cx, dy = ny - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            nx += (dx / d) * (r - d + 0.01);
            ny += (dy / d) * (r - d + 0.01);
          } else {
            const l = nx - rx, rr = rx + TILE - nx, tp = ny - ry, bt = ry + TILE - ny;
            const m = Math.min(l, rr, tp, bt);
            if (m === l) nx = rx - r - 0.01;
            else if (m === rr) nx = rx + TILE + r + 0.01;
            else if (m === tp) ny = ry - r - 0.01;
            else ny = ry + TILE + r + 0.01;
          }
        }
      }
    }
    return { x: clamp(nx, r, WORLD_PX - r), y: clamp(ny, r, WORLD_PX - r) };
  }

  hasLOS(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const d = Math.hypot(dx, dy);
    const steps = Math.ceil(d / 12);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAt(x1 + dx * t, y1 + dy * t)) return false;
    }
    return true;
  }

  // ── generation ──────────────────────────────────────────────────────
  generate() {
    const rng = this.rng;
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const lx = x % BLOCK, ly = y % BLOCK;
        let t = T.GRASS;
        if (lx < 3 || ly < 3) t = T.ROAD;
        else if (lx === 3 || lx === BLOCK - 1 || ly === 3 || ly === BLOCK - 1) t = T.SIDEWALK;
        this.tiles[y * MAP + x] = t;
      }
    }

    const typeKeys = Object.keys(BUILDING_TYPES);
    for (let i = typeKeys.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [typeKeys[i], typeKeys[j]] = [typeKeys[j], typeKeys[i]];
    }
    let ti = 0;

    for (let by = 0; by < MAP / BLOCK; by++) {
      for (let bx = 0; bx < MAP / BLOCK; bx++) {
        const x0 = bx * BLOCK + 4, y0 = by * BLOCK + 4;
        if (rng() < 0.12) { this.makePark(x0, y0); continue; }
        const roll = rng();
        if (roll < 0.62) {
          this.makeBuilding(x0 + 1, y0 + 1, 10, 10, typeKeys[ti++ % typeKeys.length]);
        } else if (roll < 0.93) {
          this.makeBuilding(x0 + 1, y0 + 1, 6, 10, typeKeys[ti++ % typeKeys.length]);
          this.makeBuilding(x0 + 7, y0 + 1, 5, 10, typeKeys[ti++ % typeKeys.length]);
        } else {
          this.makeBuilding(x0 + 1, y0 + 1, 10, 5, typeKeys[ti++ % typeKeys.length]);
          this.makeBuilding(x0 + 1, y0 + 7, 10, 5, typeKeys[ti++ % typeKeys.length]);
        }
      }
    }

    this.makeCars();
    this.makeLamps();
  }

  makePark(x0, y0) {
    const rng = this.rng;
    for (let i = 0; i < 9; i++) {
      const px = (x0 + 0.5 + rng() * 11) * TILE;
      const py = (y0 + 0.5 + rng() * 11) * TILE;
      this.props.push({ kind: rng() < 0.35 ? 'tree' : 'bush', x: px, y: py, r: 10 + rng() * 15 });
    }
    if (rng() < 0.5) {
      this.props.push({ kind: 'bench', x: (x0 + 3) * TILE, y: (y0 + 6) * TILE, r: 14 });
    }
  }

  makeBuilding(tx, ty, w, h, typeKey) {
    const rng = this.rng;
    const def = BUILDING_TYPES[typeKey];
    const b = {
      index: this.buildings.length, x: tx, y: ty, w, h, type: typeKey, def,
      roofAlpha: 0.96, door: null, decor: [], vents: [],
    };
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) this.setTile(x, y, T.FLOOR);
    }
    for (let x = tx; x < tx + w; x++) { this.setTile(x, ty, T.WALL); this.setTile(x, ty + h - 1, T.WALL); }
    for (let y = ty; y < ty + h; y++) { this.setTile(tx, y, T.WALL); this.setTile(tx + w - 1, y, T.WALL); }

    // interior dividing wall with a doorway gap
    if (w >= 8 && h >= 8 && rng() < 0.6) {
      if (rng() < 0.5) {
        const wx = tx + ((w / 2) | 0);
        const gap = ty + 1 + randInt(0, Math.max(0, h - 5));
        for (let y = ty + 1; y < ty + h - 1; y++) {
          if (y === gap || y === gap + 1) continue;
          this.setTile(wx, y, T.WALL);
        }
      } else {
        const wy = ty + ((h / 2) | 0);
        const gap = tx + 1 + randInt(0, Math.max(0, w - 5));
        for (let x = tx + 1; x < tx + w - 1; x++) {
          if (x === gap || x === gap + 1) continue;
          this.setTile(x, wy, T.WALL);
        }
      }
    }

    // door candidates on the perimeter, outward face must be non-wall
    const cand = [];
    for (let x = tx + 1; x < tx + w - 1; x++) {
      cand.push({ x, y: ty, ox: 0, oy: -1 });
      cand.push({ x, y: ty + h - 1, ox: 0, oy: 1 });
    }
    for (let y = ty + 1; y < ty + h - 1; y++) {
      cand.push({ x: tx, y, ox: -1, oy: 0 });
      cand.push({ x: tx + w - 1, y, ox: 1, oy: 0 });
    }
    const valid = cand.filter((c) => {
      const out = this.tileAt(c.x + c.ox, c.y + c.oy);
      return out !== T.WALL && out !== T.CAR && out !== T.FLOOR;
    });
    const door = (valid.length ? valid[(rng() * valid.length) | 0] : cand[(rng() * cand.length) | 0]);
    this.setTile(door.x, door.y, T.FLOOR);
    // make it easy to walk through: clear the outside tile too if it's a wall
    b.door = {
      x: (door.x + 0.5) * TILE,
      y: (door.y + 0.5) * TILE,
      ox: door.ox, oy: door.oy,
      tx: door.x, ty: door.y,
    };

    // rooftop details
    const ventCount = randInt(1, 3);
    for (let i = 0; i < ventCount; i++) {
      b.vents.push({
        x: (tx + 1.2 + rng() * (w - 3.4)) * TILE,
        y: (ty + 1.2 + rng() * (h - 3.4)) * TILE,
        w: 14 + rng() * 18, h: 10 + rng() * 12,
      });
    }

    this.decorate(b, rng);
    this.buildings.push(b);

    // containers
    const slots = [];
    for (let y = ty + 1; y < ty + h - 1; y++) {
      for (let x = tx + 1; x < tx + w - 1; x++) {
        if (this.tileAt(x, y) !== T.FLOOR) continue;
        if (x === door.x && y === door.y) continue;
        let adj = 0;
        if (this.tileAt(x - 1, y) === T.WALL) adj++;
        if (this.tileAt(x + 1, y) === T.WALL) adj++;
        if (this.tileAt(x, y - 1) === T.WALL) adj++;
        if (this.tileAt(x, y + 1) === T.WALL) adj++;
        slots.push({ x, y, score: adj + rng() * 2 });
      }
    }
    slots.sort((a, c) => c.score - a.score);
    const count = clamp(1 + Math.floor(((w - 2) * (h - 2)) / 26), 1, 4);
    const used = new Set();
    for (let i = 0; i < Math.min(count, slots.length); i++) {
      const slot = slots[i * 2 + (i === 0 ? 0 : 1)] || slots[i];
      const key = slot.x + ',' + slot.y;
      if (used.has(key)) continue;
      used.add(key);
      let kind;
      const kr = rng();
      if (typeKey === 'senjata' || typeKey === 'gudang') kind = i === 0 ? 'weaponcase' : kr < 0.55 ? 'crate' : 'cabinet';
      else if (typeKey === 'apotek') kind = kr < 0.72 ? 'cabinet' : 'crate';
      else if (typeKey === 'minimarket' || typeKey === 'kafe') kind = kr < 0.62 ? 'fridge' : 'crate';
      else kind = kr < 0.4 ? 'crate' : kr < 0.72 ? 'cabinet' : (kr < 0.9 ? 'fridge' : 'weaponcase');
      this.containers.push({
        id: this._nextContainerId++,
        x: (slot.x + 0.5) * TILE,
        y: (slot.y + 0.5) * TILE,
        kind, opened: false, building: b.index, tx: slot.x, ty: slot.y,
      });
    }
  }

  decorate(b, rng) {
    const ix = b.x + 1, iy = b.y + 1, iw = b.w - 2, ih = b.h - 2;
    const add = (x, y, w, h, color, kind = 'shelf') => {
      b.decor.push({
        x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE, color, kind,
      });
    };
    const t = b.type;
    if (t === 'minimarket') {
      add(ix + 0.5, iy + 0.8, iw - 1, 0.45, '#6b5741');
      add(ix + 0.5, iy + 2.1, iw - 1, 0.45, '#6b5741');
      add(ix + iw - 2.4, iy + ih - 2, 1.8, 1.1, '#4e6b60', 'counter');
    } else if (t === 'apotek') {
      add(ix + 0.6, iy + 0.7, 0.5, ih - 1.6, '#5c7d70');
      add(ix + 1.5, iy + 1, 0.5, ih - 2.2, '#5c7d70');
      add(ix + iw - 2.3, iy + ih - 1.9, 1.7, 0.9, '#4e6b60', 'counter');
    } else if (t === 'senjata') {
      add(ix + 0.6, iy + 0.9, 0.5, ih - 2, '#7a6a4c');
      add(ix + iw - 2.3, iy + 1, 1.6, 0.9, '#4b3f30', 'counter');
    } else if (t === 'rumah') {
      add(ix + 0.6, iy + 0.7, 2.2, 1.4, '#6a4b4b', 'bed');
      add(ix + iw - 2.6, iy + ih - 2.1, 2, 1.1, '#5a4b66', 'sofa');
      add(ix + 1.2, iy + ih - 2.2, 1.2, 1.2, '#644b39', 'table');
    } else if (t === 'gudang') {
      add(ix + 0.5, iy + 0.8, 1.4, 1.4, '#6e5c3f', 'crate');
      add(ix + iw - 2, iy + 0.9, 1.3, 1.3, '#6e5c3f', 'crate');
      add(ix + 1.5, iy + ih - 2.3, 2.4, 1.1, '#57503f', 'pallet');
    } else if (t === 'kafe') {
      add(ix + 1, iy + 1.4, 1.1, 1.6, '#7a5636', 'table');
      add(ix + iw - 2.6, iy + ih - 2.2, 1.6, 1.8, '#6b4a2e', 'table');
      add(ix + 1.4, iy + ih - 2.1, 1.7, 0.9, '#4e6b60', 'counter');
    } else if (t === 'bengkel') {
      add(ix + 1.2, iy + 1.2, 2.6, 2.2, '#4c4a42', 'lift');
      add(ix + iw - 2.4, iy + 0.8, 1.5, 0.7, '#6d5a3a', 'bench');
    }
  }

  makeCars() {
    const rng = this.rng;
    const palette = ['#7c4a42', '#4a5a6c', '#6b6b52', '#585858', '#6d4f63', '#4f6354'];
    for (let i = 0; i < 14; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const tx = randInt(2, MAP - 5), ty = randInt(2, MAP - 5);
        const lx = tx % BLOCK, ly = ty % BLOCK;
        const horiz = ly < 3;
        const vert = lx < 3;
        if ((!horiz && !vert) || (horiz && vert)) continue;
        if (horiz) {
          if (this.tileAt(tx, ty) !== T.ROAD || this.tileAt(tx + 1, ty) !== T.ROAD) continue;
          if (this.cars.some((c) => c.tx === tx && c.ty === ty)) continue;
          this.setTile(tx, ty, T.CAR); this.setTile(tx + 1, ty, T.CAR);
          this.cars.push({
            tx, ty, horiz: true, x: tx * TILE + 4, y: ty * TILE + 11,
            w: TILE * 2 - 8, h: TILE - 22, color: choice(palette),
          });
        } else {
          if (this.tileAt(tx, ty) !== T.ROAD || this.tileAt(tx, ty + 1) !== T.ROAD) continue;
          if (this.cars.some((c) => c.tx === tx && c.ty === ty)) continue;
          this.setTile(tx, ty, T.CAR); this.setTile(tx, ty + 1, T.CAR);
          this.cars.push({
            tx, ty, horiz: false, x: tx * TILE + 11, y: ty * TILE + 4,
            w: TILE - 22, h: TILE * 2 - 8, color: choice(palette),
          });
        }
        break;
      }
    }
  }

  makeLamps() {
    let i = 0;
    for (let by = 0; by < MAP / BLOCK; by++) {
      for (let bx = 0; bx < MAP / BLOCK; bx++) {
        const tx = bx * BLOCK + 3, ty = by * BLOCK + 3;
        this.lamps.push({
          x: (tx + 0.5) * TILE,
          y: (ty + 0.5) * TILE,
          r: 150 + this.rng() * 55,
          phase: this.rng() * TAU,
        });
      }
    }
  }

  // ── points of interest ──────────────────────────────────────────────
  findStart() {
    const shops = this.buildings
      .filter((b) => b.type === 'minimarket' || b.type === 'senjata')
      .sort((a, c) => {
        const da = (a.door.x - WORLD_PX / 2) ** 2 + (a.door.y - WORLD_PX / 2) ** 2;
        const dc = (c.door.x - WORLD_PX / 2) ** 2 + (c.door.y - WORLD_PX / 2) ** 2;
        return da - dc;
      });
    const b = shops[0] || this.buildings[0];
    if (b && b.door) {
      const x = b.door.x + b.door.ox * TILE * 1.6;
      const y = b.door.y + b.door.oy * TILE * 1.6;
      if (this.circleFree(x, y, 14)) return { x, y, building: b };
    }
    const cx = WORLD_PX / 2, cy = WORLD_PX / 2;
    for (let r = 0; r < 20; r++) {
      for (let a = 0; a < 16; a++) {
        const x = cx + Math.cos((a / 16) * TAU) * r * TILE;
        const y = cy + Math.sin((a / 16) * TAU) * r * TILE;
        if (this.circleFree(x, y, 14) && this.walkableTile(Math.floor(x / TILE), Math.floor(y / TILE))) {
          return { x, y, building: null };
        }
      }
    }
    return { x: cx, y: cy, building: null };
  }

  randomSpawn(px, py, minD, maxD) {
    for (let i = 0; i < 220; i++) {
      const a = Math.random() * TAU;
      const d = minD + Math.random() * (maxD - minD);
      const x = clamp(px + Math.cos(a) * d, TILE * 2, WORLD_PX - TILE * 2);
      const y = clamp(py + Math.sin(a) * d, TILE * 2, WORLD_PX - TILE * 2);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const t = this.tileAt(tx, ty);
      if (t !== T.ROAD && t !== T.SIDEWALK && t !== T.GRASS) continue;
      if (!this.circleFree(x, y, 16)) continue;
      return { x, y };
    }
    return { x: clamp(px + minD, TILE * 2, WORLD_PX - TILE * 2), y: py };
  }

  // ── zombie navigation: BFS distance field ───────────────────────────
  computeField(px, py) {
    if (!this._field) {
      this._field = new Int32Array(MAP * MAP);
      this._queue = new Int32Array(MAP * MAP);
    }
    const f = this._field, q = this._queue;
    f.fill(-1);
    let sx = clamp(Math.floor(px / TILE), 0, MAP - 1);
    let sy = clamp(Math.floor(py / TILE), 0, MAP - 1);
    if (this.solid(sx, sy)) {
      outer: for (let r = 1; r < 4; r++) {
        for (let yy = sy - r; yy <= sy + r; yy++) {
          for (let xx = sx - r; xx <= sx + r; xx++) {
            if (!this.solid(xx, yy)) { sx = xx; sy = yy; break outer; }
          }
        }
      }
    }
    let head = 0, tail = 0;
    const start = sy * MAP + sx;
    f[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const i = q[head++];
      const d = f[i] + 1;
      const x = i % MAP, y = (i / MAP) | 0;
      if (x > 0 && f[i - 1] < 0 && !this.solid(x - 1, y)) { f[i - 1] = d; q[tail++] = i - 1; }
      if (x < MAP - 1 && f[i + 1] < 0 && !this.solid(x + 1, y)) { f[i + 1] = d; q[tail++] = i + 1; }
      if (y > 0 && f[i - MAP] < 0 && !this.solid(x, y - 1)) { f[i - MAP] = d; q[tail++] = i - MAP; }
      if (y < MAP - 1 && f[i + MAP] < 0 && !this.solid(x, y + 1)) { f[i + MAP] = d; q[tail++] = i + MAP; }
    }
    this._fieldAt = { x: px, y: py, time: performance.now() };
  }

  fieldDir(x, y) {
    const f = this._field;
    if (!f) return null;
    const tx = clamp(Math.floor(x / TILE), 0, MAP - 1);
    const ty = clamp(Math.floor(y / TILE), 0, MAP - 1);
    let best = Infinity, bx = tx, by = ty, found = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        if (this.solid(nx, ny)) continue;
        if (dx && dy && (this.solid(tx + dx, ty) || this.solid(tx, ty + dy))) continue;
        const v = f[ny * MAP + nx];
        if (v >= 0 && v < best) { best = v; bx = nx; by = ny; found = true; }
      }
    }
    if (!found) return null;
    const cx = (bx + 0.5) * TILE, cy = (by + 0.5) * TILE;
    const dx = cx - x, dy = cy - y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  nearestContainer(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.containers) {
      if (c.opened) continue;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}

export { CONTAINERS };
