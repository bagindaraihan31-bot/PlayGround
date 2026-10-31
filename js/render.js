// ── KOTA MATI — canvas renderer ──────────────────────────────────────
import { TILE, T, WEAPONS, ZOMBIES, ITEMS, CONTAINERS, AMMO, clamp, hash2, lerp, TAU } from './config.js';

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const RAIN = Array.from({ length: 90 }, () => ({
  x: Math.random(), y: Math.random(), len: 6 + Math.random() * 14, sp: 0.35 + Math.random() * 0.5,
}));

function dark(hex, f = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * f, g = ((n >> 8) & 255) * f, b = (n & 255) * f;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function light(hex, f = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255), g = ((n >> 8) & 255), b = (n & 255);
  return `rgb(${Math.min(255, r + 255 * f) | 0},${Math.min(255, g + 255 * f) | 0},${Math.min(255, b + 255 * f) | 0})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.lightCanvas = document.createElement('canvas');
    this.lctx = this.lightCanvas.getContext('2d');
    this.w = 1; this.h = 1; this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.lightCanvas.width = this.canvas.width;
    this.lightCanvas.height = this.canvas.height;
  }

  draw(g) {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    const zoom = g.zoom;
    const shakeX = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
    const shakeY = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
    const camX = g.cam.x + shakeX;
    const camY = g.cam.y + shakeY;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom,
      (w / 2 - camX * zoom) * dpr, (h / 2 - camY * zoom) * dpr);

    const view = {
      x0: camX - w / 2 / zoom - TILE,
      y0: camY - h / 2 / zoom - TILE,
      x1: camX + w / 2 / zoom + TILE,
      y1: camY + h / 2 / zoom + TILE,
    };
    this.view = view;

    this.drawGround(g, view);
    this.drawDecals(g, view);
    this.drawProps(g, view);
    this.drawBuildingInteriors(g, view);
    this.drawCars(g, view);
    this.drawLoot(g, view);
    this.drawBullets(g);
    this.drawZombies(g, view);
    this.drawPlayer(g);
    this.drawParticles(g, view);
    this.drawBuildingRoofs(g, view);
    this.drawFloating(g);
    this.drawLamps(g, view);

    // lighting overlay
    this.drawLighting(g, g.cam.x, g.cam.y, zoom, shakeX, shakeY);
    this.drawWeather(g);
    this.drawSticks(g);
    this.drawCrosshair(g);
  }

  // ── ground ─────────────────────────────────────────────────────────
  drawGround(g, v) {
    const ctx = this.ctx;
    const w = g.world;
    const x0 = Math.max(0, Math.floor(v.x0 / TILE)), x1 = Math.min(84, Math.floor(v.x1 / TILE));
    const y0 = Math.max(0, Math.floor(v.y0 / TILE)), y1 = Math.min(84, Math.floor(v.y1 / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = w.tiles[ty * 85 + tx];
        const px = tx * TILE, py = ty * TILE;
        const n = hash2(tx, ty);
        if (t === T.ROAD || t === T.CAR) {
          ctx.fillStyle = n > 0.5 ? '#23272b' : '#252a2e';
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          if (n > 0.93) {
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px + 6, py + TILE * 0.2);
            ctx.lineTo(px + TILE * 0.55, py + TILE * 0.5);
            ctx.lineTo(px + TILE * 0.4, py + TILE * 0.82);
            ctx.stroke();
          }
          const lx = tx % 17, ly = ty % 17;
          if (ly === 1 && lx > 2 && (tx * TILE) % 96 < 50) {
            ctx.fillStyle = 'rgba(196,168,88,0.22)';
            ctx.fillRect(px, py + TILE / 2 - 2, TILE, 4);
          }
          if (lx === 1 && ly > 2 && (ty * TILE) % 96 < 50) {
            ctx.fillStyle = 'rgba(196,168,88,0.22)';
            ctx.fillRect(px + TILE / 2 - 2, py, 4, TILE);
          }
        } else if (t === T.SIDEWALK) {
          ctx.fillStyle = n > 0.5 ? '#303438' : '#33373b';
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
        } else if (t === T.GRASS) {
          ctx.fillStyle = n > 0.5 ? '#222d24' : '#202a22';
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
          if (n > 0.55) {
            ctx.strokeStyle = 'rgba(90,120,80,0.28)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
              const gx = px + hash2(tx + i, ty) * TILE;
              const gy = py + hash2(tx, ty + i) * TILE;
              ctx.beginPath();
              ctx.moveTo(gx, gy + 4);
              ctx.lineTo(gx + (i - 1) * 2, gy - 3);
              ctx.stroke();
            }
          }
        } else if (t === T.FLOOR) {
          ctx.fillStyle = '#1b1d1c';
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
        } else if (t === T.WALL) {
          ctx.fillStyle = '#1c1d1e';
          ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
        }
      }
    }
    // world border
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, 85 * TILE, 85 * TILE);
  }

  drawDecals(g, v) {
    const ctx = this.ctx;
    for (const d of g.decals) {
      if (d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = d.color;
      if (d.corpse) {
        ctx.fillRect(-12, -5, 24, 10);
        ctx.beginPath();
        ctx.arc(-14, 0, 5, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r, d.r * 0.62, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = d.alpha * 0.5;
        ctx.beginPath();
        ctx.ellipse(d.r * 0.7, d.r * 0.4, d.r * 0.3, d.r * 0.2, 0.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawProps(g, v) {
    const ctx = this.ctx;
    for (const p of g.world.props) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, p.r * 0.5, p.r * 0.9, p.r * 0.4, 0, 0, TAU);
      ctx.fill();
      if (p.kind === 'tree') {
        ctx.fillStyle = '#3a3023';
        ctx.fillRect(-3, -4, 6, 14);
        ctx.fillStyle = '#233a27';
        ctx.beginPath(); ctx.arc(0, -8, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2c4830';
        ctx.beginPath(); ctx.arc(-p.r * 0.35, -p.r * 0.6, p.r * 0.6, 0, TAU); ctx.fill();
      } else if (p.kind === 'bench') {
        ctx.fillStyle = '#4b3a2a';
        ctx.fillRect(-p.r, -6, p.r * 2, 12);
        ctx.fillStyle = '#5e4a35';
        ctx.fillRect(-p.r, -6, p.r * 2, 4);
      } else {
        ctx.fillStyle = '#243827';
        ctx.beginPath(); ctx.arc(0, 0, p.r * 0.75, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2e4530';
        ctx.beginPath(); ctx.arc(-p.r * 0.3, -p.r * 0.25, p.r * 0.45, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── buildings ───────────────────────────────────────────────────────
  drawBuildingInteriors(g, v) {
    for (const b of g.world.buildings) {
      const bx = b.x * TILE, by = b.y * TILE;
      const bw = b.w * TILE, bh = b.h * TILE;
      if (bx > v.x1 || by > v.y1 || bx + bw < v.x0 || by + bh < v.y0) continue;
      const reveal = 1 - b.roofAlpha;
      if (reveal < 0.05) continue;
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = reveal;

      // floor
      ctx.fillStyle = b.def.floor;
      ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = by + 4; y < by + bh - 4; y += TILE) {
        ctx.fillRect(bx + 4, y, bw - 8, 1);
      }
      for (let x = bx + 4; x < bx + bw - 4; x += TILE) {
        ctx.fillRect(x, by + 4, 1, bh - 8);
      }
      // interior grid light
      const grad = ctx.createRadialGradient(bx + bw / 2, by + bh / 2, 10, bx + bw / 2, by + bh / 2, Math.max(bw, bh) * 0.6);
      grad.addColorStop(0, 'rgba(255,224,170,0.06)');
      grad.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = grad;
      ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);

      // decor
      for (const d of b.decor) {
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(d.x, d.y + d.h - 4, d.w, 4);
        if (d.kind === 'bed') {
          ctx.fillStyle = '#b9a9a0';
          ctx.fillRect(d.x + 3, d.y + 3, d.w - 6, d.h * 0.35);
        } else if (d.kind === 'table') {
          ctx.fillStyle = 'rgba(255,220,160,0.18)';
          ctx.fillRect(d.x + 4, d.y + 4, d.w - 8, 3);
        }
      }

      // walls
      for (let ty = b.y; ty < b.y + b.h; ty++) {
        for (let tx = b.x; tx < b.x + b.w; tx++) {
          if (g.world.tileAt(tx, ty) !== T.WALL) continue;
          this.drawWallTile(tx, ty, b, tx, ty);
        }
      }

      // door glow + mat
      if (b.door) {
        const dcx = b.door.x, dcy = b.door.y;
        const pulse = 0.45 + Math.sin(g.time * 3 + b.index) * 0.15;
        ctx.fillStyle = `rgba(255,190,110,${pulse * 0.35})`;
        ctx.fillRect(dcx - TILE / 2 + 3, dcy - TILE / 2 + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = `rgba(255,200,130,${pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(dcx - TILE / 2 + 6, dcy - TILE / 2 + 6, TILE - 12, TILE - 12);
        ctx.fillStyle = 'rgba(255,210,140,0.55)';
        const ox = b.door.ox, oy = b.door.oy;
        ctx.fillRect(dcx - 10 + ox * 16, dcy - 2 + oy * 16, 20, 4);
      }

      // containers
      for (const c of g.world.containers) {
        if (c.building !== b.index) continue;
        this.drawContainer(c, g);
      }

      // zombies and player inside are already drawn after interiors, so fine
      ctx.restore();
    }
  }

  drawWallTile(tx, ty, b) {
    const ctx = this.ctx;
    const px = tx * TILE, py = ty * TILE;
    const n = hash2(tx, ty);
    ctx.fillStyle = n > 0.5 ? '#4f4a43' : '#534d46';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(px + 1, py + 1, TILE - 2, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(px + 1, py + TILE - 6, TILE - 2, 5);
    // windows on exterior wall
    const per = tx === b.x || tx === b.x + b.w - 1 || ty === b.y || ty === b.y + b.h - 1;
    if (per && n > 0.55) {
      const horiz = ty === b.y || ty === b.y + b.h - 1;
      ctx.fillStyle = 'rgba(120,200,210,0.22)';
      if (horiz) ctx.fillRect(px + 10, py + 18, TILE - 20, 8);
      else ctx.fillRect(px + 18, py + 10, 8, TILE - 20);
      ctx.fillStyle = 'rgba(180,240,250,0.10)';
      if (horiz) ctx.fillRect(px + 10, py + 18, TILE - 20, 3);
      else ctx.fillRect(px + 18, py + 10, 3, TILE - 20);
    }
  }

  drawContainer(c, g) {
    const ctx = this.ctx;
    const opened = c.opened;
    const k = CONTAINERS[c.kind];
    const bob = opened ? 0 : Math.sin(g.time * 2 + c.id) * 1.2;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 11, 15, 6, 0, 0, TAU); ctx.fill();
    if (c.kind === 'crate') {
      ctx.fillStyle = opened ? '#4b3a2b' : '#8a6038';
      ctx.fillRect(-14, -12, 28, 24);
      ctx.strokeStyle = opened ? '#2f241a' : '#b9834c';
      ctx.lineWidth = 2;
      ctx.strokeRect(-14, -12, 28, 24);
      if (!opened) {
        ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(14, 12); ctx.moveTo(14, -12); ctx.lineTo(-14, 12); ctx.stroke();
      }
    } else if (c.kind === 'fridge') {
      ctx.fillStyle = opened ? '#4d5657' : '#c3ced0';
      ctx.fillRect(-12, -16, 24, 32);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(-12, -4, 24, 2);
      ctx.fillStyle = opened ? '#222' : '#7d8b8d';
      ctx.fillRect(7, -12, 3, 12);
      if (opened) { ctx.fillStyle = '#1b2223'; ctx.fillRect(-9, -13, 18, 10); }
    } else if (c.kind === 'cabinet') {
      ctx.fillStyle = opened ? '#3c564c' : '#4f7d6a';
      ctx.fillRect(-13, -14, 26, 28);
      ctx.strokeStyle = '#2c463c';
      ctx.lineWidth = 2;
      ctx.strokeRect(-13, -14, 26, 28);
      ctx.fillStyle = '#e7f0ea';
      ctx.fillRect(-2, -8, 4, 12);
      ctx.fillRect(-7, -3, 14, 4);
    } else {
      ctx.fillStyle = opened ? '#3d3527' : '#6b5a39';
      ctx.fillRect(-15, -11, 30, 22);
      ctx.strokeStyle = '#c7a85a';
      ctx.lineWidth = 2;
      ctx.strokeRect(-15, -11, 30, 22);
      ctx.fillStyle = '#c7a85a';
      ctx.fillRect(-15, -11, 8, 3);
      ctx.fillRect(-15, 8, 30, 3);
      ctx.fillStyle = opened ? '#2a2419' : '#d9c27a';
      ctx.fillRect(-4, -2, 8, 5);
    }
    // highlight for nearest
    if (g.nearContainer && g.nearContainer.id === c.id && !opened) {
      const pulse = 0.55 + Math.sin(g.time * 5) * 0.25;
      ctx.strokeStyle = `rgba(255,220,140,${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(-18, -18, 36, 36);
    }
    ctx.restore();
  }

  drawBuildingRoofs(g, v) {
    const ctx = this.ctx;
    for (const b of g.world.buildings) {
      if (b.roofAlpha < 0.02) continue;
      const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
      if (x > v.x1 || y > v.y1 || x + w < v.x0 || y + h < v.y0) continue;
      ctx.save();
      ctx.globalAlpha = b.roofAlpha;
      ctx.fillStyle = dark(b.def.roof, 0.85);
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      // roof texture strips
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      for (let sy = y + 10; sy < y + h - 8; sy += 18) ctx.fillRect(x + 6, sy, w - 12, 2);
      // slanted highlight
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + w * 0.55, y + 4);
      ctx.lineTo(x + 4, y + h * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = b.def.edge;
      ctx.globalAlpha = b.roofAlpha * 0.55;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.globalAlpha = b.roofAlpha;
      // vents
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (const ve of b.vents) {
        ctx.fillRect(ve.x, ve.y, ve.w, ve.h);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(ve.x, ve.y, ve.w, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
      }
      // label
      if (w > 120) {
        ctx.fillStyle = 'rgba(230,240,235,0.34)';
        ctx.font = `700 ${Math.min(13, (w / 11)) | 0}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.def.label, x + w / 2, y + h / 2);
      }
      // door marker visible from outside
      if (b.door) {
        const dcx = b.door.x, dcy = b.door.y;
        const near = Math.hypot(g.player.x - dcx, g.player.y - dcy) < 200;
        const pulse = 0.5 + Math.sin(g.time * 4) * 0.2;
        ctx.fillStyle = `rgba(255,190,110,${near ? 0.9 : 0.45})`;
        ctx.beginPath();
        ctx.arc(dcx, dcy, near ? 5 + pulse * 2 : 4, 0, TAU);
        ctx.fill();
        if (near) {
          ctx.strokeStyle = `rgba(255,210,140,${pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(dcx, dcy, 11 + pulse * 3, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawCars(g, v) {
    const ctx = this.ctx;
    for (const c of g.world.cars) {
      if (c.x > v.x1 || c.y > v.y1 || c.x + c.w < v.x0 || c.y + c.h < v.y0) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(c.x + 3, c.y + 4, c.w, c.h);
      ctx.fillStyle = c.color;
      const r = 7;
      ctx.beginPath();
      ctx.roundRect(c.x, c.y, c.w, c.h, r);
      ctx.fill();
      ctx.fillStyle = 'rgba(10,16,20,0.65)';
      if (c.horiz) {
        ctx.fillRect(c.x + c.w * 0.28, c.y + 4, c.w * 0.28, c.h - 8);
        ctx.fillRect(c.x + c.w * 0.62, c.y + 4, c.w * 0.2, c.h - 8);
        ctx.fillStyle = 'rgba(220,210,160,0.35)';
        ctx.fillRect(c.x + c.w - 4, c.y + 5, 3, 6);
        ctx.fillRect(c.x + c.w - 4, c.y + c.h - 11, 3, 6);
      } else {
        ctx.fillRect(c.x + 4, c.y + c.h * 0.28, c.w - 8, c.h * 0.28);
        ctx.fillRect(c.x + 4, c.y + c.h * 0.62, c.w - 8, c.h * 0.2);
        ctx.fillStyle = 'rgba(220,210,160,0.35)';
        ctx.fillRect(c.x + 5, c.y + c.h - 4, 6, 3);
        ctx.fillRect(c.x + c.w - 11, c.y + c.h - 4, 6, 3);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawLamps(g, v) {
    const ctx = this.ctx;
    for (const l of g.world.lamps) {
      if (l.x < v.x0 - 20 || l.x > v.x1 + 20 || l.y < v.y0 - 20 || l.y > v.y1 + 20) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(l.x, l.y + 5, 7, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f3234';
      ctx.fillRect(l.x - 2, l.y - 18, 4, 22);
      const flick = 0.75 + Math.sin(g.time * 9 + l.phase) * 0.06;
      ctx.fillStyle = `rgba(255,206,130,${flick})`;
      ctx.beginPath(); ctx.arc(l.x, l.y - 20, 3.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // ── loot / particles / combat ───────────────────────────────────────
  drawLoot(g, v) {
    const ctx = this.ctx;
    for (const it of g.loot) {
      if (it.x < v.x0 || it.x > v.x1 || it.y < v.y0 || it.y > v.y1) continue;
      const bob = Math.sin(g.time * 4 + it.seed) * 2;
      ctx.save();
      ctx.translate(it.x, it.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 7 - bob, 7, 3, 0, 0, TAU); ctx.fill();
      const col = it.kind === 'ammo' ? '#e0bc63' : (ITEMS[it.kind]?.color || '#eee');
      ctx.fillStyle = col;
      if (it.kind === 'ammo') {
        ctx.fillRect(-5, -4, 10, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-5, -1, 10, 2);
      } else if (it.kind === 'water' || it.kind === 'energy') {
        ctx.fillRect(-3.5, -6, 7, 12);
        ctx.fillStyle = '#dfe9e8';
        ctx.fillRect(-2, -8, 4, 3);
      } else if (it.kind === 'medkit') {
        ctx.fillRect(-6, -5, 12, 10);
        ctx.fillStyle = '#b52a2a';
        ctx.fillRect(-1.5, -3.5, 3, 7);
        ctx.fillRect(-4.5, -1.5, 9, 3);
      } else {
        ctx.fillRect(-4, -5, 8, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-4, -3, 8, 2);
      }
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawBullets(g) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of g.bullets) {
      ctx.strokeStyle = b.color || 'rgba(255,220,140,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,245,200,0.85)';
      ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawZombies(g, v) {
    const ctx = this.ctx;
    for (const z of g.zombies) {
      if (z.x < v.x0 - 30 || z.x > v.x1 + 30 || z.y < v.y0 - 30 || z.y > v.y1 + 30) continue;
      if (z.dead) continue;
      const s = z.r / 15;
      const walk = Math.sin(z.walk * 6) * (z.moving ? 1 : 0.25);
      ctx.save();
      ctx.translate(z.x, z.y);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath(); ctx.ellipse(0, 10 * s, 13 * s, 6 * s, 0, 0, TAU); ctx.fill();
      // legs
      ctx.fillStyle = dark(z.type === 'walker' ? '#3e4a38' : z.type === 'runner' ? '#4f3a2b' : '#3a2c2c', 0.9);
      ctx.fillRect(-8 * s, 3 * s + walk * 5 * s, 6 * s, 12 * s);
      ctx.fillRect(2 * s, 3 * s - walk * 5 * s, 6 * s, 12 * s);
      // body
      ctx.fillStyle = z.flash > 0 ? '#f4dede' : ZOMBIES[z.type].color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11 * s, 13 * s, 0, 0, TAU);
      ctx.fill();
      // torn shirt / blood
      ctx.fillStyle = 'rgba(60,22,22,0.55)';
      ctx.beginPath(); ctx.ellipse(-3 * s, 2 * s, 4 * s, 5 * s, 0.4, 0, TAU); ctx.fill();
      // arms reaching toward player
      const ang = Math.atan2(g.player.y - z.y, g.player.x - z.x);
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = z.flash > 0 ? '#f4dede' : light(ZOMBIES[z.type].color, 0.05);
      ctx.fillRect(8 * s, -9 * s, 15 * s, 5 * s);
      ctx.fillRect(8 * s, 4 * s, 15 * s, 5 * s);
      ctx.fillStyle = '#9a8a72';
      ctx.beginPath(); ctx.arc(23 * s, -6.5 * s, 3.2 * s, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(23 * s, 6.5 * s, 3.2 * s, 0, TAU); ctx.fill();
      ctx.restore();
      // head
      ctx.fillStyle = z.flash > 0 ? '#fff' : '#8e9074';
      ctx.beginPath(); ctx.arc(0, -10 * s, 7 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a1f1a';
      ctx.fillRect(-5 * s, -12 * s, 3 * s, 2 * s);
      ctx.fillRect(2 * s, -12 * s, 3 * s, 2 * s);
      // health bar
      if (z.hp < z.maxHp) {
        const bw = 30 * s;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(-bw / 2, -27 * s, bw, 4);
        ctx.fillStyle = z.hp / z.maxHp > 0.4 ? '#d9694f' : '#ff5a5a';
        ctx.fillRect(-bw / 2 + 1, -26 * s, (bw - 2) * clamp(z.hp / z.maxHp, 0, 1), 2);
      }
      ctx.restore();
    }
  }

  drawPlayer(g) {
    const p = g.player;
    const ctx = this.ctx;
    const bob = p.moving ? Math.sin(p.walk * 8) * 1.5 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.ellipse(0, 11, 14, 6, 0, 0, TAU); ctx.fill();
    // subtle selection ring keeps the survivor readable at night
    ctx.strokeStyle = 'rgba(150,245,210,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 1, 18, 0, TAU); ctx.stroke();
    // legs oriented to movement
    ctx.save();
    ctx.rotate(p.moveAngle);
    const lw = p.moving ? Math.sin(p.walk * 8) * 4 : 0;
    ctx.fillStyle = '#2e3630';
    ctx.fillRect(-6, 2 + lw, 5, 12);
    ctx.fillRect(1, 2 - lw, 5, 12);
    ctx.restore();
    // backpack
    ctx.fillStyle = '#353a30';
    ctx.beginPath(); ctx.arc(0, 1, 11, 0, TAU); ctx.fill();
    // torso
    ctx.fillStyle = p.hurtT > 0 ? '#c96a5a' : '#6f9a7f';
    ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.arc(-2, -3, 6, 0, TAU); ctx.fill();
    // weapon + arms + head rotate toward aim
    ctx.save();
    ctx.rotate(p.aim);
    const wid = p.weapon;
    ctx.fillStyle = '#d8b48c';
    ctx.beginPath(); ctx.arc(9, -5, 3.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(9, 5, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a3d3f';
    if (wid === 'golok') {
      ctx.fillRect(8, -2, 14, 4);
      ctx.fillStyle = '#b9c2c4';
      ctx.fillRect(20, -3, 12, 6);
    } else if (wid === 'shotgun') {
      ctx.fillRect(8, -3, 24, 6);
      ctx.fillStyle = '#6b4d33';
      ctx.fillRect(13, 1, 12, 4);
    } else if (wid === 'rifle') {
      ctx.fillRect(8, -3, 30, 6);
      ctx.fillStyle = '#5a4630';
      ctx.fillRect(16, 2, 10, 4);
      ctx.fillStyle = '#2c2f31';
      ctx.fillRect(30, -2, 12, 3);
    } else if (wid === 'smg') {
      ctx.fillRect(8, -3, 20, 6);
      ctx.fillStyle = '#2c2f31';
      ctx.fillRect(16, 2, 5, 8);
    } else {
      ctx.fillRect(8, -2.5, 17, 5);
    }
    if (p.flash > 0) {
      ctx.fillStyle = 'rgba(255,235,160,0.95)';
      ctx.beginPath();
      const fx = wid === 'golok' ? 32 : wid === 'rifle' ? 43 : wid === 'shotgun' ? 33 : 26;
      ctx.moveTo(fx, 0);
      ctx.lineTo(fx + 12, -7);
      ctx.lineTo(fx + 8, 0);
      ctx.lineTo(fx + 12, 7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // head
    ctx.fillStyle = '#c99a73';
    ctx.beginPath(); ctx.arc(Math.cos(p.aim) * 2, Math.sin(p.aim) * 2 - 1, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2b22';
    ctx.beginPath(); ctx.arc(Math.cos(p.aim) * 1, Math.sin(p.aim) * 1 - 3, 6, Math.PI, TAU); ctx.fill();
    ctx.restore();

    // aim hint
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#ffe6a8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aim) * 26, p.y + Math.sin(p.aim) * 26);
    ctx.lineTo(p.x + Math.cos(p.aim) * 120, p.y + Math.sin(p.aim) * 120);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(g, v) {
    const ctx = this.ctx;
    for (const p of g.particles) {
      if (p.x < v.x0 - 20 || p.x > v.x1 + 20 || p.y < v.y0 - 20 || p.y > v.y1 + 20) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + (1 - a) * 2.2), 0, TAU); ctx.stroke();
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - a), 0, TAU); ctx.fill();
      } else if (p.kind === 'shell') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-2, -1, 4, 2);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.8), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawFloating(g) {
    const ctx = this.ctx;
    const z = g.zoom;
    for (const d of g.damageTexts) {
      const a = clamp(d.life / d.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = d.color;
      ctx.font = `700 ${14 / z}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(d.text, d.x, d.y);
    }
    ctx.globalAlpha = 1;
  }

  // ── lighting ────────────────────────────────────────────────────────
  drawLighting(g, camX, camY, zoom, sx, sy) {
    const lctx = this.lctx;
    const { w, h, dpr } = this;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, w, h);
    lctx.fillStyle = 'rgba(4,7,15,0.68)';
    lctx.fillRect(0, 0, w, h);
    lctx.globalCompositeOperation = 'destination-out';

    const toScreen = (wx, wy) => ({ x: (wx - camX) * zoom + w / 2 + sx, y: (wy - camY) * zoom + h / 2 + sy });
    const punch = (x, y, r, a = 1, inner = 0.25) => {
      if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) return;
      const gr = lctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(inner, `rgba(255,255,255,${a * 0.8})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      lctx.fillStyle = gr;
      lctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    const p = g.player;
    const ps = toScreen(p.x, p.y);
    punch(ps.x, ps.y, 245 * zoom, 0.92, 0.3);
    punch(ps.x, ps.y, 96 * zoom, 1, 0.6);

    // flashlight cone
    const aim = p.aim;
    const reach = 450 * zoom;
    lctx.save();
    lctx.translate(ps.x, ps.y);
    lctx.rotate(aim);
    const lg = lctx.createLinearGradient(0, 0, reach, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.92)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    lctx.fillStyle = lg;
    lctx.beginPath();
    lctx.moveTo(0, 0);
    lctx.arc(0, 0, reach, -0.47, 0.47);
    lctx.closePath();
    lctx.fill();
    lctx.restore();

    if (p.flash > 0) {
      const fx = toScreen(p.x + Math.cos(aim) * 34, p.y + Math.sin(aim) * 34);
      punch(fx.x, fx.y, 190 * zoom, 1, 0.2);
    }

    for (const l of g.world.lamps) {
      const ls = toScreen(l.x, l.y - 16);
      if (ls.x + l.r * zoom < 0 || ls.x - l.r * zoom > w || ls.y + l.r * zoom < 0 || ls.y - l.r * zoom > h) continue;
      const flick = 0.85 + Math.sin(g.time * 7 + l.phase) * 0.08;
      punch(ls.x, ls.y, l.r * zoom, 0.78 * flick, 0.15);
    }
    lctx.globalCompositeOperation = 'source-over';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.drawImage(this.lightCanvas, 0, 0, w, h);

    // warm additive glow
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of g.world.lamps) {
      const ls = toScreen(l.x, l.y - 16);
      const r = l.r * zoom * 0.85;
      if (ls.x + r < 0 || ls.x - r > w || ls.y + r < 0 || ls.y - r > h) continue;
      const gr = ctx.createRadialGradient(ls.x, ls.y, 0, ls.x, ls.y, r);
      gr.addColorStop(0, 'rgba(255,170,80,0.10)');
      gr.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(ls.x - r, ls.y - r, r * 2, r * 2);
    }
    if (p.flash > 0) {
      const fx = toScreen(p.x + Math.cos(aim) * 34, p.y + Math.sin(aim) * 34);
      const r = 150 * zoom;
      const gr = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
      gr.addColorStop(0, 'rgba(255,210,120,0.22)');
      gr.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(fx.x - r, fx.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  drawWeather(g) {
    if (g.state === 'menu') return;
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.strokeStyle = 'rgba(180,210,230,0.075)';
    ctx.lineWidth = 1;
    const t = g.time;
    for (let i = 0; i < RAIN.length; i++) {
      const d = RAIN[i];
      const x = ((d.x + t * 0.02 * d.sp) % 1) * (w + 40) - 20;
      const y = ((d.y + t * d.sp * 0.35) % 1) * (h + 40) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + d.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSticks(g) {
    const { dpr } = this;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const drawActive = (s, color) => {
      if (!s.active) return;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgba(10,14,18,0.55)';
      ctx.beginPath(); ctx.arc(s.ox, s.oy, 62, 0, TAU); ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.ox, s.oy, 62, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(s.ox, s.oy, 24, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(s.x, s.y, 24, 0, TAU); ctx.fill();
      ctx.restore();
    };
    drawActive(g.input.sticks.move, '#8fe8d0');
    drawActive(g.input.sticks.aim, '#ffb06b');
  }

  pad(ctx, x, y, r, color, label) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r + 16);
  }

  drawCrosshair(g) {
    if (!g.input.pointer.active || navigator.maxTouchPoints > 0) return;
    const ctx = this.ctx;
    const { dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { x, y } = g.input.pointer;
    ctx.strokeStyle = 'rgba(255,220,160,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 9, y); ctx.lineTo(x - 3, y);
    ctx.moveTo(x + 3, y); ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 9); ctx.lineTo(x, y - 3);
    ctx.moveTo(x, y + 3); ctx.lineTo(x, y + 9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,220,160,0.9)';
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
  }
}
