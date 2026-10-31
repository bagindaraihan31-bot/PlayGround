// ── KOTA MATI — shared config & helpers ─────────────────────────────
export const TAU = Math.PI * 2;
export const TILE = 48;
export const MAP = 85;
export const WORLD_PX = TILE * MAP;

export const T = {
  ROAD: 0,
  SIDEWALK: 1,
  GRASS: 2,
  FLOOR: 3,
  WALL: 4,
  CAR: 5,
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const angleDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Ammo ─────────────────────────────────────────────────────────────
export const AMMO = {
  '9mm': { name: '9mm', short: '9MM', max: 320, color: '#e0bc63' },
  '12ga': { name: '12 Gauge', short: '12GA', max: 90, color: '#e07d4f' },
  '7.62': { name: '7.62mm', short: '7.62', max: 260, color: '#c9a0e8' },
};

// ── Weapons ──────────────────────────────────────────────────────────
export const WEAPON_ORDER = ['golok', 'pistol', 'smg', 'shotgun', 'rifle'];
export const WEAPONS = {
  golok: {
    id: 'golok', name: 'Golok', slot: 1, melee: true, dmg: 44, range: 82,
    arc: 1.8, cd: 0.4, stamina: 12, icon: '🔪', desc: 'Diam, hemat amunisi',
  },
  pistol: {
    id: 'pistol', name: 'P9', slot: 2, ammo: '9mm', dmg: 25, cd: 0.22,
    mag: 12, reload: 1.15, spread: 0.035, pellets: 1, speed: 1500,
    range: 900, icon: '🔫', desc: 'Andalan serba bisa',
  },
  smg: {
    id: 'smg', name: 'Vektor', slot: 3, ammo: '9mm', dmg: 13, cd: 0.072,
    mag: 32, reload: 1.6, spread: 0.095, pellets: 1, speed: 1550,
    range: 780, icon: '💨', desc: 'Semburan cepat, kontrol rendah',
  },
  shotgun: {
    id: 'shotgun', name: 'Boomstick', slot: 4, ammo: '12ga', dmg: 11,
    pellets: 7, cd: 0.85, mag: 6, reload: 2.15, spread: 0.19, speed: 1350,
    range: 540, icon: '💥', desc: 'Dekat = surga, jauh = sia-sia',
  },
  rifle: {
    id: 'rifle', name: 'AK-47', slot: 5, ammo: '7.62', dmg: 33, cd: 0.115,
    mag: 30, reload: 2.2, spread: 0.05, pellets: 1, speed: 1900,
    range: 1250, pierce: 1, icon: '🎯', desc: 'Tembus dua zombie sekaligus',
  },
};

// ── Consumables ──────────────────────────────────────────────────────
export const ITEMS = {
  food: { id: 'food', name: 'Makanan Kaleng', short: 'Makan', icon: '🥫', color: '#e0a13c', hunger: 38 },
  water: { id: 'water', name: 'Air Mineral', short: 'Minum', icon: '💧', color: '#63c8f0', thirst: 42 },
  energy: { id: 'energy', name: 'Minuman Energi', short: 'Energi', icon: '⚡', color: '#f2d44f', thirst: 18, stamina: 100, boost: 9 },
  medkit: { id: 'medkit', name: 'Kotak P3K', short: 'Obat', icon: '✚', color: '#ff6b6b', hp: 50 },
};

// ── Zombie archetypes ────────────────────────────────────────────────
export const ZOMBIES = {
  walker: { name: 'Pejalan', hp: 62, speed: 58, dmg: 9, r: 15, score: 10, atk: 1.1, color: '#6d7f5e' },
  runner: { name: 'Pelari', hp: 40, speed: 128, dmg: 7, r: 13, score: 16, atk: 0.8, color: '#8a6b4f' },
  brute: { name: 'Besar', hp: 200, speed: 48, dmg: 24, r: 22, score: 45, atk: 1.35, color: '#5d4a4a' },
};

// ── Building archetypes (roof / interior / loot weights) ────────────
export const BUILDING_TYPES = {
  minimarket: {
    label: 'MINIMARKET', roof: '#37534d', edge: '#79d6bd', floor: '#4a4a3c',
    loot: { food: 5, water: 5, energy: 3, ammo: 1, medkit: 1, weapon: 0.25 },
  },
  apotek: {
    label: 'APOTEK', roof: '#335045', edge: '#8ef0b2', floor: '#3d4a44',
    loot: { medkit: 5, food: 1, water: 2, ammo: 0.6, energy: 1, weapon: 0.15 },
  },
  senjata: {
    label: 'TOKO SENJATA', roof: '#57432f', edge: '#ffb45c', floor: '#463b30',
    loot: { ammo: 5, weapon: 2.2, medkit: 1, food: 1, water: 1 },
  },
  rumah: {
    label: 'RUMAH', roof: '#463f55', edge: '#b7a4ff', floor: '#4d3c35',
    loot: { food: 3, water: 3, medkit: 1.5, ammo: 1, weapon: 0.55, energy: 1 },
  },
  gudang: {
    label: 'GUDANG', roof: '#484c55', edge: '#9fb4c9', floor: '#3f4245',
    loot: { ammo: 4, weapon: 1.6, food: 1, water: 1, medkit: 1 },
  },
  kafe: {
    label: 'KAFE', roof: '#584233', edge: '#ffc27a', floor: '#463a2f',
    loot: { food: 4, energy: 4, water: 3, medkit: 0.5, ammo: 0.4 },
  },
  bengkel: {
    label: 'BENGKEL', roof: '#4a483b', edge: '#e0c56b', floor: '#3e3b33',
    loot: { ammo: 2.2, weapon: 1.1, food: 1, water: 1, medkit: 1 },
  },
};

export const CONTAINERS = {
  crate: { name: 'Peti Kayu', color: '#9a6b3f', loot: { ammo: 3, food: 2, water: 2, medkit: 1, energy: 1, weapon: 0.35 } },
  fridge: { name: 'Kulkas', color: '#c9d4d6', loot: { water: 4, food: 4, energy: 2, medkit: 0.3 } },
  cabinet: { name: 'Lemari', color: '#4f7d6a', loot: { medkit: 4, food: 1, ammo: 1.5, energy: 0.6, weapon: 0.2 } },
  weaponcase: { name: 'Peti Senjata', color: '#6f5d3a', loot: { weapon: 4, ammo: 5, medkit: 0.6 } },
};

export function weaponLabel(id) {
  return WEAPONS[id]?.name || id;
}
