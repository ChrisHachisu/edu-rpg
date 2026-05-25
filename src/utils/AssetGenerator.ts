import Phaser from 'phaser';
import type { HeroColorScheme } from './types';

// Procedural pixel art generator — creates all game sprites at runtime
// so we don't need any external image files

/** Wraps Phaser.Graphics so all drawing coordinates are multiplied by `s`,
 *  producing higher-resolution textures from the same drawing code. */
class ScaledGraphics {
  constructor(private g: Phaser.GameObjects.Graphics, private s: number) {}
  fillStyle(c: number, a?: number) { this.g.fillStyle(c, a); return this; }
  lineStyle(w: number, c: number, a?: number) { this.g.lineStyle(w * this.s, c, a); return this; }
  fillRect(x: number, y: number, w: number, h: number) { this.g.fillRect(x*this.s, y*this.s, w*this.s, h*this.s); return this; }

  // ── Scanline-rasterized shape methods (fillRect only, no shape primitives) ──

  /** Rasterize an ellipse as horizontal fillRect scanlines */
  fillEllipse(cx: number, cy: number, w: number, h: number) {
    const s = this.s;
    const rx = w / 2, ry = h / 2;
    const pry = Math.ceil(ry * s);
    for (let dy = -pry; dy <= pry; dy++) {
      const hw = rx * s * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * s * ry * s)));
      const x0 = Math.round(cx * s - hw);
      const x1 = Math.round(cx * s + hw);
      if (x1 > x0) this.g.fillRect(x0, Math.round(cy * s + dy), x1 - x0, 1);
    }
    return this;
  }

  /** Rasterize a circle as horizontal fillRect scanlines */
  fillCircle(cx: number, cy: number, r: number) {
    return this.fillEllipse(cx, cy, r * 2, r * 2);
  }

  /** Rasterize a filled triangle as horizontal fillRect scanlines */
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    const s = this.s;
    const px1 = x1*s, py1 = y1*s, px2 = x2*s, py2 = y2*s, px3 = x3*s, py3 = y3*s;
    const minY = Math.floor(Math.min(py1, py2, py3));
    const maxY = Math.ceil(Math.max(py1, py2, py3));
    const edges: number[][] = [[px1,py1,px2,py2],[px2,py2,px3,py3],[px3,py3,px1,py1]];
    for (let y = minY; y <= maxY; y++) {
      let xMin = Infinity, xMax = -Infinity;
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by >= y) || (by <= y && ay >= y)) {
          const d = by - ay;
          const t = d === 0 ? 0 : (y - ay) / d;
          const x = ax + t * (bx - ax);
          xMin = Math.min(xMin, x);
          xMax = Math.max(xMax, x);
        }
      }
      if (xMin <= xMax) {
        this.g.fillRect(Math.round(xMin), y, Math.max(1, Math.round(xMax - xMin)), 1);
      }
    }
    return this;
  }

  /** Draw a straight limb/connector with varying radius (organic taper) */
  fillLimb(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) {
    const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    const steps = Math.max(10, Math.ceil(dist * 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const r = r1 + (r2 - r1) * t;
      this.fillCircle(x, y, r);
    }
    return this;
  }

  /** Draw a curved limb along a quadratic bezier with varying radius */
  fillCurvedLimb(x1: number, y1: number, r1: number,
                  cpx: number, cpy: number,
                  x2: number, y2: number, r2: number) {
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt*mt*x1 + 2*mt*t*cpx + t*t*x2;
      const y = mt*mt*y1 + 2*mt*t*cpy + t*t*y2;
      const r = r1 + (r2 - r1) * t;
      this.fillCircle(x, y, r);
    }
    return this;
  }

  /** Rasterize a line as fillRect pixels */
  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    const s = this.s;
    const px1 = Math.round(x1*s), py1 = Math.round(y1*s);
    const px2 = Math.round(x2*s), py2 = Math.round(y2*s);
    const dx = Math.abs(px2 - px1), dy = Math.abs(py2 - py1);
    const sx = px1 < px2 ? 1 : -1, sy = py1 < py2 ? 1 : -1;
    let err = dx - dy, cx = px1, cy = py1;
    for (let i = 0; i < 500; i++) {
      this.g.fillRect(cx, cy, 2, 2);
      if (Math.abs(cx - px2) <= 1 && Math.abs(cy - py2) <= 1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
    return this;
  }

  strokeCircle(x: number, y: number, r: number) {
    // Rasterize circle outline as fillRect pixels
    const s = this.s;
    const pcx = Math.round(x * s), pcy = Math.round(y * s), pr = Math.round(r * s);
    let px = 0, py = pr, d = 1 - pr;
    while (px <= py) {
      this.g.fillRect(pcx + px, pcy + py, 1, 1); this.g.fillRect(pcx - px, pcy + py, 1, 1);
      this.g.fillRect(pcx + px, pcy - py, 1, 1); this.g.fillRect(pcx - px, pcy - py, 1, 1);
      this.g.fillRect(pcx + py, pcy + px, 1, 1); this.g.fillRect(pcx - py, pcy + px, 1, 1);
      this.g.fillRect(pcx + py, pcy - px, 1, 1); this.g.fillRect(pcx - py, pcy - px, 1, 1);
      px++;
      if (d < 0) { d += 2 * px + 1; } else { py--; d += 2 * (px - py) + 1; }
    }
    return this;
  }
}

const SPRITE_SCALE = 2;
const TILE_LOGICAL = 24; // logical tile size (was 16, now 24 for higher detail)

/** Wraps ScaledGraphics to upscale 16-grid coordinates to 24-grid automatically.
 *  Existing tile decorators written for 16×16 pass through this to render at 24×24. */
class UpscaledGraphics {
  private ratio = TILE_LOGICAL / 16; // 1.5
  constructor(private sg: ScaledGraphics) {}
  fillStyle(c: number, a?: number) { this.sg.fillStyle(c, a); return this; }
  lineStyle(w: number, c: number, a?: number) { this.sg.lineStyle(w, c, a); return this; }
  fillRect(x: number, y: number, w: number, h: number) {
    const r = this.ratio;
    this.sg.fillRect(Math.round(x * r), Math.round(y * r), Math.max(1, Math.round(w * r)), Math.max(1, Math.round(h * r)));
    return this;
  }
  fillEllipse(cx: number, cy: number, w: number, h: number) {
    const r = this.ratio;
    this.sg.fillEllipse(cx * r, cy * r, w * r, h * r);
    return this;
  }
  fillCircle(cx: number, cy: number, rad: number) {
    const r = this.ratio;
    this.sg.fillCircle(cx * r, cy * r, rad * r);
    return this;
  }
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    const r = this.ratio;
    this.sg.fillTriangle(x1*r, y1*r, x2*r, y2*r, x3*r, y3*r);
    return this;
  }
  fillLimb(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) {
    const r = this.ratio;
    this.sg.fillLimb(x1*r, y1*r, r1*r, x2*r, y2*r, r2*r);
    return this;
  }
  fillCurvedLimb(x1: number, y1: number, r1: number, cpx: number, cpy: number, x2: number, y2: number, r2: number) {
    const r = this.ratio;
    this.sg.fillCurvedLimb(x1*r, y1*r, r1*r, cpx*r, cpy*r, x2*r, y2*r, r2*r);
    return this;
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    const r = this.ratio;
    this.sg.lineBetween(x1*r, y1*r, x2*r, y2*r);
    return this;
  }
  strokeCircle(x: number, y: number, rad: number) {
    const r = this.ratio;
    this.sg.strokeCircle(x * r, y * r, rad * r);
    return this;
  }
}

// Hero color scheme definitions
export const HERO_COLOR_SCHEMES: Record<HeroColorScheme, {
  armor: number; armorDark: number; helmet: number;
  plume: number; cape: number; capeDark: number;
  shield: number; shieldEdge: number;
}> = {
  gray:  { armor: 0x8899bb, armorDark: 0x667799, helmet: 0x7788aa, plume: 0xcc2222, cape: 0x2244aa, capeDark: 0x1a3388, shield: 0x2244aa, shieldEdge: 0xddaa33 },
  blue:  { armor: 0x4477dd, armorDark: 0x3355aa, helmet: 0x3366cc, plume: 0xffffff, cape: 0x2255cc, capeDark: 0x1a44aa, shield: 0x2255cc, shieldEdge: 0xccccdd },
  pink:  { armor: 0xcc6699, armorDark: 0xaa4477, helmet: 0xbb5588, plume: 0xffeeff, cape: 0xdd4488, capeDark: 0xbb3366, shield: 0xdd4488, shieldEdge: 0xffc0cb },
  black: { armor: 0x444455, armorDark: 0x333344, helmet: 0x333344, plume: 0xcc2222, cape: 0x222233, capeDark: 0x111122, shield: 0x333344, shieldEdge: 0x888899 },
};

export function generateAssets(scene: Phaser.Scene): void {
  generateHeroSprites(scene, 'gray');
  generateMonsterSprites(scene);
  generateTilesets(scene);
  generateUIAssets(scene);
}

/** Regenerate hero sprites with the given color scheme */
export function regenerateHeroSprites(scene: Phaser.Scene, scheme: HeroColorScheme): void {
  // Remove old texture if it exists
  if (scene.textures.exists('hero-walk')) {
    scene.textures.remove('hero-walk');
  }
  generateHeroSprites(scene, scheme);
}

function drawKnight(g: ScaledGraphics, ox: number, oy: number, dir: number, frame: number, scheme: HeroColorScheme = 'gray'): void {
  // dir: 0=down, 1=left, 2=right, 3=up  — native 24×24 coordinate space
  const cs = HERO_COLOR_SCHEMES[scheme];
  const armor = cs.armor;
  const armorDark = cs.armorDark;
  const armorHi = 0xaabbdd;     // Armor highlight
  const helmet = cs.helmet;
  const visor = armorDark;
  const plume = cs.plume;
  const plumeDark = 0x991111;
  const cape = cs.cape;
  const capeDark = cs.capeDark;
  const sword = 0xccccdd;
  const swordHi = 0xeeeeff;     // Sword shine
  const hilt = 0xddaa33;
  const shield = cs.shield;
  const shieldEdge = cs.shieldEdge;
  const boots = 0x554433;
  const bootsHi = 0x776655;
  const skin = 0xddbb88;

  const lo = frame === 1 ? 1 : frame === 2 ? -1 : 0; // leg offset

  if (dir === 0) {
    // ── FACING DOWN (front view) ──
    // Cape behind body
    g.fillStyle(cape);
    g.fillRect(ox + 4, oy + 10, 16, 10);
    g.fillStyle(capeDark);
    g.fillRect(ox + 6, oy + 11, 12, 9);
    g.fillStyle(cape);
    g.fillRect(ox + 4, oy + 18, 3, 2); // left flutter
    g.fillRect(ox + 17, oy + 18, 3, 2); // right flutter

    // Armor body
    g.fillStyle(armor);
    g.fillRect(ox + 7, oy + 8, 10, 9);
    g.fillStyle(armorHi);
    g.fillRect(ox + 7, oy + 8, 10, 1); // top highlight
    g.fillStyle(armorDark);
    g.fillRect(ox + 7, oy + 15, 10, 2); // tasset

    // Shoulder pauldrons
    g.fillStyle(armor);
    g.fillRect(ox + 5, oy + 8, 3, 3);
    g.fillRect(ox + 16, oy + 8, 3, 3);
    g.fillStyle(armorHi);
    g.fillRect(ox + 5, oy + 8, 3, 1);
    g.fillRect(ox + 16, oy + 8, 3, 1);

    // Belt
    g.fillStyle(armorDark);
    g.fillRect(ox + 7, oy + 13, 10, 2);
    g.fillStyle(hilt);
    g.fillRect(ox + 10, oy + 13, 4, 2); // gold buckle

    // Helmet
    g.fillStyle(helmet);
    g.fillRect(ox + 7, oy + 1, 10, 7);
    g.fillRect(ox + 6, oy + 2, 12, 5);
    g.fillStyle(armorHi);
    g.fillRect(ox + 8, oy + 1, 3, 1); // helmet highlight

    // Visor slit
    g.fillStyle(visor);
    g.fillRect(ox + 8, oy + 4, 8, 2);
    // Glowing eyes
    g.fillStyle(0xeeeeff);
    g.fillRect(ox + 9, oy + 4, 2, 2);
    g.fillRect(ox + 13, oy + 4, 2, 2);
    // Lower face guard
    g.fillStyle(armorDark);
    g.fillRect(ox + 8, oy + 6, 8, 1);

    // Plume
    g.fillStyle(plume);
    g.fillRect(ox + 10, oy + 0, 4, 3);
    g.fillStyle(plumeDark);
    g.fillRect(ox + 11, oy + 0, 2, 1);

    // Sword (right side)
    g.fillStyle(sword);
    g.fillRect(ox + 19, oy + 4, 2, 10);
    g.fillStyle(swordHi);
    g.fillRect(ox + 19, oy + 4, 1, 6);
    g.fillStyle(hilt);
    g.fillRect(ox + 18, oy + 13, 4, 2); // crossguard
    g.fillStyle(0x885522);
    g.fillRect(ox + 19, oy + 15, 2, 2); // grip

    // Shield (left side)
    g.fillStyle(shield);
    g.fillRect(ox + 2, oy + 7, 5, 8);
    g.fillStyle(shieldEdge);
    g.fillRect(ox + 2, oy + 7, 5, 1);
    g.fillRect(ox + 2, oy + 14, 5, 1);
    g.fillRect(ox + 2, oy + 7, 1, 8);
    g.fillRect(ox + 6, oy + 7, 1, 8);
    g.fillStyle(hilt);
    g.fillRect(ox + 4, oy + 9, 1, 4); // emblem vertical
    g.fillRect(ox + 3, oy + 10, 3, 2); // emblem horizontal

    // Legs / boots
    g.fillStyle(boots);
    g.fillRect(ox + 7 + lo, oy + 17, 4, 5);
    g.fillRect(ox + 13 - lo, oy + 17, 4, 5);
    g.fillStyle(bootsHi);
    g.fillRect(ox + 7 + lo, oy + 17, 4, 1);
    g.fillRect(ox + 13 - lo, oy + 17, 4, 1);
    g.fillStyle(0x443322);
    g.fillRect(ox + 7 + lo, oy + 21, 4, 2); // soles
    g.fillRect(ox + 13 - lo, oy + 21, 4, 2);

  } else if (dir === 1) {
    // ── FACING LEFT ──
    // Cape (right/behind)
    g.fillStyle(cape);
    g.fillRect(ox + 14, oy + 9, 6, 11);
    g.fillStyle(capeDark);
    g.fillRect(ox + 17, oy + 10, 3, 10);
    g.fillStyle(cape);
    g.fillRect(ox + 17, oy + 18, 3, 2); // flutter

    // Armor body
    g.fillStyle(armor);
    g.fillRect(ox + 7, oy + 8, 8, 9);
    g.fillStyle(armorHi);
    g.fillRect(ox + 7, oy + 8, 8, 1);
    g.fillStyle(armorDark);
    g.fillRect(ox + 7, oy + 15, 8, 2); // tasset

    // Left pauldron (visible)
    g.fillStyle(armor);
    g.fillRect(ox + 5, oy + 8, 3, 3);
    g.fillStyle(armorHi);
    g.fillRect(ox + 5, oy + 8, 3, 1);

    // Belt
    g.fillStyle(armorDark);
    g.fillRect(ox + 7, oy + 13, 8, 2);
    g.fillStyle(hilt);
    g.fillRect(ox + 10, oy + 13, 2, 2); // buckle

    // Helmet facing left
    g.fillStyle(helmet);
    g.fillRect(ox + 6, oy + 1, 9, 7);
    g.fillRect(ox + 4, oy + 3, 3, 4);
    g.fillStyle(armorHi);
    g.fillRect(ox + 7, oy + 1, 3, 1);

    // Visor slit
    g.fillStyle(visor);
    g.fillRect(ox + 5, oy + 4, 5, 2);
    g.fillStyle(0xeeeeff);
    g.fillRect(ox + 5, oy + 4, 2, 2); // eye glow
    // Face guard
    g.fillStyle(armorDark);
    g.fillRect(ox + 5, oy + 6, 5, 1);

    // Plume
    g.fillStyle(plume);
    g.fillRect(ox + 11, oy + 0, 4, 3);
    g.fillStyle(plumeDark);
    g.fillRect(ox + 12, oy + 0, 2, 1);

    // Shield (front/left)
    g.fillStyle(shield);
    g.fillRect(ox + 2, oy + 8, 5, 7);
    g.fillStyle(shieldEdge);
    g.fillRect(ox + 2, oy + 8, 1, 7);
    g.fillRect(ox + 6, oy + 8, 1, 7);
    g.fillRect(ox + 2, oy + 8, 5, 1);
    g.fillRect(ox + 2, oy + 14, 5, 1);
    g.fillStyle(hilt);
    g.fillRect(ox + 4, oy + 10, 1, 3); // emblem

    // Sword (behind/right)
    g.fillStyle(sword);
    g.fillRect(ox + 15, oy + 3, 2, 10);
    g.fillStyle(swordHi);
    g.fillRect(ox + 15, oy + 3, 1, 6);
    g.fillStyle(hilt);
    g.fillRect(ox + 14, oy + 12, 4, 2);

    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 7 + lo, oy + 17, 4, 5);
    g.fillRect(ox + 11 - lo, oy + 17, 4, 5);
    g.fillStyle(bootsHi);
    g.fillRect(ox + 7 + lo, oy + 17, 4, 1);
    g.fillRect(ox + 11 - lo, oy + 17, 4, 1);
    g.fillStyle(0x443322);
    g.fillRect(ox + 7 + lo, oy + 21, 4, 2);
    g.fillRect(ox + 11 - lo, oy + 21, 4, 2);

  } else if (dir === 2) {
    // ── FACING RIGHT (mirror of left) ──
    // Cape (left/behind)
    g.fillStyle(cape);
    g.fillRect(ox + 4, oy + 9, 6, 11);
    g.fillStyle(capeDark);
    g.fillRect(ox + 4, oy + 10, 3, 10);
    g.fillStyle(cape);
    g.fillRect(ox + 4, oy + 18, 3, 2);

    // Armor body
    g.fillStyle(armor);
    g.fillRect(ox + 9, oy + 8, 8, 9);
    g.fillStyle(armorHi);
    g.fillRect(ox + 9, oy + 8, 8, 1);
    g.fillStyle(armorDark);
    g.fillRect(ox + 9, oy + 15, 8, 2);

    // Right pauldron
    g.fillStyle(armor);
    g.fillRect(ox + 16, oy + 8, 3, 3);
    g.fillStyle(armorHi);
    g.fillRect(ox + 16, oy + 8, 3, 1);

    // Belt
    g.fillStyle(armorDark);
    g.fillRect(ox + 9, oy + 13, 8, 2);
    g.fillStyle(hilt);
    g.fillRect(ox + 12, oy + 13, 2, 2);

    // Helmet facing right
    g.fillStyle(helmet);
    g.fillRect(ox + 9, oy + 1, 9, 7);
    g.fillRect(ox + 17, oy + 3, 3, 4);
    g.fillStyle(armorHi);
    g.fillRect(ox + 14, oy + 1, 3, 1);

    // Visor slit
    g.fillStyle(visor);
    g.fillRect(ox + 14, oy + 4, 5, 2);
    g.fillStyle(0xeeeeff);
    g.fillRect(ox + 17, oy + 4, 2, 2);
    // Face guard
    g.fillStyle(armorDark);
    g.fillRect(ox + 14, oy + 6, 5, 1);

    // Plume
    g.fillStyle(plume);
    g.fillRect(ox + 9, oy + 0, 4, 3);
    g.fillStyle(plumeDark);
    g.fillRect(ox + 10, oy + 0, 2, 1);

    // Sword (front/right)
    g.fillStyle(sword);
    g.fillRect(ox + 19, oy + 3, 2, 10);
    g.fillStyle(swordHi);
    g.fillRect(ox + 20, oy + 3, 1, 6);
    g.fillStyle(hilt);
    g.fillRect(ox + 18, oy + 12, 4, 2);

    // Shield (behind/left)
    g.fillStyle(shield);
    g.fillRect(ox + 17, oy + 8, 5, 7);
    g.fillStyle(shieldEdge);
    g.fillRect(ox + 17, oy + 8, 1, 7);
    g.fillRect(ox + 21, oy + 8, 1, 7);
    g.fillRect(ox + 17, oy + 8, 5, 1);
    g.fillRect(ox + 17, oy + 14, 5, 1);
    g.fillStyle(hilt);
    g.fillRect(ox + 19, oy + 10, 1, 3);

    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 9 + lo, oy + 17, 4, 5);
    g.fillRect(ox + 13 - lo, oy + 17, 4, 5);
    g.fillStyle(bootsHi);
    g.fillRect(ox + 9 + lo, oy + 17, 4, 1);
    g.fillRect(ox + 13 - lo, oy + 17, 4, 1);
    g.fillStyle(0x443322);
    g.fillRect(ox + 9 + lo, oy + 21, 4, 2);
    g.fillRect(ox + 13 - lo, oy + 21, 4, 2);

  } else {
    // ── FACING UP (back view) ──
    // Cape full back
    g.fillStyle(cape);
    g.fillRect(ox + 4, oy + 8, 16, 12);
    g.fillStyle(capeDark);
    g.fillRect(ox + 6, oy + 9, 12, 11);
    // Cape center fold line
    g.fillStyle(cape);
    g.fillRect(ox + 11, oy + 9, 2, 11);

    // Armor shoulders peeking
    g.fillStyle(armor);
    g.fillRect(ox + 5, oy + 8, 4, 4);
    g.fillRect(ox + 15, oy + 8, 4, 4);
    g.fillStyle(armorHi);
    g.fillRect(ox + 5, oy + 8, 4, 1);
    g.fillRect(ox + 15, oy + 8, 4, 1);

    // Helmet from back
    g.fillStyle(helmet);
    g.fillRect(ox + 7, oy + 1, 10, 7);
    g.fillRect(ox + 6, oy + 2, 12, 5);
    g.fillStyle(armorDark);
    g.fillRect(ox + 8, oy + 6, 8, 1); // neck guard

    // Plume (taller from back)
    g.fillStyle(plume);
    g.fillRect(ox + 10, oy + 0, 4, 4);
    g.fillRect(ox + 9, oy + 0, 6, 2);
    g.fillStyle(plumeDark);
    g.fillRect(ox + 11, oy + 0, 2, 1);

    // Sword on back (diagonal hint)
    g.fillStyle(sword);
    g.fillRect(ox + 17, oy + 3, 2, 10);
    g.fillStyle(swordHi);
    g.fillRect(ox + 17, oy + 3, 1, 6);
    g.fillStyle(hilt);
    g.fillRect(ox + 16, oy + 12, 4, 2);

    // Shield on back
    g.fillStyle(shield);
    g.fillRect(ox + 4, oy + 6, 4, 6);
    g.fillStyle(shieldEdge);
    g.fillRect(ox + 4, oy + 6, 4, 1);
    g.fillRect(ox + 4, oy + 11, 4, 1);
    g.fillRect(ox + 4, oy + 6, 1, 6);
    g.fillRect(ox + 7, oy + 6, 1, 6);

    // Boots
    g.fillStyle(boots);
    g.fillRect(ox + 7 + lo, oy + 17, 4, 5);
    g.fillRect(ox + 13 - lo, oy + 17, 4, 5);
    g.fillStyle(bootsHi);
    g.fillRect(ox + 7 + lo, oy + 17, 4, 1);
    g.fillRect(ox + 13 - lo, oy + 17, 4, 1);
    g.fillStyle(0x443322);
    g.fillRect(ox + 7 + lo, oy + 21, 4, 2);
    g.fillRect(ox + 13 - lo, oy + 21, 4, 2);
  }
}

function generateHeroSprites(scene: Phaser.Scene, scheme: HeroColorScheme = 'gray'): void {
  // Hero walking sprite sheet: 4 directions × 3 frames = 12 frames
  // Drawn at native 24×24 coordinate space
  const g = scene.add.graphics().setVisible(false);
  const sg = new ScaledGraphics(g, SPRITE_SCALE);
  const frameW = TILE_LOGICAL; // 24

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 3; frame++) {
      const ox = (dir * 3 + frame) * frameW;
      drawKnight(sg, ox, 0, dir, frame, scheme);
    }
  }

  g.generateTexture('hero-walk', frameW * SPRITE_SCALE * 12, frameW * SPRITE_SCALE);
  g.destroy();

  // Add frames manually for animation
  for (let i = 0; i < 12; i++) {
    scene.textures.get('hero-walk').add(i, 0, i * frameW * SPRITE_SCALE, 0, frameW * SPRITE_SCALE, frameW * SPRITE_SCALE);
  }
}

function generateMonsterSprites(scene: Phaser.Scene): void {
  const monsterDefs: { key: string; color: number; shape: string }[] = [
    // Act 1 — early
    { key: 'monster-slime', color: 0x44cc88, shape: 'slime' },
    { key: 'monster-bug', color: 0x886622, shape: 'bug' },
    { key: 'monster-rabbit', color: 0xccaa88, shape: 'rabbit' },
    { key: 'monster-wolf', color: 0x555577, shape: 'wolf' },
    { key: 'monster-mushroom', color: 0xaa44aa, shape: 'mushroom' },
    { key: 'monster-bandit', color: 0x774422, shape: 'bandit' },
    { key: 'monster-bat', color: 0x443355, shape: 'bat' },
    { key: 'monster-spider', color: 0x333333, shape: 'spider' },
    { key: 'monster-crab', color: 0xcc4422, shape: 'crab' },
    { key: 'monster-golem', color: 0x888877, shape: 'golem' },
    { key: 'monster-giantToad', color: 0x337722, shape: 'frog' },
    { key: 'monster-serpent', color: 0x2266aa, shape: 'serpent' },
    // Act 2
    { key: 'monster-jellyfish', color: 0x8844cc, shape: 'jellyfish' },
    { key: 'monster-piranha', color: 0x4488cc, shape: 'piranha' },
    { key: 'monster-merfolk', color: 0x22aa88, shape: 'merfolk' },
    { key: 'monster-harpy', color: 0xddaadd, shape: 'harpy' },
    { key: 'monster-wyvern', color: 0x44aa66, shape: 'wyvern' },
    { key: 'monster-kraken', color: 0x552288, shape: 'kraken' },
    { key: 'monster-stormHarpy', color: 0x6644aa, shape: 'storm-harpy' },
    { key: 'monster-dragon', color: 0xcc2222, shape: 'dragon' },
    // Act 3
    { key: 'monster-blizzardBear', color: 0xaaccee, shape: 'bear' },
    { key: 'monster-iceSprite', color: 0x88ddff, shape: 'ice-sprite' },
    { key: 'monster-darkSorcerer', color: 0x223366, shape: 'dark-sorcerer' },
    { key: 'monster-iceWyrm', color: 0x66aadd, shape: 'ice-wyrm' },
    // Act 4
    { key: 'monster-lizard', color: 0xcc6622, shape: 'lizard' },
    { key: 'monster-knight', color: 0x332244, shape: 'knight' },
    { key: 'monster-skeleton', color: 0xccccbb, shape: 'skeleton' },
    { key: 'monster-wraith', color: 0x775599, shape: 'wraith' },
    { key: 'monster-fireElemental', color: 0xff6622, shape: 'fire-elemental' },
    { key: 'monster-lavaGolem', color: 0xcc3311, shape: 'lava-golem' },
    { key: 'monster-lich', color: 0x225533, shape: 'lich' },
    { key: 'monster-flameTitan', color: 0xee4400, shape: 'flame-titan' },
    { key: 'monster-lavaWyrm', color: 0xff5511, shape: 'lava-wyrm' },
    // Act 5
    { key: 'monster-chimera', color: 0x996633, shape: 'chimera' },
    { key: 'monster-demon', color: 0x881122, shape: 'demon' },
    { key: 'monster-shadow', color: 0x221133, shape: 'shadow' },
    { key: 'monster-demonKing', color: 0x660066, shape: 'demon-king' },
    // Legendary bosses
    { key: 'monster-swordWraith', color: 0x4466aa, shape: 'sword-wraith' },
    { key: 'monster-celestialGuardian', color: 0xddcc88, shape: 'celestial-guardian' },
    // Boss monsters
    { key: 'monster-stormSentinel', color: 0x4466ee, shape: 'storm-sentinel' },
    { key: 'monster-frostMonarch', color: 0x88ccff, shape: 'frost-monarch' },
    { key: 'monster-giantCrab', color: 0xdd5533, shape: 'giant-crab' },
    { key: 'monster-sandGolem', color: 0xccaa66, shape: 'sand-golem' },
    { key: 'monster-banditLord', color: 0x664422, shape: 'bandit-lord' },
    // V2 unique monsters
    { key: 'monster-seaStar', color: 0xff8844, shape: 'spider' },
    { key: 'monster-mummy', color: 0xbbaa77, shape: 'golem' },
    // Portal land monsters
    { key: 'monster-stormRaptor', color: 0x4466cc, shape: 'storm-raptor' },
    { key: 'monster-cloudWraith', color: 0x8899cc, shape: 'cloud-wraith' },
    { key: 'monster-frostStalker', color: 0x99bbdd, shape: 'frost-stalker' },
    { key: 'monster-glacialGolem', color: 0x88bbee, shape: 'glacial-golem' },
    { key: 'monster-templeGuard', color: 0x997744, shape: 'temple-guard' },
    { key: 'monster-ancientSphinx', color: 0xddbb66, shape: 'ancient-sphinx' },
    { key: 'monster-voidShade', color: 0x331144, shape: 'void-shade' },
    { key: 'monster-darkKnight', color: 0x222233, shape: 'dark-knight' },
  ];

  const size = 64; // Monster sprite size (increased from 48 for detail)

  for (const def of monsterDefs) {
    // Skip if a preloaded image already exists for this sprite key
    if (scene.textures.exists(def.key)) continue;
    const g = scene.add.graphics().setVisible(false);
    const sg = new ScaledGraphics(g, SPRITE_SCALE);
    drawMonster(sg, def.shape, def.color, size);
    g.generateTexture(def.key, size * SPRITE_SCALE, size * SPRITE_SCALE);
    g.destroy();
  }
}

function drawMonster(g: ScaledGraphics, shape: string, color: number, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const darker = Phaser.Display.Color.IntegerToColor(color).darken(30).color;
  const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(30).color;
  const lightest = Phaser.Display.Color.IntegerToColor(color).lighten(50).color;

  switch (shape) {



      case 'slime': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Main body - teardrop/dome shape built from ellipses
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 8, 38, 34);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 8, 36, 32);
        // Top point of teardrop
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 8, 24, 20);
        g.fillEllipse(cx, cy - 14, 14, 14);
        g.fillEllipse(cx, cy - 18, 8, 10);
        // Tip
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 22, 4, 6);
        // Body shading - darker bottom
        g.fillStyle(darker, 0.3);
        g.fillEllipse(cx, cy + 18, 32, 14);
        // Belly highlight
        g.fillStyle(lighter, 0.4);
        g.fillEllipse(cx - 2, cy + 2, 20, 16);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 4, cy - 2, 12, 10);
        // Shine spot on top
        g.fillStyle(lightest, 0.7);
        g.fillEllipse(cx - 6, cy - 14, 6, 5);
        g.fillStyle(0xFFFFFF, 0.5);
        g.fillEllipse(cx - 6, cy - 15, 4, 3);
        // Eyes - small menacing dots
        g.fillStyle(0x111111);
        g.fillCircle(cx - 6, cy + 3, 2);
        g.fillCircle(cx + 6, cy + 3, 2);
        // Mouth - cute smile
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 12, 8, 4);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 11, 8, 4);
        // Bottom edge shading
        g.fillStyle(darker, 0.2);
        g.fillEllipse(cx, cy + 24, 30, 6);
        break;
      }

      case 'bug': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Antennae
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 6, cy - 6, 1, cx - 14, cy - 22, cx - 12, cy - 18, 2);
        g.fillCurvedLimb(cx + 6, cy - 6, 1, cx + 14, cy - 22, cx + 12, cy - 18, 2);
        // Antenna tips
        g.fillStyle(lighter);
        g.fillCircle(cx - 12, cy - 18, 2);
        g.fillCircle(cx + 12, cy - 18, 2);
        // Legs - three on each side
        g.fillStyle(darker);
        // Left legs
        g.fillCurvedLimb(cx - 14, cy + 8, 2, cx - 26, cy + 14, cx - 22, cy + 20, 1);
        g.fillCurvedLimb(cx - 16, cy + 14, 2, cx - 28, cy + 20, cx - 24, cy + 26, 1);
        g.fillCurvedLimb(cx - 14, cy + 18, 2, cx - 24, cy + 26, cx - 20, cy + 28, 1);
        // Right legs
        g.fillCurvedLimb(cx + 14, cy + 8, 2, cx + 26, cy + 14, cx + 22, cy + 20, 1);
        g.fillCurvedLimb(cx + 16, cy + 14, 2, cx + 28, cy + 20, cx + 24, cy + 26, 1);
        g.fillCurvedLimb(cx + 14, cy + 18, 2, cx + 24, cy + 26, cx + 20, cy + 28, 1);
        // Shell body - main dome
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 10, 34, 26);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 9, 32, 24);
        // Shell dividing line
        g.fillStyle(darker, 0.5);
        g.fillRect(cx - 1, cy - 2, 2, 22);
        // Shell spots
        g.fillStyle(darker, 0.4);
        g.fillCircle(cx - 10, cy + 4, 3);
        g.fillCircle(cx + 10, cy + 4, 3);
        g.fillCircle(cx - 8, cy + 14, 3);
        g.fillCircle(cx + 8, cy + 14, 3);
        g.fillCircle(cx - 14, cy + 10, 2);
        g.fillCircle(cx + 14, cy + 10, 2);
        // Shell highlight
        g.fillStyle(lighter, 0.4);
        g.fillEllipse(cx - 4, cy + 2, 12, 8);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 6, cy, 6, 4);
        // Head poking out front
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 4, 18, 12);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 4, 16, 10);
        // Eyes - small insect dots
        g.fillStyle(0x111111);
        g.fillCircle(cx - 4, cy - 5, 1.5);
        g.fillCircle(cx + 4, cy - 5, 1.5);
        // Little mouth
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 1, 4, 2);
        // Shell edge shading
        g.fillStyle(darker, 0.2);
        g.fillEllipse(cx, cy + 20, 28, 6);
        break;
      }

      case 'rabbit': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Ears - long floppy rabbit ears
        g.fillStyle(darker);
        g.fillEllipse(cx - 10, cy - 22, 8, 20);
        g.fillEllipse(cx + 10, cy - 22, 8, 20);
        g.fillStyle(color);
        g.fillEllipse(cx - 10, cy - 22, 7, 19);
        g.fillEllipse(cx + 10, cy - 22, 7, 19);
        // Inner ear
        g.fillStyle(lighter);
        g.fillEllipse(cx - 10, cy - 22, 3, 14);
        g.fillEllipse(cx + 10, cy - 22, 3, 14);
        // Horn on forehead (almiraj)
        g.fillStyle(0xFFEEAA);
        g.fillTriangle(cx, cy - 38, cx - 3, cy - 18, cx + 3, cy - 18);
        g.fillStyle(0xFFDD77);
        g.fillTriangle(cx + 1, cy - 38, cx, cy - 18, cx + 3, cy - 18);
        // Horn spiral detail
        g.fillStyle(0xFFFFDD, 0.5);
        g.fillRect(cx - 1, cy - 34, 2, 1);
        g.fillRect(cx - 1, cy - 30, 2, 1);
        g.fillRect(cx - 1, cy - 26, 2, 1);
        g.fillRect(cx - 1, cy - 22, 2, 1);
        // Body - sitting round shape
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 14, 28, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 14, 26, 20);
        // Belly
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx, cy + 16, 16, 14);
        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 2, 24, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 2, 22, 18);
        // Cheeks
        g.fillStyle(lighter, 0.3);
        g.fillEllipse(cx - 10, cy + 2, 6, 4);
        g.fillEllipse(cx + 10, cy + 2, 6, 4);
        // Eyes - small, narrow, intense
        g.fillStyle(0xCC2244);
        g.fillEllipse(cx - 5, cy - 2, 4, 3);
        g.fillEllipse(cx + 5, cy - 2, 4, 3);
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 5, cy - 2, 2, 3);
        g.fillEllipse(cx + 5, cy - 2, 2, 3);
        // Angry brow
        g.fillStyle(0x111111);
        g.fillRect(cx - 8, cy - 5, 5, 1);
        g.fillRect(cx + 3, cy - 5, 5, 1);
        // Nose
        g.fillStyle(0xFF8899);
        g.fillEllipse(cx, cy + 3, 3, 2);
        // Mouth
        g.fillStyle(darker);
        g.lineBetween(cx, cy + 4, cx - 2, cy + 6);
        g.lineBetween(cx, cy + 4, cx + 2, cy + 6);
        // Front paws
        g.fillStyle(darker);
        g.fillEllipse(cx - 8, cy + 20, 6, 5);
        g.fillEllipse(cx + 8, cy + 20, 6, 5);
        g.fillStyle(color);
        g.fillEllipse(cx - 8, cy + 20, 5, 4);
        g.fillEllipse(cx + 8, cy + 20, 5, 4);
        // Fluffy tail hint
        g.fillStyle(lightest, 0.5);
        g.fillCircle(cx, cy + 22, 4);
        // Head highlight
        g.fillStyle(lightest, 0.2);
        g.fillEllipse(cx - 4, cy - 8, 10, 6);
        break;
      }

      case 'wolf': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Body/chest fur
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 14, 32, 24);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 14, 30, 22);
        // Chest fur lighter patch
        g.fillStyle(lighter, 0.5);
        g.fillEllipse(cx, cy + 16, 18, 16);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx, cy + 18, 12, 10);
        // Fur mane - spiky around neck
        g.fillStyle(color);
        g.fillTriangle(cx - 18, cy + 2, cx - 14, cy - 6, cx - 10, cy + 4);
        g.fillTriangle(cx + 18, cy + 2, cx + 14, cy - 6, cx + 10, cy + 4);
        g.fillTriangle(cx - 16, cy + 6, cx - 20, cy - 2, cx - 12, cy + 2);
        g.fillTriangle(cx + 16, cy + 6, cx + 20, cy - 2, cx + 12, cy + 2);
        g.fillStyle(darker);
        g.fillTriangle(cx - 20, cy + 4, cx - 16, cy - 4, cx - 14, cy + 6);
        g.fillTriangle(cx + 20, cy + 4, cx + 16, cy - 4, cx + 14, cy + 6);
        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 2, 26, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 2, 24, 20);
        // Snout
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 4, 14, 10);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 4, 12, 8);
        // Ears - pointed
        g.fillStyle(darker);
        g.fillTriangle(cx - 14, cy - 6, cx - 8, cy - 22, cx - 4, cy - 6);
        g.fillTriangle(cx + 14, cy - 6, cx + 8, cy - 22, cx + 4, cy - 6);
        g.fillStyle(color);
        g.fillTriangle(cx - 13, cy - 6, cx - 8, cy - 20, cx - 5, cy - 6);
        g.fillTriangle(cx + 13, cy - 6, cx + 8, cy - 20, cx + 5, cy - 6);
        // Inner ear
        g.fillStyle(lighter);
        g.fillTriangle(cx - 11, cy - 8, cx - 8, cy - 16, cx - 6, cy - 8);
        g.fillTriangle(cx + 11, cy - 8, cx + 8, cy - 16, cx + 6, cy - 8);
        // Eyes - fierce/intense, narrow
        // Angry brow line
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy - 8, 8, 2);
        g.fillRect(cx + 4, cy - 8, 8, 2);
        // Yellow irises - narrow, no whites
        g.fillStyle(0xCCAA00);
        g.fillEllipse(cx - 6, cy - 3, 5, 4);
        g.fillEllipse(cx + 6, cy - 3, 5, 4);
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 6, cy - 3, 2, 4);
        g.fillEllipse(cx + 6, cy - 3, 2, 4);
        // Nose
        g.fillStyle(0x111111);
        g.fillEllipse(cx, cy + 1, 4, 3);
        g.fillStyle(0x333333);
        g.fillCircle(cx - 1, cy, 1);
        // Fangs
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx - 5, cy + 6, cx - 4, cy + 11, cx - 3, cy + 6);
        g.fillTriangle(cx + 3, cy + 6, cx + 4, cy + 11, cx + 5, cy + 6);
        // Mouth line
        g.fillStyle(darker);
        g.lineBetween(cx - 6, cy + 7, cx + 6, cy + 7);
        // Forehead marking
        g.fillStyle(darker, 0.3);
        g.fillTriangle(cx, cy - 14, cx - 4, cy - 6, cx + 4, cy - 6);
        // Paws at bottom
        g.fillStyle(darker);
        g.fillEllipse(cx - 10, cy + 24, 8, 5);
        g.fillEllipse(cx + 10, cy + 24, 8, 5);
        g.fillStyle(color);
        g.fillEllipse(cx - 10, cy + 24, 7, 4);
        g.fillEllipse(cx + 10, cy + 24, 7, 4);
        break;
      }

      case 'mushroom': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Feet/legs
        g.fillStyle(darker);
        g.fillEllipse(cx - 8, cy + 24, 8, 5);
        g.fillEllipse(cx + 8, cy + 24, 8, 5);
        g.fillStyle(lighter);
        g.fillEllipse(cx - 8, cy + 24, 7, 4);
        g.fillEllipse(cx + 8, cy + 24, 7, 4);
        // Stem/body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 12, 18, 22);
        g.fillStyle(0xF5E6CC);
        g.fillEllipse(cx, cy + 12, 16, 20);
        // Stem shading
        g.fillStyle(0xE8D4B0, 0.5);
        g.fillEllipse(cx + 4, cy + 12, 8, 16);
        g.fillStyle(0xFFF0DD, 0.4);
        g.fillEllipse(cx - 4, cy + 10, 6, 12);
        // Mushroom cap - big dome on top
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 6, 38, 24);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 6, 36, 22);
        // Cap underside
        g.fillStyle(darker, 0.3);
        g.fillEllipse(cx, cy + 4, 32, 6);
        // Cap spots
        g.fillStyle(lightest, 0.7);
        g.fillCircle(cx - 8, cy - 12, 4);
        g.fillCircle(cx + 10, cy - 10, 3);
        g.fillCircle(cx - 2, cy - 14, 3);
        g.fillCircle(cx + 4, cy - 6, 2);
        g.fillCircle(cx - 14, cy - 6, 2);
        g.fillCircle(cx + 14, cy - 8, 2);
        // Cap highlight/shine
        g.fillStyle(lighter, 0.3);
        g.fillEllipse(cx - 6, cy - 12, 14, 8);
        g.fillStyle(lightest, 0.2);
        g.fillEllipse(cx - 8, cy - 14, 8, 4);
        // Face on stem
        // Eyes - small dark dots
        g.fillStyle(0x111111);
        g.fillCircle(cx - 4, cy + 7, 2);
        g.fillCircle(cx + 4, cy + 7, 2);
        // Rosy cheeks
        g.fillStyle(0xFF8888, 0.3);
        g.fillEllipse(cx - 8, cy + 10, 4, 3);
        g.fillEllipse(cx + 8, cy + 10, 4, 3);
        // Little mouth
        g.fillStyle(0x111111);
        g.fillEllipse(cx, cy + 13, 4, 2);
        g.fillStyle(0xCC4444, 0.5);
        g.fillEllipse(cx, cy + 13, 3, 1);
        break;
      }

      case 'bandit': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Cloak/body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 12, 26, 28);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 12, 24, 26);
        // Cloak shading
        g.fillStyle(darker, 0.2);
        g.fillEllipse(cx + 6, cy + 14, 12, 20);
        g.fillStyle(lighter, 0.15);
        g.fillEllipse(cx - 6, cy + 10, 8, 16);
        // Cloak fold lines
        g.fillStyle(darker, 0.2);
        g.fillRect(cx - 4, cy + 6, 1, 18);
        g.fillRect(cx + 2, cy + 8, 1, 16);
        // Belt
        g.fillStyle(0x8B6914);
        g.fillRect(cx - 12, cy + 10, 24, 3);
        g.fillStyle(0xCCAA22);
        g.fillRect(cx - 2, cy + 9, 4, 5);
        // Arms
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 12, cy + 6, 4, cx - 18, cy + 14, cx - 14, cy + 18, 3);
        g.fillCurvedLimb(cx + 12, cy + 6, 4, cx + 20, cy + 10, cx + 18, cy + 16, 3);
        // Dagger in right hand
        g.fillStyle(0xAAAAAA);
        g.fillTriangle(cx + 20, cy + 8, cx + 18, cy + 4, cx + 24, cy + 2);
        g.fillStyle(0xCCCCCC);
        g.fillTriangle(cx + 20, cy + 8, cx + 19, cy + 5, cx + 24, cy + 2);
        // Dagger handle
        g.fillStyle(0x8B4513);
        g.fillRect(cx + 17, cy + 8, 4, 2);
        g.fillStyle(0xCCAA22);
        g.fillRect(cx + 16, cy + 8, 1, 2);
        g.fillRect(cx + 22, cy + 8, 1, 2);
        // Hood
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 6, 26, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 6, 24, 20);
        // Hood point
        g.fillStyle(color);
        g.fillTriangle(cx, cy - 20, cx - 6, cy - 10, cx + 6, cy - 10);
        g.fillStyle(darker);
        g.fillTriangle(cx + 1, cy - 20, cx, cy - 10, cx + 6, cy - 10);
        // Hood shadow inside
        g.fillStyle(darker, 0.4);
        g.fillEllipse(cx, cy - 4, 18, 14);
        // Mask/face area
        g.fillStyle(0x332222);
        g.fillEllipse(cx, cy - 2, 16, 10);
        // Visible eyes - menacing, shadowed
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 5, cy - 4, 5, 3);
        g.fillEllipse(cx + 5, cy - 4, 5, 3);
        g.fillStyle(0x332211);
        g.fillEllipse(cx - 4, cy - 4, 3, 2);
        g.fillEllipse(cx + 4, cy - 4, 3, 2);
        // Angry brow
        g.fillStyle(0x111111);
        g.fillRect(cx - 9, cy - 7, 7, 1);
        g.fillRect(cx + 2, cy - 7, 7, 1);
        // Feet
        g.fillStyle(0x554433);
        g.fillEllipse(cx - 7, cy + 24, 7, 4);
        g.fillEllipse(cx + 7, cy + 24, 7, 4);
        break;
      }

      case 'bat': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Wings - spread wide (left wing)
        g.fillStyle(darker);
        g.fillTriangle(cx - 6, cy - 2, cx - 30, cy - 16, cx - 28, cy + 10);
        g.fillTriangle(cx - 6, cy + 2, cx - 28, cy + 10, cx - 22, cy + 18);
        g.fillTriangle(cx - 6, cy - 2, cx - 30, cy - 16, cx - 18, cy - 22);
        g.fillStyle(color);
        g.fillTriangle(cx - 6, cy - 1, cx - 28, cy - 14, cx - 26, cy + 9);
        g.fillTriangle(cx - 6, cy + 2, cx - 26, cy + 9, cx - 20, cy + 16);
        g.fillTriangle(cx - 6, cy - 1, cx - 28, cy - 14, cx - 16, cy - 20);
        // Wing membrane detail left
        g.fillStyle(darker, 0.3);
        g.lineBetween(cx - 6, cy, cx - 28, cy - 10);
        g.lineBetween(cx - 6, cy, cx - 26, cy + 6);
        g.lineBetween(cx - 6, cy, cx - 20, cy + 14);
        // Right wing
        g.fillStyle(darker);
        g.fillTriangle(cx + 6, cy - 2, cx + 30, cy - 16, cx + 28, cy + 10);
        g.fillTriangle(cx + 6, cy + 2, cx + 28, cy + 10, cx + 22, cy + 18);
        g.fillTriangle(cx + 6, cy - 2, cx + 30, cy - 16, cx + 18, cy - 22);
        g.fillStyle(color);
        g.fillTriangle(cx + 6, cy - 1, cx + 28, cy - 14, cx + 26, cy + 9);
        g.fillTriangle(cx + 6, cy + 2, cx + 26, cy + 9, cx + 20, cy + 16);
        g.fillTriangle(cx + 6, cy - 1, cx + 28, cy - 14, cx + 16, cy - 20);
        // Wing membrane detail right
        g.fillStyle(darker, 0.3);
        g.lineBetween(cx + 6, cy, cx + 28, cy - 10);
        g.lineBetween(cx + 6, cy, cx + 26, cy + 6);
        g.lineBetween(cx + 6, cy, cx + 20, cy + 14);
        // Body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 6, 16, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 6, 14, 18);
        // Belly
        g.fillStyle(lighter, 0.3);
        g.fillEllipse(cx, cy + 10, 8, 12);
        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 6, 18, 16);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 6, 16, 14);
        // Big ears
        g.fillStyle(darker);
        g.fillTriangle(cx - 10, cy - 8, cx - 12, cy - 24, cx - 4, cy - 10);
        g.fillTriangle(cx + 10, cy - 8, cx + 12, cy - 24, cx + 4, cy - 10);
        g.fillStyle(color);
        g.fillTriangle(cx - 9, cy - 8, cx - 11, cy - 22, cx - 5, cy - 10);
        g.fillTriangle(cx + 9, cy - 8, cx + 11, cy - 22, cx + 5, cy - 10);
        // Inner ear
        g.fillStyle(lighter);
        g.fillTriangle(cx - 8, cy - 10, cx - 10, cy - 18, cx - 6, cy - 10);
        g.fillTriangle(cx + 8, cy - 10, cx + 10, cy - 18, cx + 6, cy - 10);
        // Eyes - fierce red, narrow
        g.fillStyle(0xCC0000);
        g.fillEllipse(cx - 4, cy - 5, 5, 3);
        g.fillEllipse(cx + 4, cy - 5, 5, 3);
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 4, cy - 5, 2, 3);
        g.fillEllipse(cx + 4, cy - 5, 2, 3);
        // Nose
        g.fillStyle(0x111111);
        g.fillEllipse(cx, cy - 1, 3, 2);
        // Fangs
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx - 3, cy + 1, cx - 2, cy + 5, cx - 1, cy + 1);
        g.fillTriangle(cx + 1, cy + 1, cx + 2, cy + 5, cx + 3, cy + 1);
        // Mouth
        g.fillStyle(darker);
        g.lineBetween(cx - 5, cy + 1, cx + 5, cy + 1);
        // Feet
        g.fillStyle(darker);
        g.fillEllipse(cx - 4, cy + 22, 5, 3);
        g.fillEllipse(cx + 4, cy + 22, 5, 3);
        break;
      }

      case 'spider': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Legs - four on each side with joints
        g.fillStyle(darker);
        // Left legs
        g.fillCurvedLimb(cx - 10, cy + 2, 2, cx - 24, cy - 10, cx - 28, cy + 4, 1);
        g.fillCurvedLimb(cx - 28, cy + 4, 1, cx - 28, cy + 14, cx - 26, cy + 24, 1);
        g.fillCurvedLimb(cx - 10, cy + 6, 2, cx - 22, cy - 4, cx - 26, cy + 8, 1);
        g.fillCurvedLimb(cx - 26, cy + 8, 1, cx - 26, cy + 18, cx - 22, cy + 26, 1);
        g.fillCurvedLimb(cx - 10, cy + 10, 2, cx - 20, cy + 4, cx - 24, cy + 14, 1);
        g.fillCurvedLimb(cx - 24, cy + 14, 1, cx - 22, cy + 22, cx - 18, cy + 26, 1);
        g.fillCurvedLimb(cx - 10, cy + 14, 2, cx - 18, cy + 12, cx - 20, cy + 20, 1);
        g.fillCurvedLimb(cx - 20, cy + 20, 1, cx - 16, cy + 24, cx - 14, cy + 26, 1);
        // Right legs
        g.fillCurvedLimb(cx + 10, cy + 2, 2, cx + 24, cy - 10, cx + 28, cy + 4, 1);
        g.fillCurvedLimb(cx + 28, cy + 4, 1, cx + 28, cy + 14, cx + 26, cy + 24, 1);
        g.fillCurvedLimb(cx + 10, cy + 6, 2, cx + 22, cy - 4, cx + 26, cy + 8, 1);
        g.fillCurvedLimb(cx + 26, cy + 8, 1, cx + 26, cy + 18, cx + 22, cy + 26, 1);
        g.fillCurvedLimb(cx + 10, cy + 10, 2, cx + 20, cy + 4, cx + 24, cy + 14, 1);
        g.fillCurvedLimb(cx + 24, cy + 14, 1, cx + 22, cy + 22, cx + 18, cy + 26, 1);
        g.fillCurvedLimb(cx + 10, cy + 14, 2, cx + 18, cy + 12, cx + 20, cy + 20, 1);
        g.fillCurvedLimb(cx + 20, cy + 20, 1, cx + 16, cy + 24, cx + 14, cy + 26, 1);
        // Abdomen (back, larger)
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 12, 24, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 12, 22, 18);
        // Abdomen pattern
        g.fillStyle(darker, 0.3);
        g.fillEllipse(cx, cy + 8, 10, 6);
        g.fillStyle(lighter, 0.2);
        g.fillEllipse(cx, cy + 6, 6, 3);
        // Abdomen markings
        g.fillStyle(darker, 0.4);
        g.fillRect(cx - 1, cy + 4, 2, 14);
        g.fillRect(cx - 6, cy + 10, 12, 1);
        g.fillRect(cx - 4, cy + 14, 8, 1);
        // Cephalothorax (front, head area)
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 2, 18, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 2, 16, 12);
        // Head highlight
        g.fillStyle(lighter, 0.3);
        g.fillEllipse(cx - 2, cy - 5, 8, 5);
        // Multiple eyes - row of eyes
        // Multiple small dot eyes - no whites
        // Big center pair
        g.fillStyle(0x880000);
        g.fillCircle(cx - 3, cy - 4, 2);
        g.fillCircle(cx + 3, cy - 4, 2);
        // Small outer eyes
        g.fillStyle(0x880000);
        g.fillCircle(cx - 8, cy - 3, 1);
        g.fillCircle(cx + 8, cy - 3, 1);
        // Small top eyes
        g.fillStyle(0x880000);
        g.fillCircle(cx - 3, cy - 8, 1);
        g.fillCircle(cx + 3, cy - 8, 1);
        // Chelicerae/fangs
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 3, cy + 2, 2, cx - 4, cy + 6, cx - 2, cy + 6, 1);
        g.fillCurvedLimb(cx + 3, cy + 2, 2, cx + 4, cy + 6, cx + 2, cy + 6, 1);
        g.fillStyle(0xFFEECC);
        g.fillTriangle(cx - 3, cy + 5, cx - 2, cy + 9, cx - 1, cy + 5);
        g.fillTriangle(cx + 1, cy + 5, cx + 2, cy + 9, cx + 3, cy + 5);
        break;
      }

      case 'crab': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Legs - three visible pairs
        g.fillStyle(darker);
        // Left legs
        g.fillCurvedLimb(cx - 14, cy + 10, 2, cx - 24, cy + 8, cx - 26, cy + 20, 2);
        g.fillCurvedLimb(cx - 26, cy + 20, 2, cx - 26, cy + 24, cx - 24, cy + 26, 1);
        g.fillCurvedLimb(cx - 12, cy + 14, 2, cx - 20, cy + 14, cx - 22, cy + 22, 2);
        g.fillCurvedLimb(cx - 22, cy + 22, 2, cx - 22, cy + 26, cx - 20, cy + 26, 1);
        g.fillCurvedLimb(cx - 10, cy + 16, 2, cx - 16, cy + 18, cx - 16, cy + 24, 2);
        g.fillCurvedLimb(cx - 16, cy + 24, 2, cx - 16, cy + 26, cx - 14, cy + 26, 1);
        // Right legs
        g.fillCurvedLimb(cx + 14, cy + 10, 2, cx + 24, cy + 8, cx + 26, cy + 20, 2);
        g.fillCurvedLimb(cx + 26, cy + 20, 2, cx + 26, cy + 24, cx + 24, cy + 26, 1);
        g.fillCurvedLimb(cx + 12, cy + 14, 2, cx + 20, cy + 14, cx + 22, cy + 22, 2);
        g.fillCurvedLimb(cx + 22, cy + 22, 2, cx + 22, cy + 26, cx + 20, cy + 26, 1);
        g.fillCurvedLimb(cx + 10, cy + 16, 2, cx + 16, cy + 18, cx + 16, cy + 24, 2);
        g.fillCurvedLimb(cx + 16, cy + 24, 2, cx + 16, cy + 26, cx + 14, cy + 26, 1);
        // Claws - arms
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 16, cy + 4, 3, cx - 22, cy - 4, cx - 24, cy - 8, 3);
        g.fillCurvedLimb(cx + 16, cy + 4, 3, cx + 22, cy - 4, cx + 24, cy - 8, 3);
        // Left claw (pincer)
        g.fillStyle(color);
        g.fillEllipse(cx - 26, cy - 12, 10, 7);
        g.fillStyle(darker);
        g.fillEllipse(cx - 26, cy - 12, 10, 7);
        g.fillStyle(color);
        g.fillEllipse(cx - 26, cy - 12, 9, 6);
        // Claw opening
        g.fillStyle(darker);
        g.fillTriangle(cx - 30, cy - 14, cx - 28, cy - 18, cx - 26, cy - 12);
        g.fillTriangle(cx - 22, cy - 14, cx - 24, cy - 18, cx - 26, cy - 12);
        g.fillStyle(color);
        g.fillTriangle(cx - 29, cy - 14, cx - 28, cy - 16, cx - 26, cy - 12);
        g.fillTriangle(cx - 23, cy - 14, cx - 24, cy - 16, cx - 26, cy - 12);
        // Right claw (pincer)
        g.fillStyle(darker);
        g.fillEllipse(cx + 26, cy - 12, 10, 7);
        g.fillStyle(color);
        g.fillEllipse(cx + 26, cy - 12, 9, 6);
        // Claw opening
        g.fillStyle(darker);
        g.fillTriangle(cx + 30, cy - 14, cx + 28, cy - 18, cx + 26, cy - 12);
        g.fillTriangle(cx + 22, cy - 14, cx + 24, cy - 18, cx + 26, cy - 12);
        g.fillStyle(color);
        g.fillTriangle(cx + 29, cy - 14, cx + 28, cy - 16, cx + 26, cy - 12);
        g.fillTriangle(cx + 23, cy - 14, cx + 24, cy - 16, cx + 26, cy - 12);
        // Shell body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 8, 30, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 8, 28, 18);
        // Shell texture/segments
        g.fillStyle(darker, 0.2);
        g.fillEllipse(cx, cy + 4, 20, 6);
        g.fillStyle(lighter, 0.2);
        g.fillEllipse(cx, cy + 2, 14, 4);
        // Shell ridge lines
        g.fillStyle(darker, 0.15);
        g.fillRect(cx - 1, cy + 2, 2, 12);
        g.fillRect(cx - 10, cy + 6, 20, 1);
        // Eye stalks
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 6, cy, 2, cx - 6, cy - 6, cx - 6, cy - 8, 2);
        g.fillCurvedLimb(cx + 6, cy, 2, cx + 6, cy - 6, cx + 6, cy - 8, 2);
        // Eyes on stalks - small, dark
        g.fillStyle(0x111111);
        g.fillCircle(cx - 6, cy - 10, 2);
        g.fillCircle(cx + 6, cy - 10, 2);
        // Mouth
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 4, 6, 2);
        // Shell highlight
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 4, cy + 2, 8, 5);
        break;
      }

      case 'golem': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Legs - thick stone pillars
        g.fillStyle(darker);
        g.fillRect(cx - 14, cy + 16, 10, 12);
        g.fillRect(cx + 4, cy + 16, 10, 12);
        g.fillStyle(color);
        g.fillRect(cx - 13, cy + 16, 8, 11);
        g.fillRect(cx + 5, cy + 16, 8, 11);
        // Feet
        g.fillStyle(darker);
        g.fillRect(cx - 16, cy + 24, 14, 4);
        g.fillRect(cx + 2, cy + 24, 14, 4);
        // Stone cracks on legs
        g.fillStyle(darker, 0.3);
        g.lineBetween(cx - 10, cy + 18, cx - 8, cy + 24);
        g.lineBetween(cx + 8, cy + 18, cx + 10, cy + 24);
        // Torso - big blocky
        g.fillStyle(darker);
        g.fillRect(cx - 16, cy - 4, 32, 22);
        g.fillStyle(color);
        g.fillRect(cx - 15, cy - 3, 30, 20);
        // Torso stone segments
        g.fillStyle(darker, 0.15);
        g.fillRect(cx - 15, cy + 6, 30, 1);
        g.fillRect(cx - 15, cy + 12, 30, 1);
        g.fillRect(cx, cy - 3, 1, 20);
        // Moss patches
        g.fillStyle(0x447744, 0.5);
        g.fillEllipse(cx - 10, cy + 8, 6, 3);
        g.fillEllipse(cx + 12, cy + 14, 4, 2);
        g.fillStyle(0x55AA55, 0.4);
        g.fillEllipse(cx - 10, cy + 7, 4, 2);
        // Arms - thick stone
        g.fillStyle(darker);
        g.fillRect(cx - 26, cy - 2, 12, 8);
        g.fillRect(cx + 14, cy - 2, 12, 8);
        g.fillStyle(color);
        g.fillRect(cx - 25, cy - 1, 10, 6);
        g.fillRect(cx + 15, cy - 1, 10, 6);
        // Forearms hanging down
        g.fillStyle(darker);
        g.fillRect(cx - 28, cy + 4, 10, 14);
        g.fillRect(cx + 18, cy + 4, 10, 14);
        g.fillStyle(color);
        g.fillRect(cx - 27, cy + 5, 8, 12);
        g.fillRect(cx + 19, cy + 5, 8, 12);
        // Fists
        g.fillStyle(darker);
        g.fillRect(cx - 29, cy + 16, 12, 8);
        g.fillRect(cx + 17, cy + 16, 12, 8);
        g.fillStyle(color);
        g.fillRect(cx - 28, cy + 17, 10, 6);
        g.fillRect(cx + 18, cy + 17, 10, 6);
        // Stone crack on fists
        g.fillStyle(darker, 0.3);
        g.lineBetween(cx - 24, cy + 17, cx - 22, cy + 22);
        g.lineBetween(cx + 22, cy + 17, cx + 24, cy + 22);
        // Head - blocky
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy - 18, 24, 16);
        g.fillStyle(color);
        g.fillRect(cx - 11, cy - 17, 22, 14);
        // Head stone lines
        g.fillStyle(darker, 0.2);
        g.fillRect(cx - 11, cy - 10, 22, 1);
        g.fillRect(cx, cy - 17, 1, 14);
        // Brow ridge
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy - 12, 24, 3);
        // Glowing eyes
        g.fillStyle(0xFFAA00);
        g.fillRect(cx - 8, cy - 10, 5, 4);
        g.fillRect(cx + 3, cy - 10, 5, 4);
        g.fillStyle(0xFFDD44);
        g.fillRect(cx - 7, cy - 9, 3, 2);
        g.fillRect(cx + 4, cy - 9, 3, 2);
        // Eye glow effect
        g.fillStyle(0xFFAA00, 0.2);
        g.fillEllipse(cx - 6, cy - 9, 8, 6);
        g.fillEllipse(cx + 6, cy - 9, 8, 6);
        // Mouth - grim line
        g.fillStyle(darker);
        g.fillRect(cx - 6, cy - 5, 12, 2);
        // Moss on head
        g.fillStyle(0x447744, 0.5);
        g.fillEllipse(cx - 6, cy - 17, 8, 3);
        g.fillStyle(0x55AA55, 0.3);
        g.fillEllipse(cx - 4, cy - 18, 4, 2);
        // Shoulder stones
        g.fillStyle(darker);
        g.fillRect(cx - 18, cy - 6, 6, 6);
        g.fillRect(cx + 12, cy - 6, 6, 6);
        g.fillStyle(color);
        g.fillRect(cx - 17, cy - 5, 4, 4);
        g.fillRect(cx + 13, cy - 5, 4, 4);
        // Stone texture highlight
        g.fillStyle(lighter, 0.15);
        g.fillRect(cx - 10, cy, 8, 6);
        g.fillRect(cx + 4, cy + 2, 6, 4);
        break;
      }

      case 'frog': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);
        // Back legs (visible behind body)
        g.fillStyle(darker);
        g.fillEllipse(cx - 18, cy + 16, 10, 8);
        g.fillEllipse(cx + 18, cy + 16, 10, 8);
        g.fillStyle(color);
        g.fillEllipse(cx - 18, cy + 16, 9, 7);
        g.fillEllipse(cx + 18, cy + 16, 9, 7);
        // Back feet
        g.fillStyle(darker);
        g.fillEllipse(cx - 22, cy + 22, 8, 4);
        g.fillEllipse(cx + 22, cy + 22, 8, 4);
        g.fillStyle(color);
        g.fillEllipse(cx - 22, cy + 22, 7, 3);
        g.fillEllipse(cx + 22, cy + 22, 7, 3);
        // Toe lines
        g.fillStyle(darker, 0.3);
        g.lineBetween(cx - 24, cy + 21, cx - 24, cy + 24);
        g.lineBetween(cx - 22, cy + 21, cx - 22, cy + 24);
        g.lineBetween(cx + 22, cy + 21, cx + 22, cy + 24);
        g.lineBetween(cx + 24, cy + 21, cx + 24, cy + 24);
        // Main body - wide and squat
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 10, 36, 24);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 10, 34, 22);
        // Belly - lighter
        g.fillStyle(lighter, 0.4);
        g.fillEllipse(cx, cy + 14, 24, 14);
        g.fillStyle(lightest, 0.2);
        g.fillEllipse(cx, cy + 16, 16, 8);
        // Warty skin texture
        g.fillStyle(darker, 0.25);
        g.fillCircle(cx - 12, cy + 4, 2);
        g.fillCircle(cx + 14, cy + 6, 2);
        g.fillCircle(cx - 8, cy + 12, 1);
        g.fillCircle(cx + 6, cy + 8, 2);
        g.fillCircle(cx - 16, cy + 10, 1);
        g.fillCircle(cx + 16, cy + 14, 1);
        g.fillCircle(cx - 4, cy + 18, 1);
        g.fillCircle(cx + 10, cy + 16, 1);
        g.fillCircle(cx - 14, cy + 16, 2);
        g.fillCircle(cx + 2, cy + 4, 1);
        // Front legs
        g.fillStyle(darker);
        g.fillEllipse(cx - 14, cy + 20, 6, 6);
        g.fillEllipse(cx + 14, cy + 20, 6, 6);
        g.fillStyle(color);
        g.fillEllipse(cx - 14, cy + 20, 5, 5);
        g.fillEllipse(cx + 14, cy + 20, 5, 5);
        // Front feet
        g.fillStyle(darker);
        g.fillEllipse(cx - 16, cy + 24, 6, 3);
        g.fillEllipse(cx + 16, cy + 24, 6, 3);
        g.fillStyle(color);
        g.fillEllipse(cx - 16, cy + 24, 5, 2);
        g.fillEllipse(cx + 16, cy + 24, 5, 2);
        // Head area (merges with body for frog)
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 2, 28, 14);
        // Bulging eyes - on top of head
        g.fillStyle(darker);
        g.fillCircle(cx - 10, cy - 6, 8);
        g.fillCircle(cx + 10, cy - 6, 8);
        g.fillStyle(color);
        g.fillCircle(cx - 10, cy - 6, 7);
        g.fillCircle(cx + 10, cy - 6, 7);
        // Eyeballs - reptilian slit pupils, no whites
        g.fillStyle(0xCCAA00);
        g.fillCircle(cx - 10, cy - 6, 4);
        g.fillCircle(cx + 10, cy - 6, 4);
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 10, cy - 6, 2, 4);
        g.fillEllipse(cx + 10, cy - 6, 2, 4);
        // Wide mouth
        g.fillStyle(darker);
        g.lineBetween(cx - 14, cy + 6, cx - 4, cy + 8);
        g.lineBetween(cx - 4, cy + 8, cx + 4, cy + 8);
        g.lineBetween(cx + 4, cy + 8, cx + 14, cy + 6);
        // Mouth crease shading
        g.fillStyle(darker, 0.2);
        g.fillEllipse(cx, cy + 7, 20, 3);
        // Nostrils
        g.fillStyle(darker);
        g.fillCircle(cx - 4, cy + 2, 1);
        g.fillCircle(cx + 4, cy + 2, 1);
        // Top of head highlight
        g.fillStyle(lighter, 0.2);
        g.fillEllipse(cx, cy, 12, 4);
        break;
      }
      case 'serpent': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Coiled body base - lower coil
        g.fillStyle(darker);
        g.fillEllipse(cx, cy+18, 28, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy+18, 26, 12);
        // Middle coil
        g.fillStyle(darker);
        g.fillEllipse(cx-2, cy+8, 22, 12);
        g.fillStyle(color);
        g.fillEllipse(cx-2, cy+8, 20, 10);
        // Upper coil
        g.fillStyle(darker);
        g.fillEllipse(cx+2, cy-2, 18, 10);
        g.fillStyle(color);
        g.fillEllipse(cx+2, cy-2, 16, 8);
        // Belly highlights on coils
        g.fillStyle(lighter);
        g.fillEllipse(cx+2, cy+20, 14, 6);
        g.fillEllipse(cx, cy+10, 10, 5);
        g.fillEllipse(cx+3, cy, 8, 4);
        // Scale details
        g.fillStyle(darker, 0.4);
        for (let i = 0; i < 5; i++) {
          g.fillRect(cx-8+i*4, cy+15, 2, 2);
          g.fillRect(cx-6+i*3, cy+6, 2, 2);
        }
        // Neck rising up
        g.fillStyle(color);
        g.fillLimb(cx+2, cy-2, 8, cx, cy-16, 6);
        g.fillStyle(lighter);
        g.fillRect(cx-1, cy-14, 4, 10);
        // Head
        g.fillStyle(color);
        g.fillEllipse(cx, cy-22, 14, 12);
        g.fillStyle(darker);
        g.fillEllipse(cx, cy-22, 14, 12);
        g.fillStyle(color);
        g.fillEllipse(cx, cy-21, 13, 11);
        // Snout
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy-18, 8, 5);
        // Eyes - reptilian slit pupils
        g.fillStyle(0xCCAA00);
        g.fillEllipse(cx-4, cy-24, 3, 3);
        g.fillEllipse(cx+4, cy-24, 3, 3);
        g.fillStyle(0x000000);
        g.fillEllipse(cx-4, cy-24, 1, 3);
        g.fillEllipse(cx+4, cy-24, 1, 3);
        // Horns
        g.fillStyle(lightest);
        g.fillTriangle(cx-6, cy-27, cx-4, cy-27, cx-8, cy-35);
        g.fillTriangle(cx+6, cy-27, cx+4, cy-27, cx+8, cy-35);
        // Nostrils
        g.fillStyle(0x000000);
        g.fillRect(cx-2, cy-19, 1, 1);
        g.fillRect(cx+1, cy-19, 1, 1);
        // Mouth line
        g.fillStyle(darker, 0.6);
        g.fillRect(cx-3, cy-17, 6, 1);
        // Tail tip at bottom
        g.fillStyle(color);
        g.fillLimb(cx+8, cy+22, 4, cx+16, cy+18, 2);
        g.fillStyle(darker);
        g.fillTriangle(cx+16, cy+16, cx+16, cy+20, cx+22, cy+18);
        break;
      }

      case 'jellyfish': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Tentacles - long flowing
        g.fillStyle(color, 0.4);
        g.fillLimb(cx-8, cy+6, 3, cx-12, cy+26, 1);
        g.fillLimb(cx-4, cy+8, 3, cx-6, cy+28, 1);
        g.fillLimb(cx, cy+8, 3, cx+1, cy+27, 1);
        g.fillLimb(cx+4, cy+8, 3, cx+7, cy+28, 1);
        g.fillLimb(cx+8, cy+6, 3, cx+13, cy+26, 1);
        // Inner tentacles
        g.fillStyle(lighter, 0.3);
        g.fillLimb(cx-6, cy+7, 2, cx-9, cy+24, 1);
        g.fillLimb(cx-1, cy+8, 2, cx-2, cy+25, 1);
        g.fillLimb(cx+3, cy+8, 2, cx+5, cy+25, 1);
        g.fillLimb(cx+7, cy+7, 2, cx+10, cy+24, 1);
        // Wavy short tentacles
        g.fillStyle(color, 0.5);
        g.fillCurvedLimb(cx-10, cy+4, 2, cx-14, cy+14, cx-8, cy+20, 1);
        g.fillCurvedLimb(cx+10, cy+4, 2, cx+14, cy+14, cx+8, cy+20, 1);
        // Dome cap - main body
        g.fillStyle(color, 0.6);
        g.fillEllipse(cx, cy-6, 28, 22);
        // Dome shading
        g.fillStyle(darker, 0.3);
        g.fillEllipse(cx, cy-2, 26, 14);
        // Dome highlight
        g.fillStyle(lighter, 0.5);
        g.fillEllipse(cx, cy-10, 20, 12);
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx-4, cy-14, 10, 6);
        // Dome rim
        g.fillStyle(color, 0.7);
        g.fillEllipse(cx, cy+4, 28, 6);
        // Internal glow
        g.fillStyle(lightest, 0.3);
        g.fillCircle(cx, cy-4, 6);
        // Eyes - small dot
        g.fillStyle(0x000000, 0.7);
        g.fillCircle(cx-6, cy-4, 1.5);
        g.fillCircle(cx+6, cy-4, 1.5);
        // Mouth
        g.fillStyle(0x000000, 0.4);
        g.fillRect(cx-1, cy, 2, 1);
        // Sparkle effects
        g.fillStyle(lightest, 0.6);
        g.fillRect(cx-12, cy-12, 2, 2);
        g.fillRect(cx+10, cy-8, 2, 2);
        g.fillRect(cx+14, cy+2, 1, 1);
        break;
      }

      case 'piranha': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Tail fin
        g.fillStyle(darker);
        g.fillTriangle(cx, cy+4, cx-16, cy-6, cx-16, cy+14);
        g.fillStyle(color);
        g.fillTriangle(cx-2, cy+4, cx-14, cy-4, cx-14, cy+12);
        // Body - oval
        g.fillStyle(darker);
        g.fillEllipse(cx+4, cy+4, 30, 24);
        g.fillStyle(color);
        g.fillEllipse(cx+4, cy+4, 28, 22);
        // Belly
        g.fillStyle(lighter);
        g.fillEllipse(cx+4, cy+10, 20, 10);
        g.fillStyle(lightest);
        g.fillEllipse(cx+4, cy+12, 14, 6);
        // Top fin
        g.fillStyle(darker);
        g.fillTriangle(cx-2, cy-8, cx+8, cy-8, cx+3, cy-20);
        g.fillStyle(color);
        g.fillTriangle(cx-1, cy-8, cx+7, cy-8, cx+3, cy-18);
        // Side fins
        g.fillStyle(color);
        g.fillTriangle(cx-6, cy+8, cx-14, cy+14, cx-6, cy+16);
        g.fillTriangle(cx+14, cy+8, cx+22, cy+14, cx+14, cy+16);
        // Open mouth - BIG
        g.fillStyle(0x440000);
        g.fillEllipse(cx+12, cy+6, 16, 14);
        g.fillStyle(0x880000);
        g.fillEllipse(cx+12, cy+6, 14, 12);
        // Upper teeth
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx+6, cy, cx+8, cy, cx+7, cy+4);
        g.fillTriangle(cx+10, cy-1, cx+12, cy-1, cx+11, cy+4);
        g.fillTriangle(cx+14, cy, cx+16, cy, cx+15, cy+4);
        g.fillTriangle(cx+18, cy+1, cx+20, cy+1, cx+19, cy+5);
        // Lower teeth
        g.fillTriangle(cx+7, cy+12, cx+9, cy+12, cx+8, cy+8);
        g.fillTriangle(cx+11, cy+13, cx+13, cy+13, cx+12, cy+9);
        g.fillTriangle(cx+15, cy+12, cx+17, cy+12, cx+16, cy+8);
        // Eyes - angry, small
        g.fillStyle(0xFF0000);
        g.fillCircle(cx+5, cy-2, 2);
        g.fillStyle(0x000000);
        g.fillCircle(cx+5, cy-2, 1);
        // Angry eyebrow
        g.fillStyle(0x000000);
        g.fillRect(cx+1, cy-5, 3, 1);
        g.fillRect(cx+3, cy-6, 3, 1);
        // Scales
        g.fillStyle(darker, 0.3);
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            g.fillRect(cx-6+i*5, cy+j*4, 2, 2);
          }
        }
        break;
      }

      case 'merfolk': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Fish tail - lower
        g.fillStyle(darker);
        g.fillTriangle(cx-8, cy+24, cx+8, cy+24, cx, cy+20);
        g.fillTriangle(cx-10, cy+26, cx+10, cy+26, cx, cy+18);
        g.fillStyle(color);
        g.fillTriangle(cx-7, cy+24, cx+7, cy+24, cx, cy+20);
        // Tail body
        g.fillStyle(color);
        g.fillEllipse(cx, cy+14, 14, 12);
        g.fillStyle(darker);
        g.fillEllipse(cx, cy+16, 14, 8);
        // Scale pattern on tail
        g.fillStyle(lighter, 0.4);
        for (let i = 0; i < 3; i++) {
          g.fillRect(cx-4+i*3, cy+10+i*2, 2, 2);
          g.fillRect(cx-2+i*3, cy+12+i*2, 2, 2);
        }
        // Torso - humanoid
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy-2, 16, 16);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx, cy-2, 10, 8);
        // Chest armor / scales
        g.fillStyle(color, 0.6);
        g.fillEllipse(cx, cy-4, 14, 8);
        // Arms
        g.fillStyle(lighter);
        g.fillLimb(cx-8, cy-4, 3, cx-16, cy+4, 2);
        g.fillLimb(cx+8, cy-4, 3, cx+16, cy+4, 2);
        // Hands
        g.fillCircle(cx-16, cy+4, 2);
        g.fillCircle(cx+16, cy+4, 2);
        // Trident in right hand
        g.fillStyle(0xCCCC00);
        g.fillRect(cx+16, cy-18, 2, 22);
        g.fillTriangle(cx+13, cy-18, cx+17, cy-22, cx+14, cy-14);
        g.fillTriangle(cx+17, cy-22, cx+17, cy-14, cx+17, cy-18);
        g.fillTriangle(cx+19, cy-18, cx+17, cy-22, cx+20, cy-14);
        g.fillStyle(0xFFFF44);
        g.fillRect(cx+16, cy-20, 2, 2);
        // Head
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy-14, 12, 10);
        // Fin ears
        g.fillStyle(color);
        g.fillTriangle(cx-7, cy-14, cx-14, cy-18, cx-7, cy-10);
        g.fillTriangle(cx+7, cy-14, cx+14, cy-18, cx+7, cy-10);
        // Eyes - small, shadowed
        g.fillStyle(0x0044AA);
        g.fillEllipse(cx-3, cy-15, 3, 2);
        g.fillEllipse(cx+3, cy-15, 3, 2);
        g.fillStyle(0x000000);
        g.fillCircle(cx-3, cy-15, 1);
        g.fillCircle(cx+3, cy-15, 1);
        // Mouth
        g.fillStyle(0x000000, 0.4);
        g.fillRect(cx-2, cy-11, 4, 1);
        // Crown/tiara
        g.fillStyle(color);
        g.fillRect(cx-5, cy-20, 10, 2);
        g.fillRect(cx-3, cy-22, 2, 2);
        g.fillRect(cx+1, cy-22, 2, 2);
        break;
      }

      case 'harpy': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Taloned feet
        g.fillStyle(0x886622);
        g.fillLimb(cx-6, cy+20, 2, cx-6, cy+26, 1);
        g.fillLimb(cx+6, cy+20, 2, cx+6, cy+26, 1);
        g.fillRect(cx-9, cy+25, 3, 1);
        g.fillRect(cx-7, cy+26, 4, 1);
        g.fillRect(cx+4, cy+25, 3, 1);
        g.fillRect(cx+4, cy+26, 4, 1);
        // Legs
        g.fillStyle(0xDDBB88);
        g.fillLimb(cx-5, cy+12, 3, cx-6, cy+20, 2);
        g.fillLimb(cx+5, cy+12, 3, cx+6, cy+20, 2);
        // Body
        g.fillStyle(color);
        g.fillEllipse(cx, cy+4, 18, 16);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy+6, 12, 10);
        // Wings spread - left
        g.fillStyle(color);
        g.fillTriangle(cx-8, cy-2, cx-28, cy-8, cx-20, cy+8);
        g.fillStyle(darker);
        g.fillTriangle(cx-8, cy, cx-26, cy-6, cx-20, cy+6);
        g.fillStyle(lighter);
        g.fillTriangle(cx-14, cy-2, cx-24, cy-4, cx-18, cy+4);
        // Wing feathers - left
        g.fillStyle(lightest, 0.5);
        g.fillRect(cx-22, cy-4, 3, 1);
        g.fillRect(cx-20, cy, 3, 1);
        g.fillRect(cx-18, cy+4, 3, 1);
        // Wings spread - right
        g.fillStyle(color);
        g.fillTriangle(cx+8, cy-2, cx+28, cy-8, cx+20, cy+8);
        g.fillStyle(darker);
        g.fillTriangle(cx+8, cy, cx+26, cy-6, cx+20, cy+6);
        g.fillStyle(lighter);
        g.fillTriangle(cx+14, cy-2, cx+24, cy-4, cx+18, cy+4);
        // Wing feathers - right
        g.fillStyle(lightest, 0.5);
        g.fillRect(cx+20, cy-4, 3, 1);
        g.fillRect(cx+18, cy, 3, 1);
        g.fillRect(cx+16, cy+4, 3, 1);
        // Head
        g.fillStyle(0xDDBB88);
        g.fillEllipse(cx, cy-10, 12, 12);
        // Hair/feathers on head
        g.fillStyle(color);
        g.fillEllipse(cx, cy-14, 14, 8);
        g.fillTriangle(cx-4, cy-18, cx, cy-24, cx+4, cy-18);
        g.fillTriangle(cx-8, cy-16, cx-6, cy-22, cx-2, cy-16);
        g.fillTriangle(cx+2, cy-16, cx+6, cy-22, cx+8, cy-16);
        // Eyes - narrow, fierce
        g.fillStyle(0x8800AA);
        g.fillEllipse(cx-3, cy-10, 3, 2);
        g.fillEllipse(cx+3, cy-10, 3, 2);
        g.fillStyle(0x000000);
        g.fillCircle(cx-3, cy-10, 1);
        g.fillCircle(cx+3, cy-10, 1);
        // Angry brow
        g.fillStyle(0x000000);
        g.fillRect(cx-6, cy-12, 4, 1);
        g.fillRect(cx+2, cy-12, 4, 1);
        // Beak/mouth
        g.fillStyle(0xCC8800);
        g.fillTriangle(cx-2, cy-7, cx+2, cy-7, cx, cy-4);
        break;
      }

      case 'wyvern': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Tail curling right
        g.fillStyle(darker);
        g.fillCurvedLimb(cx-2, cy+14, 4, cx+12, cy+20, cx+18, cy+16, 2);
        g.fillStyle(color);
        g.fillCurvedLimb(cx-2, cy+14, 3, cx+12, cy+19, cx+17, cy+15, 2);
        // Tail spike
        g.fillStyle(darker);
        g.fillTriangle(cx+17, cy+14, cx+17, cy+18, cx+24, cy+16);
        // Legs
        g.fillStyle(darker);
        g.fillLimb(cx-6, cy+10, 4, cx-8, cy+22, 2);
        g.fillLimb(cx+6, cy+10, 4, cx+8, cy+22, 2);
        // Claws
        g.fillStyle(0xDDDDAA);
        g.fillRect(cx-10, cy+22, 2, 2);
        g.fillRect(cx-8, cy+23, 2, 2);
        g.fillRect(cx+7, cy+22, 2, 2);
        g.fillRect(cx+9, cy+23, 2, 2);
        // Body
        g.fillStyle(color);
        g.fillEllipse(cx, cy+4, 22, 18);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy+6, 14, 12);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx, cy+8, 8, 6);
        // Wings - left
        g.fillStyle(color);
        g.fillTriangle(cx-10, cy-2, cx-28, cy-14, cx-22, cy+6);
        g.fillStyle(darker);
        g.fillTriangle(cx-12, cy, cx-26, cy-12, cx-20, cy+4);
        g.fillStyle(lighter, 0.3);
        g.fillTriangle(cx-16, cy-4, cx-24, cy-10, cx-20, cy+2);
        // Wing membrane lines
        g.fillStyle(darker, 0.4);
        g.lineBetween(cx-10, cy-2, cx-24, cy+2);
        g.lineBetween(cx-10, cy-2, cx-26, cy-6);
        // Wings - right
        g.fillStyle(color);
        g.fillTriangle(cx+10, cy-2, cx+28, cy-14, cx+22, cy+6);
        g.fillStyle(darker);
        g.fillTriangle(cx+12, cy, cx+26, cy-12, cx+20, cy+4);
        g.fillStyle(lighter, 0.3);
        g.fillTriangle(cx+16, cy-4, cx+24, cy-10, cx+20, cy+2);
        g.fillStyle(darker, 0.4);
        g.lineBetween(cx+10, cy-2, cx+24, cy+2);
        g.lineBetween(cx+10, cy-2, cx+26, cy-6);
        // Head / neck
        g.fillStyle(color);
        g.fillLimb(cx, cy, 8, cx, cy-12, 6);
        g.fillEllipse(cx, cy-14, 14, 10);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy-12, 8, 5);
        // Horns
        g.fillStyle(0xDDDDAA);
        g.fillTriangle(cx-5, cy-18, cx-3, cy-18, cx-7, cy-26);
        g.fillTriangle(cx+5, cy-18, cx+3, cy-18, cx+7, cy-26);
        // Eyes - reptilian slit pupils
        g.fillStyle(0xFF4400);
        g.fillEllipse(cx-4, cy-15, 3, 2);
        g.fillEllipse(cx+4, cy-15, 3, 2);
        g.fillStyle(0x000000);
        g.fillEllipse(cx-4, cy-15, 1, 2);
        g.fillEllipse(cx+4, cy-15, 1, 2);
        // Nostrils
        g.fillStyle(0x000000);
        g.fillRect(cx-2, cy-12, 1, 1);
        g.fillRect(cx+1, cy-12, 1, 1);
        // Mouth
        g.fillStyle(darker);
        g.fillRect(cx-4, cy-10, 8, 1);
        break;
      }

      case 'kraken': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Back tentacles
        g.fillStyle(darker);
        g.fillCurvedLimb(cx-10, cy+6, 4, cx-22, cy+12, cx-26, cy+24, 2);
        g.fillCurvedLimb(cx+10, cy+6, 4, cx+22, cy+12, cx+26, cy+24, 2);
        // Front tentacles
        g.fillStyle(color);
        g.fillCurvedLimb(cx-8, cy+8, 4, cx-16, cy+16, cx-20, cy+26, 2);
        g.fillCurvedLimb(cx+8, cy+8, 4, cx+16, cy+16, cx+20, cy+26, 2);
        g.fillCurvedLimb(cx-4, cy+10, 4, cx-8, cy+18, cx-12, cy+26, 2);
        g.fillCurvedLimb(cx+4, cy+10, 4, cx+8, cy+18, cx+12, cy+26, 2);
        // Middle tentacles
        g.fillCurvedLimb(cx-2, cy+10, 3, cx-4, cy+20, cx-2, cy+26, 1);
        g.fillCurvedLimb(cx+2, cy+10, 3, cx+4, cy+20, cx+2, cy+26, 1);
        // Suction cups on tentacles
        g.fillStyle(lighter, 0.5);
        g.fillCircle(cx-14, cy+18, 1);
        g.fillCircle(cx-18, cy+22, 1);
        g.fillCircle(cx+14, cy+18, 1);
        g.fillCircle(cx+18, cy+22, 1);
        g.fillCircle(cx-8, cy+20, 1);
        g.fillCircle(cx+8, cy+20, 1);
        // Main body / head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy-2, 28, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy-2, 26, 20);
        // Head shading
        g.fillStyle(lighter, 0.3);
        g.fillEllipse(cx, cy-6, 18, 12);
        g.fillStyle(lightest, 0.2);
        g.fillEllipse(cx-4, cy-10, 10, 6);
        // Giant eye - center, menacing
        g.fillStyle(0x000000);
        g.fillCircle(cx, cy-2, 9);
        g.fillStyle(0xCCCC00);
        g.fillCircle(cx, cy-2, 7);
        g.fillStyle(0xAAAA00);
        g.fillCircle(cx, cy-2, 5);
        g.fillStyle(0x000000);
        g.fillEllipse(cx, cy-2, 3, 7);
        // Eyelid shadow
        g.fillStyle(darker, 0.5);
        g.fillRect(cx-8, cy-10, 16, 3);
        // Angry brow ridges
        g.fillStyle(darker);
        g.fillRect(cx-9, cy-12, 8, 2);
        g.fillRect(cx+1, cy-12, 8, 2);
        break;
      }

      case 'storm-harpy': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Lightning effects behind
        g.fillStyle(0xFFFF44, 0.6);
        g.fillRect(cx-18, cy-10, 2, 8);
        g.fillRect(cx-20, cy-4, 2, 6);
        g.fillRect(cx-18, cy, 2, 4);
        g.fillRect(cx+18, cy-12, 2, 10);
        g.fillRect(cx+16, cy-4, 2, 8);
        g.fillRect(cx+18, cy+2, 2, 4);
        // Taloned feet - armored
        g.fillStyle(0x664422);
        g.fillLimb(cx-6, cy+18, 3, cx-8, cy+24, 2);
        g.fillLimb(cx+6, cy+18, 3, cx+8, cy+24, 2);
        g.fillStyle(0x888866);
        g.fillRect(cx-11, cy+24, 3, 2);
        g.fillRect(cx-8, cy+25, 3, 2);
        g.fillRect(cx+6, cy+24, 3, 2);
        g.fillRect(cx+8, cy+25, 3, 2);
        // Legs
        g.fillStyle(0xBB9966);
        g.fillLimb(cx-5, cy+10, 3, cx-6, cy+18, 3);
        g.fillLimb(cx+5, cy+10, 3, cx+6, cy+18, 3);
        // Body - armored
        g.fillStyle(darker);
        g.fillEllipse(cx, cy+2, 20, 18);
        g.fillStyle(color);
        g.fillEllipse(cx, cy+2, 18, 16);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy+4, 12, 10);
        // Chest armor
        g.fillStyle(0x888888, 0.4);
        g.fillEllipse(cx, cy+2, 14, 8);
        // Wings - large, electrified
        g.fillStyle(darker);
        g.fillTriangle(cx-10, cy-4, cx-30, cy-18, cx-24, cy+8);
        g.fillTriangle(cx+10, cy-4, cx+30, cy-18, cx+24, cy+8);
        g.fillStyle(color);
        g.fillTriangle(cx-10, cy-2, cx-28, cy-16, cx-22, cy+6);
        g.fillTriangle(cx+10, cy-2, cx+28, cy-16, cx+22, cy+6);
        // Wing lightning streaks
        g.fillStyle(0xFFFF88, 0.5);
        g.lineBetween(cx-12, cy-2, cx-26, cy-10);
        g.lineBetween(cx-14, cy+2, cx-24, cy+4);
        g.lineBetween(cx+12, cy-2, cx+26, cy-10);
        g.lineBetween(cx+14, cy+2, cx+24, cy+4);
        // Feather edges
        g.fillStyle(lightest, 0.4);
        g.fillRect(cx-26, cy-12, 3, 1);
        g.fillRect(cx-24, cy-6, 3, 1);
        g.fillRect(cx-22, cy, 3, 1);
        g.fillRect(cx+24, cy-12, 3, 1);
        g.fillRect(cx+22, cy-6, 3, 1);
        g.fillRect(cx+20, cy, 3, 1);
        // Head
        g.fillStyle(0xBB9966);
        g.fillEllipse(cx, cy-12, 12, 12);
        // Crown of feathers - boss
        g.fillStyle(color);
        g.fillEllipse(cx, cy-16, 16, 8);
        g.fillStyle(lighter);
        g.fillTriangle(cx-6, cy-20, cx-4, cy-28, cx-2, cy-20);
        g.fillTriangle(cx-2, cy-20, cx, cy-30, cx+2, cy-20);
        g.fillTriangle(cx+2, cy-20, cx+4, cy-28, cx+6, cy-20);
        g.fillStyle(lightest);
        g.fillTriangle(cx-4, cy-20, cx-3, cy-26, cx-2, cy-20);
        g.fillTriangle(cx, cy-20, cx+1, cy-28, cx+2, cy-20);
        // Crown lightning
        g.fillStyle(0xFFFF44, 0.8);
        g.fillRect(cx-1, cy-28, 2, 2);
        g.fillRect(cx-5, cy-26, 2, 2);
        g.fillRect(cx+3, cy-26, 2, 2);
        // Eyes - fierce glowing, no pupils
        g.fillStyle(0xFFFF00);
        g.fillEllipse(cx-3, cy-12, 4, 2);
        g.fillEllipse(cx+3, cy-12, 4, 2);
        g.fillStyle(0xFF4400);
        g.fillEllipse(cx-3, cy-12, 2, 1);
        g.fillEllipse(cx+3, cy-12, 2, 1);
        // Angry eyebrows
        g.fillStyle(0x000000);
        g.fillRect(cx-6, cy-16, 4, 1);
        g.fillRect(cx+2, cy-16, 4, 1);
        // Beak - sharp
        g.fillStyle(0xCC8800);
        g.fillTriangle(cx-3, cy-9, cx+3, cy-9, cx, cy-5);
        g.fillStyle(0xAA6600);
        g.fillRect(cx-2, cy-8, 4, 1);
        // Electric aura
        g.fillStyle(0x8888FF, 0.2);
        g.fillCircle(cx, cy, 28);
        break;
      }

      case 'dragon': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Smoke / fire wisps behind
        g.fillStyle(0xFF4400, 0.15);
        g.fillCircle(cx-14, cy-16, 5);
        g.fillCircle(cx+14, cy-16, 5);
        g.fillStyle(0xFF6600, 0.1);
        g.fillCircle(cx-10, cy-20, 4);
        g.fillCircle(cx+10, cy-20, 4);
        // Tail - curling from behind body to the right
        g.fillStyle(darker);
        g.fillCurvedLimb(cx+6, cy+16, 5, cx+18, cy+18, cx+24, cy+12, 3);
        g.fillStyle(color);
        g.fillCurvedLimb(cx+6, cy+15, 4, cx+17, cy+17, cx+23, cy+11, 2);
        // Tail spike
        g.fillStyle(darker);
        g.fillTriangle(cx+22, cy+10, cx+24, cy+14, cx+28, cy+10);
        g.fillTriangle(cx+24, cy+8, cx+26, cy+12, cx+30, cy+10);
        // Tail belly highlight
        g.fillStyle(lighter);
        g.fillCurvedLimb(cx+8, cy+17, 2, cx+18, cy+19, cx+22, cy+14, 1);
        // Legs / feet
        g.fillStyle(darker);
        g.fillLimb(cx-8, cy+12, 5, cx-10, cy+22, 3);
        g.fillLimb(cx+8, cy+12, 5, cx+10, cy+22, 3);
        g.fillStyle(color);
        g.fillLimb(cx-8, cy+12, 4, cx-10, cy+21, 3);
        g.fillLimb(cx+8, cy+12, 4, cx+10, cy+21, 3);
        // Claws
        g.fillStyle(0xDDDDAA);
        g.fillRect(cx-14, cy+22, 2, 2);
        g.fillRect(cx-12, cy+23, 2, 2);
        g.fillRect(cx-10, cy+24, 2, 2);
        g.fillRect(cx+9, cy+22, 2, 2);
        g.fillRect(cx+11, cy+23, 2, 2);
        g.fillRect(cx+13, cy+24, 2, 2);
        // Main body - large and powerful
        g.fillStyle(darker);
        g.fillEllipse(cx, cy+4, 28, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy+4, 26, 20);
        // Belly scales - layered
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy+8, 16, 12);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx, cy+10, 10, 8);
        // Belly scale lines
        g.fillStyle(lighter, 0.5);
        for (let i = 0; i < 5; i++) {
          g.fillRect(cx-6, cy+4+i*3, 12, 1);
        }
        // Wings - grand and imposing
        g.fillStyle(darker);
        g.fillTriangle(cx-12, cy-4, cx-30, cy-22, cx-26, cy+8);
        g.fillTriangle(cx+12, cy-4, cx+30, cy-22, cx+26, cy+8);
        g.fillStyle(color);
        g.fillTriangle(cx-12, cy-2, cx-28, cy-20, cx-24, cy+6);
        g.fillTriangle(cx+12, cy-2, cx+28, cy-20, cx+24, cy+6);
        // Wing membrane
        g.fillStyle(lighter, 0.2);
        g.fillTriangle(cx-14, cy, cx-26, cy-16, cx-22, cy+4);
        g.fillTriangle(cx+14, cy, cx+26, cy-16, cx+22, cy+4);
        // Wing bone lines
        g.fillStyle(darker, 0.5);
        g.lineBetween(cx-12, cy-2, cx-28, cy-16);
        g.lineBetween(cx-12, cy-2, cx-26, cy-6);
        g.lineBetween(cx-12, cy-2, cx-24, cy+4);
        g.lineBetween(cx+12, cy-2, cx+28, cy-16);
        g.lineBetween(cx+12, cy-2, cx+26, cy-6);
        g.lineBetween(cx+12, cy-2, cx+24, cy+4);
        // Wing tips
        g.fillStyle(darker);
        g.fillTriangle(cx-28, cy-20, cx-30, cy-24, cx-26, cy-22);
        g.fillTriangle(cx+28, cy-20, cx+30, cy-24, cx+26, cy-22);
        // Neck
        g.fillStyle(color);
        g.fillLimb(cx, cy-2, 10, cx, cy-14, 8);
        g.fillStyle(lighter);
        g.fillRect(cx-3, cy-12, 6, 10);
        // Head - fierce dragon face
        g.fillStyle(darker);
        g.fillEllipse(cx, cy-20, 18, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy-20, 16, 12);
        // Snout
        g.fillStyle(color);
        g.fillEllipse(cx, cy-16, 12, 6);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy-15, 8, 4);
        // Nostrils with smoke
        g.fillStyle(0x000000);
        g.fillCircle(cx-3, cy-15, 1);
        g.fillCircle(cx+3, cy-15, 1);
        g.fillStyle(0xFF4400, 0.3);
        g.fillCircle(cx-4, cy-17, 2);
        g.fillCircle(cx+4, cy-17, 2);
        // Eyes - fierce, glowing, slit pupils
        g.fillStyle(0x000000);
        g.fillEllipse(cx-5, cy-22, 5, 4);
        g.fillEllipse(cx+5, cy-22, 5, 4);
        g.fillStyle(0xFF4400);
        g.fillEllipse(cx-5, cy-22, 4, 3);
        g.fillEllipse(cx+5, cy-22, 4, 3);
        g.fillStyle(0xFFCC00);
        g.fillEllipse(cx-5, cy-22, 3, 2);
        g.fillEllipse(cx+5, cy-22, 3, 2);
        g.fillStyle(0x000000);
        g.fillEllipse(cx-5, cy-22, 1, 3);
        g.fillEllipse(cx+5, cy-22, 1, 3);
        // Angry brow ridges
        g.fillStyle(darker);
        g.fillRect(cx-8, cy-26, 5, 2);
        g.fillRect(cx+3, cy-26, 5, 2);
        g.fillStyle(0x000000, 0.3);
        g.fillRect(cx-7, cy-25, 4, 1);
        g.fillRect(cx+3, cy-25, 4, 1);
        // Horns - large, curved
        g.fillStyle(0xBBBB88);
        g.fillCurvedLimb(cx-7, cy-26, 3, cx-14, cy-28, cx-16, cy-32, 2);
        g.fillCurvedLimb(cx+7, cy-26, 3, cx+14, cy-28, cx+16, cy-32, 2);
        g.fillStyle(0xDDDDAA);
        g.fillCircle(cx-16, cy-32, 2);
        g.fillCircle(cx+16, cy-32, 2);
        // Mouth with teeth
        g.fillStyle(0x440000);
        g.fillRect(cx-5, cy-14, 10, 2);
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx-4, cy-14, cx-3, cy-14, cx-3, cy-12);
        g.fillTriangle(cx-1, cy-14, cx, cy-14, cx, cy-12);
        g.fillTriangle(cx+2, cy-14, cx+3, cy-14, cx+2, cy-12);
        g.fillTriangle(cx+4, cy-14, cx+5, cy-14, cx+5, cy-12);
        // Fire breath wisps from mouth
        g.fillStyle(0xFF2200, 0.4);
        g.fillCircle(cx, cy-10, 3);
        g.fillStyle(0xFF6600, 0.3);
        g.fillCircle(cx-3, cy-8, 2);
        g.fillCircle(cx+3, cy-8, 2);
        g.fillStyle(0xFFAA00, 0.2);
        g.fillCircle(cx, cy-7, 2);
        // Body scale details
        g.fillStyle(darker, 0.2);
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            g.fillRect(cx-10+i*6, cy-2+j*5, 3, 2);
          }
        }
        // Spinal ridge
        g.fillStyle(darker);
        g.fillRect(cx-1, cy-26, 2, 2);
        g.fillRect(cx-1, cy-14, 2, 1);
        break;
      }

      case 'bear': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2); g.fillEllipse(cx, cy+27, 36, 8);
        // Body - large and bulky
        g.fillStyle(darker);
        g.fillEllipse(cx, cy+8, 32, 26);
        g.fillStyle(color);
        g.fillEllipse(cx, cy+8, 30, 24);
        // Fur texture
        g.fillStyle(darker, 0.2);
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < 4; j++) {
            g.fillRect(cx-12+i*5, cy-2+j*6, 2, 3);
          }
        }
        // Belly
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy+10, 18, 16);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx, cy+12, 12, 10);
        // Arms / front legs
        g.fillStyle(darker);
        g.fillLimb(cx-14, cy+2, 6, cx-16, cy+18, 5);
        g.fillLimb(cx+14, cy+2, 6, cx+16, cy+18, 5);
        g.fillStyle(color);
        g.fillLimb(cx-14, cy+2, 5, cx-16, cy+17, 4);
        g.fillLimb(cx+14, cy+2, 5, cx+16, cy+17, 4);
        // Paws
        g.fillStyle(darker);
        g.fillCircle(cx-16, cy+20, 4);
        g.fillCircle(cx+16, cy+20, 4);
        g.fillStyle(lighter);
        g.fillCircle(cx-16, cy+20, 3);
        g.fillCircle(cx+16, cy+20, 3);
        // Claws
        g.fillStyle(0xDDDDAA);
        g.fillRect(cx-19, cy+21, 1, 2);
        g.fillRect(cx-17, cy+22, 1, 2);
        g.fillRect(cx-15, cy+22, 1, 2);
        g.fillRect(cx+15, cy+21, 1, 2);
        g.fillRect(cx+17, cy+22, 1, 2);
        g.fillRect(cx+19, cy+22, 1, 2);
        // Head
        g.fillStyle(color);
        g.fillEllipse(cx, cy-10, 22, 18);
        g.fillStyle(darker, 0.15);
        g.fillEllipse(cx, cy-8, 20, 14);
        // Ears
        g.fillStyle(color);
        g.fillCircle(cx-9, cy-20, 4);
        g.fillCircle(cx+9, cy-20, 4);
        g.fillStyle(lighter);
        g.fillCircle(cx-9, cy-20, 2);
        g.fillCircle(cx+9, cy-20, 2);
        // Snout
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy-6, 10, 8);
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx, cy-7, 6, 4);
        // Nose
        g.fillStyle(0x222222);
        g.fillEllipse(cx, cy-8, 4, 3);
        g.fillStyle(0x444444);
        g.fillRect(cx-1, cy-9, 1, 1);
        // Eyes - small, intense, no whites
        g.fillStyle(0x332200);
        g.fillEllipse(cx-5, cy-12, 3, 2);
        g.fillEllipse(cx+5, cy-12, 3, 2);
        g.fillStyle(0x000000);
        g.fillCircle(cx-5, cy-12, 1);
        g.fillCircle(cx+5, cy-12, 1);
        // Mouth
        g.fillStyle(0x000000, 0.3);
        g.fillRect(cx, cy-5, 1, 2);
        g.fillRect(cx-2, cy-4, 2, 1);
        g.fillRect(cx+1, cy-4, 2, 1);
        // Ice crystals on fur
        g.fillStyle(0xAADDFF, 0.7);
        g.fillTriangle(cx-12, cy-4, cx-10, cy-4, cx-11, cy-9);
        g.fillTriangle(cx+12, cy-2, cx+14, cy-2, cx+13, cy-7);
        g.fillTriangle(cx-8, cy+4, cx-6, cy+4, cx-7, cy);
        g.fillStyle(0xCCEEFF, 0.5);
        g.fillTriangle(cx+8, cy+6, cx+10, cy+6, cx+9, cy+2);
        g.fillTriangle(cx-14, cy+8, cx-12, cy+8, cx-13, cy+4);
        // Frost sparkles
        g.fillStyle(0xFFFFFF, 0.8);
        g.fillRect(cx-11, cy-8, 1, 1);
        g.fillRect(cx+13, cy-6, 1, 1);
        g.fillRect(cx-7, cy+1, 1, 1);
        g.fillRect(cx+9, cy+3, 1, 1);
        g.fillRect(cx-13, cy+5, 1, 1);
        // Breath frost
        g.fillStyle(0xCCEEFF, 0.3);
        g.fillCircle(cx, cy-2, 3);
        g.fillCircle(cx-3, cy, 2);
        g.fillCircle(cx+3, cy, 2);
        break;
      }
      case 'ice-sprite': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Glowing aura behind sprite
        g.fillStyle(0x88DDFF, 0.15);
        g.fillCircle(cx, cy - 2, 22);
        g.fillStyle(0xAAEEFF, 0.1);
        g.fillCircle(cx, cy - 2, 26);

        // Tiny wings - left
        g.fillStyle(0xCCEEFF, 0.6);
        g.fillTriangle(cx - 8, cy - 8, cx - 22, cy - 18, cx - 18, cy + 2);
        g.fillStyle(0xEEF8FF, 0.5);
        g.fillTriangle(cx - 9, cy - 6, cx - 20, cy - 16, cx - 17, cy);
        // Wings - right
        g.fillStyle(0xCCEEFF, 0.6);
        g.fillTriangle(cx + 8, cy - 8, cx + 22, cy - 18, cx + 18, cy + 2);
        g.fillStyle(0xEEF8FF, 0.5);
        g.fillTriangle(cx + 9, cy - 6, cx + 20, cy - 16, cx + 17, cy);

        // Crystalline body - main shape
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 4, 20, 24);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 3, 18, 22);

        // Body highlight - belly
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 6, 12, 14);
        g.fillStyle(lightest);
        g.fillEllipse(cx - 2, cy + 2, 6, 8);

        // Crystal facets on body
        g.fillStyle(0xFFFFFF, 0.3);
        g.fillTriangle(cx - 6, cy - 4, cx - 2, cy + 8, cx - 8, cy + 6);
        g.fillTriangle(cx + 4, cy - 2, cx + 8, cy + 6, cx + 2, cy + 10);

        // Head
        g.fillStyle(darker);
        g.fillCircle(cx, cy - 10, 10);
        g.fillStyle(color);
        g.fillCircle(cx, cy - 10, 9);
        g.fillStyle(lighter);
        g.fillCircle(cx, cy - 11, 6);

        // Eyes - glowing ice orbs
        g.fillStyle(0x0044AA);
        g.fillCircle(cx - 4, cy - 11, 2);
        g.fillCircle(cx + 4, cy - 11, 2);
        g.fillStyle(0x0066DD);
        g.fillCircle(cx - 4, cy - 11, 1);
        g.fillCircle(cx + 4, cy - 11, 1);

        // Small smile
        g.fillStyle(darker);
        g.fillRect(cx - 2, cy - 7, 4, 1);

        // Ice crown / crystal points on head
        g.fillStyle(0xAADDFF);
        g.fillTriangle(cx - 3, cy - 18, cx, cy - 24, cx + 1, cy - 17);
        g.fillTriangle(cx + 2, cy - 18, cx + 5, cy - 23, cx + 5, cy - 16);
        g.fillTriangle(cx - 6, cy - 16, cx - 5, cy - 22, cx - 2, cy - 17);
        g.fillStyle(0xDDEEFF, 0.7);
        g.fillTriangle(cx - 2, cy - 18, cx + 1, cy - 23, cx + 1, cy - 17);
        g.fillTriangle(cx + 3, cy - 17, cx + 5, cy - 22, cx + 5, cy - 16);

        // Little arms
        g.fillStyle(color);
        g.fillLimb(cx - 9, cy + 2, 3, cx - 14, cy + 8, 2);
        g.fillLimb(cx + 9, cy + 2, 3, cx + 14, cy + 8, 2);

        // Sparkle particles
        g.fillStyle(0xFFFFFF, 0.8);
        g.fillCircle(cx - 16, cy - 6, 1);
        g.fillCircle(cx + 18, cy - 12, 1.2);
        g.fillCircle(cx - 12, cy + 14, 0.8);
        g.fillCircle(cx + 14, cy + 10, 1);
        g.fillStyle(0xCCEEFF, 0.6);
        g.fillCircle(cx + 10, cy - 20, 0.8);
        g.fillCircle(cx - 18, cy + 6, 0.8);

        break;
      }

      case 'dark-sorcerer': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Robe base - wide flowing shape
        g.fillStyle(darker);
        g.fillTriangle(cx - 18, cy + 26, cx, cy - 8, cx + 18, cy + 26);
        g.fillStyle(color);
        g.fillTriangle(cx - 16, cy + 26, cx, cy - 6, cx + 16, cy + 26);

        // Robe bottom frayed edge
        g.fillStyle(darker);
        g.fillTriangle(cx - 18, cy + 24, cx - 14, cy + 28, cx - 10, cy + 24);
        g.fillTriangle(cx - 10, cy + 24, cx - 6, cy + 28, cx - 2, cy + 24);
        g.fillTriangle(cx - 2, cy + 24, cx + 2, cy + 28, cx + 6, cy + 24);
        g.fillTriangle(cx + 6, cy + 24, cx + 10, cy + 28, cx + 14, cy + 24);
        g.fillTriangle(cx + 14, cy + 24, cx + 18, cy + 28, cx + 18, cy + 24);

        // Robe fold shadows
        g.fillStyle(darker, 0.4);
        g.fillTriangle(cx - 4, cy, cx - 10, cy + 26, cx - 2, cy + 26);
        g.fillTriangle(cx + 4, cy, cx + 10, cy + 26, cx + 2, cy + 26);

        // Robe highlight fold
        g.fillStyle(lighter, 0.3);
        g.fillTriangle(cx, cy - 4, cx - 4, cy + 20, cx + 4, cy + 20);

        // Hood
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 22, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 20, 18);

        // Hood inner darkness
        g.fillStyle(0x111111);
        g.fillEllipse(cx, cy - 10, 14, 12);
        g.fillStyle(0x0A0A0A);
        g.fillEllipse(cx, cy - 9, 12, 10);

        // Glowing eyes in hood
        g.fillStyle(0xFF0000);
        g.fillEllipse(cx - 4, cy - 10, 3, 2);
        g.fillEllipse(cx + 4, cy - 10, 3, 2);
        g.fillStyle(0xFF4444);
        g.fillCircle(cx - 4, cy - 10, 1);
        g.fillCircle(cx + 4, cy - 10, 1);
        g.fillStyle(0xFF8888, 0.4);
        g.fillCircle(cx - 4, cy - 10, 2.5);
        g.fillCircle(cx + 4, cy - 10, 2.5);

        // Staff - held to the right
        g.fillStyle(0x554422);
        g.fillRect(cx + 16, cy - 22, 2, 48);
        g.fillStyle(0x443311);
        g.fillRect(cx + 16, cy - 22, 1, 48);

        // Staff orb
        g.fillStyle(0x8800CC, 0.3);
        g.fillCircle(cx + 17, cy - 24, 7);
        g.fillStyle(0xAA00FF);
        g.fillCircle(cx + 17, cy - 24, 5);
        g.fillStyle(0xCC44FF);
        g.fillCircle(cx + 17, cy - 25, 3);
        g.fillStyle(0xEE99FF);
        g.fillCircle(cx + 16, cy - 26, 1.5);
        g.fillStyle(0xFFFFFF);
        g.fillCircle(cx + 16, cy - 26, 0.8);

        // Orb glow
        g.fillStyle(0xAA00FF, 0.15);
        g.fillCircle(cx + 17, cy - 24, 10);

        // Hands/claws reaching out
        g.fillStyle(0x666655);
        g.fillLimb(cx - 8, cy + 4, 3, cx - 16, cy + 10, 2);
        g.fillStyle(0x555544);
        g.fillCircle(cx - 16, cy + 10, 2.5);
        // Fingers
        g.fillStyle(0x666655);
        g.fillLimb(cx - 16, cy + 10, 1.5, cx - 19, cy + 8, 0.8);
        g.fillLimb(cx - 16, cy + 10, 1.5, cx - 20, cy + 10, 0.8);
        g.fillLimb(cx - 16, cy + 10, 1.5, cx - 19, cy + 12, 0.8);

        // Right hand on staff
        g.fillStyle(0x666655);
        g.fillCircle(cx + 17, cy + 2, 3);

        // Dark energy particles
        g.fillStyle(0x9900DD, 0.5);
        g.fillCircle(cx - 20, cy - 4, 1);
        g.fillCircle(cx - 14, cy - 18, 1.2);
        g.fillCircle(cx + 24, cy - 14, 0.8);
        g.fillStyle(0xCC44FF, 0.3);
        g.fillCircle(cx - 10, cy + 18, 1);
        g.fillCircle(cx + 22, cy, 1);

        break;
      }

      case 'ice-wyrm': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Serpentine body - coiled, back section
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 16, cy + 20, 8, cx + 20, cy + 10, cx + 10, cy + 4, 7);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 16, cy + 20, 7, cx + 19, cy + 10, cx + 10, cy + 4, 6);

        // Body coil - lower curve
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 12, cy + 22, 8, cx - 16, cy + 14, cx - 6, cy + 8, 7);
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 12, cy + 22, 7, cx - 15, cy + 14, cx - 6, cy + 8, 6);

        // Belly highlight on lower coil
        g.fillStyle(lighter);
        g.fillCurvedLimb(cx - 12, cy + 23, 4, cx - 14, cy + 16, cx - 6, cy + 10, 3);

        // Body coil - mid section connecting
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 6, cy + 8, 7, cx + 4, cy + 12, cx + 16, cy + 20, 8);
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 6, cy + 8, 6, cx + 4, cy + 12, cx + 16, cy + 20, 7);

        // Upper body / neck
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 10, cy + 4, 7, cx + 2, cy - 4, cx, cy - 10, 8);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 10, cy + 4, 6, cx + 2, cy - 4, cx, cy - 10, 7);

        // Belly highlight on neck
        g.fillStyle(lighter);
        g.fillCurvedLimb(cx + 9, cy + 5, 3, cx + 2, cy - 2, cx, cy - 8, 4);

        // Ice scale pattern
        g.fillStyle(0xAADDFF, 0.3);
        g.fillCircle(cx + 14, cy + 18, 1.5);
        g.fillCircle(cx + 8, cy + 10, 1.5);
        g.fillCircle(cx - 10, cy + 20, 1.5);
        g.fillCircle(cx - 4, cy + 14, 1.5);
        g.fillCircle(cx + 4, cy, 1.5);

        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 16, 18, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 16, 16, 12);

        // Snout
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 10, 6);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 9, 5);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 11, 6, 3);

        // Nostrils
        g.fillStyle(darker);
        g.fillCircle(cx - 2, cy - 12, 1);
        g.fillCircle(cx + 2, cy - 12, 1);

        // Frost breath particles
        g.fillStyle(0xCCEEFF, 0.5);
        g.fillCircle(cx - 4, cy - 9, 1.5);
        g.fillCircle(cx + 4, cy - 9, 1.5);
        g.fillCircle(cx - 8, cy - 7, 1);
        g.fillCircle(cx + 8, cy - 7, 1);
        g.fillStyle(0xEEF8FF, 0.3);
        g.fillCircle(cx - 6, cy - 6, 2);
        g.fillCircle(cx + 6, cy - 6, 2);

        // Eyes - fierce dragon eyes, narrow
        g.fillStyle(0x001155);
        g.fillEllipse(cx - 5, cy - 18, 5, 3);
        g.fillEllipse(cx + 5, cy - 18, 5, 3);
        g.fillStyle(0x44CCFF);
        g.fillEllipse(cx - 5, cy - 18, 4, 2);
        g.fillEllipse(cx + 5, cy - 18, 4, 2);
        // Slit pupils
        g.fillStyle(0x001133);
        g.fillEllipse(cx - 5, cy - 18, 1, 3);
        g.fillEllipse(cx + 5, cy - 18, 1, 3);

        // Crystal horns
        g.fillStyle(0x88CCEE);
        g.fillTriangle(cx - 8, cy - 20, cx - 14, cy - 30, cx - 6, cy - 22);
        g.fillTriangle(cx + 8, cy - 20, cx + 14, cy - 30, cx + 6, cy - 22);
        g.fillStyle(0xBBDDFF);
        g.fillTriangle(cx - 7, cy - 21, cx - 13, cy - 29, cx - 6, cy - 22);
        g.fillTriangle(cx + 7, cy - 21, cx + 13, cy - 29, cx + 6, cy - 22);
        // Horn tips shine
        g.fillStyle(0xFFFFFF, 0.7);
        g.fillCircle(cx - 13, cy - 29, 1);
        g.fillCircle(cx + 13, cy - 29, 1);

        // Small spikes along back
        g.fillStyle(0x88CCEE);
        g.fillTriangle(cx + 6, cy - 4, cx + 4, cy - 10, cx + 8, cy - 6);
        g.fillTriangle(cx + 12, cy + 6, cx + 14, cy, cx + 16, cy + 6);
        g.fillTriangle(cx - 8, cy + 10, cx - 12, cy + 4, cx - 6, cy + 8);

        // Tail tip
        g.fillStyle(darker);
        g.fillTriangle(cx - 14, cy + 22, cx - 22, cy + 18, cx - 18, cy + 26);
        g.fillStyle(color);
        g.fillTriangle(cx - 14, cy + 22, cx - 21, cy + 19, cx - 17, cy + 25);

        // Ice crystal aura
        g.fillStyle(0xAAEEFF, 0.1);
        g.fillCircle(cx, cy, 28);

        break;
      }

      case 'lizard': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Tail behind body
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 4, cy + 18, 4, cx + 18, cy + 22, cx + 24, cy + 16, 2);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 4, cy + 18, 3.5, cx + 17, cy + 21, cx + 23, cy + 16, 1.5);

        // Legs
        g.fillStyle(darker);
        g.fillLimb(cx - 6, cy + 18, 4, cx - 10, cy + 26, 3);
        g.fillLimb(cx + 6, cy + 18, 4, cx + 8, cy + 26, 3);
        g.fillStyle(color);
        g.fillLimb(cx - 6, cy + 18, 3.5, cx - 10, cy + 25, 2.5);
        g.fillLimb(cx + 6, cy + 18, 3.5, cx + 8, cy + 25, 2.5);

        // Feet with claws
        g.fillStyle(darker);
        g.fillEllipse(cx - 10, cy + 26, 6, 3);
        g.fillEllipse(cx + 8, cy + 26, 6, 3);

        // Body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 8, 22, 24);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 8, 20, 22);

        // Belly - lighter scales
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 12, 12, 14);
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx, cy + 14, 8, 10);

        // Scale pattern on body
        g.fillStyle(darker, 0.3);
        g.fillCircle(cx - 8, cy + 2, 2);
        g.fillCircle(cx + 8, cy + 2, 2);
        g.fillCircle(cx - 6, cy + 8, 2);
        g.fillCircle(cx + 6, cy + 8, 2);
        g.fillCircle(cx - 9, cy + 14, 1.8);
        g.fillCircle(cx + 9, cy + 14, 1.8);

        // Arms
        g.fillStyle(darker);
        g.fillLimb(cx - 10, cy + 4, 3.5, cx - 18, cy + 8, 2.5);
        g.fillStyle(color);
        g.fillLimb(cx - 10, cy + 4, 3, cx - 17, cy + 8, 2);

        // Sword - held in right hand
        g.fillStyle(0x888888);
        g.fillRect(cx + 18, cy - 16, 2, 26);
        g.fillStyle(0xCCCCCC);
        g.fillRect(cx + 18, cy - 16, 1, 26);
        // Sword hilt
        g.fillStyle(0x664422);
        g.fillRect(cx + 15, cy + 8, 8, 2);
        g.fillStyle(0xFFCC00);
        g.fillCircle(cx + 19, cy + 9, 1.5);
        // Right arm holding sword
        g.fillStyle(darker);
        g.fillLimb(cx + 10, cy + 4, 3.5, cx + 18, cy + 8, 2.5);
        g.fillStyle(color);
        g.fillLimb(cx + 10, cy + 4, 3, cx + 17, cy + 8, 2);
        // Hand on sword
        g.fillStyle(darker);
        g.fillCircle(cx + 18, cy + 9, 2.5);

        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 10, 18, 16);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 10, 16, 14);

        // Snout
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 6, 10, 6);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 6, 9, 5);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 5, 6, 3);

        // Nostrils
        g.fillStyle(darker);
        g.fillCircle(cx - 2, cy - 6, 1);
        g.fillCircle(cx + 2, cy - 6, 1);

        // Mouth line
        g.fillStyle(darker);
        g.fillRect(cx - 4, cy - 4, 8, 1);

        // Eyes - reptilian, narrow
        g.fillStyle(0xCCAA00);
        g.fillEllipse(cx - 5, cy - 12, 4, 3);
        g.fillEllipse(cx + 5, cy - 12, 4, 3);
        // Slit pupils
        g.fillStyle(0x222200);
        g.fillEllipse(cx - 5, cy - 12, 1, 3);
        g.fillEllipse(cx + 5, cy - 12, 1, 3);

        // Head ridges
        g.fillStyle(darker);
        g.fillTriangle(cx - 4, cy - 18, cx - 2, cy - 22, cx, cy - 17);
        g.fillTriangle(cx, cy - 18, cx + 2, cy - 22, cx + 4, cy - 17);

        break;
      }

      case 'knight': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Legs / greaves
        g.fillStyle(darker);
        g.fillRect(cx - 10, cy + 16, 8, 12);
        g.fillRect(cx + 2, cy + 16, 8, 12);
        g.fillStyle(color);
        g.fillRect(cx - 9, cy + 16, 6, 11);
        g.fillRect(cx + 3, cy + 16, 6, 11);
        // Knee guards
        g.fillStyle(lighter);
        g.fillEllipse(cx - 6, cy + 16, 6, 4);
        g.fillEllipse(cx + 6, cy + 16, 6, 4);
        // Boots
        g.fillStyle(darker);
        g.fillEllipse(cx - 7, cy + 26, 10, 4);
        g.fillEllipse(cx + 5, cy + 26, 10, 4);

        // Body - chest plate
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 6, 24, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 6, 22, 20);

        // Chest plate detail - center ridge
        g.fillStyle(lighter);
        g.fillRect(cx - 1, cy - 2, 2, 16);
        // Chest plate highlights
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx - 5, cy + 2, 6, 10);
        g.fillStyle(darker, 0.2);
        g.fillEllipse(cx + 5, cy + 6, 6, 10);

        // Pauldrons (shoulder armor)
        g.fillStyle(darker);
        g.fillEllipse(cx - 14, cy - 2, 10, 8);
        g.fillEllipse(cx + 14, cy - 2, 10, 8);
        g.fillStyle(color);
        g.fillEllipse(cx - 14, cy - 2, 9, 7);
        g.fillEllipse(cx + 14, cy - 2, 9, 7);
        g.fillStyle(lighter);
        g.fillEllipse(cx - 15, cy - 3, 5, 4);
        g.fillEllipse(cx + 13, cy - 3, 5, 4);

        // Arms
        g.fillStyle(darker);
        g.fillLimb(cx - 14, cy + 2, 4, cx - 16, cy + 14, 3);
        g.fillLimb(cx + 14, cy + 2, 4, cx + 16, cy + 14, 3);
        g.fillStyle(color);
        g.fillLimb(cx - 14, cy + 2, 3.5, cx - 16, cy + 14, 2.5);
        g.fillLimb(cx + 14, cy + 2, 3.5, cx + 16, cy + 14, 2.5);

        // Gauntlets
        g.fillStyle(darker);
        g.fillCircle(cx - 16, cy + 14, 3);
        g.fillCircle(cx + 16, cy + 14, 3);

        // Sword - right hand
        g.fillStyle(0xAAAAAA);
        g.fillRect(cx + 20, cy - 14, 2, 30);
        g.fillStyle(0xCCCCCC);
        g.fillRect(cx + 20, cy - 14, 1, 30);
        // Sword tip
        g.fillStyle(0xAAAAAA);
        g.fillTriangle(cx + 20, cy - 14, cx + 21, cy - 18, cx + 22, cy - 14);
        // Hilt
        g.fillStyle(0x886622);
        g.fillRect(cx + 16, cy + 14, 10, 2);
        // Pommel
        g.fillStyle(0xFFCC00);
        g.fillCircle(cx + 21, cy + 15, 1.5);

        // Helmet
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 20, 18);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 18, 16);

        // Helmet highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx - 3, cy - 16, 8, 6);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 4, cy - 17, 4, 3);

        // Visor slit - glowing
        g.fillStyle(0x111111);
        g.fillRect(cx - 7, cy - 12, 14, 3);
        g.fillStyle(0xFF3300, 0.8);
        g.fillRect(cx - 6, cy - 11, 12, 1);
        g.fillStyle(0xFF6600, 0.4);
        g.fillRect(cx - 5, cy - 12, 10, 3);

        // Helmet crest
        g.fillStyle(darker);
        g.fillRect(cx - 1, cy - 22, 2, 6);
        g.fillStyle(color);
        g.fillRect(cx - 1, cy - 22, 1.5, 5);

        // Helmet chin guard
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 6, 12, 6);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 6, 10, 5);

        break;
      }

      case 'skeleton': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Legs - bone segments
        g.fillStyle(darker);
        g.fillLimb(cx - 5, cy + 14, 3, cx - 7, cy + 20, 2.5);
        g.fillLimb(cx + 5, cy + 14, 3, cx + 7, cy + 20, 2.5);
        g.fillLimb(cx - 7, cy + 20, 2.5, cx - 6, cy + 26, 2);
        g.fillLimb(cx + 7, cy + 20, 2.5, cx + 6, cy + 26, 2);
        g.fillStyle(color);
        g.fillLimb(cx - 5, cy + 14, 2.5, cx - 7, cy + 20, 2);
        g.fillLimb(cx + 5, cy + 14, 2.5, cx + 7, cy + 20, 2);
        g.fillLimb(cx - 7, cy + 20, 2, cx - 6, cy + 26, 1.5);
        g.fillLimb(cx + 7, cy + 20, 2, cx + 6, cy + 26, 1.5);
        // Knee joints
        g.fillStyle(darker);
        g.fillCircle(cx - 7, cy + 20, 2.5);
        g.fillCircle(cx + 7, cy + 20, 2.5);
        // Feet
        g.fillStyle(color);
        g.fillEllipse(cx - 6, cy + 26, 5, 2);
        g.fillEllipse(cx + 6, cy + 26, 5, 2);

        // Spine
        g.fillStyle(darker);
        g.fillRect(cx - 1, cy - 2, 2, 18);
        g.fillStyle(color);
        g.fillRect(cx - 0.5, cy - 2, 1, 18);
        // Vertebrae markers
        g.fillStyle(darker);
        g.fillRect(cx - 2, cy, 4, 1);
        g.fillRect(cx - 2, cy + 4, 4, 1);
        g.fillRect(cx - 2, cy + 8, 4, 1);
        g.fillRect(cx - 2, cy + 12, 4, 1);

        // Rib cage
        g.fillStyle(darker);
        g.fillCurvedLimb(cx, cy, 1.5, cx - 8, cy + 2, cx - 10, cy + 6, 1);
        g.fillCurvedLimb(cx, cy + 3, 1.5, cx - 8, cy + 5, cx - 9, cy + 8, 1);
        g.fillCurvedLimb(cx, cy + 6, 1.5, cx - 7, cy + 8, cx - 8, cy + 10, 1);
        g.fillCurvedLimb(cx, cy, 1.5, cx + 8, cy + 2, cx + 10, cy + 6, 1);
        g.fillCurvedLimb(cx, cy + 3, 1.5, cx + 8, cy + 5, cx + 9, cy + 8, 1);
        g.fillCurvedLimb(cx, cy + 6, 1.5, cx + 7, cy + 8, cx + 8, cy + 10, 1);
        g.fillStyle(color);
        g.fillCurvedLimb(cx, cy, 1, cx - 7, cy + 2, cx - 9, cy + 6, 0.8);
        g.fillCurvedLimb(cx, cy + 3, 1, cx - 7, cy + 5, cx - 8, cy + 8, 0.8);
        g.fillCurvedLimb(cx, cy + 6, 1, cx - 6, cy + 8, cx - 7, cy + 10, 0.8);
        g.fillCurvedLimb(cx, cy, 1, cx + 7, cy + 2, cx + 9, cy + 6, 0.8);
        g.fillCurvedLimb(cx, cy + 3, 1, cx + 7, cy + 5, cx + 8, cy + 8, 0.8);
        g.fillCurvedLimb(cx, cy + 6, 1, cx + 6, cy + 8, cx + 7, cy + 10, 0.8);

        // Arms
        g.fillStyle(darker);
        g.fillLimb(cx - 10, cy, 2.5, cx - 14, cy + 8, 2);
        g.fillLimb(cx + 10, cy, 2.5, cx + 14, cy + 8, 2);
        g.fillStyle(color);
        g.fillLimb(cx - 10, cy, 2, cx - 14, cy + 8, 1.5);
        g.fillLimb(cx + 10, cy, 2, cx + 14, cy + 8, 1.5);
        // Elbow joints
        g.fillStyle(darker);
        g.fillCircle(cx - 14, cy + 8, 2);
        g.fillCircle(cx + 14, cy + 8, 2);
        // Forearms
        g.fillStyle(darker);
        g.fillLimb(cx - 14, cy + 8, 2, cx - 16, cy + 16, 1.5);
        g.fillStyle(color);
        g.fillLimb(cx - 14, cy + 8, 1.5, cx - 16, cy + 16, 1);

        // Sword in right hand
        g.fillStyle(0x888888);
        g.fillRect(cx + 18, cy - 4, 2, 22);
        g.fillStyle(0xAAAAAA);
        g.fillRect(cx + 18, cy - 4, 1, 22);
        g.fillStyle(0x888888);
        g.fillTriangle(cx + 18, cy - 4, cx + 19, cy - 8, cx + 20, cy - 4);
        g.fillStyle(0x664422);
        g.fillRect(cx + 15, cy + 16, 8, 2);
        // Right forearm to sword
        g.fillStyle(darker);
        g.fillLimb(cx + 14, cy + 8, 2, cx + 18, cy + 16, 1.5);
        g.fillStyle(color);
        g.fillLimb(cx + 14, cy + 8, 1.5, cx + 18, cy + 16, 1);
        // Hand
        g.fillStyle(color);
        g.fillCircle(cx + 18, cy + 16, 2);

        // Left hand - bony
        g.fillStyle(color);
        g.fillCircle(cx - 16, cy + 16, 2);

        // Skull
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 10, 16, 16);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 10, 14, 14);
        g.fillStyle(lighter);
        g.fillEllipse(cx - 1, cy - 12, 8, 8);

        // Eye sockets
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 4, cy - 12, 5, 5);
        g.fillEllipse(cx + 4, cy - 12, 5, 5);
        // Glowing eyes
        g.fillStyle(0xFF3300);
        g.fillCircle(cx - 4, cy - 12, 1.5);
        g.fillCircle(cx + 4, cy - 12, 1.5);
        g.fillStyle(0xFF6600, 0.4);
        g.fillCircle(cx - 4, cy - 12, 2.5);
        g.fillCircle(cx + 4, cy - 12, 2.5);

        // Nose hole
        g.fillStyle(0x111111);
        g.fillTriangle(cx - 1, cy - 8, cx + 1, cy - 8, cx, cy - 6);

        // Teeth / jaw
        g.fillStyle(darker);
        g.fillRect(cx - 5, cy - 5, 10, 3);
        g.fillStyle(color);
        g.fillRect(cx - 4, cy - 5, 8, 2);
        // Individual teeth
        g.fillStyle(darker);
        g.fillRect(cx - 3, cy - 5, 1, 2);
        g.fillRect(cx - 1, cy - 5, 1, 2);
        g.fillRect(cx + 1, cy - 5, 1, 2);
        g.fillRect(cx + 3, cy - 5, 1, 2);

        break;
      }

      case 'wraith': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Ethereal lower body - wispy, no legs
        g.fillStyle(color, 0.3);
        g.fillTriangle(cx - 14, cy + 10, cx, cy + 28, cx + 14, cy + 10);
        g.fillStyle(color, 0.2);
        g.fillTriangle(cx - 10, cy + 14, cx - 4, cy + 28, cx + 2, cy + 14);
        g.fillTriangle(cx + 4, cy + 14, cx + 8, cy + 28, cx + 12, cy + 10);

        // Wispy tendrils at bottom
        g.fillStyle(color, 0.15);
        g.fillTriangle(cx - 6, cy + 22, cx - 10, cy + 28, cx - 2, cy + 26);
        g.fillTriangle(cx + 2, cy + 24, cx + 6, cy + 28, cx + 10, cy + 22);
        g.fillTriangle(cx - 2, cy + 24, cx, cy + 28, cx + 4, cy + 24);

        // Main body - ethereal cloak
        g.fillStyle(darker, 0.7);
        g.fillEllipse(cx, cy + 4, 26, 22);
        g.fillStyle(color, 0.6);
        g.fillEllipse(cx, cy + 4, 24, 20);

        // Cloak tattered edges
        g.fillStyle(darker, 0.5);
        g.fillTriangle(cx - 14, cy + 8, cx - 18, cy + 16, cx - 10, cy + 14);
        g.fillTriangle(cx + 14, cy + 8, cx + 18, cy + 16, cx + 10, cy + 14);

        // Ragged cloak folds
        g.fillStyle(darker, 0.3);
        g.fillTriangle(cx - 6, cy - 2, cx - 10, cy + 18, cx - 2, cy + 18);
        g.fillTriangle(cx + 2, cy - 2, cx + 6, cy + 18, cx + 10, cy - 2);

        // Arms reaching out - ghostly
        g.fillStyle(color, 0.5);
        g.fillCurvedLimb(cx - 12, cy + 2, 3, cx - 20, cy + 4, cx - 22, cy + 10, 2);
        g.fillCurvedLimb(cx + 12, cy + 2, 3, cx + 20, cy + 4, cx + 22, cy + 10, 2);
        // Ghostly fingers
        g.fillStyle(color, 0.4);
        g.fillLimb(cx - 22, cy + 10, 1.5, cx - 25, cy + 8, 0.5);
        g.fillLimb(cx - 22, cy + 10, 1.5, cx - 26, cy + 10, 0.5);
        g.fillLimb(cx - 22, cy + 10, 1.5, cx - 25, cy + 12, 0.5);
        g.fillLimb(cx + 22, cy + 10, 1.5, cx + 25, cy + 8, 0.5);
        g.fillLimb(cx + 22, cy + 10, 1.5, cx + 26, cy + 10, 0.5);
        g.fillLimb(cx + 22, cy + 10, 1.5, cx + 25, cy + 12, 0.5);

        // Hood
        g.fillStyle(darker, 0.8);
        g.fillEllipse(cx, cy - 12, 22, 18);
        g.fillStyle(color, 0.7);
        g.fillEllipse(cx, cy - 12, 20, 16);

        // Hood peak
        g.fillStyle(darker, 0.8);
        g.fillTriangle(cx - 6, cy - 20, cx, cy - 26, cx + 6, cy - 20);
        g.fillStyle(color, 0.7);
        g.fillTriangle(cx - 5, cy - 20, cx, cy - 25, cx + 5, cy - 20);

        // Inner hood darkness
        g.fillStyle(0x000000, 0.8);
        g.fillEllipse(cx, cy - 10, 14, 12);

        // Glowing eyes
        g.fillStyle(0x00FF88);
        g.fillEllipse(cx - 4, cy - 10, 4, 3);
        g.fillEllipse(cx + 4, cy - 10, 4, 3);
        g.fillStyle(0x88FFBB);
        g.fillCircle(cx - 4, cy - 10, 1);
        g.fillCircle(cx + 4, cy - 10, 1);
        // Eye glow
        g.fillStyle(0x00FF88, 0.2);
        g.fillCircle(cx - 4, cy - 10, 4);
        g.fillCircle(cx + 4, cy - 10, 4);

        // Ghostly mouth
        g.fillStyle(0x000000, 0.6);
        g.fillEllipse(cx, cy - 5, 5, 3);

        // Floating particles
        g.fillStyle(color, 0.3);
        g.fillCircle(cx - 18, cy - 8, 1);
        g.fillCircle(cx + 16, cy - 14, 1.2);
        g.fillCircle(cx - 14, cy + 16, 0.8);
        g.fillCircle(cx + 20, cy + 4, 1);
        g.fillStyle(0x00FF88, 0.2);
        g.fillCircle(cx - 8, cy + 22, 1);
        g.fillCircle(cx + 12, cy + 20, 0.8);

        break;
      }

      case 'fire-elemental': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Base fire glow
        g.fillStyle(0xFF4400, 0.1);
        g.fillCircle(cx, cy, 28);

        // Lower flame body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 14, 22, 18);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 14, 20, 16);

        // Inner flame - brighter
        g.fillStyle(0xFF8800);
        g.fillEllipse(cx, cy + 16, 14, 12);
        g.fillStyle(0xFFAA22);
        g.fillEllipse(cx, cy + 18, 8, 8);

        // Upper body / torso
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 2, 20, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 2, 18, 18);
        g.fillStyle(0xFF8800);
        g.fillEllipse(cx, cy + 4, 12, 12);
        g.fillStyle(0xFFAA22, 0.6);
        g.fillEllipse(cx, cy + 6, 6, 8);

        // Flame arms - left
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 10, cy + 2, 4, cx - 18, cy - 2, cx - 20, cy + 6, 3);
        g.fillStyle(0xFF8800);
        g.fillCurvedLimb(cx - 10, cy + 2, 3, cx - 17, cy - 1, cx - 19, cy + 6, 2);
        // Flame fingers left
        g.fillStyle(0xFFCC44);
        g.fillLimb(cx - 20, cy + 6, 2, cx - 24, cy + 4, 0.5);
        g.fillLimb(cx - 20, cy + 6, 2, cx - 24, cy + 7, 0.5);
        g.fillLimb(cx - 20, cy + 6, 2, cx - 23, cy + 10, 0.5);

        // Flame arms - right
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 10, cy + 2, 4, cx + 18, cy - 2, cx + 20, cy + 6, 3);
        g.fillStyle(0xFF8800);
        g.fillCurvedLimb(cx + 10, cy + 2, 3, cx + 17, cy - 1, cx + 19, cy + 6, 2);
        g.fillStyle(0xFFCC44);
        g.fillLimb(cx + 20, cy + 6, 2, cx + 24, cy + 4, 0.5);
        g.fillLimb(cx + 20, cy + 6, 2, cx + 24, cy + 7, 0.5);
        g.fillLimb(cx + 20, cy + 6, 2, cx + 23, cy + 10, 0.5);

        // Head
        g.fillStyle(darker);
        g.fillCircle(cx, cy - 12, 10);
        g.fillStyle(color);
        g.fillCircle(cx, cy - 12, 9);
        g.fillStyle(0xFF8800);
        g.fillCircle(cx, cy - 12, 6);

        // Flame crown / top flames
        g.fillStyle(color);
        g.fillTriangle(cx - 6, cy - 18, cx - 2, cy - 28, cx + 2, cy - 18);
        g.fillTriangle(cx + 2, cy - 18, cx + 6, cy - 26, cx + 8, cy - 16);
        g.fillTriangle(cx - 8, cy - 16, cx - 6, cy - 24, cx - 2, cy - 18);
        g.fillStyle(0xFF8800);
        g.fillTriangle(cx - 4, cy - 18, cx - 1, cy - 26, cx + 1, cy - 18);
        g.fillTriangle(cx + 3, cy - 17, cx + 6, cy - 24, cx + 7, cy - 16);
        g.fillStyle(0xFFCC44);
        g.fillTriangle(cx - 2, cy - 19, cx, cy - 24, cx + 1, cy - 19);
        g.fillTriangle(cx + 4, cy - 17, cx + 5, cy - 22, cx + 6, cy - 16);

        // Eyes - glowing fire orbs, no whites
        g.fillStyle(0xFF4400);
        g.fillEllipse(cx - 4, cy - 12, 3, 3);
        g.fillEllipse(cx + 4, cy - 12, 3, 3);
        g.fillStyle(0xFFCC00);
        g.fillCircle(cx - 4, cy - 12, 1);
        g.fillCircle(cx + 4, cy - 12, 1);

        // Mouth - fierce
        g.fillStyle(0xFFFF44);
        g.fillRect(cx - 3, cy - 8, 6, 1);

        // Ember particles
        g.fillStyle(0xFFCC00, 0.6);
        g.fillCircle(cx - 16, cy - 6, 1);
        g.fillCircle(cx + 14, cy - 16, 1.2);
        g.fillCircle(cx - 10, cy + 20, 0.8);
        g.fillCircle(cx + 18, cy + 2, 1);
        g.fillStyle(0xFF6600, 0.4);
        g.fillCircle(cx - 20, cy + 10, 1);
        g.fillCircle(cx + 8, cy - 22, 0.8);
        g.fillCircle(cx - 4, cy + 24, 1);

        break;
      }

      case 'lava-golem': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Lava drip beneath
        g.fillStyle(0xFF4400, 0.3);
        g.fillEllipse(cx - 4, cy + 26, 4, 2);
        g.fillEllipse(cx + 6, cy + 26, 3, 2);

        // Legs - thick rocky
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy + 14, 10, 14);
        g.fillRect(cx + 2, cy + 14, 10, 14);
        g.fillStyle(color);
        g.fillRect(cx - 11, cy + 14, 8, 13);
        g.fillRect(cx + 3, cy + 14, 8, 13);
        // Lava cracks on legs
        g.fillStyle(0xFF6600);
        g.fillRect(cx - 9, cy + 17, 1, 6);
        g.fillRect(cx - 6, cy + 20, 1, 4);
        g.fillRect(cx + 5, cy + 18, 1, 5);
        g.fillRect(cx + 8, cy + 16, 1, 7);
        g.fillStyle(0xFFAA00, 0.6);
        g.fillRect(cx - 9, cy + 18, 1, 3);
        g.fillRect(cx + 5, cy + 19, 1, 3);

        // Feet
        g.fillStyle(darker);
        g.fillEllipse(cx - 8, cy + 26, 12, 4);
        g.fillEllipse(cx + 6, cy + 26, 12, 4);

        // Body - massive rocky torso
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 2, 28, 26);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 2, 26, 24);

        // Rock texture - darker patches
        g.fillStyle(darker, 0.4);
        g.fillCircle(cx - 8, cy - 2, 4);
        g.fillCircle(cx + 6, cy + 4, 3);
        g.fillCircle(cx - 4, cy + 10, 3.5);
        g.fillCircle(cx + 10, cy - 4, 3);

        // Glowing lava cracks across body
        g.fillStyle(0xFF4400);
        g.fillCurvedLimb(cx - 10, cy - 4, 1, cx - 2, cy + 2, cx + 6, cy - 2, 1);
        g.fillCurvedLimb(cx - 6, cy + 6, 1, cx + 2, cy + 10, cx + 10, cy + 6, 1);
        g.fillCurvedLimb(cx - 8, cy + 12, 1.2, cx, cy + 14, cx + 8, cy + 10, 1);
        g.fillStyle(0xFF8800, 0.7);
        g.fillCurvedLimb(cx - 9, cy - 3, 0.6, cx - 2, cy + 2, cx + 5, cy - 1, 0.6);
        g.fillCurvedLimb(cx - 5, cy + 7, 0.6, cx + 2, cy + 10, cx + 9, cy + 7, 0.6);
        // Hot spots
        g.fillStyle(0xFFCC00, 0.5);
        g.fillCircle(cx - 2, cy + 2, 1.5);
        g.fillCircle(cx + 2, cy + 10, 1.5);
        g.fillCircle(cx + 8, cy - 2, 1);

        // Arms - heavy rocky limbs
        g.fillStyle(darker);
        g.fillLimb(cx - 14, cy - 2, 6, cx - 20, cy + 10, 5);
        g.fillLimb(cx + 14, cy - 2, 6, cx + 20, cy + 10, 5);
        g.fillStyle(color);
        g.fillLimb(cx - 14, cy - 2, 5, cx - 20, cy + 10, 4);
        g.fillLimb(cx + 14, cy - 2, 5, cx + 20, cy + 10, 4);

        // Arm lava cracks
        g.fillStyle(0xFF4400);
        g.fillRect(cx - 18, cy + 4, 1, 4);
        g.fillRect(cx + 18, cy + 2, 1, 5);
        g.fillStyle(0xFF8800, 0.5);
        g.fillCircle(cx - 17, cy + 6, 1);
        g.fillCircle(cx + 19, cy + 4, 1);

        // Fists
        g.fillStyle(darker);
        g.fillCircle(cx - 20, cy + 12, 5);
        g.fillCircle(cx + 20, cy + 12, 5);
        g.fillStyle(color);
        g.fillCircle(cx - 20, cy + 12, 4);
        g.fillCircle(cx + 20, cy + 12, 4);

        // Head - rocky, angular
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 14, 18, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 14, 16, 12);

        // Head lava crack
        g.fillStyle(0xFF4400);
        g.fillCurvedLimb(cx - 6, cy - 18, 0.8, cx, cy - 14, cx + 4, cy - 18, 0.8);
        g.fillStyle(0xFFAA00, 0.5);
        g.fillCircle(cx, cy - 15, 1);

        // Eyes - glowing lava
        g.fillStyle(0xFF2200);
        g.fillEllipse(cx - 5, cy - 16, 5, 4);
        g.fillEllipse(cx + 5, cy - 16, 5, 4);
        g.fillStyle(0xFF6600);
        g.fillEllipse(cx - 5, cy - 16, 3, 2.5);
        g.fillEllipse(cx + 5, cy - 16, 3, 2.5);
        g.fillStyle(0xFFCC00);
        g.fillCircle(cx - 5, cy - 16, 1);
        g.fillCircle(cx + 5, cy - 16, 1);

        // Mouth crack
        g.fillStyle(0xFF4400);
        g.fillRect(cx - 5, cy - 10, 10, 2);
        g.fillStyle(0xFFAA00, 0.6);
        g.fillRect(cx - 4, cy - 10, 8, 1);

        // Heat shimmer / lava glow
        g.fillStyle(0xFF4400, 0.08);
        g.fillCircle(cx, cy, 30);

        break;
      }

      case 'lich': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Robe base - grand flowing
        g.fillStyle(darker);
        g.fillTriangle(cx - 20, cy + 26, cx, cy - 4, cx + 20, cy + 26);
        g.fillStyle(color);
        g.fillTriangle(cx - 18, cy + 26, cx, cy - 2, cx + 18, cy + 26);

        // Robe bottom ornate edge
        g.fillStyle(0x44AA44);
        g.fillRect(cx - 18, cy + 24, 36, 2);
        g.fillStyle(0x55CC55);
        g.fillRect(cx - 16, cy + 24, 32, 1);

        // Robe fold shadows
        g.fillStyle(darker, 0.4);
        g.fillTriangle(cx - 6, cy, cx - 12, cy + 24, cx - 2, cy + 24);
        g.fillTriangle(cx + 6, cy, cx + 12, cy + 24, cx + 2, cy + 24);

        // Robe highlight
        g.fillStyle(lighter, 0.2);
        g.fillTriangle(cx, cy - 2, cx - 4, cy + 22, cx + 4, cy + 22);

        // Green arcane symbols on robe
        g.fillStyle(0x44DD44, 0.3);
        g.fillCircle(cx, cy + 12, 3);
        g.fillStyle(0x44DD44, 0.2);
        g.strokeCircle(cx, cy + 12, 4);
        g.fillCircle(cx - 6, cy + 18, 1.5);
        g.fillCircle(cx + 6, cy + 18, 1.5);

        // Staff - left side
        g.fillStyle(0x443322);
        g.fillRect(cx - 18, cy - 24, 2, 50);
        g.fillStyle(0x332211);
        g.fillRect(cx - 18, cy - 24, 1, 50);

        // Staff top - skull ornament
        g.fillStyle(0xBBAA99);
        g.fillCircle(cx - 17, cy - 26, 4);
        g.fillStyle(0xCCBBAA);
        g.fillCircle(cx - 17, cy - 27, 3);
        // Tiny skull eyes
        g.fillStyle(0x00FF44);
        g.fillCircle(cx - 18, cy - 27, 1);
        g.fillCircle(cx - 16, cy - 27, 1);

        // Green flame on staff
        g.fillStyle(0x22CC22, 0.7);
        g.fillTriangle(cx - 21, cy - 30, cx - 17, cy - 38, cx - 13, cy - 30);
        g.fillStyle(0x44FF44, 0.5);
        g.fillTriangle(cx - 20, cy - 30, cx - 17, cy - 36, cx - 14, cy - 30);
        g.fillStyle(0x88FF88, 0.4);
        g.fillTriangle(cx - 19, cy - 30, cx - 17, cy - 34, cx - 15, cy - 30);
        // Flame glow
        g.fillStyle(0x00FF44, 0.15);
        g.fillCircle(cx - 17, cy - 32, 8);

        // Left arm holding staff
        g.fillStyle(color);
        g.fillLimb(cx - 10, cy + 2, 3, cx - 17, cy + 6, 2);
        g.fillStyle(0x998877);
        g.fillCircle(cx - 17, cy + 6, 2.5);

        // Right arm - casting
        g.fillStyle(color);
        g.fillLimb(cx + 10, cy + 2, 3, cx + 18, cy + 8, 2);
        g.fillStyle(0x998877);
        g.fillCircle(cx + 18, cy + 8, 2.5);
        // Bony fingers
        g.fillStyle(0xAA9988);
        g.fillLimb(cx + 18, cy + 8, 1.5, cx + 22, cy + 6, 0.5);
        g.fillLimb(cx + 18, cy + 8, 1.5, cx + 23, cy + 8, 0.5);
        g.fillLimb(cx + 18, cy + 8, 1.5, cx + 22, cy + 10, 0.5);

        // Green energy from right hand
        g.fillStyle(0x44FF44, 0.3);
        g.fillCircle(cx + 22, cy + 8, 3);
        g.fillStyle(0x88FF88, 0.2);
        g.fillCircle(cx + 22, cy + 8, 5);

        // Hood
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 22, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 20, 18);

        // Hood inner
        g.fillStyle(0x111111);
        g.fillEllipse(cx, cy - 10, 14, 12);

        // Skeletal face visible in hood
        g.fillStyle(0x998877);
        g.fillEllipse(cx, cy - 10, 10, 10);
        g.fillStyle(0xAA9988);
        g.fillEllipse(cx, cy - 12, 8, 7);

        // Eye sockets
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 3, cy - 12, 4, 4);
        g.fillEllipse(cx + 3, cy - 12, 4, 4);
        // Glowing green eyes
        g.fillStyle(0x00FF44);
        g.fillCircle(cx - 3, cy - 12, 1.5);
        g.fillCircle(cx + 3, cy - 12, 1.5);
        g.fillStyle(0x44FF88);
        g.fillCircle(cx - 3, cy - 13, 0.8);
        g.fillCircle(cx + 3, cy - 13, 0.8);
        g.fillStyle(0x00FF44, 0.3);
        g.fillCircle(cx - 3, cy - 12, 3);
        g.fillCircle(cx + 3, cy - 12, 3);

        // Nose cavity
        g.fillStyle(0x111111);
        g.fillTriangle(cx - 1, cy - 8, cx + 1, cy - 8, cx, cy - 6);

        // Jaw / teeth
        g.fillStyle(0x887766);
        g.fillRect(cx - 4, cy - 5, 8, 2);
        g.fillStyle(0xAA9988);
        g.fillRect(cx - 3, cy - 5, 1, 2);
        g.fillRect(cx - 1, cy - 5, 1, 2);
        g.fillRect(cx + 1, cy - 5, 1, 2);
        g.fillRect(cx + 3, cy - 5, 1, 2);

        // Crown
        g.fillStyle(0xBB8800);
        g.fillRect(cx - 8, cy - 20, 16, 3);
        g.fillStyle(0xDDAA00);
        g.fillRect(cx - 7, cy - 20, 14, 2);
        // Crown points
        g.fillStyle(0xBB8800);
        g.fillTriangle(cx - 7, cy - 20, cx - 5, cy - 24, cx - 3, cy - 20);
        g.fillTriangle(cx - 2, cy - 20, cx, cy - 26, cx + 2, cy - 20);
        g.fillTriangle(cx + 3, cy - 20, cx + 5, cy - 24, cx + 7, cy - 20);
        g.fillStyle(0xDDAA00);
        g.fillTriangle(cx - 6, cy - 20, cx - 5, cy - 23, cx - 4, cy - 20);
        g.fillTriangle(cx - 1, cy - 20, cx, cy - 25, cx + 1, cy - 20);
        g.fillTriangle(cx + 4, cy - 20, cx + 5, cy - 23, cx + 6, cy - 20);
        // Gems in crown
        g.fillStyle(0x00FF44);
        g.fillCircle(cx, cy - 20, 1.5);
        g.fillStyle(0xFF0044);
        g.fillCircle(cx - 5, cy - 20, 1);
        g.fillCircle(cx + 5, cy - 20, 1);

        // Dark energy particles
        g.fillStyle(0x00FF44, 0.4);
        g.fillCircle(cx - 14, cy - 4, 1);
        g.fillCircle(cx + 14, cy - 18, 1.2);
        g.fillCircle(cx - 22, cy + 14, 0.8);
        g.fillStyle(0x88FF88, 0.2);
        g.fillCircle(cx + 10, cy + 20, 1);
        g.fillCircle(cx - 8, cy - 22, 0.8);

        break;
      }
      case 'flame-titan': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 40, 10);

        // Leg flames - left
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy + 14, 8, 14);
        g.fillStyle(color);
        g.fillRect(cx - 11, cy + 15, 6, 12);
        // Leg flames - right
        g.fillStyle(darker);
        g.fillRect(cx + 4, cy + 14, 8, 14);
        g.fillStyle(color);
        g.fillRect(cx + 5, cy + 15, 6, 12);

        // Molten core body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 2, 28, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 2, 26, 20);
        // Inner glow
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 4, 18, 14);
        g.fillStyle(lightest);
        g.fillEllipse(cx, cy + 5, 10, 8);

        // Lava cracks on body
        g.fillStyle(lightest);
        g.fillRect(cx - 8, cy - 2, 2, 6);
        g.fillRect(cx + 6, cy, 2, 5);
        g.fillRect(cx - 3, cy + 6, 3, 2);

        // Burning shoulders - left
        g.fillStyle(darker);
        g.fillCircle(cx - 16, cy - 4, 8);
        g.fillStyle(color);
        g.fillCircle(cx - 16, cy - 4, 7);
        g.fillStyle(lighter);
        g.fillCircle(cx - 16, cy - 5, 4);
        // Shoulder flame left
        g.fillStyle(lightest);
        g.fillTriangle(cx - 20, cy - 10, cx - 16, cy - 18, cx - 12, cy - 10);
        g.fillStyle(lighter);
        g.fillTriangle(cx - 18, cy - 10, cx - 16, cy - 15, cx - 14, cy - 10);

        // Burning shoulders - right
        g.fillStyle(darker);
        g.fillCircle(cx + 16, cy - 4, 8);
        g.fillStyle(color);
        g.fillCircle(cx + 16, cy - 4, 7);
        g.fillStyle(lighter);
        g.fillCircle(cx + 16, cy - 5, 4);
        // Shoulder flame right
        g.fillStyle(lightest);
        g.fillTriangle(cx + 12, cy - 10, cx + 16, cy - 18, cx + 20, cy - 10);
        g.fillStyle(lighter);
        g.fillTriangle(cx + 14, cy - 10, cx + 16, cy - 15, cx + 18, cy - 10);

        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 18, 16);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 16, 14);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 11, 12, 10);

        // Molten crown
        g.fillStyle(lightest);
        g.fillTriangle(cx - 10, cy - 18, cx - 7, cy - 26, cx - 4, cy - 18);
        g.fillTriangle(cx - 4, cy - 19, cx, cy - 28, cx + 4, cy - 19);
        g.fillTriangle(cx + 4, cy - 18, cx + 7, cy - 26, cx + 10, cy - 18);
        g.fillStyle(lighter);
        g.fillTriangle(cx - 8, cy - 18, cx - 6, cy - 23, cx - 4, cy - 18);
        g.fillTriangle(cx - 3, cy - 19, cx, cy - 25, cx + 3, cy - 19);
        g.fillTriangle(cx + 4, cy - 18, cx + 6, cy - 23, cx + 8, cy - 18);

        // Eyes - menacing glow, no whites
        g.fillStyle(lightest);
        g.fillEllipse(cx - 5, cy - 13, 4, 2);
        g.fillEllipse(cx + 5, cy - 13, 4, 2);
        g.fillStyle(darker);
        g.fillCircle(cx - 5, cy - 13, 1);
        g.fillCircle(cx + 5, cy - 13, 1);

        // Mouth - fiery grin
        g.fillStyle(darker);
        g.fillRect(cx - 4, cy - 8, 8, 2);
        g.fillStyle(lightest);
        g.fillRect(cx - 3, cy - 8, 6, 1);

        // Glowing fists - left
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 16, cy, 4, cx - 22, cy + 6, cx - 20, cy + 12, 5);
        g.fillStyle(lightest);
        g.fillCircle(cx - 20, cy + 12, 4);
        g.fillStyle(lighter);
        g.fillCircle(cx - 20, cy + 12, 3);

        // Glowing fists - right
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 16, cy, 4, cx + 22, cy + 6, cx + 20, cy + 12, 5);
        g.fillStyle(lightest);
        g.fillCircle(cx + 20, cy + 12, 4);
        g.fillStyle(lighter);
        g.fillCircle(cx + 20, cy + 12, 3);

        // Rising flames around body
        g.fillStyle(color, 0.6);
        g.fillTriangle(cx - 14, cy + 10, cx - 12, cy - 2, cx - 10, cy + 10);
        g.fillTriangle(cx + 10, cy + 10, cx + 12, cy - 2, cx + 14, cy + 10);
        g.fillStyle(lightest, 0.4);
        g.fillTriangle(cx - 6, cy + 14, cx - 4, cy + 4, cx - 2, cy + 14);
        g.fillTriangle(cx + 2, cy + 14, cx + 4, cy + 4, cx + 6, cy + 14);
        break;
      }

      case 'lava-wyrm': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Coiled serpent body - lower coil
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 18, cy + 22, 7, cx, cy + 26, cx - 16, cy + 18, 7);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 17, cy + 21, 6, cx, cy + 25, cx - 15, cy + 17, 6);
        // Lava glow on lower coil
        g.fillStyle(lighter);
        g.fillCurvedLimb(cx + 16, cy + 20, 3, cx, cy + 24, cx - 14, cy + 16, 3);

        // Middle coil
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 16, cy + 14, 7, cx - 4, cy + 10, cx + 14, cy + 12, 7);
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 15, cy + 13, 6, cx - 3, cy + 9, cx + 13, cy + 11, 6);
        g.fillStyle(lighter);
        g.fillCurvedLimb(cx - 14, cy + 12, 3, cx - 2, cy + 8, cx + 12, cy + 10, 3);

        // Upper coil / neck rising
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 10, cy + 8, 7, cx + 6, cy, cx, cy - 6, 6);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 9, cy + 7, 6, cx + 5, cy - 1, cx, cy - 6, 5);
        g.fillStyle(lighter);
        g.fillCurvedLimb(cx + 8, cy + 6, 3, cx + 4, cy - 2, cx, cy - 7, 2);

        // Lava cracks on coils
        g.fillStyle(lightest);
        g.fillRect(cx - 8, cy + 18, 2, 3);
        g.fillRect(cx + 6, cy + 12, 2, 3);
        g.fillRect(cx - 2, cy + 10, 3, 2);
        g.fillRect(cx + 10, cy + 20, 2, 2);

        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 14, 16, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 14, 14, 12);

        // Head crest / fire mane
        g.fillStyle(lighter);
        g.fillTriangle(cx - 8, cy - 18, cx - 6, cy - 28, cx - 2, cy - 18);
        g.fillTriangle(cx - 3, cy - 19, cx, cy - 30, cx + 3, cy - 19);
        g.fillTriangle(cx + 2, cy - 18, cx + 6, cy - 28, cx + 8, cy - 18);
        g.fillStyle(lightest);
        g.fillTriangle(cx - 6, cy - 18, cx - 5, cy - 25, cx - 3, cy - 18);
        g.fillTriangle(cx - 2, cy - 19, cx, cy - 27, cx + 2, cy - 19);
        g.fillTriangle(cx + 3, cy - 18, cx + 5, cy - 25, cx + 6, cy - 18);

        // Side flame mane
        g.fillStyle(lighter);
        g.fillTriangle(cx - 9, cy - 16, cx - 16, cy - 20, cx - 8, cy - 12);
        g.fillTriangle(cx + 9, cy - 16, cx + 16, cy - 20, cx + 8, cy - 12);

        // Glowing eyes - fierce, no whites
        g.fillStyle(lightest);
        g.fillEllipse(cx - 4, cy - 15, 4, 2);
        g.fillEllipse(cx + 4, cy - 15, 4, 2);
        g.fillStyle(darker);
        g.fillEllipse(cx - 4, cy - 15, 1, 2);
        g.fillEllipse(cx + 4, cy - 15, 1, 2);

        // Nostrils
        g.fillStyle(darker);
        g.fillRect(cx - 3, cy - 10, 2, 1);
        g.fillRect(cx + 1, cy - 10, 2, 1);

        // Open mouth with fangs
        g.fillStyle(darker);
        g.fillRect(cx - 5, cy - 8, 10, 3);
        g.fillStyle(lightest);
        g.fillRect(cx - 4, cy - 8, 8, 2);
        // Fangs
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx - 4, cy - 8, cx - 3, cy - 5, cx - 2, cy - 8);
        g.fillTriangle(cx + 2, cy - 8, cx + 3, cy - 5, cx + 4, cy - 8);

        // Tail tip with flame
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 18, cy + 22, 5, cx + 24, cy + 18, cx + 26, cy + 14, 3);
        g.fillStyle(lighter);
        g.fillTriangle(cx + 24, cy + 14, cx + 28, cy + 8, cx + 22, cy + 10);
        g.fillStyle(lightest);
        g.fillTriangle(cx + 25, cy + 14, cx + 27, cy + 10, cx + 23, cy + 12);

        // Belly highlights on coils
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 2, cy + 22, 8, 3);
        g.fillEllipse(cx, cy + 10, 8, 3);
        break;
      }

      case 'chimera': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Hind legs
        g.fillStyle(darker);
        g.fillRect(cx - 14, cy + 16, 6, 12);
        g.fillRect(cx + 8, cy + 16, 6, 12);
        g.fillStyle(color);
        g.fillRect(cx - 13, cy + 17, 4, 10);
        g.fillRect(cx + 9, cy + 17, 4, 10);
        // Hooves (goat legs)
        g.fillStyle(0x444444);
        g.fillRect(cx - 14, cy + 26, 6, 2);
        g.fillRect(cx + 8, cy + 26, 6, 2);

        // Main body (lion-like)
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 8, 30, 18);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 8, 28, 16);
        // Belly highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 12, 20, 8);
        g.fillStyle(lightest);
        g.fillEllipse(cx, cy + 13, 12, 4);

        // Front legs
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy + 14, 5, 14);
        g.fillRect(cx + 7, cy + 14, 5, 14);
        g.fillStyle(color);
        g.fillRect(cx - 11, cy + 15, 3, 12);
        g.fillRect(cx + 8, cy + 15, 3, 12);
        // Paws
        g.fillStyle(lighter);
        g.fillRect(cx - 13, cy + 26, 7, 2);
        g.fillRect(cx + 6, cy + 26, 7, 2);

        // Serpent tail (right side, curving up)
        g.fillStyle(0x448844);
        g.fillCurvedLimb(cx + 14, cy + 6, 4, cx + 22, cy, cx + 24, cy - 8, 3);
        g.fillCurvedLimb(cx + 24, cy - 8, 3, cx + 22, cy - 14, cx + 20, cy - 16, 2);
        // Snake head on tail
        g.fillStyle(0x336633);
        g.fillCircle(cx + 20, cy - 16, 3);
        g.fillStyle(0xFF4444);
        g.fillCircle(cx + 19, cy - 17, 1);
        // Forked tongue
        g.fillStyle(0xFF4444);
        g.fillRect(cx + 17, cy - 17, 2, 1);

        // Ram/goat head (left side)
        g.fillStyle(darker);
        g.fillEllipse(cx - 14, cy - 6, 12, 10);
        g.fillStyle(color);
        g.fillEllipse(cx - 14, cy - 6, 10, 8);
        // Ram horns
        g.fillStyle(0xCCCCAA);
        g.fillCurvedLimb(cx - 18, cy - 10, 2, cx - 22, cy - 14, cx - 20, cy - 4, 1);
        g.fillCurvedLimb(cx - 10, cy - 10, 2, cx - 6, cy - 14, cx - 8, cy - 4, 1);
        // Ram eye - yellow, narrow
        g.fillStyle(0xCCAA00);
        g.fillEllipse(cx - 14, cy - 7, 2, 1.5);
        g.fillStyle(0x000000);
        g.fillEllipse(cx - 14, cy - 7, 0.5, 1.5);
        // Ram mouth
        g.fillStyle(darker);
        g.fillRect(cx - 17, cy - 3, 6, 1);

        // Lion head (center, main)
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 10, 16, 14);
        // Mane
        g.fillStyle(darker);
        g.fillCircle(cx - 6, cy - 14, 4);
        g.fillCircle(cx, cy - 16, 4);
        g.fillCircle(cx + 6, cy - 14, 4);
        g.fillCircle(cx - 8, cy - 10, 3);
        g.fillCircle(cx + 8, cy - 10, 3);
        // Face
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 10, 12, 10);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 8, 8, 6);

        // Lion eyes - fierce, no whites
        g.fillStyle(0xDD6600);
        g.fillEllipse(cx - 3, cy - 12, 2, 1.5);
        g.fillEllipse(cx + 3, cy - 12, 2, 1.5);
        g.fillStyle(0x000000);
        g.fillCircle(cx - 3, cy - 12, 0.5);
        g.fillCircle(cx + 3, cy - 12, 0.5);

        // Lion nose
        g.fillStyle(darker);
        g.fillTriangle(cx - 1, cy - 8, cx, cy - 6, cx + 1, cy - 8);

        // Lion mouth - roaring
        g.fillStyle(darker);
        g.fillRect(cx - 4, cy - 6, 8, 3);
        g.fillStyle(0xCC4444);
        g.fillRect(cx - 3, cy - 6, 6, 2);
        // Fangs
        g.fillStyle(0xFFFFFF);
        g.fillRect(cx - 3, cy - 6, 1, 2);
        g.fillRect(cx + 2, cy - 6, 1, 2);

        // Wings (bat-like)
        g.fillStyle(darker, 0.7);
        g.fillTriangle(cx - 14, cy - 2, cx - 28, cy - 14, cx - 20, cy + 4);
        g.fillTriangle(cx + 14, cy - 2, cx + 28, cy - 14, cx + 20, cy + 4);
        g.fillStyle(color, 0.5);
        g.fillTriangle(cx - 13, cy - 1, cx - 26, cy - 12, cx - 19, cy + 3);
        g.fillTriangle(cx + 13, cy - 1, cx + 26, cy - 12, cx + 19, cy + 3);
        break;
      }

      case 'demon': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Folded wings behind body
        g.fillStyle(darker, 0.8);
        g.fillTriangle(cx - 10, cy - 4, cx - 26, cy - 18, cx - 18, cy + 12);
        g.fillTriangle(cx + 10, cy - 4, cx + 26, cy - 18, cx + 18, cy + 12);
        g.fillStyle(darker, 0.6);
        g.fillTriangle(cx - 12, cy - 2, cx - 28, cy - 14, cx - 20, cy + 10);
        g.fillTriangle(cx + 12, cy - 2, cx + 28, cy - 14, cx + 20, cy + 10);
        // Wing membrane lines
        g.fillStyle(color, 0.4);
        g.fillRect(cx - 22, cy - 8, 1, 12);
        g.fillRect(cx - 18, cy - 12, 1, 14);
        g.fillRect(cx + 22, cy - 8, 1, 12);
        g.fillRect(cx + 18, cy - 12, 1, 14);

        // Legs
        g.fillStyle(darker);
        g.fillRect(cx - 10, cy + 14, 7, 14);
        g.fillRect(cx + 3, cy + 14, 7, 14);
        g.fillStyle(color);
        g.fillRect(cx - 9, cy + 15, 5, 12);
        g.fillRect(cx + 4, cy + 15, 5, 12);
        // Hooved feet
        g.fillStyle(0x333333);
        g.fillRect(cx - 11, cy + 26, 9, 2);
        g.fillRect(cx + 2, cy + 26, 9, 2);

        // Muscular torso
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 4, 24, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 4, 22, 18);
        // Chest muscles
        g.fillStyle(lighter);
        g.fillEllipse(cx - 4, cy, 8, 6);
        g.fillEllipse(cx + 4, cy, 8, 6);
        // Abs
        g.fillStyle(darker, 0.3);
        g.fillRect(cx - 1, cy + 2, 2, 10);
        g.fillRect(cx - 6, cy + 4, 12, 1);
        g.fillRect(cx - 5, cy + 8, 10, 1);

        // Arms - muscular
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 12, cy, 5, cx - 18, cy + 6, cx - 16, cy + 14, 4);
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 11, cy + 1, 4, cx - 17, cy + 6, cx - 15, cy + 13, 3);

        // Weapon (trident/spear) in right hand
        g.fillStyle(0x888888);
        g.fillRect(cx + 18, cy - 20, 2, 36);
        // Trident head
        g.fillStyle(0xAAAAAA);
        g.fillTriangle(cx + 15, cy - 18, cx + 19, cy - 26, cx + 19, cy - 18);
        g.fillTriangle(cx + 19, cy - 18, cx + 19, cy - 28, cx + 19, cy - 18);
        g.fillTriangle(cx + 19, cy - 18, cx + 19, cy - 26, cx + 23, cy - 18);
        g.fillStyle(0xCCCCCC);
        g.fillRect(cx + 18, cy - 26, 2, 8);

        // Right arm holding weapon
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 12, cy, 5, cx + 18, cy + 4, cx + 17, cy + 10, 4);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 11, cy + 1, 4, cx + 17, cy + 4, cx + 16, cy + 9, 3);

        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 16, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 14, 12);

        // Horns
        g.fillStyle(0x444444);
        g.fillCurvedLimb(cx - 6, cy - 18, 3, cx - 12, cy - 24, cx - 10, cy - 28, 1);
        g.fillCurvedLimb(cx + 6, cy - 18, 3, cx + 12, cy - 24, cx + 10, cy - 28, 1);
        g.fillStyle(0x666666);
        g.fillCurvedLimb(cx - 6, cy - 18, 2, cx - 11, cy - 23, cx - 9, cy - 27, 1);
        g.fillCurvedLimb(cx + 6, cy - 18, 2, cx + 11, cy - 23, cx + 9, cy - 27, 1);

        // Face details
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 10, 10, 6);

        // Evil eyes - glowing, no whites
        g.fillStyle(0xFF0000);
        g.fillEllipse(cx - 4, cy - 13, 3, 2);
        g.fillEllipse(cx + 4, cy - 13, 3, 2);
        g.fillStyle(0xFFFF00);
        g.fillCircle(cx - 4, cy - 13, 1);
        g.fillCircle(cx + 4, cy - 13, 1);
        // Glow effect
        g.fillStyle(0xFF0000, 0.2);
        g.fillCircle(cx - 4, cy - 13, 4);
        g.fillCircle(cx + 4, cy - 13, 4);

        // Fanged grin
        g.fillStyle(darker);
        g.fillRect(cx - 5, cy - 8, 10, 3);
        g.fillStyle(0x880000);
        g.fillRect(cx - 4, cy - 8, 8, 2);
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx - 4, cy - 8, cx - 3, cy - 5, cx - 2, cy - 8);
        g.fillTriangle(cx + 2, cy - 8, cx + 3, cy - 5, cx + 4, cy - 8);

        // Tail
        g.fillStyle(darker);
        g.fillCurvedLimb(cx, cy + 14, 3, cx - 14, cy + 20, cx - 18, cy + 16, 2);
        // Tail tip - arrow
        g.fillStyle(color);
        g.fillTriangle(cx - 20, cy + 12, cx - 18, cy + 16, cx - 16, cy + 12);
        break;
      }

      case 'shadow': {
        // Ground shadow (darker for shadow creature)
        g.fillStyle(0x000000, 0.4);
        g.fillEllipse(cx, cy + 27, 38, 10);

        // Wispy base tendrils merging with ground
        g.fillStyle(darker, 0.5);
        g.fillTriangle(cx - 18, cy + 26, cx - 14, cy + 10, cx - 10, cy + 26);
        g.fillTriangle(cx - 8, cy + 26, cx - 4, cy + 8, cx, cy + 26);
        g.fillTriangle(cx + 2, cy + 26, cx + 6, cy + 8, cx + 10, cy + 26);
        g.fillTriangle(cx + 12, cy + 26, cx + 16, cy + 10, cx + 20, cy + 26);

        // Main amorphous body
        g.fillStyle(darker, 0.8);
        g.fillEllipse(cx, cy + 6, 28, 24);
        g.fillStyle(color, 0.7);
        g.fillEllipse(cx, cy + 4, 24, 20);
        g.fillStyle(darker, 0.5);
        g.fillEllipse(cx - 2, cy + 6, 18, 16);

        // Inner dark void
        g.fillStyle(0x000000, 0.4);
        g.fillEllipse(cx, cy + 4, 14, 12);

        // Upper wispy tendrils
        g.fillStyle(darker, 0.6);
        g.fillTriangle(cx - 12, cy - 8, cx - 16, cy - 22, cx - 8, cy - 10);
        g.fillTriangle(cx - 4, cy - 10, cx - 2, cy - 26, cx + 2, cy - 12);
        g.fillTriangle(cx + 6, cy - 8, cx + 10, cy - 24, cx + 12, cy - 10);
        g.fillStyle(color, 0.4);
        g.fillTriangle(cx - 10, cy - 8, cx - 14, cy - 20, cx - 8, cy - 10);
        g.fillTriangle(cx - 2, cy - 10, cx, cy - 22, cx + 2, cy - 12);
        g.fillTriangle(cx + 8, cy - 8, cx + 10, cy - 20, cx + 12, cy - 10);

        // Side tendrils (arms/wisps)
        g.fillStyle(darker, 0.6);
        g.fillCurvedLimb(cx - 14, cy + 2, 4, cx - 22, cy - 2, cx - 26, cy + 4, 2);
        g.fillCurvedLimb(cx + 14, cy + 2, 4, cx + 22, cy - 2, cx + 26, cy + 4, 2);
        g.fillStyle(color, 0.4);
        g.fillCurvedLimb(cx - 14, cy + 4, 3, cx - 20, cy, cx - 24, cy + 6, 1);
        g.fillCurvedLimb(cx + 14, cy + 4, 3, cx + 20, cy, cx + 24, cy + 6, 1);

        // Glowing eyes - eerie, no whites
        g.fillStyle(lighter);
        g.fillEllipse(cx - 6, cy - 2, 4, 2);
        g.fillEllipse(cx + 6, cy - 2, 4, 2);
        g.fillStyle(lightest);
        g.fillCircle(cx - 6, cy - 2, 1);
        g.fillCircle(cx + 6, cy - 2, 1);
        // Eye glow effect
        g.fillStyle(lighter, 0.2);
        g.fillCircle(cx - 6, cy - 2, 5);
        g.fillCircle(cx + 6, cy - 2, 5);

        // Sinister mouth
        g.fillStyle(lighter, 0.6);
        g.fillRect(cx - 6, cy + 4, 12, 2);
        g.fillStyle(lightest, 0.4);
        g.fillRect(cx - 4, cy + 4, 8, 1);

        // Floating particles/wisps around body
        g.fillStyle(lighter, 0.4);
        g.fillCircle(cx - 18, cy - 6, 2);
        g.fillCircle(cx + 20, cy - 4, 1);
        g.fillCircle(cx - 10, cy - 16, 1);
        g.fillCircle(cx + 14, cy - 14, 2);
        g.fillCircle(cx + 4, cy - 18, 1);
        g.fillStyle(lightest, 0.3);
        g.fillCircle(cx - 20, cy + 10, 1);
        g.fillCircle(cx + 22, cy + 8, 1);
        break;
      }

      case 'demon-king': {
        // Ground shadow - grand
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(cx, cy + 27, 42, 10);

        // Cape/robe flowing behind - wide and majestic
        g.fillStyle(darker, 0.9);
        g.fillTriangle(cx - 28, cy + 26, cx - 10, cy - 4, cx - 6, cy + 26);
        g.fillTriangle(cx + 28, cy + 26, cx + 10, cy - 4, cx + 6, cy + 26);
        g.fillStyle(darker, 0.7);
        g.fillTriangle(cx - 26, cy + 26, cx - 8, cy, cx - 4, cy + 26);
        g.fillTriangle(cx + 26, cy + 26, cx + 8, cy, cx + 4, cy + 26);
        // Cape inner highlight
        g.fillStyle(color, 0.3);
        g.fillTriangle(cx - 22, cy + 26, cx - 8, cy + 4, cx - 6, cy + 26);
        g.fillTriangle(cx + 22, cy + 26, cx + 8, cy + 4, cx + 6, cy + 26);

        // Throne-like shoulder guards
        g.fillStyle(0x888833);
        g.fillRect(cx - 22, cy - 6, 10, 4);
        g.fillRect(cx + 12, cy - 6, 10, 4);
        g.fillStyle(0xAAAA44);
        g.fillRect(cx - 21, cy - 5, 8, 2);
        g.fillRect(cx + 13, cy - 5, 8, 2);
        // Shoulder spikes
        g.fillStyle(0x888833);
        g.fillTriangle(cx - 22, cy - 6, cx - 24, cy - 14, cx - 18, cy - 6);
        g.fillTriangle(cx + 22, cy - 6, cx + 24, cy - 14, cx + 18, cy - 6);

        // Grand body / torso armor
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 6, 26, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 6, 24, 20);
        // Chest plate
        g.fillStyle(0x888833);
        g.fillEllipse(cx, cy + 2, 16, 12);
        g.fillStyle(0xAAAA44);
        g.fillEllipse(cx, cy + 2, 12, 8);
        // Gem on chest
        g.fillStyle(0xFF2222);
        g.fillCircle(cx, cy + 2, 3);
        g.fillStyle(0xFF6666);
        g.fillCircle(cx - 1, cy + 1, 1);

        // Legs / robe bottom
        g.fillStyle(darker);
        g.fillRect(cx - 10, cy + 16, 20, 12);
        g.fillStyle(color);
        g.fillRect(cx - 9, cy + 17, 18, 10);
        // Robe trim
        g.fillStyle(0x888833);
        g.fillRect(cx - 10, cy + 25, 20, 2);

        // Arms
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 14, cy + 2, 5, cx - 20, cy + 8, cx - 18, cy + 16, 4);
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 13, cy + 3, 4, cx - 19, cy + 8, cx - 17, cy + 15, 3);
        // Right arm raised with scepter
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 14, cy + 2, 5, cx + 20, cy - 4, cx + 18, cy - 10, 4);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 13, cy + 3, 4, cx + 19, cy - 3, cx + 17, cy - 9, 3);

        // Scepter
        g.fillStyle(0x888833);
        g.fillRect(cx + 17, cy - 22, 2, 18);
        g.fillStyle(0xAAAA44);
        g.fillCircle(cx + 18, cy - 22, 3);
        g.fillStyle(0xFF4444);
        g.fillCircle(cx + 18, cy - 22, 2);
        g.fillStyle(0xFF8888);
        g.fillCircle(cx + 17, cy - 23, 1);

        // Grand head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 14, 18, 16);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 14, 16, 14);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 12, 12, 8);

        // Grand crown
        g.fillStyle(0x888833);
        g.fillRect(cx - 10, cy - 20, 20, 4);
        g.fillStyle(0xAAAA44);
        g.fillRect(cx - 9, cy - 19, 18, 2);
        // Crown spires
        g.fillStyle(0x888833);
        g.fillTriangle(cx - 10, cy - 20, cx - 8, cy - 28, cx - 6, cy - 20);
        g.fillTriangle(cx - 3, cy - 20, cx, cy - 30, cx + 3, cy - 20);
        g.fillTriangle(cx + 6, cy - 20, cx + 8, cy - 28, cx + 10, cy - 20);
        // Crown gems
        g.fillStyle(0xFF2222);
        g.fillCircle(cx - 7, cy - 24, 1);
        g.fillCircle(cx, cy - 26, 2);
        g.fillCircle(cx + 7, cy - 24, 1);
        g.fillStyle(0xFF6666);
        g.fillCircle(cx, cy - 27, 1);

        // Horns behind crown
        g.fillStyle(0x555555);
        g.fillCurvedLimb(cx - 10, cy - 18, 3, cx - 18, cy - 24, cx - 16, cy - 28, 1);
        g.fillCurvedLimb(cx + 10, cy - 18, 3, cx + 18, cy - 24, cx + 16, cy - 28, 1);

        // Menacing eyes - fierce glow, no highlights
        g.fillStyle(0xFF0000);
        g.fillEllipse(cx - 4, cy - 15, 4, 2);
        g.fillEllipse(cx + 4, cy - 15, 4, 2);
        g.fillStyle(0xFFFF00);
        g.fillEllipse(cx - 4, cy - 15, 2, 1);
        g.fillEllipse(cx + 4, cy - 15, 2, 1);
        // Eye glow
        g.fillStyle(0xFF0000, 0.2);
        g.fillCircle(cx - 4, cy - 15, 5);
        g.fillCircle(cx + 4, cy - 15, 5);

        // Stern mouth
        g.fillStyle(darker);
        g.fillRect(cx - 4, cy - 9, 8, 2);
        g.fillStyle(0xFFFFFF);
        g.fillRect(cx - 3, cy - 9, 1, 2);
        g.fillRect(cx + 2, cy - 9, 1, 2);

        // Aura effect
        g.fillStyle(lighter, 0.15);
        g.fillCircle(cx, cy, 30);
        g.fillStyle(color, 0.1);
        g.fillCircle(cx, cy, 28);
        break;
      }

      case 'sword-wraith': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 34, 8);

        // Ethereal glow aura
        g.fillStyle(lighter, 0.1);
        g.fillCircle(cx, cy, 28);
        g.fillStyle(color, 0.08);
        g.fillCircle(cx, cy + 2, 26);

        // Ghostly wispy bottom (no legs - floating)
        g.fillStyle(color, 0.4);
        g.fillTriangle(cx - 12, cy + 14, cx - 8, cy + 26, cx - 4, cy + 14);
        g.fillTriangle(cx - 6, cy + 14, cx - 2, cy + 28, cx + 2, cy + 14);
        g.fillTriangle(cx, cy + 14, cx + 4, cy + 26, cx + 8, cy + 14);
        g.fillTriangle(cx + 6, cy + 14, cx + 10, cy + 28, cx + 14, cy + 14);
        g.fillStyle(lighter, 0.3);
        g.fillTriangle(cx - 10, cy + 14, cx - 6, cy + 24, cx - 4, cy + 14);
        g.fillTriangle(cx - 2, cy + 14, cx + 2, cy + 24, cx + 6, cy + 14);
        g.fillTriangle(cx + 6, cy + 14, cx + 10, cy + 24, cx + 14, cy + 14);

        // Ghostly armor body
        g.fillStyle(darker, 0.7);
        g.fillEllipse(cx, cy + 4, 22, 20);
        g.fillStyle(color, 0.6);
        g.fillEllipse(cx, cy + 4, 20, 18);
        // Armor lines
        g.fillStyle(lighter, 0.5);
        g.fillEllipse(cx, cy + 4, 16, 14);
        // Chest plate
        g.fillStyle(lighter, 0.3);
        g.fillRect(cx - 6, cy - 2, 12, 10);
        g.fillStyle(lightest, 0.2);
        g.fillRect(cx - 4, cy, 8, 6);

        // Shoulder armor
        g.fillStyle(darker, 0.7);
        g.fillEllipse(cx - 14, cy - 2, 10, 6);
        g.fillEllipse(cx + 14, cy - 2, 10, 6);
        g.fillStyle(color, 0.6);
        g.fillEllipse(cx - 14, cy - 2, 8, 4);
        g.fillEllipse(cx + 14, cy - 2, 8, 4);
        // Shoulder spikes
        g.fillStyle(lighter, 0.5);
        g.fillTriangle(cx - 18, cy - 4, cx - 16, cy - 10, cx - 14, cy - 4);
        g.fillTriangle(cx + 14, cy - 4, cx + 16, cy - 10, cx + 18, cy - 4);

        // Left arm ghostly
        g.fillStyle(color, 0.5);
        g.fillCurvedLimb(cx - 14, cy, 4, cx - 18, cy + 6, cx - 16, cy + 12, 3);

        // Spectral sword in right hand
        g.fillStyle(0xCCCCFF, 0.8);
        g.fillRect(cx + 18, cy - 24, 2, 30);
        g.fillStyle(0xEEEEFF, 0.6);
        g.fillRect(cx + 19, cy - 22, 1, 26);
        // Sword hilt
        g.fillStyle(lighter, 0.7);
        g.fillRect(cx + 14, cy + 4, 10, 2);
        g.fillStyle(color, 0.8);
        g.fillRect(cx + 17, cy + 4, 4, 4);
        // Sword tip
        g.fillStyle(0xFFFFFF, 0.6);
        g.fillTriangle(cx + 17, cy - 24, cx + 19, cy - 28, cx + 21, cy - 24);
        // Sword glow
        g.fillStyle(lighter, 0.15);
        g.fillRect(cx + 16, cy - 24, 6, 30);

        // Right arm holding sword
        g.fillStyle(color, 0.5);
        g.fillCurvedLimb(cx + 14, cy, 4, cx + 18, cy + 4, cx + 18, cy + 6, 3);

        // Helmet / head
        g.fillStyle(darker, 0.8);
        g.fillEllipse(cx, cy - 12, 16, 14);
        g.fillStyle(color, 0.7);
        g.fillEllipse(cx, cy - 12, 14, 12);

        // Helmet visor
        g.fillStyle(darker, 0.9);
        g.fillRect(cx - 7, cy - 16, 14, 4);
        g.fillStyle(lighter, 0.6);
        g.fillRect(cx - 6, cy - 15, 12, 2);

        // Glowing eyes through visor - spectral
        g.fillStyle(lightest);
        g.fillEllipse(cx - 4, cy - 14, 3, 1.5);
        g.fillEllipse(cx + 4, cy - 14, 3, 1.5);
        // Eye glow trails
        g.fillStyle(lighter, 0.3);
        g.fillRect(cx - 8, cy - 15, 4, 1);
        g.fillRect(cx + 4, cy - 15, 4, 1);

        // Helmet crest
        g.fillStyle(lighter, 0.6);
        g.fillTriangle(cx - 2, cy - 18, cx, cy - 26, cx + 2, cy - 18);
        g.fillStyle(lightest, 0.4);
        g.fillTriangle(cx - 1, cy - 18, cx, cy - 24, cx + 1, cy - 18);

        // Floating particles
        g.fillStyle(lighter, 0.4);
        g.fillCircle(cx - 16, cy - 10, 1);
        g.fillCircle(cx + 18, cy - 8, 1);
        g.fillCircle(cx - 10, cy + 18, 1);
        g.fillCircle(cx + 12, cy + 20, 1);
        g.fillCircle(cx - 20, cy + 6, 1);
        break;
      }

      case 'celestial-guardian': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Divine aura
        g.fillStyle(lightest, 0.08);
        g.fillCircle(cx, cy, 30);
        g.fillStyle(lighter, 0.06);
        g.fillCircle(cx, cy - 4, 28);

        // Golden wings - left
        g.fillStyle(darker);
        g.fillTriangle(cx - 10, cy - 4, cx - 30, cy - 20, cx - 22, cy + 8);
        g.fillTriangle(cx - 14, cy - 8, cx - 28, cy - 24, cx - 24, cy - 4);
        g.fillStyle(color);
        g.fillTriangle(cx - 10, cy - 3, cx - 28, cy - 18, cx - 20, cy + 6);
        g.fillTriangle(cx - 12, cy - 6, cx - 26, cy - 22, cx - 22, cy - 2);
        // Wing feather details
        g.fillStyle(lighter);
        g.fillTriangle(cx - 14, cy - 2, cx - 24, cy - 14, cx - 18, cy + 2);
        g.fillStyle(lightest);
        g.fillTriangle(cx - 12, cy - 4, cx - 20, cy - 12, cx - 16, cy);

        // Golden wings - right
        g.fillStyle(darker);
        g.fillTriangle(cx + 10, cy - 4, cx + 30, cy - 20, cx + 22, cy + 8);
        g.fillTriangle(cx + 14, cy - 8, cx + 28, cy - 24, cx + 24, cy - 4);
        g.fillStyle(color);
        g.fillTriangle(cx + 10, cy - 3, cx + 28, cy - 18, cx + 20, cy + 6);
        g.fillTriangle(cx + 12, cy - 6, cx + 26, cy - 22, cx + 22, cy - 2);
        g.fillStyle(lighter);
        g.fillTriangle(cx + 14, cy - 2, cx + 24, cy - 14, cx + 18, cy + 2);
        g.fillStyle(lightest);
        g.fillTriangle(cx + 12, cy - 4, cx + 20, cy - 12, cx + 16, cy);

        // Legs - armored
        g.fillStyle(darker);
        g.fillRect(cx - 9, cy + 14, 6, 14);
        g.fillRect(cx + 3, cy + 14, 6, 14);
        g.fillStyle(color);
        g.fillRect(cx - 8, cy + 15, 4, 12);
        g.fillRect(cx + 4, cy + 15, 4, 12);
        // Golden greaves
        g.fillStyle(lighter);
        g.fillRect(cx - 9, cy + 22, 6, 2);
        g.fillRect(cx + 3, cy + 22, 6, 2);
        // Boots
        g.fillStyle(lightest);
        g.fillRect(cx - 10, cy + 26, 8, 2);
        g.fillRect(cx + 2, cy + 26, 8, 2);

        // Armored body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 4, 22, 20);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 4, 20, 18);
        // Breastplate
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 2, 14, 12);
        g.fillStyle(lightest);
        g.fillEllipse(cx, cy + 1, 8, 6);
        // Divine symbol on chest
        g.fillStyle(0xFFFFFF);
        g.fillCircle(cx, cy + 2, 3);
        g.fillStyle(lightest);
        g.fillRect(cx - 1, cy - 1, 2, 6);
        g.fillRect(cx - 3, cy + 1, 6, 2);

        // Left arm with shield
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 12, cy, 4, cx - 18, cy + 4, cx - 18, cy + 10, 4);
        g.fillStyle(color);
        g.fillEllipse(cx - 20, cy + 6, 8, 10);
        g.fillStyle(lighter);
        g.fillEllipse(cx - 20, cy + 6, 6, 8);
        g.fillStyle(lightest);
        g.fillCircle(cx - 20, cy + 6, 2);

        // Right arm with divine weapon (lance)
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 12, cy, 4, cx + 16, cy - 4, cx + 16, cy - 8, 3);
        // Lance
        g.fillStyle(lighter);
        g.fillRect(cx + 15, cy - 24, 2, 24);
        g.fillStyle(lightest);
        g.fillTriangle(cx + 13, cy - 24, cx + 16, cy - 30, cx + 19, cy - 24);
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx + 14, cy - 24, cx + 16, cy - 28, cx + 18, cy - 24);

        // Head - helmeted
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 16, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 14, 12);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 11, 10, 8);

        // Halo
        g.fillStyle(lightest, 0.6);
        g.fillEllipse(cx, cy - 22, 14, 4);
        g.fillStyle(0xFFFFFF, 0.4);
        g.fillEllipse(cx, cy - 22, 12, 3);
        g.fillStyle(color, 0.5);
        g.fillEllipse(cx, cy - 22, 8, 2);

        // Serene eyes - glowing divine
        g.fillStyle(0x4488FF);
        g.fillEllipse(cx - 4, cy - 13, 3, 2);
        g.fillEllipse(cx + 4, cy - 13, 3, 2);
        g.fillStyle(0xAADDFF);
        g.fillCircle(cx - 4, cy - 13, 1);
        g.fillCircle(cx + 4, cy - 13, 1);

        // Calm mouth
        g.fillStyle(darker);
        g.fillRect(cx - 3, cy - 8, 6, 1);

        // Helmet crest
        g.fillStyle(lighter);
        g.fillTriangle(cx - 2, cy - 18, cx, cy - 24, cx + 2, cy - 18);
        g.fillStyle(lightest);
        g.fillRect(cx - 1, cy - 22, 2, 4);

        // Light particles
        g.fillStyle(0xFFFFFF, 0.5);
        g.fillCircle(cx - 18, cy - 14, 1);
        g.fillCircle(cx + 20, cy - 10, 1);
        g.fillCircle(cx - 14, cy + 16, 1);
        g.fillCircle(cx + 16, cy + 18, 1);
        g.fillCircle(cx, cy - 28, 1);
        break;
      }

      case 'storm-sentinel': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 38, 10);

        // Crackling electricity on ground
        g.fillStyle(lightest, 0.4);
        g.fillRect(cx - 14, cy + 26, 2, 1);
        g.fillRect(cx + 10, cy + 25, 3, 1);
        g.fillRect(cx - 4, cy + 27, 2, 1);

        // Massive legs - armored
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy + 12, 8, 16);
        g.fillRect(cx + 4, cy + 12, 8, 16);
        g.fillStyle(color);
        g.fillRect(cx - 11, cy + 13, 6, 14);
        g.fillRect(cx + 5, cy + 13, 6, 14);
        // Knee guards
        g.fillStyle(lighter);
        g.fillRect(cx - 12, cy + 16, 8, 3);
        g.fillRect(cx + 4, cy + 16, 8, 3);
        // Boots
        g.fillStyle(darker);
        g.fillRect(cx - 14, cy + 26, 10, 2);
        g.fillRect(cx + 4, cy + 26, 10, 2);

        // Massive torso - storm armor
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 2, 28, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 2, 26, 20);
        // Storm armor plates
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy, 20, 14);
        g.fillStyle(lightest);
        g.fillEllipse(cx, cy, 12, 8);
        // Lightning emblem on chest
        g.fillStyle(0xFFFF44);
        g.fillTriangle(cx - 2, cy - 4, cx + 2, cy, cx - 1, cy);
        g.fillTriangle(cx + 1, cy, cx - 2, cy, cx + 2, cy + 4);

        // Shoulder armor - massive
        g.fillStyle(darker);
        g.fillEllipse(cx - 18, cy - 4, 12, 8);
        g.fillEllipse(cx + 18, cy - 4, 12, 8);
        g.fillStyle(color);
        g.fillEllipse(cx - 18, cy - 4, 10, 6);
        g.fillEllipse(cx + 18, cy - 4, 10, 6);
        g.fillStyle(lighter);
        g.fillEllipse(cx - 18, cy - 5, 6, 3);
        g.fillEllipse(cx + 18, cy - 5, 6, 3);

        // Left arm
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 18, cy, 5, cx - 22, cy + 8, cx - 20, cy + 14, 4);
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 17, cy + 1, 4, cx - 21, cy + 8, cx - 19, cy + 13, 3);
        // Gauntlet
        g.fillStyle(lighter);
        g.fillCircle(cx - 20, cy + 14, 4);
        // Lightning from left hand
        g.fillStyle(lightest, 0.6);
        g.fillRect(cx - 22, cy + 16, 1, 8);
        g.fillRect(cx - 20, cy + 18, 1, 6);
        g.fillStyle(0xFFFF88, 0.4);
        g.fillRect(cx - 18, cy + 16, 1, 10);

        // Thunder hammer in right hand
        g.fillStyle(0x888888);
        g.fillRect(cx + 18, cy - 16, 2, 28);
        // Hammer head
        g.fillStyle(0x666666);
        g.fillRect(cx + 12, cy - 18, 14, 6);
        g.fillStyle(0x888888);
        g.fillRect(cx + 13, cy - 17, 12, 4);
        g.fillStyle(lighter);
        g.fillRect(cx + 14, cy - 16, 10, 2);
        // Lightning on hammer
        g.fillStyle(lightest);
        g.fillCircle(cx + 14, cy - 15, 1);
        g.fillCircle(cx + 24, cy - 15, 1);

        // Right arm holding hammer
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 18, cy, 5, cx + 20, cy + 4, cx + 18, cy + 10, 4);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 17, cy + 1, 4, cx + 19, cy + 4, cx + 17, cy + 9, 3);

        // Helmeted head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 14, 18, 16);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 14, 16, 14);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 12, 12, 8);

        // Helmet visor / face guard
        g.fillStyle(darker);
        g.fillRect(cx - 8, cy - 16, 16, 3);
        g.fillStyle(lighter);
        g.fillRect(cx - 7, cy - 15, 14, 1);

        // Glowing storm eyes - no whites
        g.fillStyle(lightest);
        g.fillEllipse(cx - 4, cy - 14, 3, 1.5);
        g.fillEllipse(cx + 4, cy - 14, 3, 1.5);

        // Helmet horns / antennae
        g.fillStyle(lighter);
        g.fillTriangle(cx - 8, cy - 18, cx - 10, cy - 26, cx - 6, cy - 18);
        g.fillTriangle(cx + 6, cy - 18, cx + 10, cy - 26, cx + 8, cy - 18);
        // Lightning between horns
        g.fillStyle(lightest, 0.6);
        g.fillRect(cx - 6, cy - 24, 1, 2);
        g.fillRect(cx - 4, cy - 22, 1, 2);
        g.fillRect(cx - 2, cy - 24, 1, 2);
        g.fillRect(cx, cy - 22, 1, 2);
        g.fillRect(cx + 2, cy - 24, 1, 2);
        g.fillRect(cx + 4, cy - 22, 1, 2);

        // Storm aura
        g.fillStyle(lighter, 0.1);
        g.fillCircle(cx, cy, 28);

        // Floating lightning bolts around body
        g.fillStyle(lightest, 0.5);
        g.fillTriangle(cx - 24, cy - 8, cx - 22, cy - 4, cx - 20, cy - 8);
        g.fillTriangle(cx + 22, cy - 6, cx + 24, cy - 2, cx + 26, cy - 6);
        g.fillStyle(0xFFFF88, 0.3);
        g.fillRect(cx - 26, cy + 2, 1, 4);
        g.fillRect(cx + 26, cy + 4, 1, 4);
        break;
      }

      case 'frost-monarch': {
        // Ground shadow - icy
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 38, 10);

        // Ice floor effect
        g.fillStyle(lightest, 0.2);
        g.fillEllipse(cx, cy + 26, 34, 6);
        g.fillStyle(0xFFFFFF, 0.15);
        g.fillEllipse(cx, cy + 26, 28, 4);

        // Frost cape - flowing wide
        g.fillStyle(darker, 0.8);
        g.fillTriangle(cx - 26, cy + 26, cx - 8, cy - 6, cx - 4, cy + 26);
        g.fillTriangle(cx + 26, cy + 26, cx + 8, cy - 6, cx + 4, cy + 26);
        g.fillStyle(color, 0.6);
        g.fillTriangle(cx - 24, cy + 26, cx - 8, cy - 4, cx - 4, cy + 26);
        g.fillTriangle(cx + 24, cy + 26, cx + 8, cy - 4, cx + 4, cy + 26);
        // Cape frost detail
        g.fillStyle(lighter, 0.3);
        g.fillTriangle(cx - 20, cy + 26, cx - 8, cy, cx - 6, cy + 26);
        g.fillTriangle(cx + 20, cy + 26, cx + 8, cy, cx + 6, cy + 26);
        // Cape icicle edges
        g.fillStyle(lightest, 0.4);
        g.fillTriangle(cx - 24, cy + 24, cx - 22, cy + 28, cx - 20, cy + 24);
        g.fillTriangle(cx - 16, cy + 24, cx - 14, cy + 28, cx - 12, cy + 24);
        g.fillTriangle(cx + 12, cy + 24, cx + 14, cy + 28, cx + 16, cy + 24);
        g.fillTriangle(cx + 20, cy + 24, cx + 22, cy + 28, cx + 24, cy + 24);

        // Regal robe / body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 6, 22, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 6, 20, 20);
        // Robe highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 4, 14, 14);
        // Ice crystal on chest
        g.fillStyle(lightest);
        g.fillTriangle(cx - 3, cy + 2, cx, cy - 4, cx + 3, cy + 2);
        g.fillTriangle(cx - 3, cy + 2, cx, cy + 8, cx + 3, cy + 2);
        g.fillStyle(0xFFFFFF);
        g.fillCircle(cx, cy + 2, 2);

        // Shoulder fur/frost
        g.fillStyle(0xFFFFFF, 0.6);
        g.fillEllipse(cx - 14, cy - 4, 10, 6);
        g.fillEllipse(cx + 14, cy - 4, 10, 6);
        g.fillStyle(lightest, 0.5);
        g.fillEllipse(cx - 14, cy - 5, 8, 4);
        g.fillEllipse(cx + 14, cy - 5, 8, 4);

        // Left arm
        g.fillStyle(darker);
        g.fillCurvedLimb(cx - 14, cy, 4, cx - 18, cy + 6, cx - 16, cy + 12, 3);
        g.fillStyle(color);
        g.fillCurvedLimb(cx - 13, cy + 1, 3, cx - 17, cy + 6, cx - 15, cy + 11, 2);

        // Ice scepter in right hand
        g.fillStyle(lighter);
        g.fillRect(cx + 16, cy - 20, 2, 26);
        g.fillStyle(lightest);
        g.fillRect(cx + 17, cy - 18, 1, 22);
        // Scepter crystal top
        g.fillStyle(lightest);
        g.fillTriangle(cx + 13, cy - 22, cx + 17, cy - 30, cx + 21, cy - 22);
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx + 14, cy - 22, cx + 17, cy - 28, cx + 20, cy - 22);
        g.fillStyle(lighter, 0.6);
        g.fillCircle(cx + 17, cy - 24, 2);
        // Scepter glow
        g.fillStyle(lightest, 0.2);
        g.fillCircle(cx + 17, cy - 24, 5);

        // Right arm holding scepter
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 14, cy, 4, cx + 16, cy + 2, cx + 16, cy + 6, 3);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 13, cy + 1, 3, cx + 15, cy + 2, cx + 15, cy + 5, 2);

        // Regal head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 16, 14);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 12, 14, 12);
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy - 11, 10, 8);

        // Crystal crown - elaborate
        g.fillStyle(lighter);
        g.fillRect(cx - 10, cy - 18, 20, 3);
        g.fillStyle(lightest);
        g.fillRect(cx - 9, cy - 17, 18, 1);
        // Crown crystals
        g.fillStyle(lightest);
        g.fillTriangle(cx - 10, cy - 18, cx - 8, cy - 26, cx - 6, cy - 18);
        g.fillTriangle(cx - 4, cy - 18, cx - 1, cy - 28, cx + 2, cy - 18);
        g.fillTriangle(cx + 4, cy - 18, cx + 6, cy - 26, cx + 8, cy - 18);
        g.fillStyle(0xFFFFFF);
        g.fillTriangle(cx - 8, cy - 18, cx - 7, cy - 24, cx - 6, cy - 18);
        g.fillTriangle(cx - 2, cy - 18, cx, cy - 26, cx + 2, cy - 18);
        g.fillTriangle(cx + 6, cy - 18, cx + 7, cy - 24, cx + 8, cy - 18);

        // Cold, regal eyes - icy glow
        g.fillStyle(lighter);
        g.fillEllipse(cx - 4, cy - 13, 3, 2);
        g.fillEllipse(cx + 4, cy - 13, 3, 2);
        g.fillStyle(lightest);
        g.fillCircle(cx - 4, cy - 13, 1);
        g.fillCircle(cx + 4, cy - 13, 1);

        // Stern, thin mouth
        g.fillStyle(darker);
        g.fillRect(cx - 3, cy - 8, 6, 1);

        // Frost aura
        g.fillStyle(lightest, 0.08);
        g.fillCircle(cx, cy, 30);

        // Floating ice crystals
        g.fillStyle(lightest, 0.5);
        g.fillTriangle(cx - 22, cy - 10, cx - 20, cy - 14, cx - 18, cy - 10);
        g.fillTriangle(cx + 20, cy - 8, cx + 22, cy - 12, cx + 24, cy - 8);
        g.fillStyle(0xFFFFFF, 0.4);
        g.fillCircle(cx - 18, cy + 10, 1);
        g.fillCircle(cx + 20, cy + 12, 1);
        g.fillCircle(cx - 24, cy, 1);
        g.fillCircle(cx + 8, cy - 24, 1);
        g.fillCircle(cx - 12, cy - 22, 1);
        break;
      }
      case 'giant-crab': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 42, 10);

        // Main shell body - large armored carapace
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 2, 44, 30);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 3, 42, 28);

        // Shell armor segments
        g.fillStyle(darker, 0.4);
        g.fillEllipse(cx, cy - 6, 38, 22);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 7, 36, 20);

        // Shell ridge line (center)
        g.fillStyle(darker, 0.5);
        g.fillRect(cx - 1, cy - 18, 2, 22);

        // Shell highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx - 6, cy - 12, 14, 8);
        g.fillStyle(lightest, 0.6);
        g.fillEllipse(cx - 8, cy - 14, 8, 5);

        // Shell texture bumps
        g.fillStyle(darker, 0.3);
        g.fillCircle(cx + 8, cy - 10, 3);
        g.fillCircle(cx - 4, cy - 4, 2);
        g.fillCircle(cx + 12, cy - 4, 2);
        g.fillCircle(cx - 12, cy - 6, 2);

        // Shell spikes along top
        g.fillStyle(darker);
        g.fillTriangle(cx - 10, cy - 16, cx - 8, cy - 22, cx - 6, cy - 16);
        g.fillTriangle(cx - 2, cy - 17, cx, cy - 24, cx + 2, cy - 17);
        g.fillTriangle(cx + 6, cy - 16, cx + 8, cy - 22, cx + 10, cy - 16);

        // Spike highlights
        g.fillStyle(lighter, 0.5);
        g.fillTriangle(cx - 9, cy - 16, cx - 8, cy - 21, cx - 7, cy - 16);
        g.fillTriangle(cx - 1, cy - 17, cx, cy - 23, cx + 1, cy - 17);
        g.fillTriangle(cx + 7, cy - 16, cx + 8, cy - 21, cx + 9, cy - 16);

        // Legs (back pair)
        g.fillStyle(darker);
        g.fillLimb(cx - 16, cy + 8, 4, cx - 22, cy + 22, 3);
        g.fillLimb(cx + 16, cy + 8, 4, cx + 22, cy + 22, 3);
        // Legs (front pair)
        g.fillStyle(color);
        g.fillLimb(cx - 12, cy + 10, 4, cx - 18, cy + 24, 3);
        g.fillLimb(cx + 12, cy + 10, 4, cx + 18, cy + 24, 3);
        // Leg highlights
        g.fillStyle(lighter, 0.4);
        g.fillLimb(cx - 12, cy + 10, 2, cx - 18, cy + 22, 2);
        g.fillLimb(cx + 12, cy + 10, 2, cx + 18, cy + 22, 2);

        // Middle legs
        g.fillStyle(color);
        g.fillLimb(cx - 18, cy + 4, 3, cx - 24, cy + 18, 3);
        g.fillLimb(cx + 18, cy + 4, 3, cx + 24, cy + 18, 3);

        // LEFT CLAW ARM - massive boss claw
        g.fillStyle(darker);
        g.fillLimb(cx - 18, cy - 2, 5, cx - 26, cy - 10, 4);
        g.fillStyle(color);
        // Left claw pincer
        g.fillEllipse(cx - 28, cy - 14, 14, 10);
        g.fillStyle(darker);
        // Claw opening
        g.fillTriangle(cx - 22, cy - 14, cx - 28, cy - 8, cx - 34, cy - 14);
        g.fillStyle(color);
        // Upper pincer
        g.fillEllipse(cx - 30, cy - 17, 10, 5);
        // Lower pincer
        g.fillEllipse(cx - 30, cy - 11, 10, 5);
        // Claw highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx - 30, cy - 18, 6, 3);
        // Claw tip serrations
        g.fillStyle(lightest);
        g.fillRect(cx - 34, cy - 18, 2, 2);
        g.fillRect(cx - 34, cy - 12, 2, 2);

        // RIGHT CLAW ARM - even bigger boss claw
        g.fillStyle(darker);
        g.fillLimb(cx + 18, cy - 2, 5, cx + 26, cy - 12, 5);
        g.fillStyle(color);
        // Right claw pincer (bigger)
        g.fillEllipse(cx + 30, cy - 16, 16, 12);
        g.fillStyle(darker);
        // Claw opening
        g.fillTriangle(cx + 24, cy - 16, cx + 30, cy - 8, cx + 36, cy - 16);
        g.fillStyle(color);
        // Upper pincer
        g.fillEllipse(cx + 32, cy - 20, 12, 6);
        // Lower pincer
        g.fillEllipse(cx + 32, cy - 12, 12, 6);
        // Claw highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx + 31, cy - 21, 7, 3);
        g.fillStyle(lightest);
        g.fillRect(cx + 37, cy - 21, 2, 2);
        g.fillRect(cx + 37, cy - 13, 2, 2);

        // Eyes on stalks
        g.fillStyle(darker);
        g.fillLimb(cx - 6, cy - 16, 2, cx - 8, cy - 24, 2);
        g.fillLimb(cx + 6, cy - 16, 2, cx + 8, cy - 24, 2);
        // Eye balls - dark, no whites
        g.fillStyle(0x220000);
        g.fillCircle(cx - 8, cy - 26, 3);
        g.fillCircle(cx + 8, cy - 26, 3);

        // Mouth
        g.fillStyle(darker);
        g.fillRect(cx - 5, cy + 2, 10, 2);
        g.fillStyle(0xFFFFFF, 0.8);
        g.fillRect(cx - 4, cy + 2, 2, 2);
        g.fillRect(cx + 2, cy + 2, 2, 2);

        // Bubbles (boss aura)
        g.fillStyle(0xFFFFFF, 0.4);
        g.fillCircle(cx - 20, cy - 26, 2);
        g.fillCircle(cx + 22, cy - 28, 3);
        g.fillCircle(cx - 14, cy - 30, 2);
        break;
      }

      case 'sand-golem': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Sand particles falling off body
        g.fillStyle(color, 0.4);
        g.fillRect(cx - 14, cy + 22, 2, 3);
        g.fillRect(cx + 10, cy + 20, 2, 4);
        g.fillRect(cx - 8, cy + 24, 2, 2);
        g.fillRect(cx + 16, cy + 18, 1, 3);

        // Main body - rough sandy form
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 4, 32, 36);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 3, 30, 34);

        // Crumbling edges - irregular sand blocks
        g.fillStyle(color);
        g.fillRect(cx - 16, cy - 4, 4, 5);
        g.fillRect(cx + 13, cy - 2, 4, 4);
        g.fillRect(cx - 14, cy + 14, 3, 4);
        g.fillRect(cx + 12, cy + 16, 3, 3);
        g.fillStyle(darker, 0.3);
        g.fillRect(cx - 17, cy - 3, 2, 3);
        g.fillRect(cx + 16, cy - 1, 2, 3);

        // Body texture - sand grain lines
        g.fillStyle(darker, 0.2);
        g.fillRect(cx - 10, cy - 6, 20, 1);
        g.fillRect(cx - 8, cy + 2, 16, 1);
        g.fillRect(cx - 12, cy + 8, 24, 1);
        g.fillRect(cx - 10, cy + 14, 20, 1);

        // Body highlight (sun-bleached)
        g.fillStyle(lighter);
        g.fillEllipse(cx - 2, cy - 2, 16, 14);
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx - 4, cy - 6, 10, 8);

        // Head - blocky sand head
        g.fillStyle(darker);
        g.fillRect(cx - 11, cy - 20, 22, 18);
        g.fillStyle(color);
        g.fillRect(cx - 10, cy - 19, 20, 16);

        // Head crumbling corners
        g.fillStyle(color, 0.6);
        g.fillRect(cx - 12, cy - 18, 2, 4);
        g.fillRect(cx + 10, cy - 17, 2, 3);
        g.fillRect(cx - 11, cy - 8, 2, 3);
        g.fillRect(cx + 10, cy - 6, 2, 2);

        // Head highlight
        g.fillStyle(lighter);
        g.fillRect(cx - 8, cy - 18, 10, 6);
        g.fillStyle(lightest, 0.5);
        g.fillRect(cx - 6, cy - 18, 6, 3);

        // Desert crystal eyes - glowing amber
        g.fillStyle(0x000000);
        g.fillRect(cx - 8, cy - 15, 6, 5);
        g.fillRect(cx + 2, cy - 15, 6, 5);
        g.fillStyle(0xFFAA00);
        g.fillRect(cx - 7, cy - 14, 4, 3);
        g.fillRect(cx + 3, cy - 14, 4, 3);
        // Crystal shine
        g.fillStyle(0xFFDD44);
        g.fillRect(cx - 7, cy - 14, 2, 2);
        g.fillRect(cx + 3, cy - 14, 2, 2);
        // Crystal glow
        g.fillStyle(0xFFAA00, 0.3);
        g.fillCircle(cx - 5, cy - 13, 5);
        g.fillCircle(cx + 5, cy - 13, 5);

        // Mouth - crack in the sand
        g.fillStyle(0x000000, 0.6);
        g.fillRect(cx - 4, cy - 7, 8, 2);
        g.fillRect(cx - 3, cy - 8, 1, 1);
        g.fillRect(cx + 2, cy - 8, 1, 1);

        // Left arm - blocky sand arm
        g.fillStyle(darker);
        g.fillLimb(cx - 14, cy - 2, 6, cx - 24, cy + 8, 5);
        g.fillStyle(color);
        g.fillLimb(cx - 14, cy - 2, 5, cx - 23, cy + 7, 4);
        // Crumbling fist
        g.fillStyle(color);
        g.fillRect(cx - 28, cy + 4, 10, 10);
        g.fillStyle(darker, 0.3);
        g.fillRect(cx - 27, cy + 7, 8, 1);
        g.fillStyle(lighter);
        g.fillRect(cx - 27, cy + 5, 5, 3);

        // Right arm
        g.fillStyle(darker);
        g.fillLimb(cx + 14, cy - 2, 6, cx + 24, cy + 6, 5);
        g.fillStyle(color);
        g.fillLimb(cx + 14, cy - 2, 5, cx + 23, cy + 5, 4);
        // Raised fist
        g.fillStyle(color);
        g.fillRect(cx + 19, cy - 2, 10, 10);
        g.fillStyle(darker, 0.3);
        g.fillRect(cx + 20, cy + 1, 8, 1);
        g.fillStyle(lighter);
        g.fillRect(cx + 20, cy - 1, 5, 3);

        // Legs - stubby sand pillars
        g.fillStyle(darker);
        g.fillRect(cx - 10, cy + 16, 8, 10);
        g.fillRect(cx + 2, cy + 16, 8, 10);
        g.fillStyle(color);
        g.fillRect(cx - 9, cy + 16, 6, 9);
        g.fillRect(cx + 3, cy + 16, 6, 9);
        g.fillStyle(lighter, 0.4);
        g.fillRect(cx - 9, cy + 16, 3, 5);
        g.fillRect(cx + 3, cy + 16, 3, 5);

        // Falling sand particles
        g.fillStyle(color, 0.5);
        g.fillRect(cx - 18, cy + 12, 1, 2);
        g.fillRect(cx + 20, cy + 10, 1, 2);
        g.fillRect(cx - 6, cy + 26, 1, 2);
        g.fillRect(cx + 8, cy + 25, 1, 3);
        g.fillRect(cx - 22, cy + 14, 1, 2);
        break;
      }

      case 'bandit-lord': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Cape - flowing behind
        g.fillStyle(0x8B0000);
        g.fillTriangle(cx - 14, cy - 6, cx - 20, cy + 26, cx + 20, cy + 26);
        g.fillTriangle(cx + 14, cy - 6, cx + 22, cy + 26, cx - 2, cy + 26);
        // Cape highlight
        g.fillStyle(0xAA2222, 0.5);
        g.fillTriangle(cx - 10, cy - 2, cx - 14, cy + 20, cx + 2, cy + 20);
        // Cape edge detail
        g.fillStyle(0xFFD700, 0.6);
        g.fillRect(cx - 18, cy + 24, 36, 2);

        // Body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 6, 22, 24);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 5, 20, 22);

        // Leather vest detail
        g.fillStyle(darker, 0.4);
        g.fillRect(cx - 1, cy - 4, 2, 18);
        // Belt
        g.fillStyle(0x8B4513);
        g.fillRect(cx - 10, cy + 8, 20, 3);
        // Belt buckle - gold
        g.fillStyle(0xFFD700);
        g.fillRect(cx - 3, cy + 8, 6, 3);
        g.fillStyle(0xFFEE88);
        g.fillRect(cx - 2, cy + 9, 4, 1);

        // Chest highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx - 2, cy, 10, 8);

        // Head
        g.fillStyle(0xDEB887);
        g.fillEllipse(cx, cy - 14, 14, 14);

        // Boss hat/crown - elaborate tricorn
        g.fillStyle(0x2F1B14);
        g.fillEllipse(cx, cy - 20, 20, 6);
        g.fillRect(cx - 10, cy - 24, 20, 4);
        // Hat brim curl
        g.fillStyle(0x3D2B1F);
        g.fillTriangle(cx - 12, cy - 20, cx - 8, cy - 26, cx - 4, cy - 20);
        g.fillTriangle(cx + 4, cy - 20, cx + 8, cy - 26, cx + 12, cy - 20);
        // Gold hat band
        g.fillStyle(0xFFD700);
        g.fillRect(cx - 9, cy - 21, 18, 2);
        // Jewel on hat
        g.fillStyle(0xFF0000);
        g.fillCircle(cx, cy - 22, 2);
        g.fillStyle(0xFF6666);
        g.fillRect(cx - 1, cy - 23, 1, 1);

        // Hat feather
        g.fillStyle(0xFF4444);
        g.fillCurvedLimb(cx + 6, cy - 24, 1, cx + 14, cy - 30, cx + 10, cy - 30, 1);
        g.fillStyle(0xFF6666);
        g.fillCurvedLimb(cx + 7, cy - 24, 1, cx + 13, cy - 29, cx + 10, cy - 29, 1);

        // Eyes - cunning, shadowed
        g.fillStyle(0x111111);
        g.fillRect(cx - 6, cy - 16, 5, 3);
        g.fillRect(cx + 1, cy - 16, 5, 3);
        g.fillStyle(0x2F1B14);
        g.fillRect(cx - 5, cy - 15, 3, 2);
        g.fillRect(cx + 2, cy - 15, 3, 2);

        // Smirk
        g.fillStyle(0x000000);
        g.fillRect(cx - 3, cy - 9, 7, 1);
        g.fillRect(cx + 3, cy - 10, 2, 1);

        // Scar across cheek
        g.fillStyle(0xCC8866);
        g.fillRect(cx + 3, cy - 13, 4, 1);
        g.fillRect(cx + 4, cy - 12, 3, 1);

        // Goatee
        g.fillStyle(0x2F1B14);
        g.fillRect(cx - 1, cy - 8, 3, 3);

        // Left arm with dagger
        g.fillStyle(color);
        g.fillLimb(cx - 10, cy + 2, 4, cx - 18, cy - 4, 3);
        g.fillStyle(0xDEB887);
        g.fillCircle(cx - 18, cy - 4, 3);
        // Left dagger
        g.fillStyle(0xCCCCCC);
        g.fillLimb(cx - 18, cy - 6, 2, cx - 16, cy - 18, 1);
        g.fillStyle(0xFFFFFF, 0.6);
        g.fillLimb(cx - 17, cy - 8, 1, cx - 16, cy - 16, 1);
        // Dagger guard
        g.fillStyle(0xFFD700);
        g.fillRect(cx - 20, cy - 7, 5, 2);

        // Right arm with dagger
        g.fillStyle(color);
        g.fillLimb(cx + 10, cy + 2, 4, cx + 20, cy - 2, 3);
        g.fillStyle(0xDEB887);
        g.fillCircle(cx + 20, cy - 2, 3);
        // Right dagger
        g.fillStyle(0xCCCCCC);
        g.fillLimb(cx + 20, cy - 4, 2, cx + 22, cy - 16, 1);
        g.fillStyle(0xFFFFFF, 0.6);
        g.fillLimb(cx + 21, cy - 6, 1, cx + 22, cy - 14, 1);
        // Dagger guard
        g.fillStyle(0xFFD700);
        g.fillRect(cx + 18, cy - 5, 5, 2);

        // Legs
        g.fillStyle(darker);
        g.fillRect(cx - 8, cy + 16, 6, 10);
        g.fillRect(cx + 2, cy + 16, 6, 10);
        // Boots
        g.fillStyle(0x3D2B1F);
        g.fillRect(cx - 9, cy + 22, 8, 4);
        g.fillRect(cx + 1, cy + 22, 8, 4);
        g.fillStyle(0x4D3B2F);
        g.fillRect(cx - 8, cy + 22, 4, 2);
        g.fillRect(cx + 2, cy + 22, 4, 2);
        break;
      }

      case 'storm-raptor': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Lightning bolts crackling around wings
        g.fillStyle(0xFFFF00, 0.6);
        // Left lightning
        g.fillRect(cx - 26, cy - 12, 2, 4);
        g.fillRect(cx - 24, cy - 8, 2, 3);
        g.fillRect(cx - 26, cy - 5, 2, 4);
        // Right lightning
        g.fillRect(cx + 24, cy - 14, 2, 4);
        g.fillRect(cx + 22, cy - 10, 2, 3);
        g.fillRect(cx + 24, cy - 7, 2, 4);

        // Left wing - outstretched
        g.fillStyle(darker);
        g.fillTriangle(cx - 8, cy - 4, cx - 30, cy - 18, cx - 22, cy + 4);
        g.fillStyle(color);
        g.fillTriangle(cx - 7, cy - 3, cx - 28, cy - 16, cx - 20, cy + 3);
        // Wing feather layers
        g.fillStyle(lighter);
        g.fillTriangle(cx - 8, cy - 2, cx - 24, cy - 12, cx - 18, cy + 2);
        g.fillStyle(darker, 0.4);
        g.fillRect(cx - 28, cy - 14, 6, 1);
        g.fillRect(cx - 26, cy - 11, 6, 1);
        g.fillRect(cx - 24, cy - 8, 6, 1);
        // Wing tip feathers
        g.fillStyle(darker);
        g.fillTriangle(cx - 28, cy - 16, cx - 30, cy - 22, cx - 26, cy - 16);
        g.fillTriangle(cx - 26, cy - 14, cx - 30, cy - 20, cx - 24, cy - 14);

        // Right wing
        g.fillStyle(darker);
        g.fillTriangle(cx + 8, cy - 4, cx + 30, cy - 18, cx + 22, cy + 4);
        g.fillStyle(color);
        g.fillTriangle(cx + 7, cy - 3, cx + 28, cy - 16, cx + 20, cy + 3);
        g.fillStyle(lighter);
        g.fillTriangle(cx + 8, cy - 2, cx + 24, cy - 12, cx + 18, cy + 2);
        g.fillStyle(darker, 0.4);
        g.fillRect(cx + 22, cy - 14, 6, 1);
        g.fillRect(cx + 20, cy - 11, 6, 1);
        g.fillRect(cx + 18, cy - 8, 6, 1);
        g.fillStyle(darker);
        g.fillTriangle(cx + 26, cy - 14, cx + 30, cy - 22, cx + 28, cy - 16);
        g.fillTriangle(cx + 24, cy - 14, cx + 30, cy - 20, cx + 26, cy - 16);

        // Body
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 4, 18, 24);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 3, 16, 22);

        // Chest/belly lighter feathers
        g.fillStyle(lighter);
        g.fillEllipse(cx, cy + 6, 10, 14);
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx, cy + 4, 6, 8);

        // Feather texture on chest
        g.fillStyle(darker, 0.15);
        g.fillRect(cx - 4, cy + 2, 8, 1);
        g.fillRect(cx - 3, cy + 5, 6, 1);
        g.fillRect(cx - 4, cy + 8, 8, 1);

        // Head
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 14, 12, 12);
        g.fillStyle(color);
        g.fillEllipse(cx, cy - 14, 11, 11);

        // Head crest feathers
        g.fillStyle(0xFFDD00);
        g.fillTriangle(cx - 2, cy - 20, cx - 4, cy - 28, cx, cy - 20);
        g.fillTriangle(cx, cy - 20, cx + 2, cy - 26, cx + 4, cy - 20);
        g.fillTriangle(cx + 2, cy - 20, cx + 6, cy - 24, cx + 6, cy - 20);

        // Fierce eyes
        g.fillStyle(0x000000);
        g.fillRect(cx - 6, cy - 16, 5, 3);
        g.fillRect(cx + 1, cy - 16, 5, 3);
        g.fillStyle(0xFFAA00);
        g.fillRect(cx - 5, cy - 15, 3, 2);
        g.fillRect(cx + 2, cy - 15, 3, 2);
        // Angry brow
        g.fillStyle(darker);
        g.fillRect(cx - 6, cy - 18, 5, 1);
        g.fillRect(cx + 1, cy - 17, 5, 1);

        // Beak
        g.fillStyle(0xFFAA00);
        g.fillTriangle(cx - 3, cy - 12, cx, cy - 6, cx + 3, cy - 12);
        g.fillStyle(0xDD8800);
        g.fillTriangle(cx - 2, cy - 11, cx, cy - 6, cx, cy - 11);

        // Talons
        g.fillStyle(darker);
        g.fillLimb(cx - 5, cy + 14, 3, cx - 8, cy + 24, 2);
        g.fillLimb(cx + 5, cy + 14, 3, cx + 8, cy + 24, 2);
        // Talon claws
        g.fillStyle(0xFFAA00);
        g.fillTriangle(cx - 10, cy + 23, cx - 7, cy + 23, cx - 12, cy + 26);
        g.fillTriangle(cx - 7, cy + 23, cx - 4, cy + 23, cx - 7, cy + 26);
        g.fillTriangle(cx + 7, cy + 23, cx + 10, cy + 23, cx + 12, cy + 26);
        g.fillTriangle(cx + 4, cy + 23, cx + 7, cy + 23, cx + 7, cy + 26);

        // Electric aura sparks
        g.fillStyle(0xFFFF66, 0.7);
        g.fillCircle(cx - 20, cy - 6, 2);
        g.fillCircle(cx + 22, cy - 8, 2);
        g.fillStyle(0xFFFFFF, 0.5);
        g.fillCircle(cx - 20, cy - 6, 1);
        g.fillCircle(cx + 22, cy - 8, 1);

        // More lightning
        g.fillStyle(0xFFFF00, 0.5);
        g.fillRect(cx - 16, cy + 10, 1, 3);
        g.fillRect(cx + 15, cy + 8, 1, 4);
        break;
      }

      case 'cloud-wraith': {
        // Ground shadow - faint (floating)
        g.fillStyle(0x000000, 0.1);
        g.fillEllipse(cx, cy + 27, 28, 6);

        // Ethereal mist trail below
        g.fillStyle(color, 0.15);
        g.fillEllipse(cx, cy + 24, 20, 8);
        g.fillStyle(color, 0.1);
        g.fillEllipse(cx - 4, cy + 28, 14, 5);

        // Main ghostly body - flowing cloud form
        g.fillStyle(color, 0.3);
        g.fillEllipse(cx, cy + 6, 30, 34);
        g.fillStyle(color, 0.5);
        g.fillEllipse(cx, cy + 2, 26, 30);
        g.fillStyle(color, 0.7);
        g.fillEllipse(cx, cy - 2, 22, 26);

        // Inner form - more solid core
        g.fillStyle(lighter, 0.6);
        g.fillEllipse(cx, cy - 4, 18, 22);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 2, cy - 8, 12, 14);

        // Cloud wisps on sides
        g.fillStyle(color, 0.4);
        g.fillEllipse(cx - 16, cy - 2, 10, 8);
        g.fillEllipse(cx + 16, cy, 10, 8);
        g.fillEllipse(cx - 12, cy + 10, 8, 6);
        g.fillEllipse(cx + 14, cy + 12, 8, 6);

        // Wispy arm extensions
        g.fillStyle(color, 0.35);
        g.fillCurvedLimb(cx - 10, cy, 5, cx - 22, cy - 6, cx - 20, cy + 6, 3);
        g.fillCurvedLimb(cx + 10, cy, 5, cx + 22, cy - 4, cx + 20, cy + 8, 3);
        // Arm tips fade
        g.fillStyle(lighter, 0.2);
        g.fillEllipse(cx - 24, cy - 4, 6, 6);
        g.fillEllipse(cx + 24, cy - 2, 6, 6);

        // Head region - slightly more defined
        g.fillStyle(lighter, 0.7);
        g.fillEllipse(cx, cy - 14, 16, 14);
        g.fillStyle(lightest, 0.4);
        g.fillEllipse(cx, cy - 16, 12, 10);

        // Hood-like cloud formation
        g.fillStyle(color, 0.5);
        g.fillEllipse(cx, cy - 20, 18, 8);
        g.fillStyle(darker, 0.3);
        g.fillEllipse(cx, cy - 22, 16, 6);

        // Glowing eyes - piercing cyan, no whites
        g.fillStyle(0x00FFFF, 0.8);
        g.fillEllipse(cx - 5, cy - 14, 4, 2);
        g.fillEllipse(cx + 5, cy - 14, 4, 2);
        // Eye glow aura
        g.fillStyle(0x00FFFF, 0.15);
        g.fillCircle(cx - 5, cy - 14, 5);
        g.fillCircle(cx + 5, cy - 14, 5);

        // Spectral mouth - faint
        g.fillStyle(0x00FFFF, 0.3);
        g.fillEllipse(cx, cy - 8, 6, 3);
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy - 8, 4, 2);

        // Flowing tail at bottom
        g.fillStyle(color, 0.25);
        g.fillCurvedLimb(cx, cy + 14, 8, cx + 6, cy + 24, cx - 4, cy + 20, 4);
        g.fillStyle(color, 0.15);
        g.fillCurvedLimb(cx - 2, cy + 20, 4, cx + 4, cy + 28, cx - 6, cy + 26, 2);

        // Sparkle particles floating around
        g.fillStyle(0xFFFFFF, 0.6);
        g.fillRect(cx - 18, cy - 18, 2, 2);
        g.fillRect(cx + 16, cy - 12, 2, 2);
        g.fillRect(cx - 14, cy + 6, 1, 1);
        g.fillRect(cx + 18, cy + 4, 1, 1);
        g.fillStyle(0x00FFFF, 0.4);
        g.fillRect(cx - 20, cy - 8, 2, 2);
        g.fillRect(cx + 20, cy - 16, 2, 2);
        g.fillRect(cx + 12, cy + 16, 1, 1);
        break;
      }

      case 'frost-stalker': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Frost aura particles
        g.fillStyle(0xAADDFF, 0.3);
        g.fillRect(cx - 20, cy - 8, 2, 2);
        g.fillRect(cx + 18, cy - 4, 2, 2);
        g.fillRect(cx - 16, cy + 14, 1, 1);
        g.fillRect(cx + 20, cy + 10, 1, 1);

        // Tail - long and sleek with ice crystal tip
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 8, cy + 8, 4, cx + 28, cy + 4, cx + 24, cy - 6, 2);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 8, cy + 8, 3, cx + 27, cy + 4, cx + 23, cy - 5, 2);
        // Ice crystal tail tip
        g.fillStyle(0xAADDFF);
        g.fillTriangle(cx + 22, cy - 8, cx + 20, cy - 4, cx + 26, cy - 4);
        g.fillStyle(0xDDEEFF, 0.7);
        g.fillTriangle(cx + 22, cy - 7, cx + 21, cy - 4, cx + 24, cy - 4);

        // Back legs
        g.fillStyle(darker);
        g.fillLimb(cx + 6, cy + 12, 4, cx + 8, cy + 24, 3);
        g.fillStyle(color);
        g.fillLimb(cx + 6, cy + 12, 3, cx + 8, cy + 23, 3);
        // Back paw
        g.fillStyle(lighter);
        g.fillEllipse(cx + 8, cy + 25, 5, 3);

        // Main body - sleek feline form, crouching
        g.fillStyle(darker);
        g.fillEllipse(cx - 2, cy + 6, 28, 18);
        g.fillStyle(color);
        g.fillEllipse(cx - 2, cy + 5, 26, 16);

        // Crystalline fur texture
        g.fillStyle(lighter, 0.5);
        g.fillEllipse(cx - 4, cy + 2, 18, 10);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 6, cy, 12, 6);

        // Ice crystal spikes along spine
        g.fillStyle(0xAADDFF);
        g.fillTriangle(cx - 6, cy - 2, cx - 4, cy - 8, cx - 2, cy - 2);
        g.fillTriangle(cx, cy - 2, cx + 2, cy - 7, cx + 4, cy - 2);
        g.fillTriangle(cx + 6, cy - 1, cx + 8, cy - 6, cx + 10, cy - 1);
        g.fillStyle(0xDDEEFF, 0.6);
        g.fillTriangle(cx - 5, cy - 2, cx - 4, cy - 7, cx - 3, cy - 2);
        g.fillTriangle(cx + 1, cy - 2, cx + 2, cy - 6, cx + 3, cy - 2);

        // Front legs - crouching stance
        g.fillStyle(darker);
        g.fillLimb(cx - 10, cy + 10, 4, cx - 12, cy + 24, 3);
        g.fillLimb(cx - 4, cy + 12, 4, cx - 4, cy + 24, 3);
        g.fillStyle(color);
        g.fillLimb(cx - 10, cy + 10, 3, cx - 12, cy + 23, 3);
        g.fillLimb(cx - 4, cy + 12, 3, cx - 4, cy + 23, 3);
        // Front paws with ice claws
        g.fillStyle(lighter);
        g.fillEllipse(cx - 12, cy + 25, 5, 3);
        g.fillEllipse(cx - 4, cy + 25, 5, 3);
        g.fillStyle(0xAADDFF);
        g.fillRect(cx - 14, cy + 25, 1, 2);
        g.fillRect(cx - 11, cy + 25, 1, 2);
        g.fillRect(cx - 6, cy + 25, 1, 2);
        g.fillRect(cx - 3, cy + 25, 1, 2);

        // Head - sleek predator
        g.fillStyle(darker);
        g.fillEllipse(cx - 12, cy - 6, 16, 14);
        g.fillStyle(color);
        g.fillEllipse(cx - 12, cy - 7, 15, 13);

        // Ears - pointed with ice
        g.fillStyle(color);
        g.fillTriangle(cx - 18, cy - 12, cx - 20, cy - 22, cx - 14, cy - 12);
        g.fillTriangle(cx - 8, cy - 12, cx - 6, cy - 22, cx - 4, cy - 12);
        g.fillStyle(lighter);
        g.fillTriangle(cx - 17, cy - 12, cx - 19, cy - 20, cx - 15, cy - 12);
        g.fillTriangle(cx - 7, cy - 12, cx - 5, cy - 20, cx - 5, cy - 12);
        // Ice ear tips
        g.fillStyle(0xAADDFF);
        g.fillTriangle(cx - 21, cy - 22, cx - 19, cy - 18, cx - 20, cy - 24);
        g.fillTriangle(cx - 5, cy - 22, cx - 7, cy - 18, cx - 6, cy - 24);

        // Piercing eyes
        g.fillStyle(0x000000);
        g.fillRect(cx - 17, cy - 9, 6, 4);
        g.fillRect(cx - 9, cy - 9, 6, 4);
        g.fillStyle(0x00CCFF);
        g.fillRect(cx - 16, cy - 8, 4, 3);
        g.fillRect(cx - 8, cy - 8, 4, 3);
        g.fillStyle(0x00EEFF);
        g.fillRect(cx - 16, cy - 8, 2, 2);
        g.fillRect(cx - 8, cy - 8, 2, 2);
        // Eye glow
        g.fillStyle(0x00CCFF, 0.2);
        g.fillCircle(cx - 14, cy - 7, 5);
        g.fillCircle(cx - 6, cy - 7, 5);

        // Nose
        g.fillStyle(0x88AACC);
        g.fillRect(cx - 13, cy - 3, 3, 2);

        // Mouth snarl
        g.fillStyle(0x000000, 0.6);
        g.fillRect(cx - 16, cy - 1, 8, 1);
        // Fangs
        g.fillStyle(0xFFFFFF);
        g.fillRect(cx - 15, cy - 1, 1, 2);
        g.fillRect(cx - 10, cy - 1, 1, 2);

        // Whiskers - ice crystal whiskers
        g.fillStyle(0xAADDFF, 0.6);
        g.fillRect(cx - 22, cy - 6, 5, 1);
        g.fillRect(cx - 21, cy - 3, 4, 1);
        g.fillRect(cx - 2, cy - 6, 5, 1);
        g.fillRect(cx - 2, cy - 3, 4, 1);
        break;
      }

      case 'glacial-golem': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Frost aura
        g.fillStyle(0xAADDFF, 0.15);
        g.fillEllipse(cx, cy + 2, 40, 44);

        // Main body - ice blocks stacked
        g.fillStyle(darker);
        g.fillRect(cx - 14, cy - 4, 28, 26);
        g.fillStyle(color);
        g.fillRect(cx - 13, cy - 3, 26, 24);

        // Ice block texture - cracks and facets
        g.fillStyle(lighter, 0.6);
        g.fillRect(cx - 12, cy - 2, 12, 10);
        g.fillStyle(lightest, 0.4);
        g.fillRect(cx - 10, cy - 1, 7, 6);

        // Ice crack lines
        g.fillStyle(darker, 0.3);
        g.fillRect(cx - 1, cy - 2, 1, 22);
        g.fillRect(cx - 12, cy + 8, 24, 1);
        g.fillRect(cx + 4, cy + 2, 1, 12);
        g.fillRect(cx - 8, cy + 14, 16, 1);

        // Semi-transparent ice effect highlights
        g.fillStyle(0xFFFFFF, 0.2);
        g.fillRect(cx + 2, cy, 8, 6);
        g.fillRect(cx - 6, cy + 10, 6, 4);

        // Head - angular ice block
        g.fillStyle(darker);
        g.fillRect(cx - 10, cy - 20, 20, 18);
        g.fillStyle(color);
        g.fillRect(cx - 9, cy - 19, 18, 16);

        // Head ice facets
        g.fillStyle(lighter);
        g.fillRect(cx - 8, cy - 18, 10, 8);
        g.fillStyle(lightest, 0.5);
        g.fillRect(cx - 6, cy - 17, 6, 4);

        // Icicle crown on top
        g.fillStyle(0xAADDFF);
        g.fillTriangle(cx - 8, cy - 20, cx - 6, cy - 28, cx - 4, cy - 20);
        g.fillTriangle(cx - 3, cy - 20, cx, cy - 30, cx + 3, cy - 20);
        g.fillTriangle(cx + 4, cy - 20, cx + 6, cy - 26, cx + 8, cy - 20);
        g.fillStyle(0xDDEEFF, 0.7);
        g.fillTriangle(cx - 7, cy - 20, cx - 6, cy - 27, cx - 5, cy - 20);
        g.fillTriangle(cx - 2, cy - 20, cx, cy - 29, cx + 2, cy - 20);
        g.fillTriangle(cx + 5, cy - 20, cx + 6, cy - 25, cx + 7, cy - 20);

        // Eyes - cold blue glow
        g.fillStyle(0x000000);
        g.fillRect(cx - 7, cy - 14, 5, 5);
        g.fillRect(cx + 2, cy - 14, 5, 5);
        g.fillStyle(0x0088FF);
        g.fillRect(cx - 6, cy - 13, 3, 3);
        g.fillRect(cx + 3, cy - 13, 3, 3);
        g.fillStyle(0x44BBFF);
        g.fillRect(cx - 6, cy - 13, 2, 2);
        g.fillRect(cx + 3, cy - 13, 2, 2);
        // Eye glow
        g.fillStyle(0x0088FF, 0.2);
        g.fillCircle(cx - 5, cy - 12, 5);
        g.fillCircle(cx + 5, cy - 12, 5);

        // Mouth crack
        g.fillStyle(0x000000, 0.5);
        g.fillRect(cx - 4, cy - 6, 8, 2);
        g.fillStyle(0x0088FF, 0.3);
        g.fillRect(cx - 3, cy - 6, 6, 1);

        // Left arm - icicle arm
        g.fillStyle(darker);
        g.fillLimb(cx - 14, cy, 6, cx - 24, cy + 10, 5);
        g.fillStyle(color);
        g.fillLimb(cx - 14, cy, 5, cx - 23, cy + 9, 4);
        // Icicle fist/fingers
        g.fillStyle(0xAADDFF);
        g.fillTriangle(cx - 26, cy + 8, cx - 28, cy + 18, cx - 22, cy + 12);
        g.fillTriangle(cx - 24, cy + 10, cx - 24, cy + 20, cx - 20, cy + 12);
        g.fillStyle(0xDDEEFF, 0.6);
        g.fillTriangle(cx - 25, cy + 9, cx - 27, cy + 16, cx - 23, cy + 11);

        // Right arm
        g.fillStyle(darker);
        g.fillLimb(cx + 14, cy, 6, cx + 24, cy + 8, 5);
        g.fillStyle(color);
        g.fillLimb(cx + 14, cy, 5, cx + 23, cy + 7, 4);
        // Icicle fist
        g.fillStyle(0xAADDFF);
        g.fillTriangle(cx + 22, cy + 6, cx + 28, cy + 16, cx + 26, cy + 8);
        g.fillTriangle(cx + 20, cy + 8, cx + 24, cy + 18, cx + 24, cy + 10);
        g.fillStyle(0xDDEEFF, 0.6);
        g.fillTriangle(cx + 23, cy + 7, cx + 27, cy + 14, cx + 25, cy + 9);

        // Legs - ice pillars
        g.fillStyle(darker);
        g.fillRect(cx - 10, cy + 18, 8, 8);
        g.fillRect(cx + 2, cy + 18, 8, 8);
        g.fillStyle(color);
        g.fillRect(cx - 9, cy + 18, 6, 7);
        g.fillRect(cx + 3, cy + 18, 6, 7);
        g.fillStyle(lighter, 0.4);
        g.fillRect(cx - 9, cy + 18, 3, 4);
        g.fillRect(cx + 3, cy + 18, 3, 4);

        // Frost particles
        g.fillStyle(0xFFFFFF, 0.5);
        g.fillRect(cx - 18, cy - 16, 2, 2);
        g.fillRect(cx + 16, cy - 10, 2, 2);
        g.fillRect(cx - 22, cy + 4, 1, 1);
        g.fillRect(cx + 22, cy + 2, 1, 1);
        break;
      }

      case 'temple-guard': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Weapon - ancient spear held to the side
        g.fillStyle(0x8B7355);
        g.fillRect(cx + 18, cy - 28, 2, 52);
        // Spear head
        g.fillStyle(0xCCBB88);
        g.fillTriangle(cx + 16, cy - 28, cx + 19, cy - 34, cx + 22, cy - 28);
        g.fillStyle(0xDDCCA0, 0.6);
        g.fillTriangle(cx + 17, cy - 28, cx + 19, cy - 33, cx + 19, cy - 28);

        // Body - stone/bronze armor
        g.fillStyle(darker);
        g.fillRect(cx - 12, cy - 4, 24, 24);
        g.fillStyle(color);
        g.fillRect(cx - 11, cy - 3, 22, 22);

        // Armor chest plate detail
        g.fillStyle(lighter);
        g.fillRect(cx - 9, cy - 2, 18, 8);
        g.fillStyle(darker, 0.3);
        g.fillRect(cx - 1, cy - 2, 2, 20);
        // Armor segments
        g.fillStyle(darker, 0.2);
        g.fillRect(cx - 10, cy + 4, 20, 1);
        g.fillRect(cx - 10, cy + 10, 20, 1);
        g.fillRect(cx - 10, cy + 16, 20, 1);

        // Glowing rune on chest
        g.fillStyle(0xFFAA00, 0.7);
        g.fillCircle(cx, cy + 2, 3);
        g.fillStyle(0xFFDD44, 0.5);
        g.fillCircle(cx, cy + 2, 2);
        // Rune glow
        g.fillStyle(0xFFAA00, 0.15);
        g.fillCircle(cx, cy + 2, 7);

        // Shoulder guards
        g.fillStyle(darker);
        g.fillRect(cx - 16, cy - 6, 6, 8);
        g.fillRect(cx + 10, cy - 6, 6, 8);
        g.fillStyle(color);
        g.fillRect(cx - 15, cy - 5, 5, 6);
        g.fillRect(cx + 11, cy - 5, 5, 6);
        // Shoulder runes
        g.fillStyle(0xFFAA00, 0.5);
        g.fillRect(cx - 14, cy - 4, 3, 1);
        g.fillRect(cx + 12, cy - 4, 3, 1);

        // Head - stone helmet
        g.fillStyle(darker);
        g.fillRect(cx - 9, cy - 22, 18, 18);
        g.fillStyle(color);
        g.fillRect(cx - 8, cy - 21, 16, 16);

        // Helmet crest
        g.fillStyle(darker);
        g.fillRect(cx - 2, cy - 26, 4, 6);
        g.fillStyle(color);
        g.fillRect(cx - 1, cy - 25, 2, 5);

        // Helmet face plate
        g.fillStyle(darker, 0.4);
        g.fillRect(cx - 7, cy - 16, 14, 10);

        // Glowing eyes behind visor
        g.fillStyle(0xFFAA00, 0.9);
        g.fillRect(cx - 5, cy - 14, 4, 3);
        g.fillRect(cx + 1, cy - 14, 4, 3);
        g.fillStyle(0xFFDD44);
        g.fillRect(cx - 4, cy - 13, 2, 2);
        g.fillRect(cx + 2, cy - 13, 2, 2);
        // Eye glow
        g.fillStyle(0xFFAA00, 0.2);
        g.fillCircle(cx - 3, cy - 13, 4);
        g.fillCircle(cx + 3, cy - 13, 4);

        // Visor slit
        g.fillStyle(0x000000, 0.5);
        g.fillRect(cx - 6, cy - 9, 12, 2);

        // Arms
        g.fillStyle(darker);
        g.fillLimb(cx - 14, cy, 5, cx - 18, cy + 14, 4);
        g.fillStyle(color);
        g.fillLimb(cx - 14, cy, 4, cx - 17, cy + 13, 3);
        // Left hand/fist
        g.fillStyle(darker);
        g.fillCircle(cx - 18, cy + 16, 4);
        g.fillStyle(color);
        g.fillCircle(cx - 18, cy + 16, 3);

        // Right arm holding spear
        g.fillStyle(darker);
        g.fillLimb(cx + 12, cy, 5, cx + 18, cy + 10, 4);
        g.fillStyle(color);
        g.fillLimb(cx + 12, cy, 4, cx + 17, cy + 9, 3);
        g.fillStyle(darker);
        g.fillCircle(cx + 18, cy + 12, 4);
        g.fillStyle(color);
        g.fillCircle(cx + 18, cy + 12, 3);

        // Legs - stone pillar legs
        g.fillStyle(darker);
        g.fillRect(cx - 10, cy + 18, 8, 8);
        g.fillRect(cx + 2, cy + 18, 8, 8);
        g.fillStyle(color);
        g.fillRect(cx - 9, cy + 18, 6, 7);
        g.fillRect(cx + 3, cy + 18, 6, 7);

        // Leg rune markings
        g.fillStyle(0xFFAA00, 0.4);
        g.fillRect(cx - 8, cy + 20, 4, 1);
        g.fillRect(cx + 4, cy + 20, 4, 1);
        g.fillRect(cx - 7, cy + 23, 2, 1);
        g.fillRect(cx + 5, cy + 23, 2, 1);

        // Stone feet
        g.fillStyle(darker);
        g.fillRect(cx - 11, cy + 24, 10, 3);
        g.fillRect(cx + 1, cy + 24, 10, 3);
        break;
      }

      case 'ancient-sphinx': {
        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, cy + 27, 40, 8);

        // Lion body - regal recumbent pose
        g.fillStyle(darker);
        g.fillEllipse(cx, cy + 12, 36, 18);
        g.fillStyle(color);
        g.fillEllipse(cx, cy + 11, 34, 16);

        // Body highlight
        g.fillStyle(lighter);
        g.fillEllipse(cx - 2, cy + 8, 20, 10);
        g.fillStyle(lightest, 0.3);
        g.fillEllipse(cx - 4, cy + 6, 12, 6);

        // Fur texture lines
        g.fillStyle(darker, 0.2);
        g.fillRect(cx - 14, cy + 8, 28, 1);
        g.fillRect(cx - 12, cy + 12, 24, 1);
        g.fillRect(cx - 10, cy + 16, 20, 1);

        // Front paws - extended
        g.fillStyle(darker);
        g.fillRect(cx - 16, cy + 18, 8, 8);
        g.fillRect(cx + 8, cy + 18, 8, 8);
        g.fillStyle(color);
        g.fillRect(cx - 15, cy + 18, 6, 7);
        g.fillRect(cx + 9, cy + 18, 6, 7);
        // Paw details
        g.fillStyle(lighter);
        g.fillRect(cx - 14, cy + 18, 4, 3);
        g.fillRect(cx + 10, cy + 18, 4, 3);

        // Folded wings at sides
        g.fillStyle(darker);
        g.fillTriangle(cx - 14, cy + 2, cx - 22, cy - 8, cx - 18, cy + 14);
        g.fillTriangle(cx + 14, cy + 2, cx + 22, cy - 8, cx + 18, cy + 14);
        g.fillStyle(color);
        g.fillTriangle(cx - 13, cy + 3, cx - 20, cy - 6, cx - 17, cy + 13);
        g.fillTriangle(cx + 13, cy + 3, cx + 20, cy - 6, cx + 17, cy + 13);
        // Wing feather lines
        g.fillStyle(darker, 0.3);
        g.fillRect(cx - 20, cy - 4, 6, 1);
        g.fillRect(cx - 19, cy, 5, 1);
        g.fillRect(cx - 18, cy + 4, 4, 1);
        g.fillRect(cx + 14, cy - 4, 6, 1);
        g.fillRect(cx + 14, cy, 5, 1);
        g.fillRect(cx + 14, cy + 4, 4, 1);
        // Wing highlight
        g.fillStyle(lighter, 0.4);
        g.fillTriangle(cx - 12, cy + 4, cx - 18, cy - 4, cx - 16, cy + 10);
        g.fillTriangle(cx + 12, cy + 4, cx + 18, cy - 4, cx + 16, cy + 10);

        // Chest/neck
        g.fillStyle(darker);
        g.fillRect(cx - 6, cy - 4, 12, 10);
        g.fillStyle(color);
        g.fillRect(cx - 5, cy - 3, 10, 8);
        g.fillStyle(lighter);
        g.fillRect(cx - 3, cy - 2, 6, 6);

        // Head - human face
        g.fillStyle(darker);
        g.fillEllipse(cx, cy - 12, 14, 14);
        g.fillStyle(0xDEB887);
        g.fillEllipse(cx, cy - 12, 13, 13);

        // Egyptian headdress (nemes)
        g.fillStyle(0x1a2a6c);
        g.fillRect(cx - 10, cy - 22, 20, 6);
        // Headdress side flaps
        g.fillStyle(0x1a2a6c);
        g.fillTriangle(cx - 10, cy - 16, cx - 14, cy + 2, cx - 8, cy - 8);
        g.fillTriangle(cx + 10, cy - 16, cx + 14, cy + 2, cx + 8, cy - 8);
        // Gold stripes on headdress
        g.fillStyle(0xFFD700);
        g.fillRect(cx - 9, cy - 22, 18, 2);
        g.fillRect(cx - 9, cy - 18, 18, 1);
        // Headdress side stripe
        g.fillStyle(0xFFD700, 0.6);
        g.fillRect(cx - 12, cy - 12, 2, 10);
        g.fillRect(cx + 10, cy - 12, 2, 10);

        // Uraeus (cobra) on forehead
        g.fillStyle(0xFFD700);
        g.fillCircle(cx, cy - 22, 2);
        g.fillTriangle(cx - 1, cy - 24, cx, cy - 26, cx + 1, cy - 24);

        // Eyes - serene, wise, no highlights
        g.fillStyle(0x000000);
        g.fillRect(cx - 5, cy - 14, 4, 3);
        g.fillRect(cx + 1, cy - 14, 4, 3);
        g.fillStyle(0x8B6914);
        g.fillRect(cx - 4, cy - 13, 2, 2);
        g.fillRect(cx + 2, cy - 13, 2, 2);
        // Eye liner (Egyptian style)
        g.fillStyle(0x000000);
        g.fillRect(cx - 6, cy - 13, 1, 1);
        g.fillRect(cx + 5, cy - 13, 1, 1);
        g.fillRect(cx - 7, cy - 12, 1, 2);
        g.fillRect(cx + 6, cy - 12, 1, 2);

        // Nose
        g.fillStyle(0xC4A675);
        g.fillRect(cx - 1, cy - 10, 2, 2);

        // Serene smile
        g.fillStyle(0x8B6914, 0.6);
        g.fillRect(cx - 3, cy - 7, 6, 1);
        g.fillRect(cx - 2, cy - 6, 4, 1);

        // Tail curving up behind
        g.fillStyle(darker);
        g.fillCurvedLimb(cx + 14, cy + 14, 3, cx + 22, cy + 8, cx + 20, cy + 2, 2);
        g.fillStyle(color);
        g.fillCurvedLimb(cx + 14, cy + 14, 2, cx + 21, cy + 8, cx + 19, cy + 3, 2);
        // Tail tuft
        g.fillStyle(darker);
        g.fillCircle(cx + 19, cy + 2, 3);
        break;
      }

      case 'void-shade': {
        // Ground shadow - distorted
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(cx, cy + 27, 34, 8);

        // Reality-warping edge distortion
        g.fillStyle(0x220044, 0.3);
        g.fillEllipse(cx, cy + 2, 42, 46);
        g.fillStyle(0x110022, 0.4);
        g.fillEllipse(cx + 2, cy, 38, 42);

        // Warped edge fragments
        g.fillStyle(0x440066, 0.3);
        g.fillRect(cx - 20, cy - 18, 3, 5);
        g.fillRect(cx + 18, cy - 14, 4, 3);
        g.fillRect(cx - 22, cy + 8, 3, 4);
        g.fillRect(cx + 20, cy + 6, 3, 5);
        g.fillRect(cx - 16, cy + 18, 4, 3);
        g.fillRect(cx + 14, cy + 16, 3, 4);

        // Main body - pure darkness
        g.fillStyle(0x000000);
        g.fillEllipse(cx, cy + 2, 32, 38);

        // Dark matter texture
        g.fillStyle(0x110022, 0.8);
        g.fillEllipse(cx - 2, cy, 28, 34);
        g.fillStyle(0x1a0033, 0.5);
        g.fillEllipse(cx + 2, cy - 4, 20, 24);

        // Void cracks - purple energy lines
        g.fillStyle(0x8800CC, 0.4);
        g.fillRect(cx - 12, cy - 8, 1, 20);
        g.fillRect(cx + 10, cy - 6, 1, 18);
        g.fillRect(cx - 6, cy + 6, 14, 1);
        g.fillRect(cx - 8, cy - 4, 12, 1);

        // Multiple glowing eyes - scattered across body
        // Main eye pair - no white highlights
        g.fillStyle(0xFF0044);
        g.fillRect(cx - 7, cy - 8, 5, 3);
        g.fillRect(cx + 2, cy - 8, 5, 3);
        g.fillStyle(0xFF4488);
        g.fillRect(cx - 6, cy - 7, 3, 2);
        g.fillRect(cx + 3, cy - 7, 3, 2);

        // Secondary eyes (smaller)
        g.fillStyle(0xFF0044, 0.7);
        g.fillRect(cx - 10, cy - 2, 3, 2);
        g.fillRect(cx + 8, cy - 4, 3, 2);
        g.fillStyle(0xFF4488, 0.5);
        g.fillRect(cx - 9, cy - 2, 1, 1);
        g.fillRect(cx + 9, cy - 4, 1, 1);

        // Tertiary eyes (even smaller)
        g.fillStyle(0xFF0044, 0.5);
        g.fillRect(cx - 4, cy + 4, 2, 2);
        g.fillRect(cx + 6, cy + 2, 2, 2);
        g.fillRect(cx - 8, cy + 8, 2, 2);

        // Fourth set - tiny
        g.fillStyle(0xFF0044, 0.4);
        g.fillRect(cx + 2, cy + 10, 2, 1);
        g.fillRect(cx - 6, cy + 14, 2, 1);

        // Eye glow auras
        g.fillStyle(0xFF0044, 0.15);
        g.fillCircle(cx - 4, cy - 6, 8);
        g.fillCircle(cx + 4, cy - 6, 8);

        // Void mouth - gaping darkness
        g.fillStyle(0x000000);
        g.fillEllipse(cx, cy - 1, 8, 4);
        g.fillStyle(0x220044, 0.6);
        g.fillEllipse(cx, cy - 1, 6, 3);

        // Shadowy tendrils extending outward
        g.fillStyle(0x000000, 0.6);
        g.fillCurvedLimb(cx - 12, cy + 4, 4, cx - 24, cy - 4, cx - 20, cy + 8, 2);
        g.fillCurvedLimb(cx + 12, cy + 2, 4, cx + 24, cy - 6, cx + 22, cy + 6, 2);
        g.fillCurvedLimb(cx - 8, cy + 14, 3, cx - 18, cy + 22, cx - 14, cy + 16, 2);
        g.fillCurvedLimb(cx + 8, cy + 14, 3, cx + 18, cy + 20, cx + 16, cy + 14, 2);

        // Tendril tips glow
        g.fillStyle(0x8800CC, 0.4);
        g.fillCircle(cx - 24, cy - 2, 2);
        g.fillCircle(cx + 24, cy - 4, 2);
        g.fillCircle(cx - 18, cy + 22, 2);
        g.fillCircle(cx + 18, cy + 20, 2);

        // Floating void particles
        g.fillStyle(0x8800CC, 0.5);
        g.fillRect(cx - 18, cy - 16, 2, 2);
        g.fillRect(cx + 16, cy - 18, 2, 2);
        g.fillRect(cx - 14, cy + 20, 2, 2);
        g.fillRect(cx + 14, cy + 22, 2, 2);
        g.fillStyle(0xFF0044, 0.3);
        g.fillRect(cx - 22, cy - 10, 1, 1);
        g.fillRect(cx + 22, cy - 12, 1, 1);
        g.fillRect(cx, cy - 20, 1, 1);
        break;
      }

      case 'dark-knight': {
        // Ground shadow
        g.fillStyle(0x000000, 0.25);
        g.fillEllipse(cx, cy + 27, 36, 8);

        // Ominous dark aura
        g.fillStyle(0x220000, 0.15);
        g.fillEllipse(cx, cy + 2, 38, 44);

        // Dark sword - held to the right
        g.fillStyle(0x333333);
        g.fillRect(cx + 16, cy - 26, 3, 42);
        g.fillStyle(0x444444);
        g.fillRect(cx + 17, cy - 24, 1, 38);
        // Sword edge highlight
        g.fillStyle(0x666666, 0.5);
        g.fillRect(cx + 16, cy - 24, 1, 36);
        // Sword tip
        g.fillStyle(0x333333);
        g.fillTriangle(cx + 16, cy - 26, cx + 17, cy - 32, cx + 19, cy - 26);
        // Sword dark energy
        g.fillStyle(0xFF0000, 0.3);
        g.fillRect(cx + 15, cy - 20, 1, 30);
        g.fillRect(cx + 19, cy - 18, 1, 28);
        // Sword guard
        g.fillStyle(0x880000);
        g.fillRect(cx + 12, cy + 12, 12, 3);
        g.fillStyle(0xAA0000);
        g.fillRect(cx + 13, cy + 13, 10, 1);
        // Sword pommel
        g.fillStyle(0x880000);
        g.fillCircle(cx + 17, cy + 18, 2);

        // Cape flowing behind
        g.fillStyle(0x220000);
        g.fillTriangle(cx - 12, cy - 4, cx - 18, cy + 26, cx + 16, cy + 26);
        g.fillTriangle(cx + 10, cy - 4, cx + 20, cy + 26, cx, cy + 26);
        g.fillStyle(0x330000, 0.6);
        g.fillTriangle(cx - 8, cy, cx - 14, cy + 22, cx + 4, cy + 22);

        // Body - black full plate armor
        g.fillStyle(0x111111);
        g.fillRect(cx - 11, cy - 4, 22, 24);
        g.fillStyle(0x222222);
        g.fillRect(cx - 10, cy - 3, 20, 22);

        // Armor plate segments
        g.fillStyle(0x333333, 0.5);
        g.fillRect(cx - 9, cy - 2, 18, 6);
        g.fillStyle(0x111111);
        g.fillRect(cx - 10, cy + 4, 20, 1);
        g.fillRect(cx - 10, cy + 10, 20, 1);
        g.fillRect(cx - 10, cy + 16, 20, 1);
        // Center armor line
        g.fillStyle(0x111111);
        g.fillRect(cx - 1, cy - 3, 2, 22);

        // Dark energy rune on chest
        g.fillStyle(0xFF0000, 0.4);
        g.fillCircle(cx, cy + 2, 3);
        g.fillStyle(0xFF0000, 0.6);
        g.fillRect(cx - 1, cy + 1, 2, 2);

        // Shoulder pauldrons - large and menacing
        g.fillStyle(0x111111);
        g.fillEllipse(cx - 14, cy - 4, 10, 8);
        g.fillEllipse(cx + 14, cy - 4, 10, 8);
        g.fillStyle(0x222222);
        g.fillEllipse(cx - 14, cy - 5, 8, 6);
        g.fillEllipse(cx + 14, cy - 5, 8, 6);
        // Pauldron spikes
        g.fillStyle(0x111111);
        g.fillTriangle(cx - 18, cy - 6, cx - 18, cy - 14, cx - 14, cy - 6);
        g.fillTriangle(cx + 14, cy - 6, cx + 18, cy - 14, cx + 18, cy - 6);
        // Spike highlights
        g.fillStyle(0x333333, 0.4);
        g.fillTriangle(cx - 17, cy - 6, cx - 17, cy - 12, cx - 15, cy - 6);
        g.fillTriangle(cx + 15, cy - 6, cx + 17, cy - 12, cx + 17, cy - 6);

        // Helmet - full plate with visor
        g.fillStyle(0x111111);
        g.fillRect(cx - 9, cy - 22, 18, 18);
        g.fillStyle(0x1a1a1a);
        g.fillRect(cx - 8, cy - 21, 16, 16);

        // Helmet crest
        g.fillStyle(0x111111);
        g.fillRect(cx - 2, cy - 28, 4, 8);
        g.fillStyle(0x1a1a1a);
        g.fillRect(cx - 1, cy - 27, 2, 7);

        // Helmet horns
        g.fillStyle(0x222222);
        g.fillTriangle(cx - 8, cy - 20, cx - 14, cy - 28, cx - 6, cy - 20);
        g.fillTriangle(cx + 6, cy - 20, cx + 14, cy - 28, cx + 8, cy - 20);
        g.fillStyle(0x333333, 0.4);
        g.fillTriangle(cx - 7, cy - 20, cx - 12, cy - 26, cx - 6, cy - 20);
        g.fillTriangle(cx + 6, cy - 20, cx + 12, cy - 26, cx + 7, cy - 20);

        // Glowing red visor
        g.fillStyle(0x000000);
        g.fillRect(cx - 6, cy - 14, 12, 4);
        g.fillStyle(0xFF0000, 0.9);
        g.fillRect(cx - 5, cy - 13, 4, 2);
        g.fillRect(cx + 1, cy - 13, 4, 2);
        g.fillStyle(0xFF4444);
        g.fillRect(cx - 4, cy - 13, 2, 1);
        g.fillRect(cx + 2, cy - 13, 2, 1);
        // Visor glow
        g.fillStyle(0xFF0000, 0.15);
        g.fillCircle(cx - 3, cy - 12, 5);
        g.fillCircle(cx + 3, cy - 12, 5);

        // Visor slit (nose/mouth area)
        g.fillStyle(0x000000);
        g.fillRect(cx - 4, cy - 9, 8, 2);

        // Left arm (armored)
        g.fillStyle(0x111111);
        g.fillLimb(cx - 12, cy, 5, cx - 16, cy + 12, 4);
        g.fillStyle(0x1a1a1a);
        g.fillLimb(cx - 12, cy, 4, cx - 15, cy + 11, 3);
        // Gauntlet
        g.fillStyle(0x111111);
        g.fillCircle(cx - 16, cy + 14, 4);
        g.fillStyle(0x222222);
        g.fillCircle(cx - 16, cy + 14, 3);

        // Right arm holding sword
        g.fillStyle(0x111111);
        g.fillLimb(cx + 12, cy, 5, cx + 16, cy + 12, 4);
        g.fillStyle(0x1a1a1a);
        g.fillLimb(cx + 12, cy, 4, cx + 15, cy + 11, 3);
        g.fillStyle(0x111111);
        g.fillCircle(cx + 16, cy + 14, 4);
        g.fillStyle(0x222222);
        g.fillCircle(cx + 16, cy + 14, 3);

        // Legs - armored greaves
        g.fillStyle(0x111111);
        g.fillRect(cx - 9, cy + 18, 7, 8);
        g.fillRect(cx + 2, cy + 18, 7, 8);
        g.fillStyle(0x1a1a1a);
        g.fillRect(cx - 8, cy + 18, 5, 7);
        g.fillRect(cx + 3, cy + 18, 5, 7);

        // Armored boots
        g.fillStyle(0x111111);
        g.fillRect(cx - 10, cy + 24, 9, 3);
        g.fillRect(cx + 1, cy + 24, 9, 3);
        g.fillStyle(0x1a1a1a);
        g.fillRect(cx - 9, cy + 24, 4, 2);
        g.fillRect(cx + 2, cy + 24, 4, 2);

        // Dark energy wisps
        g.fillStyle(0xFF0000, 0.2);
        g.fillRect(cx - 20, cy - 10, 2, 3);
        g.fillRect(cx + 20, cy - 8, 2, 3);
        g.fillStyle(0x880000, 0.3);
        g.fillRect(cx - 18, cy + 18, 2, 2);
        g.fillRect(cx + 18, cy + 16, 2, 2);
        break;
      }
      default: {
        // Fallback - draw a simple shape
        g.fillStyle(0xff00ff, 1);
        g.fillRect(16, 16, 32, 32);
        break;
      }
  }
}

function generateTile(scene: Phaser.Scene, key: string, color: number, alt: number, decorator?: (g: ScaledGraphics) => void, nativeDecorator?: (g: ScaledGraphics) => void): void {
  const s = TILE_LOGICAL; // 24
  const g = scene.add.graphics().setVisible(false);
  const sg = new ScaledGraphics(g, SPRITE_SCALE);
  sg.fillStyle(color);
  sg.fillRect(0, 0, s, s);
  if (nativeDecorator) {
    // New high-detail decorator — draws directly at 24×24
    nativeDecorator(sg);
  } else if (decorator) {
    // Legacy 16×16 decorator — upscale through wrapper
    sg.fillStyle(alt);
    for (let i = 0; i < 8; i++) {
      sg.fillRect(Math.floor(Math.random() * 20) + 1, Math.floor(Math.random() * 20) + 1, 2, 2);
    }
    const ug = new UpscaledGraphics(sg);
    decorator(ug as unknown as ScaledGraphics);
  }
  g.generateTexture(key, s * SPRITE_SCALE, s * SPRITE_SCALE);
  g.destroy();
}

function generateTilesets(scene: Phaser.Scene): void {
  // Overworld tiles: 0=grass, 1=path, 2=water, 3=tree, 4=mountain, 5=bridge, 6=town, 7=cave, 8=castle
  // ow-0: Natural grass — rich multi-shade green with blade hints and wildflowers
  generateTile(scene, 'ow-0', 0x3d9e3d, 0x4aad4a, undefined, g => {
    // Diagonal shading: top-left lighter, bottom-right darker
    g.fillStyle(0x358c35);
    g.fillRect(12, 12, 12, 12);
    g.fillRect(8, 16, 16, 8);
    // Dark shadow patches
    g.fillStyle(0x2a7a2a);
    g.fillRect(0, 5, 5, 3);
    g.fillRect(14, 0, 4, 3);
    g.fillRect(18, 10, 5, 4);
    g.fillRect(3, 17, 5, 3);
    g.fillRect(10, 20, 6, 3);
    // Mid-dark tone patches
    g.fillStyle(0x318831);
    g.fillRect(6, 2, 4, 3);
    g.fillRect(12, 6, 5, 3);
    g.fillRect(1, 12, 4, 3);
    g.fillRect(20, 4, 3, 3);
    g.fillRect(8, 14, 4, 3);
    // Mid-tone variation
    g.fillStyle(0x378f37);
    g.fillRect(8, 8, 3, 2);
    g.fillRect(17, 2, 3, 2);
    g.fillRect(2, 9, 3, 1);
    g.fillRect(20, 17, 3, 2);
    g.fillRect(14, 14, 3, 2);
    // Bright highlights (sun-touched)
    g.fillStyle(0x52b852);
    g.fillRect(3, 1, 2, 1);
    g.fillRect(10, 4, 1, 1);
    g.fillRect(19, 1, 1, 1);
    g.fillRect(1, 7, 1, 1);
    g.fillRect(22, 6, 1, 1);
    g.fillRect(6, 11, 1, 1);
    g.fillRect(16, 9, 1, 1);
    g.fillRect(5, 19, 1, 1);
    g.fillRect(15, 18, 1, 1);
    g.fillRect(22, 21, 1, 1);
    // Very bright highlight spots
    g.fillStyle(0x5ec45e);
    g.fillRect(9, 1, 1, 1);
    g.fillRect(21, 8, 1, 1);
    g.fillRect(0, 15, 1, 1);
    g.fillRect(13, 22, 1, 1);
    // Grass blade hints (1px vertical marks)
    g.fillStyle(0x2e8a2e);
    g.fillRect(4, 3, 1, 2);
    g.fillRect(11, 6, 1, 2);
    g.fillRect(19, 5, 1, 2);
    g.fillRect(7, 13, 1, 2);
    g.fillRect(16, 16, 1, 2);
    g.fillRect(1, 20, 1, 2);
    g.fillRect(22, 14, 1, 2);
    g.fillStyle(0x46a846);
    g.fillRect(14, 3, 1, 2);
    g.fillRect(2, 10, 1, 2);
    g.fillRect(21, 19, 1, 2);
    g.fillRect(9, 17, 1, 2);
    // Wildflower hints
    g.fillStyle(0xddcc33); // yellow flower
    g.fillRect(6, 6, 1, 1);
    g.fillStyle(0xcc3344); // red flower
    g.fillRect(17, 13, 1, 1);
  });
  // ow-1: Sandy path with cobblestone pattern and edge grass
  generateTile(scene, 'ow-1', 0xccbb88, 0xbbaa77, undefined, g => {
    // Worn center track
    g.fillStyle(0xc4b080);
    g.fillRect(5, 0, 14, 24);
    // Cobblestone pattern - mortar lines (darker)
    g.fillStyle(0x998866);
    // Horizontal mortar
    g.fillRect(3, 4, 18, 1);
    g.fillRect(3, 9, 18, 1);
    g.fillRect(3, 14, 18, 1);
    g.fillRect(3, 19, 18, 1);
    // Vertical mortar - offset rows
    g.fillRect(6, 0, 1, 4);
    g.fillRect(12, 0, 1, 4);
    g.fillRect(18, 0, 1, 4);
    g.fillRect(9, 5, 1, 4);
    g.fillRect(15, 5, 1, 4);
    g.fillRect(6, 10, 1, 4);
    g.fillRect(12, 10, 1, 4);
    g.fillRect(18, 10, 1, 4);
    g.fillRect(9, 15, 1, 4);
    g.fillRect(15, 15, 1, 4);
    g.fillRect(6, 20, 1, 4);
    g.fillRect(12, 20, 1, 4);
    // Stone highlight tops
    g.fillStyle(0xddd0a8);
    g.fillRect(7, 1, 4, 1);
    g.fillRect(13, 1, 4, 1);
    g.fillRect(10, 6, 4, 1);
    g.fillRect(7, 11, 4, 1);
    g.fillRect(13, 11, 4, 1);
    g.fillRect(10, 16, 4, 1);
    g.fillRect(7, 21, 4, 1);
    // Scattered pebbles
    g.fillStyle(0xaa9966);
    g.fillRect(4, 2, 1, 1);
    g.fillRect(19, 7, 1, 1);
    g.fillRect(8, 13, 1, 1);
    g.fillRect(16, 17, 1, 1);
    g.fillRect(5, 22, 1, 1);
    // Dirt variation
    g.fillStyle(0xb8a570);
    g.fillRect(10, 3, 2, 1);
    g.fillRect(14, 8, 2, 1);
    g.fillRect(7, 18, 2, 1);
    // Edge grass tufts (left)
    g.fillStyle(0x3d9e3d);
    g.fillRect(0, 3, 2, 2);
    g.fillRect(0, 10, 1, 3);
    g.fillRect(1, 11, 1, 1);
    g.fillRect(0, 18, 2, 2);
    // Edge grass tufts (right)
    g.fillRect(22, 5, 2, 2);
    g.fillRect(23, 13, 1, 2);
    g.fillRect(22, 20, 2, 2);
    // Darker grass accents
    g.fillStyle(0x2e8a2e);
    g.fillRect(0, 4, 1, 1);
    g.fillRect(23, 6, 1, 1);
    g.fillRect(0, 19, 1, 1);
  });
  // ow-2: Ocean water — deep blue with wave bands, foam, and depth variation
  generateTile(scene, 'ow-2', 0x2855b8, 0x3060c0, undefined, g => {
    // Depth variation: darker patches
    g.fillStyle(0x1e48a0);
    g.fillRect(0, 0, 12, 6);
    g.fillRect(14, 14, 10, 10);
    g.fillStyle(0x224da8);
    g.fillRect(10, 8, 14, 6);
    g.fillRect(0, 16, 10, 8);
    // Wave bands - lighter blue horizontal streaks
    g.fillStyle(0x3a6ed0);
    g.fillRect(1, 3, 10, 1);
    g.fillRect(14, 4, 8, 1);
    g.fillRect(3, 11, 12, 1);
    g.fillRect(0, 12, 6, 1);
    g.fillRect(16, 11, 7, 1);
    g.fillRect(5, 19, 14, 1);
    g.fillRect(0, 20, 4, 1);
    // Secondary wave highlights
    g.fillStyle(0x4278d8);
    g.fillRect(2, 3, 6, 1);
    g.fillRect(15, 4, 5, 1);
    g.fillRect(5, 11, 8, 1);
    g.fillRect(7, 19, 10, 1);
    // Foam highlights on wave crests (white/light blue dots)
    g.fillStyle(0x88aaee);
    g.fillRect(3, 3, 1, 1);
    g.fillRect(7, 3, 1, 1);
    g.fillRect(16, 4, 1, 1);
    g.fillRect(20, 4, 1, 1);
    g.fillRect(6, 11, 1, 1);
    g.fillRect(10, 11, 1, 1);
    g.fillRect(8, 19, 1, 1);
    g.fillRect(13, 19, 1, 1);
    // Bright foam specks
    g.fillStyle(0xaaccff);
    g.fillRect(5, 3, 1, 1);
    g.fillRect(18, 4, 1, 1);
    g.fillRect(8, 11, 1, 1);
    g.fillRect(11, 19, 1, 1);
    // Subtle ripple texture between waves
    g.fillStyle(0x2c58b8);
    g.fillRect(4, 7, 3, 1);
    g.fillRect(13, 8, 4, 1);
    g.fillRect(1, 15, 3, 1);
    g.fillRect(18, 16, 4, 1);
    g.fillRect(8, 23, 5, 1);
    // Deep shadow patches
    g.fillStyle(0x1a4090);
    g.fillRect(2, 1, 3, 1);
    g.fillRect(18, 9, 3, 1);
    g.fillRect(6, 15, 3, 1);
    g.fillRect(14, 22, 3, 1);
  });
  // ow-3: Tree — layered evergreen with trunk, foliage shading, and ground shadow
  generateTile(scene, 'ow-3', 0x3d9e3d, 0x4aad4a, undefined, g => {
    // Ground shadow beneath tree (darker green ellipse)
    g.fillStyle(0x2a7a2a);
    g.fillRect(6, 20, 12, 3);
    g.fillRect(8, 19, 8, 1);
    g.fillRect(7, 22, 10, 2);
    // Tree trunk - 3 shades of brown, 4px wide centered
    g.fillStyle(0x5a3a1a);
    g.fillRect(10, 17, 4, 6);
    g.fillStyle(0x4a2e14);
    g.fillRect(10, 17, 2, 6); // shadow side
    g.fillStyle(0x6a4828);
    g.fillRect(13, 17, 1, 6); // highlight side
    // Bark texture
    g.fillStyle(0x3a2010);
    g.fillRect(11, 19, 1, 1);
    g.fillRect(12, 21, 1, 1);
    // Lower foliage layer (widest, darkest)
    g.fillStyle(0x143c12);
    g.fillRect(3, 13, 18, 5);
    g.fillRect(4, 12, 16, 1);
    g.fillRect(5, 11, 14, 1);
    // Mid foliage layer
    g.fillStyle(0x174514);
    g.fillRect(5, 8, 14, 4);
    g.fillRect(6, 7, 12, 1);
    g.fillRect(7, 6, 10, 1);
    // Upper foliage layer
    g.fillStyle(0x1a5018);
    g.fillRect(7, 4, 10, 3);
    g.fillRect(8, 3, 8, 1);
    g.fillRect(9, 2, 6, 1);
    // Top spike
    g.fillStyle(0x1e5c1a);
    g.fillRect(11, 0, 2, 2);
    g.fillRect(10, 1, 4, 1);
    // Sun-touched highlights (top and right side lighter)
    g.fillStyle(0x226a1e);
    g.fillRect(11, 1, 1, 1);
    g.fillRect(13, 3, 3, 1);
    g.fillRect(15, 5, 2, 1);
    g.fillRect(16, 7, 2, 1);
    g.fillRect(17, 9, 2, 1);
    g.fillRect(18, 11, 2, 1);
    g.fillRect(18, 13, 2, 1);
    // Bright highlight spots
    g.fillStyle(0x2a7a24);
    g.fillRect(12, 2, 1, 1);
    g.fillRect(15, 6, 1, 1);
    g.fillRect(17, 8, 1, 1);
    g.fillRect(14, 4, 1, 1);
    g.fillRect(19, 12, 1, 1);
    // Shadow depth on left/bottom
    g.fillStyle(0x103410);
    g.fillRect(3, 14, 2, 3);
    g.fillRect(5, 11, 2, 1);
    g.fillRect(5, 15, 1, 2);
    g.fillRect(7, 7, 1, 1);
  });
  // ow-4: Mountain range — two peaks with snow caps, rock texture, valley shadow
  generateTile(scene, 'ow-4', 0x7a6b5a, 0x6e6050, undefined, g => {
    // Base rock mass
    g.fillStyle(0x6e6050);
    g.fillRect(0, 14, 24, 10);
    // Left peak (taller, main)
    g.fillStyle(0x6e6050);
    g.fillRect(2, 11, 10, 3);
    g.fillRect(3, 9, 8, 2);
    g.fillRect(4, 7, 6, 2);
    g.fillRect(5, 5, 4, 2);
    g.fillRect(6, 3, 3, 2);
    g.fillRect(7, 2, 2, 1);
    // Right peak (shorter)
    g.fillStyle(0x6e6050);
    g.fillRect(12, 12, 11, 2);
    g.fillRect(13, 10, 9, 2);
    g.fillRect(14, 8, 7, 2);
    g.fillRect(15, 6, 5, 2);
    g.fillRect(16, 5, 3, 1);
    g.fillRect(17, 4, 2, 1);
    // Left peak shadow face (left side darker)
    g.fillStyle(0x5a4e42);
    g.fillRect(0, 14, 7, 10);
    g.fillRect(2, 11, 4, 3);
    g.fillRect(3, 9, 3, 2);
    g.fillRect(4, 7, 2, 2);
    g.fillRect(5, 5, 2, 2);
    g.fillRect(6, 3, 1, 2);
    // Right peak shadow face
    g.fillStyle(0x5a4e42);
    g.fillRect(12, 12, 4, 2);
    g.fillRect(13, 10, 3, 2);
    g.fillRect(14, 8, 2, 2);
    g.fillRect(15, 6, 1, 2);
    // Left peak highlight (right face)
    g.fillStyle(0x8a7c6c);
    g.fillRect(9, 9, 3, 5);
    g.fillRect(8, 7, 2, 2);
    g.fillRect(8, 5, 1, 2);
    // Right peak highlight
    g.fillStyle(0x8a7c6c);
    g.fillRect(20, 8, 3, 6);
    g.fillRect(19, 6, 2, 2);
    g.fillRect(18, 5, 1, 1);
    // Valley between peaks (dark shadow)
    g.fillStyle(0x504538);
    g.fillRect(10, 13, 4, 4);
    g.fillRect(11, 12, 2, 1);
    // Snow on left peak
    g.fillStyle(0xe8e4e0);
    g.fillRect(7, 2, 2, 1);
    g.fillRect(6, 3, 3, 1);
    g.fillRect(5, 4, 4, 1);
    // Snow transition (light gray)
    g.fillStyle(0xc8c0b8);
    g.fillRect(5, 5, 1, 1);
    g.fillRect(8, 4, 1, 1);
    g.fillRect(4, 5, 1, 1);
    // Snow on right peak
    g.fillStyle(0xe8e4e0);
    g.fillRect(17, 4, 2, 1);
    g.fillRect(16, 5, 3, 1);
    g.fillRect(15, 6, 4, 1);
    // Snow transition right
    g.fillStyle(0xc8c0b8);
    g.fillRect(15, 6, 1, 1);
    g.fillRect(18, 6, 1, 1);
    // Rock crack texture
    g.fillStyle(0x4a4038);
    g.fillRect(4, 12, 1, 2);
    g.fillRect(7, 10, 1, 1);
    g.fillRect(3, 16, 1, 2);
    g.fillRect(8, 15, 1, 1);
    g.fillRect(15, 11, 1, 1);
    g.fillRect(20, 13, 1, 2);
    g.fillRect(17, 15, 1, 1);
    // Rock highlight texture
    g.fillStyle(0x968878);
    g.fillRect(9, 14, 1, 1);
    g.fillRect(6, 18, 1, 1);
    g.fillRect(14, 16, 1, 1);
    g.fillRect(21, 17, 1, 1);
    g.fillRect(18, 10, 1, 1);
  });
  // ow-5: Bridge — wooden planks with rope rails and grass edges
  generateTile(scene, 'ow-5', 0xccbb88, 0xbbaa77, undefined, g => {
    // Wood plank base (warm brown)
    g.fillStyle(0x8a6a3a);
    g.fillRect(3, 0, 18, 24);
    // Individual plank lines (horizontal gaps)
    g.fillStyle(0x6a4e28);
    g.fillRect(3, 3, 18, 1);
    g.fillRect(3, 7, 18, 1);
    g.fillRect(3, 11, 18, 1);
    g.fillRect(3, 15, 18, 1);
    g.fillRect(3, 19, 18, 1);
    g.fillRect(3, 23, 18, 1);
    // Plank wood grain highlights
    g.fillStyle(0x9a7a48);
    g.fillRect(5, 1, 6, 1);
    g.fillRect(14, 2, 5, 1);
    g.fillRect(7, 5, 8, 1);
    g.fillRect(4, 9, 5, 1);
    g.fillRect(15, 10, 4, 1);
    g.fillRect(6, 13, 7, 1);
    g.fillRect(12, 17, 6, 1);
    g.fillRect(5, 21, 5, 1);
    g.fillRect(15, 22, 4, 1);
    // Darker plank variation
    g.fillStyle(0x7a5a30);
    g.fillRect(4, 4, 7, 3);
    g.fillRect(14, 8, 6, 3);
    g.fillRect(6, 16, 8, 3);
    g.fillRect(4, 20, 5, 3);
    // Rope/rail on left side
    g.fillStyle(0x554422);
    g.fillRect(2, 0, 1, 24);
    g.fillStyle(0x665533);
    g.fillRect(1, 0, 1, 24);
    // Rope/rail on right side
    g.fillStyle(0x554422);
    g.fillRect(21, 0, 1, 24);
    g.fillStyle(0x665533);
    g.fillRect(22, 0, 1, 24);
    // Rail post highlights
    g.fillStyle(0x776644);
    g.fillRect(1, 0, 1, 1);
    g.fillRect(1, 6, 1, 1);
    g.fillRect(1, 12, 1, 1);
    g.fillRect(1, 18, 1, 1);
    g.fillRect(22, 3, 1, 1);
    g.fillRect(22, 9, 1, 1);
    g.fillRect(22, 15, 1, 1);
    g.fillRect(22, 21, 1, 1);
    // Grass blending on edges
    g.fillStyle(0x3d9e3d);
    g.fillRect(0, 2, 1, 3);
    g.fillRect(0, 10, 1, 3);
    g.fillRect(0, 18, 1, 2);
    g.fillRect(23, 0, 1, 2);
    g.fillRect(23, 8, 1, 3);
    g.fillRect(23, 16, 1, 3);
    // Darker grass
    g.fillStyle(0x2e8a2e);
    g.fillRect(0, 3, 1, 1);
    g.fillRect(23, 9, 1, 1);
  });
  // ow-6: Town/Village — two houses with roofs, path, chimney, fence
  generateTile(scene, 'ow-6', 0x44aa44, 0x55bb55, undefined, g => {
    // Cobblestone path leading to buildings
    g.fillStyle(0xbbaa77);
    g.fillRect(7, 18, 10, 6);
    g.fillStyle(0xaa9966);
    g.fillRect(9, 19, 1, 1);
    g.fillRect(12, 21, 1, 1);
    g.fillRect(14, 20, 1, 1);
    g.fillRect(8, 22, 1, 1);
    g.fillStyle(0xccbb88);
    g.fillRect(10, 20, 2, 1);
    g.fillRect(13, 22, 2, 1);
    // House 1 (left, larger) — stone walls + red peaked roof
    g.fillStyle(0xddcc99);
    g.fillRect(1, 10, 9, 11);
    // Roof shingles
    g.fillStyle(0xcc4422);
    g.fillTriangle(5, 4, 0, 11, 11, 11);
    // Darker shingle row
    g.fillStyle(0xbb3311);
    g.fillRect(1, 10, 9, 1);
    g.fillRect(3, 8, 5, 1);
    // Window on house 1
    g.fillStyle(0x88bbdd);
    g.fillRect(3, 13, 3, 3);
    g.fillStyle(0x664422);
    g.fillRect(4, 13, 1, 3); // window cross vertical
    g.fillRect(3, 14, 3, 1); // window cross horizontal
    // Door on house 1
    g.fillStyle(0x774422);
    g.fillRect(7, 15, 2, 6);
    g.fillStyle(0xddaa33);
    g.fillRect(8, 18, 1, 1); // doorknob
    // Chimney on house 1
    g.fillStyle(0x666666);
    g.fillRect(3, 3, 2, 3);
    g.fillStyle(0x888888);
    g.fillRect(3, 3, 2, 1); // chimney cap
    g.fillStyle(0x555555);
    g.fillRect(3, 4, 1, 2); // chimney shadow
    // House 2 (right, behind) — brown roof
    g.fillStyle(0xccaa77);
    g.fillRect(12, 7, 10, 12);
    // Roof 2
    g.fillStyle(0xbb5522);
    g.fillTriangle(17, 2, 11, 8, 23, 8);
    g.fillStyle(0xaa4411);
    g.fillRect(12, 7, 10, 1); // eave shadow
    g.fillRect(14, 5, 6, 1);
    // Window on house 2
    g.fillStyle(0x88bbdd);
    g.fillRect(19, 10, 2, 2);
    g.fillStyle(0x664422);
    g.fillRect(20, 10, 1, 2);
    // Second window
    g.fillStyle(0x88bbdd);
    g.fillRect(13, 10, 2, 2);
    g.fillStyle(0x664422);
    g.fillRect(14, 10, 1, 2);
    // Door on house 2
    g.fillStyle(0x774422);
    g.fillRect(16, 13, 2, 6);
    g.fillStyle(0xddaa33);
    g.fillRect(17, 16, 1, 1);
    // Fence posts and rail
    g.fillStyle(0x886644);
    g.fillRect(0, 19, 1, 3);
    g.fillRect(3, 19, 1, 3);
    g.fillRect(6, 19, 1, 3);
    g.fillStyle(0x997755);
    g.fillRect(0, 20, 7, 1); // fence rail
    // Stone wall texture on house 1
    g.fillStyle(0xccbb88);
    g.fillRect(1, 14, 1, 1);
    g.fillRect(1, 17, 1, 1);
    g.fillRect(6, 12, 1, 1);
    g.fillRect(6, 16, 1, 1);
  });
  // ow-7: Cave entrance — rocky cliff face with dark arch opening
  generateTile(scene, 'ow-7', 0x44aa44, 0x55bb55, undefined, g => {
    // Rocky cliff face base
    g.fillStyle(0x777766);
    g.fillRect(1, 4, 22, 18);
    // Rounded cliff top
    g.fillStyle(0x777766);
    g.fillRect(2, 3, 20, 1);
    g.fillRect(3, 2, 18, 1);
    g.fillRect(5, 1, 14, 1);
    // Rock ledge above entrance (highlight)
    g.fillStyle(0x999988);
    g.fillRect(3, 2, 18, 1);
    g.fillRect(5, 1, 14, 1);
    g.fillRect(2, 3, 20, 1);
    // Mid-tone rock texture bands
    g.fillStyle(0x666655);
    g.fillRect(1, 8, 22, 1);
    g.fillRect(2, 14, 20, 1);
    g.fillRect(1, 19, 22, 1);
    // Darker rock shadows and cracks
    g.fillStyle(0x555544);
    g.fillRect(5, 5, 1, 3);
    g.fillRect(16, 4, 1, 4);
    g.fillRect(3, 11, 1, 3);
    g.fillRect(19, 10, 1, 3);
    g.fillRect(8, 3, 1, 2);
    g.fillRect(14, 6, 1, 2);
    // Rock highlight patches
    g.fillStyle(0x8a8a78);
    g.fillRect(4, 5, 2, 1);
    g.fillRect(17, 5, 3, 1);
    g.fillRect(2, 10, 2, 1);
    g.fillRect(19, 16, 2, 1);
    // Cave entrance — dark arch
    g.fillStyle(0x111111);
    g.fillRect(6, 10, 12, 12);
    g.fillRect(7, 9, 10, 1);
    g.fillRect(8, 8, 8, 1);
    g.fillRect(9, 7, 6, 1);
    g.fillRect(10, 6, 4, 1);
    // Very dark interior depth (gradient darker toward center)
    g.fillStyle(0x050505);
    g.fillRect(8, 11, 8, 11);
    g.fillRect(9, 10, 6, 1);
    g.fillRect(10, 9, 4, 1);
    g.fillRect(11, 8, 2, 1);
    // Deepest black center
    g.fillStyle(0x020202);
    g.fillRect(9, 14, 6, 8);
    g.fillRect(10, 12, 4, 2);
    // Cave entrance border / lip (rock edge around opening)
    g.fillStyle(0x888877);
    g.fillRect(5, 10, 1, 12);
    g.fillRect(18, 10, 1, 12);
    g.fillRect(6, 9, 1, 1);
    g.fillRect(17, 9, 1, 1);
    g.fillRect(7, 8, 1, 1);
    g.fillRect(16, 8, 1, 1);
    g.fillRect(8, 7, 1, 1);
    g.fillRect(15, 7, 1, 1);
    g.fillRect(9, 6, 1, 1);
    g.fillRect(14, 6, 1, 1);
    // Moss/grass at base blending with ground
    g.fillStyle(0x44aa44);
    g.fillRect(0, 20, 5, 4);
    g.fillRect(19, 20, 5, 4);
    g.fillRect(0, 18, 3, 2);
    g.fillRect(21, 18, 3, 2);
    g.fillStyle(0x3d9e3d);
    g.fillRect(1, 19, 2, 1);
    g.fillRect(21, 19, 2, 1);
    // Darker grass shadow
    g.fillStyle(0x2e8a2e);
    g.fillRect(0, 21, 2, 1);
    g.fillRect(22, 21, 2, 1);
  });
  // ow-8: Castle — turrets with crenellations, gate, stone texture, pennants
  generateTile(scene, 'ow-8', 0x44aa44, 0x55bb55, undefined, g => {
    // Left turret (tall)
    g.fillStyle(0x6a6a7a);
    g.fillRect(1, 3, 6, 20);
    // Right turret
    g.fillRect(17, 3, 6, 20);
    // Left turret crenellations (battlements)
    g.fillStyle(0x7a7a8a);
    g.fillRect(1, 1, 2, 2);
    g.fillRect(4, 1, 2, 2);
    g.fillStyle(0x6a6a7a);
    g.fillRect(3, 2, 1, 1);
    g.fillRect(6, 2, 1, 1);
    // Right turret crenellations
    g.fillStyle(0x7a7a8a);
    g.fillRect(18, 1, 2, 2);
    g.fillRect(21, 1, 2, 2);
    g.fillStyle(0x6a6a7a);
    g.fillRect(17, 2, 1, 1);
    g.fillRect(20, 2, 1, 1);
    // Main castle wall (center, lower)
    g.fillStyle(0x606070);
    g.fillRect(6, 6, 12, 17);
    // Wall-top crenellations (center)
    g.fillStyle(0x7a7a8a);
    g.fillRect(7, 5, 2, 1);
    g.fillRect(10, 5, 2, 1);
    g.fillRect(13, 5, 2, 1);
    g.fillRect(16, 5, 2, 1);
    // Stone mortar lines — horizontal
    g.fillStyle(0x555565);
    g.fillRect(6, 9, 12, 1);
    g.fillRect(6, 13, 12, 1);
    g.fillRect(6, 17, 12, 1);
    // Stone mortar — vertical (offset rows)
    g.fillRect(9, 6, 1, 3);
    g.fillRect(13, 6, 1, 3);
    g.fillRect(17, 6, 1, 3);
    g.fillRect(7, 10, 1, 3);
    g.fillRect(11, 10, 1, 3);
    g.fillRect(15, 10, 1, 3);
    g.fillRect(9, 14, 1, 3);
    g.fillRect(13, 14, 1, 3);
    g.fillRect(17, 14, 1, 3);
    // Turret stone mortar
    g.fillStyle(0x5a5a6a);
    g.fillRect(1, 7, 6, 1);
    g.fillRect(1, 12, 6, 1);
    g.fillRect(1, 17, 6, 1);
    g.fillRect(17, 7, 6, 1);
    g.fillRect(17, 12, 6, 1);
    g.fillRect(17, 17, 6, 1);
    // Turret highlight (left edge lit)
    g.fillStyle(0x7e7e8e);
    g.fillRect(1, 3, 1, 20);
    g.fillRect(17, 3, 1, 20);
    // Turret shadow (right edge)
    g.fillStyle(0x5a5a6a);
    g.fillRect(6, 3, 1, 20);
    g.fillRect(22, 3, 1, 20);
    // Gate archway (dark entrance)
    g.fillStyle(0x221111);
    g.fillRect(9, 15, 6, 8);
    g.fillRect(10, 14, 4, 1);
    g.fillRect(11, 13, 2, 1);
    // Gate wood planks
    g.fillStyle(0x553322);
    g.fillRect(9, 16, 6, 7);
    // Wood plank lines
    g.fillStyle(0x442211);
    g.fillRect(9, 18, 6, 1);
    g.fillRect(9, 21, 6, 1);
    // Vertical plank dividers
    g.fillRect(11, 16, 1, 7);
    g.fillRect(13, 16, 1, 7);
    // Iron bands
    g.fillStyle(0x333333);
    g.fillRect(9, 17, 6, 1);
    g.fillRect(9, 20, 6, 1);
    // Gate handle
    g.fillStyle(0xccaa44);
    g.fillRect(14, 19, 1, 1);
    // Pennant flags on turrets (red triangles)
    g.fillStyle(0xcc2222);
    g.fillTriangle(3, 0, 1, 0, 1, 3);
    g.fillTriangle(20, 0, 22, 0, 22, 3);
    // Window slits on turrets
    g.fillStyle(0x222233);
    g.fillRect(3, 8, 1, 3);
    g.fillRect(4, 14, 1, 3);
    g.fillRect(20, 8, 1, 3);
    g.fillRect(19, 14, 1, 3);
    // Wall windows
    g.fillRect(7, 7, 1, 2);
    g.fillRect(16, 7, 1, 2);
  });

  // ow-9: Portal — stone arch pillars with swirling purple/blue energy
  generateTile(scene, 'ow-9', 0x44aa44, 0x55bb55, undefined, g => {
    // Ground rune circle beneath portal (faint purple)
    g.fillStyle(0x5533aa, 0.25);
    g.fillCircle(12, 19, 8);
    g.fillStyle(0x7744cc, 0.15);
    g.fillCircle(12, 19, 5);
    // Stone arch pillars — left
    g.fillStyle(0x666677);
    g.fillRect(2, 4, 5, 18);
    // Stone arch pillars — right
    g.fillRect(17, 4, 5, 18);
    // Pillar stone texture (mortar lines)
    g.fillStyle(0x555566);
    g.fillRect(2, 8, 5, 1);
    g.fillRect(2, 13, 5, 1);
    g.fillRect(2, 18, 5, 1);
    g.fillRect(17, 7, 5, 1);
    g.fillRect(17, 12, 5, 1);
    g.fillRect(17, 17, 5, 1);
    // Pillar highlights (left edge lit)
    g.fillStyle(0x777788);
    g.fillRect(2, 4, 1, 18);
    g.fillRect(17, 4, 1, 18);
    // Pillar shadow (right edge)
    g.fillStyle(0x555566);
    g.fillRect(6, 4, 1, 18);
    g.fillRect(21, 4, 1, 18);
    // Carved pillar detail
    g.fillStyle(0x7a7a8c);
    g.fillRect(3, 5, 3, 1);
    g.fillRect(3, 20, 3, 1);
    g.fillRect(18, 5, 3, 1);
    g.fillRect(18, 20, 3, 1);
    // Moss on pillars
    g.fillStyle(0x447744, 0.5);
    g.fillRect(3, 18, 3, 2);
    g.fillRect(18, 19, 3, 1);
    g.fillRect(4, 20, 2, 2);
    // Arch top connecting pillars
    g.fillStyle(0x777788);
    g.fillRect(2, 2, 20, 3);
    // Arch top highlight
    g.fillStyle(0x888899);
    g.fillRect(3, 1, 18, 1);
    g.fillRect(5, 0, 14, 1);
    // Keystone (carved gem)
    g.fillStyle(0x7744cc);
    g.fillRect(9, 1, 6, 3);
    g.fillStyle(0x9966ff);
    g.fillRect(10, 1, 4, 2);
    g.fillStyle(0xbb88ff);
    g.fillRect(11, 1, 2, 1);
    // Inner dimensional energy — layered gradient
    g.fillStyle(0x221144);
    g.fillRect(7, 5, 10, 16);
    g.fillStyle(0x332266);
    g.fillRect(7, 5, 10, 14);
    g.fillStyle(0x5533aa);
    g.fillRect(8, 6, 8, 12);
    g.fillStyle(0x7744dd);
    g.fillRect(9, 7, 6, 10);
    g.fillStyle(0x9966ff);
    g.fillRect(10, 8, 4, 8);
    g.fillStyle(0xbb88ff);
    g.fillRect(10, 9, 4, 6);
    // Bright portal center
    g.fillStyle(0xddccff);
    g.fillRect(11, 10, 2, 4);
    g.fillStyle(0xeeddff);
    g.fillRect(11, 11, 2, 2);
    g.fillStyle(0xffeeff);
    g.fillRect(12, 12, 1, 1);
    // Energy sparks around portal
    g.fillStyle(0xccaaff);
    g.fillRect(7, 7, 1, 1);
    g.fillRect(16, 9, 1, 1);
    g.fillRect(8, 15, 1, 1);
    g.fillRect(15, 6, 1, 1);
    g.fillRect(9, 11, 1, 1);
    g.fillRect(14, 14, 1, 1);
    // Outer spark glow
    g.fillStyle(0x9977dd);
    g.fillRect(6, 8, 1, 1);
    g.fillRect(17, 11, 1, 1);
    g.fillRect(7, 17, 1, 1);
    g.fillRect(16, 16, 1, 1);
    // Ground glow beneath portal
    g.fillStyle(0x7744cc, 0.3);
    g.fillRect(6, 21, 12, 3);
    g.fillStyle(0x5533aa, 0.2);
    g.fillRect(8, 20, 8, 1);
  });
  // ow-10: Dark cave entrance with stone pillars
  generateTile(scene, 'ow-10', 0x44aa44, 0x55bb55, undefined, g => {
    g.fillStyle(0x1a4a1a); g.fillRect(0, 0, 8, 22); g.fillRect(0, 0, 10, 10); g.fillRect(16, 0, 8, 22); g.fillRect(14, 0, 10, 10);
    g.fillStyle(0x3d1e1a); g.fillRect(2, 6, 4, 18); g.fillRect(18, 6, 4, 18);
    g.fillStyle(0x4a2ea0); g.fillRect(3, 8, 2, 3); g.fillRect(19, 10, 2, 3); g.fillRect(2, 14, 3, 2); g.fillRect(19, 16, 3, 2);
    g.fillStyle(0x080808); g.fillRect(7, 4, 10, 20); g.fillRect(8, 3, 8, 1); g.fillRect(9, 2, 6, 1);
    g.fillStyle(0x030303); g.fillRect(9, 8, 6, 14); g.fillRect(10, 6, 4, 2);
    g.fillStyle(0x1a4a1a); g.fillRect(8, 0, 3, 3); g.fillRect(13, 0, 3, 3); g.fillRect(10, 0, 4, 1);
    g.fillStyle(0x226622); g.fillRect(8, 1, 2, 1); g.fillRect(14, 1, 2, 1); g.fillRect(6, 3, 2, 2); g.fillRect(16, 3, 2, 2);
    g.fillStyle(0x3d9e3d); g.fillRect(0, 21, 7, 3); g.fillRect(17, 21, 7, 3);
    g.fillStyle(0x2e8a2e); g.fillRect(0, 22, 3, 2); g.fillRect(21, 22, 3, 2);
    g.fillStyle(0x334433, 0.3); g.fillRect(9, 12, 6, 1); g.fillRect(8, 16, 8, 1);
    g.fillStyle(0x66ff66, 0.4); g.fillRect(10, 10, 1, 1); g.fillRect(13, 10, 1, 1);
  });
  // ow-11: Signpost on grass
  generateTile(scene, 'ow-11', 0x44aa44, 0x55bb55, undefined, g => {
    g.fillStyle(0x3d9e3d); g.fillRect(0, 20, 24, 4);
    g.fillStyle(0x2e8a2e); g.fillRect(2, 21, 3, 2); g.fillRect(18, 22, 4, 2);
    g.fillStyle(0x5c3c1e); g.fillRect(11, 8, 3, 16);
    g.fillStyle(0x4a2e16); g.fillRect(11, 8, 1, 16);
    g.fillStyle(0x6b4a27); g.fillRect(13, 8, 1, 16);
    g.fillStyle(0x8b8b14); g.fillRect(3, 5, 19, 7);
    g.fillStyle(0x6b5410); g.fillRect(3, 5, 19, 1); g.fillRect(3, 11, 19, 1); g.fillRect(3, 5, 1, 7); g.fillRect(21, 5, 1, 7);
    g.fillStyle(0x9e7e1c); g.fillRect(5, 7, 14, 1); g.fillRect(6, 9, 12, 1);
    g.fillStyle(0x3d1e1a); g.fillRect(7, 8, 8, 1); g.fillRect(13, 7, 2, 1); g.fillRect(13, 9, 2, 1);
    g.fillStyle(0x6b4a27); g.fillRect(10, 3, 5, 3);
    g.fillStyle(0x5c3c1e); g.fillRect(11, 4, 3, 1);
  });
  // ow-12: Church/shrine on grass
  generateTile(scene, 'ow-12', 0x44aa44, 0x55bb55, undefined, g => {
    g.fillStyle(0x3d9e3d); g.fillRect(0, 20, 24, 4);
    g.fillStyle(0x2e8a2e); g.fillRect(2, 21, 3, 2); g.fillRect(18, 22, 4, 2);
    g.fillStyle(0x6a5a00); g.fillRect(7, 6, 10, 14);
    g.fillStyle(0x5a5010); g.fillRect(7, 6, 10, 1); g.fillRect(7, 10, 10, 1); g.fillRect(7, 14, 10, 1); g.fillRect(7, 18, 10, 1);
    g.fillStyle(0x555558); g.fillRect(12, 6, 1, 14);
    g.fillStyle(0x7a6a10); g.fillRect(8, 7, 3, 2); g.fillRect(14, 11, 2, 2); g.fillRect(9, 15, 2, 2);
    g.fillStyle(0x3a3a55); g.fillTriangle(12, 0, 5, 7, 19, 7);
    g.fillStyle(0x4a4a65); g.fillTriangle(12, 1, 7, 6, 12, 6);
    g.fillStyle(0x222233); g.fillRect(9, 8, 2, 2); g.fillRect(14, 12, 2, 2); g.fillRect(9, 16, 2, 2);
    g.fillStyle(0xaaaacc, 0.3); g.fillRect(9, 8, 1, 1); g.fillRect(14, 12, 1, 1);
    // Torch flame
    g.fillStyle(0xffee44, 0.8); g.fillRect(19, 1, 2, 1); g.fillRect(18, 2, 2, 1); g.fillRect(19, 3, 3, 1); g.fillRect(20, 4, 2, 1); g.fillRect(19, 5, 2, 1);
    g.fillStyle(0xffff5a, 0.3); g.fillRect(18, 0, 4, 2); g.fillRect(17, 3, 3, 2);
    g.fillStyle(0x5a5010); g.fillRect(6, 19, 12, 2);
    g.fillStyle(0x3a2a2a); g.fillRect(10, 17, 4, 3);
    g.fillStyle(0x4a3a2a); g.fillRect(11, 17, 2, 2);
  });
  // ow-13: Snow/ice ground
  generateTile(scene, 'ow-13', 0x3d9e3d, 0x2e8a2e, undefined, g => {
    g.fillStyle(0x88aacc); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x778ebb); g.fillRect(0, 6, 24, 3); g.fillRect(0, 16, 24, 3);
    g.fillStyle(0xffffff, 0.9); g.fillRect(0, 3, 20, 2); g.fillRect(4, 10, 20, 2); g.fillRect(0, 19, 18, 2);
    g.fillStyle(0xccddff, 0.8); g.fillRect(2, 7, 16, 2); g.fillRect(6, 14, 18, 2);
    g.fillStyle(0xffffff, 0.8); g.fillRect(3, 2, 2, 2); g.fillRect(14, 5, 2, 2); g.fillRect(8, 12, 2, 2); g.fillRect(18, 17, 2, 2); g.fillRect(5, 21, 2, 2); g.fillRect(20, 2, 1, 1);
  });
  // ow-14: Deep forest/swamp
  generateTile(scene, 'ow-14', 0x1a5c1a, 0x164e16, undefined, g => {
    g.fillStyle(0x1a5c1a); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x144914); g.fillRect(2, 2, 6, 5); g.fillRect(14, 8, 7, 6); g.fillRect(5, 16, 8, 5);
    g.fillStyle(0x185a18); g.fillRect(10, 1, 5, 4); g.fillRect(1, 10, 6, 4); g.fillRect(16, 18, 6, 4);
    g.fillStyle(0x2a1a0a, 0.6); g.fillRect(6, 8, 2, 8); g.fillRect(16, 4, 2, 7); g.fillRect(11, 14, 2, 6);
  });
  // ow-15: Mountain/hill
  generateTile(scene, 'ow-15', 0x44aa44, 0x55bb55, undefined, g => {
    g.fillStyle(0x44aa44); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x55bb55); g.fillRect(1, 22, 3, 2); g.fillRect(19, 21, 3, 2);
    g.fillStyle(0x66882c); g.fillRect(2, 14, 20, 10);
    g.fillStyle(0x77992d); g.fillRect(4, 10, 16, 8);
    g.fillStyle(0x88aa2e); g.fillRect(6, 6, 12, 8);
    g.fillStyle(0x99bb2f); g.fillRect(8, 3, 8, 6); g.fillRect(10, 1, 4, 4);
    g.fillStyle(0xbbddff); g.fillRect(7, 5, 2, 1); g.fillRect(15, 7, 2, 1); g.fillRect(5, 11, 1, 2); g.fillRect(18, 12, 1, 2);
    g.fillStyle(0xddddff); g.fillRect(10, 2, 1, 1); g.fillRect(13, 3, 1, 1);
    // Cave entrance
    g.fillStyle(0x111133); g.fillRect(8, 15, 8, 9);
    g.fillStyle(0x0a0a22); g.fillRect(9, 16, 6, 8);
    g.fillStyle(0xaabb22); g.fillRect(8, 14, 1, 2); g.fillRect(15, 14, 1, 2);
    g.fillStyle(0x55883b, 0.5); g.fillRect(10, 18, 1, 1); g.fillRect(13, 20, 1, 1);
  });
  // ow-16: Haunted building
  generateTile(scene, 'ow-16', 0x44aa44, 0x55bb55, undefined, g => {
    g.fillStyle(0xd8d8ee); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0xcccc6a); g.fillRect(2, 20, 5, 4); g.fillRect(17, 22, 4, 2);
    g.fillStyle(0x778820); g.fillRect(1, 4, 22, 18);
    g.fillStyle(0x778820); g.fillRect(2, 3, 20, 1); g.fillRect(3, 2, 18, 1); g.fillRect(5, 1, 14, 1);
    g.fillStyle(0xe8e8f6); g.fillRect(3, 1, 18, 2); g.fillRect(5, 0, 14, 2);
    g.fillStyle(0xf0f0f8); g.fillRect(6, 0, 12, 1);
    g.fillStyle(0xd8d8ee); g.fillRect(2, 3, 3, 2); g.fillRect(19, 3, 3, 2); g.fillRect(1, 5, 2, 1); g.fillRect(21, 5, 2, 1);
    g.fillStyle(0x99882c, 0.4); g.fillRect(4, 7, 3, 2); g.fillRect(17, 10, 3, 2);
    // Door
    g.fillStyle(0x112233); g.fillRect(7, 12, 10, 12);
    g.fillStyle(0x0a1620); g.fillRect(8, 13, 8, 11);
    g.fillStyle(0xaabbdd); g.fillRect(8, 12, 1, 3); g.fillRect(10, 12, 1, 2); g.fillRect(13, 12, 1, 2); g.fillRect(15, 12, 1, 3);
    g.fillStyle(0x55883b, 0.4); g.fillRect(10, 17, 1, 1); g.fillRect(13, 19, 1, 1);
  });
  // ow-17: Sand/desert tile
  generateTile(scene, 'ow-17', 0xd8d8ee, 0xceceda, undefined, g => {
    g.fillStyle(0xd8d8ee); g.fillRect(0, 0, 12, 12);
    g.fillStyle(0xceceda); g.fillRect(12, 0, 12, 12);
    g.fillStyle(0xd2d2d8); g.fillRect(0, 12, 12, 12);
    g.fillStyle(0xdcdce0); g.fillRect(12, 12, 12, 12);
    g.fillStyle(0xe8e8f6, 0.6); g.fillRect(4, 3, 2, 1); g.fillRect(16, 8, 2, 1); g.fillRect(7, 17, 2, 1); g.fillRect(19, 21, 1, 1);
    g.fillStyle(0xc0c0c0, 0.3); g.fillRect(2, 10, 4, 1); g.fillRect(14, 15, 3, 1);
  });
  // ow-18: Sand plains
  generateTile(scene, 'ow-18', 0xe8daf0, 0xd8cab0, undefined, g => {
    g.fillStyle(0xe8daf0); g.fillRect(0, 0, 12, 12);
    g.fillStyle(0xddcce8); g.fillRect(12, 0, 12, 12);
    g.fillStyle(0xe4d4ec); g.fillRect(0, 12, 12, 12);
    g.fillStyle(0xeadaf4); g.fillRect(12, 12, 12, 12);
    g.fillStyle(0xd4c4d8, 0.5); g.fillRect(2, 4, 6, 1); g.fillRect(5, 7, 8, 1); g.fillRect(1, 10, 5, 1); g.fillRect(14, 3, 7, 1); g.fillRect(16, 6, 5, 1); g.fillRect(13, 9, 8, 1); g.fillRect(3, 15, 6, 1); g.fillRect(15, 17, 5, 1); g.fillRect(7, 19, 7, 1);
    g.fillStyle(0xb89aa0, 0.4); g.fillRect(8, 2, 1, 1); g.fillRect(18, 5, 1, 1); g.fillRect(3, 14, 1, 1); g.fillRect(20, 14, 1, 1); g.fillRect(10, 20, 1, 1);
  });
  // ow-19: Sand pyramid/dune
  generateTile(scene, 'ow-19', 0xe8daf0, 0xd8cab0, undefined, g => {
    g.fillStyle(0xe8daf0); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0xddbef0); g.fillRect(0, 18, 24, 6);
    g.fillStyle(0xd4aec0); g.fillRect(2, 16, 20, 4); g.fillRect(4, 12, 16, 4); g.fillRect(6, 8, 12, 4); g.fillRect(8, 4, 8, 4); g.fillRect(10, 1, 4, 3);
    g.fillStyle(0xb88ab0, 0.5); g.fillRect(12, 1, 2, 3); g.fillRect(14, 4, 4, 4); g.fillRect(18, 8, 2, 4); g.fillRect(16, 12, 4, 4); g.fillRect(18, 16, 4, 4);
    g.fillStyle(0x220000); g.fillRect(10, 15, 4, 5);
    g.fillStyle(0x8a5420); g.fillRect(9, 14, 6, 1);
    g.fillStyle(0xecc8f0, 0.4); g.fillRect(2, 16, 2, 4); g.fillRect(4, 12, 2, 4); g.fillRect(6, 8, 2, 4); g.fillRect(8, 4, 2, 4); g.fillRect(10, 1, 2, 3);
  });
  // ow-20: Sand signpost/tree
  generateTile(scene, 'ow-20', 0xe8daf0, 0xd8cab0, undefined, g => {
    g.fillStyle(0xe0d0dc); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0xd4b0c0); g.fillRect(1, 5, 6, 1); g.fillRect(14, 10, 8, 1); g.fillRect(3, 17, 10, 1);
    g.fillStyle(0xb88aa0); g.fillRect(11, 8, 3, 16);
    g.fillStyle(0x9a6a48); g.fillRect(11, 8, 1, 16);
    g.fillStyle(0xc8a8b0); g.fillRect(13, 8, 1, 16);
    g.fillStyle(0xa0a050); g.fillRect(11, 11, 3, 1); g.fillRect(11, 16, 3, 1);
    g.fillStyle(0x8b8b14); g.fillRect(3, 5, 19, 7);
    g.fillStyle(0x6b5410); g.fillRect(3, 5, 19, 1); g.fillRect(3, 11, 19, 1); g.fillRect(3, 5, 1, 7); g.fillRect(21, 5, 1, 7);
    g.fillStyle(0x9e7e1c); g.fillRect(5, 7, 14, 1); g.fillRect(6, 9, 12, 1);
    g.fillStyle(0x3d1e1a); g.fillRect(7, 8, 8, 1); g.fillRect(13, 7, 2, 1); g.fillRect(13, 9, 2, 1);
    g.fillStyle(0x9a6a48); g.fillRect(10, 3, 5, 3);
    g.fillStyle(0xb88aa0); g.fillRect(11, 4, 3, 1);
    g.fillStyle(0xc0b4d8); g.fillRect(9, 22, 2, 1); g.fillRect(14, 21, 1, 1);
  });

  // Castle interior tiles — ornate stone with royal detailing (native 24×24)
  // castle-0: Polished stone floor with red carpet runner, torch glow warmth
  generateTile(scene, 'castle-0', 0x555566, 0x4a4a5a, undefined, g => {
    // Stone block grid pattern
    g.fillStyle(0x4e4e5e);
    g.fillRect(0, 11, 24, 1);
    g.fillRect(6, 0, 1, 11);
    g.fillRect(18, 0, 1, 11);
    g.fillRect(12, 12, 1, 12);
    g.fillRect(0, 23, 24, 1);
    // Stone variation patches
    g.fillStyle(0x505060);
    g.fillRect(1, 1, 4, 4);
    g.fillRect(13, 13, 4, 3);
    g.fillStyle(0x484858);
    g.fillRect(8, 1, 4, 3);
    g.fillRect(1, 14, 4, 3);
    g.fillRect(19, 5, 4, 3);
    // Red carpet runner (center)
    g.fillStyle(0x772233);
    g.fillRect(9, 0, 6, 24);
    g.fillStyle(0x882233);
    g.fillRect(10, 0, 4, 24);
    g.fillStyle(0x993344);
    g.fillRect(11, 0, 2, 24);
    // Carpet gold trim edges
    g.fillStyle(0xddaa33, 0.7);
    g.fillRect(9, 0, 1, 24);
    g.fillRect(14, 0, 1, 24);
    // Carpet fringe detail
    g.fillStyle(0xcc9922, 0.5);
    g.fillRect(10, 2, 1, 1);
    g.fillRect(13, 5, 1, 1);
    g.fillRect(10, 8, 1, 1);
    g.fillRect(13, 11, 1, 1);
    g.fillRect(10, 14, 1, 1);
    g.fillRect(13, 17, 1, 1);
    g.fillRect(10, 20, 1, 1);
    g.fillRect(13, 23, 1, 1);
    // Warm torch glow in top-left corner
    g.fillStyle(0xffaa44, 0.08);
    g.fillRect(0, 0, 8, 8);
    g.fillStyle(0xffaa44, 0.04);
    g.fillRect(0, 0, 5, 5);
    // Stone edge highlight
    g.fillStyle(0x5a5a6a);
    g.fillRect(1, 0, 4, 1);
    g.fillRect(7, 12, 4, 1);
    g.fillRect(16, 0, 2, 1);
  });
  // castle-1: Dark stone wall with mortar, torch sconce, royal banner
  generateTile(scene, 'castle-1', 0x333344, 0x2a2a3a, undefined, g => {
    // Brick mortar grid
    g.fillStyle(0x444455);
    g.fillRect(0, 7, 24, 1);
    g.fillRect(0, 15, 24, 1);
    g.fillRect(0, 23, 24, 1);
    g.fillRect(12, 0, 1, 7);
    g.fillRect(6, 8, 1, 7);
    g.fillRect(18, 8, 1, 7);
    g.fillRect(12, 16, 1, 7);
    // Stone highlight weathering
    g.fillStyle(0x3a3a4a);
    g.fillRect(1, 1, 5, 3);
    g.fillRect(14, 9, 3, 3);
    g.fillRect(7, 17, 4, 3);
    // Darker shadow patches
    g.fillStyle(0x222233);
    g.fillRect(7, 10, 3, 2);
    g.fillRect(19, 2, 3, 2);
    g.fillRect(2, 18, 3, 2);
    g.fillRect(14, 4, 2, 2);
    // Torch sconce bracket
    g.fillStyle(0x886644);
    g.fillRect(10, 4, 4, 1);
    g.fillStyle(0x664422);
    g.fillRect(11, 3, 2, 1);
    g.fillStyle(0x553311);
    g.fillRect(11, 5, 2, 1);
    // Torch flame
    g.fillStyle(0xff8833);
    g.fillRect(11, 1, 2, 2);
    g.fillStyle(0xffcc44);
    g.fillRect(11, 0, 2, 1);
    g.fillStyle(0xffee66);
    g.fillRect(12, 1, 1, 1);
    // Flame glow
    g.fillStyle(0xff6622, 0.12);
    g.fillRect(8, 0, 8, 6);
    // Royal banner hanging from wall
    g.fillStyle(0x882233);
    g.fillRect(2, 9, 3, 5);
    g.fillStyle(0x993344);
    g.fillRect(3, 9, 1, 5);
    g.fillStyle(0xddaa33);
    g.fillRect(2, 9, 3, 1);
    g.fillRect(3, 11, 1, 1);
    // Banner point
    g.fillStyle(0x882233);
    g.fillTriangle(3, 15, 2, 14, 5, 14);
    // Moss in low corner
    g.fillStyle(0x334433, 0.3);
    g.fillRect(19, 20, 3, 2);
    g.fillRect(21, 19, 2, 1);
  });
  // castle-2: Cracked floor with moss, damaged stone
  generateTile(scene, 'castle-2', 0x555566, 0x4a4a5a, undefined, g => {
    // Stone block lines
    g.fillStyle(0x4e4e5e);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(9, 0, 1, 12);
    g.fillRect(16, 13, 1, 11);
    g.fillRect(5, 13, 1, 11);
    // Crack system 1 — jagged diagonal
    g.fillStyle(0x333344);
    g.fillRect(4, 2, 1, 1);
    g.fillRect(5, 3, 1, 1);
    g.fillRect(6, 4, 1, 2);
    g.fillRect(7, 6, 1, 1);
    g.fillRect(8, 7, 1, 2);
    g.fillRect(9, 9, 1, 1);
    g.fillRect(10, 10, 1, 2);
    // Crack system 2
    g.fillStyle(0x333344);
    g.fillRect(15, 4, 1, 1);
    g.fillRect(16, 5, 1, 2);
    g.fillRect(17, 7, 1, 1);
    g.fillRect(18, 8, 1, 2);
    g.fillRect(19, 10, 1, 2);
    // Deep crack shadows
    g.fillStyle(0x222233);
    g.fillRect(7, 5, 1, 1);
    g.fillRect(17, 6, 1, 1);
    g.fillRect(10, 11, 1, 1);
    // Rubble/pebbles
    g.fillStyle(0x666677);
    g.fillRect(6, 14, 2, 1);
    g.fillRect(8, 15, 1, 1);
    g.fillRect(14, 18, 2, 1);
    g.fillRect(19, 14, 1, 1);
    g.fillStyle(0x5a5a6a);
    g.fillRect(11, 13, 2, 1);
    g.fillRect(3, 20, 1, 1);
    // Moss in cracks and corners
    g.fillStyle(0x445544, 0.5);
    g.fillRect(7, 7, 2, 1);
    g.fillRect(16, 6, 2, 1);
    g.fillRect(0, 21, 3, 2);
    g.fillStyle(0x334433, 0.4);
    g.fillRect(1, 22, 2, 1);
    g.fillRect(18, 9, 1, 1);
    // Floor damage — missing chunk
    g.fillStyle(0x3a3a4a);
    g.fillRect(12, 2, 3, 2);
    g.fillRect(13, 4, 2, 1);
  });
  // castle-3: Ornate archway with pillars, carved details, banner
  generateTile(scene, 'castle-3', 0x555566, 0x4a4a5a, undefined, g => {
    // Stone pillars
    g.fillStyle(0x666677);
    g.fillRect(1, 3, 4, 20);
    g.fillRect(19, 3, 4, 20);
    // Pillar fluting (vertical grooves)
    g.fillStyle(0x555566);
    g.fillRect(2, 4, 1, 18);
    g.fillRect(4, 4, 1, 18);
    g.fillRect(20, 4, 1, 18);
    g.fillRect(22, 4, 1, 18);
    // Pillar highlights
    g.fillStyle(0x777788);
    g.fillRect(1, 3, 1, 20);
    g.fillRect(19, 3, 1, 20);
    // Pillar capitals (ornate tops)
    g.fillStyle(0x888899);
    g.fillRect(0, 3, 6, 1);
    g.fillRect(18, 3, 6, 1);
    g.fillStyle(0x9999aa);
    g.fillRect(1, 2, 4, 1);
    g.fillRect(19, 2, 4, 1);
    // Pillar bases
    g.fillStyle(0x888899);
    g.fillRect(0, 22, 6, 2);
    g.fillRect(18, 22, 6, 2);
    // Arch top with carved keystone
    g.fillStyle(0x777788);
    g.fillRect(1, 0, 22, 3);
    g.fillStyle(0x888899);
    g.fillRect(5, 0, 14, 2);
    g.fillStyle(0x9999aa);
    g.fillRect(10, 0, 4, 1);
    // Carved arch detail
    g.fillStyle(0xddaa33, 0.5);
    g.fillRect(6, 1, 12, 1);
    // Dark opening
    g.fillStyle(0x111122);
    g.fillRect(5, 3, 14, 20);
    // Royal banner hanging from arch
    g.fillStyle(0x882233);
    g.fillRect(9, 3, 6, 7);
    g.fillStyle(0x993344);
    g.fillRect(10, 4, 4, 5);
    // Banner gold trim
    g.fillStyle(0xddaa33);
    g.fillRect(9, 3, 6, 1);
    g.fillRect(11, 5, 2, 1);
    // Banner point
    g.fillStyle(0x882233);
    g.fillTriangle(12, 12, 9, 9, 15, 9);
    // Floor visible through arch
    g.fillStyle(0x444455);
    g.fillRect(5, 20, 14, 3);
    g.fillStyle(0x4a4a5a);
    g.fillRect(7, 21, 3, 1);
    g.fillRect(14, 21, 3, 1);
  });
  // castle-4: Treasure chest (closed) with gold trim on stone floor
  generateTile(scene, 'castle-4', 0x555566, 0x4a4a5a, undefined, g => {
    // Shadow beneath chest
    g.fillStyle(0x333344, 0.5);
    g.fillRect(4, 20, 16, 3);
    // Chest body (rich brown wood)
    g.fillStyle(0x996622);
    g.fillRect(4, 11, 16, 10);
    g.fillStyle(0xaa7722);
    g.fillRect(5, 12, 14, 8);
    // Chest lid (curved top)
    g.fillStyle(0xbb8833);
    g.fillRect(4, 7, 16, 5);
    g.fillStyle(0xcc9933);
    g.fillRect(5, 7, 14, 3);
    g.fillStyle(0xddaa44);
    g.fillRect(6, 7, 12, 1);
    // Gold metal bands
    g.fillStyle(0xddaa33);
    g.fillRect(4, 12, 16, 1);
    g.fillRect(4, 16, 16, 1);
    g.fillRect(4, 20, 16, 1);
    // Gold lock plate
    g.fillStyle(0xddaa33);
    g.fillRect(9, 13, 6, 3);
    g.fillStyle(0xffcc44);
    g.fillRect(10, 14, 4, 1);
    g.fillStyle(0xaa8822);
    g.fillRect(11, 14, 2, 2);
    // Corner rivets
    g.fillStyle(0xddaa33);
    g.fillRect(4, 11, 1, 1);
    g.fillRect(19, 11, 1, 1);
    g.fillRect(4, 20, 1, 1);
    g.fillRect(19, 20, 1, 1);
    // Wood grain detail
    g.fillStyle(0x886611);
    g.fillRect(7, 13, 1, 6);
    g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511);
    g.fillRect(10, 17, 1, 3);
    g.fillRect(13, 17, 1, 3);
    // Lid wood grain
    g.fillStyle(0xaa7722);
    g.fillRect(7, 8, 1, 3);
    g.fillRect(16, 8, 1, 3);
    // Stone floor hint
    g.fillStyle(0x4e4e5e);
    g.fillRect(0, 22, 4, 2);
    g.fillRect(20, 22, 4, 2);
  });
  // castle-5: Lava with flowing currents, crust edges, intense glow
  generateTile(scene, 'castle-5', 0x331111, 0x221111, undefined, g => {
    // Molten base
    g.fillStyle(0xcc3300);
    g.fillRect(1, 1, 22, 22);
    // Flowing bright streaks
    g.fillStyle(0xff6600);
    g.fillRect(3, 3, 8, 4);
    g.fillRect(13, 10, 8, 4);
    g.fillRect(4, 15, 10, 3);
    g.fillRect(1, 7, 5, 3);
    g.fillStyle(0xff7722);
    g.fillRect(14, 3, 6, 3);
    g.fillRect(2, 12, 5, 2);
    // Hot bubbling spots
    g.fillStyle(0xffaa22);
    g.fillCircle(7, 5, 3);
    g.fillCircle(17, 12, 3);
    g.fillCircle(10, 17, 2);
    g.fillCircle(4, 9, 2);
    g.fillCircle(20, 6, 2);
    // White-hot center spots
    g.fillStyle(0xffdd44);
    g.fillCircle(7, 5, 1);
    g.fillCircle(17, 12, 1);
    g.fillStyle(0xffee88);
    g.fillRect(7, 4, 1, 1);
    g.fillRect(17, 11, 1, 1);
    g.fillRect(10, 16, 1, 1);
    // Cooled crust at edges
    g.fillStyle(0x551100);
    g.fillRect(0, 0, 24, 1);
    g.fillRect(0, 23, 24, 1);
    g.fillRect(0, 0, 1, 24);
    g.fillRect(23, 0, 1, 24);
    // Crust patches
    g.fillStyle(0x442200);
    g.fillRect(1, 9, 3, 1);
    g.fillRect(18, 5, 3, 1);
    g.fillRect(10, 20, 5, 1);
    g.fillRect(20, 17, 2, 1);
    g.fillRect(1, 19, 2, 1);
    // Dark crust islands
    g.fillStyle(0x331100);
    g.fillRect(11, 7, 2, 2);
    g.fillRect(2, 20, 3, 2);
    g.fillRect(19, 1, 3, 2);
  });
  // castle-6: Grand staircase with red carpet, gold railings
  generateTile(scene, 'castle-6', 0x555566, 0x4a4a5a, undefined, g => {
    // Stone steps ascending (5 steps)
    g.fillStyle(0x606070);
    g.fillRect(2, 19, 20, 4);
    g.fillStyle(0x6a6a7a);
    g.fillRect(3, 15, 17, 4);
    g.fillStyle(0x757585);
    g.fillRect(4, 11, 14, 4);
    g.fillStyle(0x808090);
    g.fillRect(5, 7, 11, 4);
    g.fillStyle(0x8a8a9a);
    g.fillRect(6, 3, 8, 4);
    // Step edge highlights
    g.fillStyle(0x9a9aaa);
    g.fillRect(2, 19, 20, 1);
    g.fillRect(3, 15, 17, 1);
    g.fillRect(4, 11, 14, 1);
    g.fillRect(5, 7, 11, 1);
    g.fillRect(6, 3, 8, 1);
    // Step shadow undersides
    g.fillStyle(0x4a4a5a);
    g.fillRect(2, 22, 20, 1);
    g.fillRect(3, 18, 17, 1);
    g.fillRect(4, 14, 14, 1);
    g.fillRect(5, 10, 11, 1);
    // Red carpet on steps
    g.fillStyle(0x882233);
    g.fillRect(9, 19, 6, 4);
    g.fillRect(8, 15, 5, 4);
    g.fillRect(7, 11, 4, 4);
    g.fillRect(7, 7, 3, 4);
    g.fillStyle(0x993344);
    g.fillRect(10, 19, 4, 4);
    g.fillRect(9, 15, 3, 4);
    g.fillRect(8, 11, 2, 4);
    // Gold railings
    g.fillStyle(0xddaa33);
    g.fillRect(1, 3, 1, 20);
    g.fillRect(22, 3, 1, 20);
    // Railing posts
    g.fillStyle(0xeecc44);
    g.fillRect(1, 3, 1, 1);
    g.fillRect(1, 7, 1, 1);
    g.fillRect(1, 11, 1, 1);
    g.fillRect(22, 3, 1, 1);
    g.fillRect(22, 7, 1, 1);
    g.fillRect(22, 11, 1, 1);
    // Up arrow indicator
    g.fillStyle(0xffcc00);
    g.fillTriangle(10, 1, 7, 4, 13, 4);
  });
  // castle-7: Boss chamber — armored demon lord on throne
  generateTile(scene, 'castle-7', 0x555566, 0x4a4a5a, undefined, g => {
    // Castle floor background
    g.fillStyle(0x4e4e5e);
    g.fillRect(0, 11, 24, 1);
    g.fillRect(8, 0, 1, 11);
    g.fillRect(16, 0, 1, 11);
    // Throne structure
    g.fillStyle(0x442233);
    g.fillRect(5, 4, 14, 3);
    g.fillStyle(0x553344);
    g.fillRect(4, 7, 16, 2);
    g.fillStyle(0x663355);
    g.fillRect(5, 9, 14, 6);
    // Throne back ornate top
    g.fillStyle(0x664466);
    g.fillRect(6, 3, 12, 2);
    g.fillStyle(0xaa8833);
    g.fillRect(6, 3, 12, 1);
    // Boss body — armored demon
    g.fillStyle(0x330022);
    g.fillRect(7, 6, 10, 10);
    g.fillRect(6, 8, 12, 7);
    // Head
    g.fillStyle(0x440033);
    g.fillRect(9, 3, 6, 4);
    // Large curved horns
    g.fillStyle(0xccaa66);
    g.fillRect(8, 2, 1, 3);
    g.fillRect(7, 1, 1, 2);
    g.fillRect(6, 0, 1, 2);
    g.fillRect(15, 2, 1, 3);
    g.fillRect(16, 1, 1, 2);
    g.fillRect(17, 0, 1, 2);
    // Glowing eyes
    g.fillStyle(0xff3333);
    g.fillRect(10, 4, 2, 1);
    g.fillRect(13, 4, 2, 1);
    g.fillStyle(0xff0000, 0.4);
    g.fillRect(9, 3, 3, 2);
    g.fillRect(13, 3, 3, 2);
    // Armor chest plate
    g.fillStyle(0x553355);
    g.fillRect(9, 9, 6, 3);
    g.fillStyle(0x664466);
    g.fillRect(10, 10, 4, 1);
    // Arms on armrests with claws
    g.fillStyle(0x330022);
    g.fillRect(4, 10, 3, 4);
    g.fillRect(17, 10, 3, 4);
    g.fillStyle(0xccaa66);
    g.fillRect(3, 11, 1, 1);
    g.fillRect(3, 12, 1, 1);
    g.fillRect(20, 11, 1, 1);
    g.fillRect(20, 12, 1, 1);
    // Throne dais
    g.fillStyle(0x443344);
    g.fillRect(3, 16, 18, 3);
    // Dark carpet from throne
    g.fillStyle(0x331122);
    g.fillRect(9, 19, 6, 5);
    g.fillStyle(0x441133);
    g.fillRect(10, 19, 4, 5);
    // Gold trim on throne
    g.fillStyle(0xaa8833);
    g.fillRect(4, 7, 16, 1);
    g.fillRect(5, 15, 14, 1);
  });
  // castle-8: Opened chest with spilling coins
  generateTile(scene, 'castle-8', 0x555566, 0x4a4a5a, undefined, g => {
    // Shadow
    g.fillStyle(0x333344, 0.4);
    g.fillRect(4, 20, 16, 3);
    // Chest base (open)
    g.fillStyle(0x665533);
    g.fillRect(4, 14, 16, 8);
    g.fillStyle(0x886644);
    g.fillRect(4, 14, 16, 1);
    // Iron bands on base
    g.fillStyle(0x888888);
    g.fillRect(4, 17, 16, 1);
    g.fillRect(4, 21, 16, 1);
    // Open lid (tilted back)
    g.fillStyle(0x776644);
    g.fillRect(4, 6, 16, 8);
    g.fillStyle(0x887755);
    g.fillRect(5, 6, 14, 1);
    g.fillStyle(0x998866);
    g.fillRect(6, 6, 12, 1);
    // Hinge line
    g.fillStyle(0x886633);
    g.fillRect(4, 13, 16, 1);
    // Metal bands on lid
    g.fillStyle(0x998866);
    g.fillRect(4, 9, 16, 1);
    // Lid interior shadow
    g.fillStyle(0x554422);
    g.fillRect(5, 10, 14, 3);
    // Dark interior of chest
    g.fillStyle(0x332211);
    g.fillRect(5, 15, 14, 5);
    // Gold coins remaining inside
    g.fillStyle(0xddaa33);
    g.fillRect(7, 18, 2, 1);
    g.fillRect(12, 17, 3, 1);
    g.fillStyle(0xffcc44);
    g.fillRect(8, 17, 1, 1);
    g.fillRect(14, 18, 1, 1);
    // Spilled coins on floor
    g.fillStyle(0xddaa33);
    g.fillRect(2, 20, 1, 1);
    g.fillRect(3, 21, 1, 1);
    g.fillRect(6, 22, 1, 1);
    g.fillRect(18, 20, 1, 1);
    g.fillRect(20, 21, 1, 1);
    g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44);
    g.fillRect(1, 21, 1, 1);
    g.fillRect(4, 22, 1, 1);
    g.fillRect(19, 22, 1, 1);
    g.fillRect(22, 21, 1, 1);
    // Gem among coins
    g.fillStyle(0xff4455);
    g.fillRect(10, 22, 1, 1);
    g.fillStyle(0x4488ff);
    g.fillRect(14, 21, 1, 1);
  });
  // castle-9: Descending stairs into darkness
  generateTile(scene, 'castle-9', 0x555566, 0x4a4a5a, undefined, g => {
    // Steps descending (5 steps, lighter at top, darker at bottom)
    g.fillStyle(0x9999aa);
    g.fillRect(2, 1, 5, 4);
    g.fillStyle(0x888899);
    g.fillRect(2, 5, 9, 4);
    g.fillStyle(0x777788);
    g.fillRect(2, 9, 13, 4);
    g.fillStyle(0x666677);
    g.fillRect(2, 13, 17, 4);
    g.fillStyle(0x555566);
    g.fillRect(2, 17, 20, 4);
    // Step edge highlights
    g.fillStyle(0xaaaabb);
    g.fillRect(2, 1, 5, 1);
    g.fillRect(2, 5, 9, 1);
    g.fillRect(2, 9, 13, 1);
    g.fillRect(2, 13, 17, 1);
    g.fillRect(2, 17, 20, 1);
    // Step shadows
    g.fillStyle(0x4a4a5a);
    g.fillRect(2, 4, 5, 1);
    g.fillRect(2, 8, 9, 1);
    g.fillRect(2, 12, 13, 1);
    g.fillRect(2, 16, 17, 1);
    // Red carpet runner
    g.fillStyle(0x882233, 0.5);
    g.fillRect(4, 1, 3, 4);
    g.fillRect(7, 5, 3, 4);
    g.fillRect(10, 9, 3, 4);
    g.fillRect(13, 13, 3, 4);
    g.fillRect(16, 17, 3, 4);
    // Darkness below
    g.fillStyle(0x222233, 0.6);
    g.fillRect(2, 21, 20, 3);
    // Arrow hint
    g.fillStyle(0xffcc00);
    g.fillTriangle(19, 22, 16, 19, 22, 19);
  });
  // castle-10: Victory portal — golden radiant light
  generateTile(scene, 'castle-10', 0x555566, 0x4a4a5a, undefined, g => {
    // Ground glow
    g.fillStyle(0xddaa33, 0.12);
    g.fillCircle(12, 18, 9);
    // Stone arch pillars
    g.fillStyle(0x777788);
    g.fillRect(3, 2, 3, 20);
    g.fillRect(18, 2, 3, 20);
    // Arch top
    g.fillStyle(0x777788);
    g.fillRect(3, 0, 18, 3);
    // Gold inlay on arch
    g.fillStyle(0xddaa33);
    g.fillRect(3, 0, 18, 1);
    g.fillRect(3, 2, 1, 20);
    g.fillRect(20, 2, 1, 20);
    // Keystone
    g.fillStyle(0xffcc44);
    g.fillRect(9, 0, 6, 2);
    g.fillStyle(0xffdd66);
    g.fillRect(10, 0, 4, 1);
    // Inner pillar detail
    g.fillStyle(0x888899);
    g.fillRect(4, 3, 1, 19);
    g.fillRect(19, 3, 1, 19);
    // Golden energy interior — layered glow
    g.fillStyle(0xcc8822);
    g.fillRect(6, 3, 12, 19);
    g.fillStyle(0xddaa33);
    g.fillRect(7, 4, 10, 17);
    g.fillStyle(0xeebc44);
    g.fillRect(8, 5, 8, 15);
    g.fillStyle(0xffcc44);
    g.fillRect(9, 6, 6, 13);
    g.fillStyle(0xffdd66);
    g.fillCircle(12, 11, 3);
    g.fillStyle(0xffeeaa);
    g.fillCircle(12, 11, 2);
    g.fillStyle(0xffffff);
    g.fillCircle(12, 11, 1);
    // Radiant sparkles
    g.fillStyle(0xffeecc);
    g.fillRect(8, 7, 1, 1);
    g.fillRect(15, 9, 1, 1);
    g.fillRect(9, 14, 1, 1);
    g.fillRect(14, 6, 1, 1);
    g.fillRect(10, 17, 1, 1);
    g.fillRect(13, 12, 1, 1);
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(11, 8, 1, 1);
    g.fillRect(13, 15, 1, 1);
    // Light rays
    g.fillStyle(0xffdd88, 0.15);
    g.fillRect(6, 2, 2, 20);
    g.fillRect(16, 2, 2, 20);
  });
  // castle-11: Boss warp portal — ominous purple vortex
  generateTile(scene, 'castle-11', 0x555566, 0x4a4a5a, undefined, g => {
    // Rune circle on floor
    g.fillStyle(0x5533aa, 0.25);
    g.strokeCircle(12, 12, 11);
    g.fillStyle(0x6644bb, 0.15);
    g.strokeCircle(12, 12, 10);
    // Rune marks around circle
    g.fillStyle(0x7755cc, 0.4);
    g.fillRect(2, 6, 1, 1);
    g.fillRect(6, 2, 1, 1);
    g.fillRect(17, 2, 1, 1);
    g.fillRect(21, 6, 1, 1);
    g.fillRect(21, 17, 1, 1);
    g.fillRect(17, 21, 1, 1);
    g.fillRect(6, 21, 1, 1);
    g.fillRect(2, 17, 1, 1);
    // Outer vortex rings
    g.fillStyle(0x221144);
    g.fillCircle(12, 12, 9);
    g.fillStyle(0x332255);
    g.fillCircle(12, 12, 7);
    // Mid vortex
    g.fillStyle(0x5533aa);
    g.fillCircle(12, 12, 5);
    g.fillStyle(0x7744cc);
    g.fillCircle(12, 12, 4);
    // Inner bright vortex
    g.fillStyle(0x9966ee);
    g.fillCircle(12, 12, 3);
    g.fillStyle(0xbb88ff);
    g.fillCircle(12, 12, 2);
    // White-hot eye of vortex
    g.fillStyle(0xddccff);
    g.fillCircle(12, 12, 1);
    g.fillStyle(0xeeddff);
    g.fillRect(12, 12, 1, 1);
    // Swirling sparks (asymmetric for rotation feel)
    g.fillStyle(0xccaaff);
    g.fillRect(5, 7, 1, 1);
    g.fillRect(17, 9, 1, 1);
    g.fillRect(7, 17, 1, 1);
    g.fillRect(15, 15, 1, 1);
    g.fillRect(9, 5, 1, 1);
    g.fillRect(14, 19, 1, 1);
    g.fillStyle(0xaa88dd);
    g.fillRect(4, 12, 1, 1);
    g.fillRect(12, 4, 1, 1);
    g.fillRect(19, 13, 1, 1);
    g.fillRect(10, 19, 1, 1);
    g.fillRect(16, 6, 1, 1);
    g.fillRect(7, 14, 1, 1);
    // Energy wisps
    g.fillStyle(0xdd99ff, 0.3);
    g.fillRect(6, 9, 2, 1);
    g.fillRect(16, 14, 2, 1);
    g.fillRect(10, 17, 1, 2);
    g.fillRect(13, 6, 1, 2);
  });

  // Town tiles: 0=floor, 1=fence, 2=roof, 3=grass, 4=fountain, 5=path, 6=save, 7=exit
  // town-0: Cobblestone floor — irregular stone pattern with mortar lines
  generateTile(scene, 'town-0', 0xaa9977, 0x998866, undefined, g => {
    // Mortar grid (horizontal lines)
    g.fillStyle(0x8e7e5e);
    g.fillRect(0, 6, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 18, 24, 1);
    // Mortar grid (vertical lines, offset per row)
    g.fillRect(4, 0, 1, 6);
    g.fillRect(12, 0, 1, 6);
    g.fillRect(20, 0, 1, 6);
    g.fillRect(0, 6, 1, 6);
    g.fillRect(8, 6, 1, 6);
    g.fillRect(16, 6, 1, 6);
    g.fillRect(4, 12, 1, 6);
    g.fillRect(12, 12, 1, 6);
    g.fillRect(20, 12, 1, 6);
    g.fillRect(0, 18, 1, 6);
    g.fillRect(8, 18, 1, 6);
    g.fillRect(16, 18, 1, 6);
    // Stone color variation — lighter stones
    g.fillStyle(0xbbaa88);
    g.fillRect(1, 1, 2, 3);
    g.fillRect(9, 7, 3, 3);
    g.fillRect(17, 13, 2, 3);
    g.fillRect(5, 19, 2, 3);
    // Mid-tone stones
    g.fillStyle(0xb0a080);
    g.fillRect(6, 1, 4, 3);
    g.fillRect(14, 7, 3, 3);
    g.fillRect(1, 13, 3, 3);
    g.fillRect(13, 19, 4, 3);
    // Darker worn center stones
    g.fillStyle(0x907850);
    g.fillRect(9, 1, 2, 2);
    g.fillRect(3, 8, 3, 2);
    g.fillRect(17, 8, 2, 2);
    g.fillRect(10, 14, 2, 2);
    g.fillRect(20, 20, 2, 2);
    // Highlight dots (wear polish)
    g.fillStyle(0xccbb99);
    g.fillRect(2, 2, 1, 1);
    g.fillRect(10, 8, 1, 1);
    g.fillRect(18, 14, 1, 1);
    g.fillRect(6, 20, 1, 1);
    g.fillRect(15, 3, 1, 1);
    // Shadow cracks
    g.fillStyle(0x7a6a4a);
    g.fillRect(7, 4, 2, 1);
    g.fillRect(19, 10, 1, 1);
    g.fillRect(3, 16, 2, 1);
    g.fillRect(14, 22, 1, 1);
  });
  // town-1: Wooden fence with planks, posts, wood grain, nails
  generateTile(scene, 'town-1', 0x664433, 0x553322, undefined, g => {
    // Fence posts (thicker verticals)
    g.fillStyle(0x5a3a20);
    g.fillRect(0, 0, 3, 24);
    g.fillRect(21, 0, 3, 24);
    g.fillRect(10, 0, 3, 24);
    // Post tops (rounded caps)
    g.fillStyle(0x6b4a30);
    g.fillRect(0, 0, 3, 2);
    g.fillRect(10, 0, 3, 2);
    g.fillRect(21, 0, 3, 2);
    // Planks between posts
    g.fillStyle(0x7a5535);
    g.fillRect(3, 5, 7, 3);
    g.fillRect(13, 5, 8, 3);
    g.fillRect(3, 14, 7, 3);
    g.fillRect(13, 14, 8, 3);
    // Plank top edge highlights
    g.fillStyle(0x8a6545);
    g.fillRect(3, 5, 7, 1);
    g.fillRect(13, 5, 8, 1);
    g.fillRect(3, 14, 7, 1);
    g.fillRect(13, 14, 8, 1);
    // Wood grain on planks
    g.fillStyle(0x6a4525);
    g.fillRect(4, 6, 4, 1);
    g.fillRect(14, 6, 5, 1);
    g.fillRect(5, 15, 3, 1);
    g.fillRect(15, 15, 4, 1);
    // Wood grain on posts
    g.fillStyle(0x4e2e18);
    g.fillRect(1, 3, 1, 4);
    g.fillRect(11, 9, 1, 3);
    g.fillRect(22, 5, 1, 5);
    g.fillRect(1, 18, 1, 3);
    // Nail heads (silver dots)
    g.fillStyle(0x999999);
    g.fillRect(1, 6, 1, 1);
    g.fillRect(1, 15, 1, 1);
    g.fillRect(11, 6, 1, 1);
    g.fillRect(11, 15, 1, 1);
    g.fillRect(22, 6, 1, 1);
    g.fillRect(22, 15, 1, 1);
    // Post shadow edges
    g.fillStyle(0x4a2a15);
    g.fillRect(2, 2, 1, 22);
    g.fillRect(12, 2, 1, 22);
    g.fillRect(23, 2, 1, 22);
  });
  // town-2: House roof — peaked red/brown with shingle rows, ridge, chimney
  generateTile(scene, 'town-2', 0xcc5533, 0xbb4422, undefined, g => {
    // Main roof body
    g.fillStyle(0xcc5533);
    g.fillRect(0, 4, 24, 20);
    // Ridge line at top
    g.fillStyle(0xdd7755);
    g.fillRect(0, 3, 24, 2);
    g.fillStyle(0xee8866);
    g.fillRect(0, 3, 24, 1);
    // Shingle rows (alternating offset)
    g.fillStyle(0xbb4422);
    g.fillRect(0, 8, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 16, 24, 1);
    g.fillRect(0, 20, 24, 1);
    // Shingle vertical gaps (row 1)
    g.fillStyle(0xaa3b1e);
    g.fillRect(4, 5, 1, 3);
    g.fillRect(10, 5, 1, 3);
    g.fillRect(16, 5, 1, 3);
    g.fillRect(22, 5, 1, 3);
    // Shingle vertical gaps (row 2, offset)
    g.fillRect(1, 9, 1, 3);
    g.fillRect(7, 9, 1, 3);
    g.fillRect(13, 9, 1, 3);
    g.fillRect(19, 9, 1, 3);
    // Shingle vertical gaps (row 3)
    g.fillRect(4, 13, 1, 3);
    g.fillRect(10, 13, 1, 3);
    g.fillRect(16, 13, 1, 3);
    g.fillRect(22, 13, 1, 3);
    // Shingle vertical gaps (row 4, offset)
    g.fillRect(1, 17, 1, 3);
    g.fillRect(7, 17, 1, 3);
    g.fillRect(13, 17, 1, 3);
    g.fillRect(19, 17, 1, 3);
    // Shingle highlights
    g.fillStyle(0xdd6644);
    g.fillRect(6, 6, 2, 1);
    g.fillRect(14, 10, 2, 1);
    g.fillRect(3, 14, 2, 1);
    g.fillRect(18, 18, 2, 1);
    // Eave shadow at bottom
    g.fillStyle(0x882211);
    g.fillRect(0, 22, 24, 2);
    // Chimney (right side)
    g.fillStyle(0x775544);
    g.fillRect(18, 0, 4, 6);
    g.fillStyle(0x665533);
    g.fillRect(18, 0, 4, 1);
    // Chimney mortar line
    g.fillStyle(0x887766);
    g.fillRect(20, 1, 1, 5);
    g.fillRect(18, 3, 4, 1);
  });
  // town-9: House wall — stone/wood wall with window, glass, cross frame
  generateTile(scene, 'town-9', 0xddbb88, 0xccaa77, undefined, g => {
    // Wall texture — horizontal plank lines
    g.fillStyle(0xccaa77);
    g.fillRect(0, 6, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 18, 24, 1);
    // Stone foundation base
    g.fillStyle(0x998877);
    g.fillRect(0, 21, 24, 3);
    g.fillStyle(0x887766);
    g.fillRect(0, 21, 24, 1);
    // Window outer frame (dark wood)
    g.fillStyle(0x554422);
    g.fillRect(5, 2, 14, 12);
    // Window glass (blue tint)
    g.fillStyle(0x88bbdd);
    g.fillRect(6, 3, 12, 10);
    // Glass reflection highlight
    g.fillStyle(0xaaddee, 0.5);
    g.fillRect(7, 4, 3, 2);
    g.fillStyle(0xbbeeff, 0.3);
    g.fillRect(7, 4, 2, 1);
    // Window cross frame
    g.fillStyle(0x554422);
    g.fillRect(11, 3, 2, 10);
    g.fillRect(6, 7, 12, 2);
    // Cross frame highlight
    g.fillStyle(0x665533);
    g.fillRect(11, 3, 1, 10);
    g.fillRect(6, 7, 12, 1);
    // Window sill
    g.fillStyle(0xeeddbb);
    g.fillRect(4, 13, 16, 2);
    g.fillStyle(0xffeedd);
    g.fillRect(4, 13, 16, 1);
    // Wall detail — wood grain
    g.fillStyle(0xc5a270);
    g.fillRect(1, 3, 3, 1);
    g.fillRect(20, 15, 3, 1);
    g.fillRect(1, 16, 4, 1);
    // Plank highlight
    g.fillStyle(0xe8cc99);
    g.fillRect(1, 7, 3, 1);
    g.fillRect(20, 13, 3, 1);
  });
  // town-10: House wall with door — wooden door with handle, frame detail
  generateTile(scene, 'town-10', 0xddbb88, 0xccaa77, undefined, g => {
    // Wall texture — horizontal plank lines
    g.fillStyle(0xccaa77);
    g.fillRect(0, 6, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 18, 24, 1);
    // Stone foundation
    g.fillStyle(0x998877);
    g.fillRect(0, 21, 24, 3);
    g.fillStyle(0x887766);
    g.fillRect(0, 21, 24, 1);
    // Door frame (dark wood)
    g.fillStyle(0x443311);
    g.fillRect(6, 3, 12, 21);
    // Door surface
    g.fillStyle(0x774422);
    g.fillRect(7, 4, 10, 20);
    // Door panel insets
    g.fillStyle(0x6a3a1c);
    g.fillRect(8, 5, 4, 5);
    g.fillRect(13, 5, 4, 5);
    g.fillRect(8, 12, 4, 7);
    g.fillRect(13, 12, 4, 7);
    // Panel highlights
    g.fillStyle(0x885533);
    g.fillRect(8, 5, 4, 1);
    g.fillRect(13, 5, 4, 1);
    g.fillRect(8, 12, 4, 1);
    g.fillRect(13, 12, 4, 1);
    // Center divider
    g.fillStyle(0x664020);
    g.fillRect(12, 4, 1, 20);
    // Door arch top
    g.fillStyle(0x553311);
    g.fillRect(8, 3, 8, 1);
    g.fillStyle(0x665522);
    g.fillRect(9, 3, 6, 1);
    // Door handle (brass)
    g.fillStyle(0xddaa33);
    g.fillRect(15, 14, 2, 2);
    g.fillStyle(0xeebb44);
    g.fillRect(15, 14, 1, 1);
    // Door handle shadow
    g.fillStyle(0xbb8822);
    g.fillRect(16, 15, 1, 1);
    // Step/threshold
    g.fillStyle(0x887766);
    g.fillRect(6, 22, 12, 2);
    g.fillStyle(0x998877);
    g.fillRect(6, 22, 12, 1);
  });
  // town-8: Shop awning — blue/striped awning over storefront, hanging sign
  generateTile(scene, 'town-8', 0x5588bb, 0x4477aa, undefined, g => {
    // Upper wall
    g.fillStyle(0x5588bb);
    g.fillRect(0, 0, 24, 10);
    // Hanging sign board (wood frame)
    g.fillStyle(0x664422);
    g.fillRect(5, 1, 14, 8);
    // Sign face (cream)
    g.fillStyle(0xffeedd);
    g.fillRect(6, 2, 12, 6);
    // Coin icon on sign
    g.fillStyle(0xffcc00);
    g.fillCircle(9, 5, 2);
    g.fillStyle(0xddaa00);
    g.fillRect(9, 4, 1, 1);
    // Text lines on sign
    g.fillStyle(0x4477aa);
    g.fillRect(12, 3, 4, 1);
    g.fillRect(12, 5, 3, 1);
    g.fillRect(12, 7, 4, 1);
    // Sign hanging chains
    g.fillStyle(0x888888);
    g.fillRect(7, 0, 1, 2);
    g.fillRect(16, 0, 1, 2);
    // Awning — red and yellow stripes
    g.fillStyle(0xcc4422);
    g.fillRect(0, 10, 24, 10);
    g.fillStyle(0xddcc44);
    g.fillRect(4, 10, 4, 10);
    g.fillRect(12, 10, 4, 10);
    g.fillRect(20, 10, 4, 10);
    // Awning fold shadows
    g.fillStyle(0xaa3318, 0.4);
    g.fillRect(0, 14, 4, 1);
    g.fillRect(8, 14, 4, 1);
    g.fillRect(16, 14, 4, 1);
    g.fillStyle(0xbbaa33, 0.4);
    g.fillRect(4, 14, 4, 1);
    g.fillRect(12, 14, 4, 1);
    g.fillRect(20, 14, 4, 1);
    // Scalloped fringe at bottom
    g.fillStyle(0xeecc55);
    g.fillRect(0, 20, 3, 2);
    g.fillRect(4, 21, 2, 1);
    g.fillRect(8, 20, 3, 2);
    g.fillRect(12, 21, 2, 1);
    g.fillRect(16, 20, 3, 2);
    g.fillRect(20, 21, 2, 1);
    // Awning shadow on wall
    g.fillStyle(0x000000, 0.1);
    g.fillRect(0, 22, 24, 2);
  });
  // town-11: Shop wall with display window showing wares
  generateTile(scene, 'town-11', 0x5588bb, 0x4477aa, undefined, g => {
    // Blue wall base
    g.fillStyle(0x5588bb);
    g.fillRect(0, 0, 24, 24);
    // Wall texture
    g.fillStyle(0x4e7eaa);
    g.fillRect(0, 8, 24, 1);
    g.fillRect(0, 16, 24, 1);
    // Display window frame (dark wood)
    g.fillStyle(0x443322);
    g.fillRect(2, 1, 20, 15);
    // Display window glass/interior (cream)
    g.fillStyle(0xeeddcc);
    g.fillRect(3, 2, 18, 13);
    // Display shelf
    g.fillStyle(0x664422);
    g.fillRect(3, 9, 18, 1);
    // Items on upper shelf — potion
    g.fillStyle(0xcc3333);
    g.fillRect(5, 4, 3, 4);
    g.fillStyle(0xdd5555);
    g.fillRect(5, 4, 1, 2);
    g.fillRect(6, 3, 1, 1);
    // Sword on upper shelf
    g.fillStyle(0x888888);
    g.fillRect(11, 3, 1, 6);
    g.fillStyle(0xaaaaaa);
    g.fillRect(11, 3, 1, 1);
    g.fillStyle(0x664422);
    g.fillRect(10, 7, 3, 1);
    // Shield on upper shelf
    g.fillStyle(0x4488cc);
    g.fillRect(15, 4, 4, 4);
    g.fillStyle(0x55aadd);
    g.fillRect(16, 5, 2, 2);
    // Items on lower shelf — scroll
    g.fillStyle(0xeedd88);
    g.fillRect(5, 11, 4, 2);
    // Herb
    g.fillStyle(0x33aa33);
    g.fillRect(12, 10, 3, 3);
    g.fillStyle(0x44cc44);
    g.fillRect(13, 10, 1, 1);
    // Ring
    g.fillStyle(0xddaa33);
    g.fillCircle(18, 12, 1);
    // Base wall stripe
    g.fillStyle(0x446688);
    g.fillRect(0, 17, 24, 7);
    g.fillStyle(0x3d5e80);
    g.fillRect(0, 17, 24, 1);
  });
  // town-12: Shop counter — dark interior with wooden counter, items on display
  generateTile(scene, 'town-12', 0x5588bb, 0x4477aa, undefined, g => {
    // Dark interior
    g.fillStyle(0x1e2e3e);
    g.fillRect(0, 0, 24, 14);
    // Back wall slightly lighter
    g.fillStyle(0x253545);
    g.fillRect(0, 0, 24, 2);
    // Shelves
    g.fillStyle(0x3a4a5a);
    g.fillRect(2, 2, 20, 1);
    g.fillRect(2, 6, 20, 1);
    // Items on top shelf
    g.fillStyle(0xcc4444);
    g.fillRect(3, 3, 2, 3);  // red potion
    g.fillStyle(0xdd6666);
    g.fillRect(3, 3, 1, 1);
    g.fillStyle(0x44cc44);
    g.fillRect(8, 3, 2, 3);  // green herb
    g.fillStyle(0x4488dd);
    g.fillRect(13, 3, 2, 3); // blue potion
    g.fillStyle(0x66aaee);
    g.fillRect(13, 3, 1, 1);
    g.fillStyle(0xeedd88);
    g.fillRect(18, 3, 3, 3); // scroll
    // Items on bottom shelf
    g.fillStyle(0xddaa33);
    g.fillRect(4, 7, 2, 2);  // gold item
    g.fillStyle(0x888888);
    g.fillRect(10, 7, 1, 5);  // sword
    g.fillStyle(0xaaaaaa);
    g.fillRect(10, 7, 1, 1);
    g.fillStyle(0xcc88cc);
    g.fillRect(16, 7, 3, 3); // magic orb
    g.fillStyle(0xddaadd);
    g.fillRect(17, 8, 1, 1);
    // Wooden counter
    g.fillStyle(0x886633);
    g.fillRect(0, 14, 24, 5);
    // Counter top edge (polished)
    g.fillStyle(0xaa8844);
    g.fillRect(0, 14, 24, 1);
    g.fillStyle(0xbb9955);
    g.fillRect(0, 14, 24, 1);
    // Counter bottom edge
    g.fillStyle(0x775522);
    g.fillRect(0, 18, 24, 1);
    // Counter wood grain
    g.fillStyle(0x7a5828);
    g.fillRect(3, 15, 5, 1);
    g.fillRect(14, 16, 4, 1);
    // Floor below counter
    g.fillStyle(0xaa9977);
    g.fillRect(0, 19, 24, 5);
    g.fillStyle(0x9e8e6e);
    g.fillRect(0, 21, 24, 1);
  });
  // town-3: Garden/grass — trimmed lawn, flower bed hints
  generateTile(scene, 'town-3', 0x3d9e3d, 0x4aad4a, undefined, g => {
    // Grass texture — shadow patches
    g.fillStyle(0x2e8a2e);
    g.fillRect(1, 3, 4, 3);
    g.fillRect(13, 8, 4, 3);
    g.fillRect(6, 17, 4, 3);
    g.fillRect(18, 1, 3, 2);
    // Mid-tone grass variation
    g.fillStyle(0x358c35);
    g.fillRect(7, 1, 3, 2);
    g.fillRect(18, 12, 3, 2);
    g.fillRect(1, 14, 3, 2);
    g.fillRect(10, 7, 3, 2);
    // Lighter grass highlights (trimmed look)
    g.fillStyle(0x52b852);
    g.fillRect(5, 5, 2, 1);
    g.fillRect(11, 2, 2, 1);
    g.fillRect(19, 6, 2, 1);
    g.fillRect(3, 11, 2, 1);
    g.fillRect(15, 15, 2, 1);
    g.fillRect(8, 21, 2, 1);
    // Grass blade tips
    g.fillStyle(0x48b048);
    g.fillRect(2, 6, 1, 1);
    g.fillRect(9, 3, 1, 1);
    g.fillRect(16, 10, 1, 1);
    g.fillRect(4, 19, 1, 1);
    g.fillRect(20, 17, 1, 1);
    g.fillRect(12, 22, 1, 1);
    // Small flower dots (flower bed hints)
    g.fillStyle(0xee6688);
    g.fillRect(3, 8, 1, 1);
    g.fillRect(17, 4, 1, 1);
    g.fillStyle(0xeedd44);
    g.fillRect(10, 13, 1, 1);
    g.fillRect(21, 19, 1, 1);
    g.fillStyle(0xcc88ee);
    g.fillRect(7, 20, 1, 1);
    g.fillStyle(0xffffff);
    g.fillRect(14, 18, 1, 1);
    // Darker ground patches
    g.fillStyle(0x2a7a2a);
    g.fillRect(0, 22, 3, 2);
    g.fillRect(20, 22, 4, 2);
  });
  // town-4: Fountain/pond — circular blue water with stone rim, ripples
  generateTile(scene, 'town-4', 0x2255cc, 0x3366dd, undefined, g => {
    // Stone rim (outer circle)
    g.fillStyle(0x888899);
    g.fillCircle(12, 12, 11);
    // Stone rim highlight
    g.fillStyle(0x9999aa);
    g.fillRect(5, 2, 14, 1);
    g.fillRect(3, 3, 3, 1);
    g.fillRect(18, 3, 3, 1);
    // Stone rim shadow
    g.fillStyle(0x666677);
    g.fillRect(5, 21, 14, 1);
    g.fillRect(3, 20, 3, 1);
    g.fillRect(18, 20, 3, 1);
    // Water surface (inner)
    g.fillStyle(0x3366dd);
    g.fillCircle(12, 12, 9);
    // Water depth variation
    g.fillStyle(0x2255bb, 0.6);
    g.fillCircle(12, 13, 6);
    // Water ripple rings
    g.fillStyle(0x5599ee, 0.4);
    g.fillRect(6, 9, 5, 1);
    g.fillRect(13, 9, 5, 1);
    g.fillRect(7, 14, 4, 1);
    g.fillRect(14, 14, 3, 1);
    // Ripple ring 2
    g.fillStyle(0x4488dd, 0.3);
    g.fillRect(8, 7, 8, 1);
    g.fillRect(8, 16, 8, 1);
    // Splash highlight (center fountain)
    g.fillStyle(0xaaddff, 0.6);
    g.fillRect(11, 10, 2, 2);
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(12, 10, 1, 1);
    // Sparkle dots on water
    g.fillStyle(0xbbddff, 0.5);
    g.fillRect(8, 8, 1, 1);
    g.fillRect(15, 11, 1, 1);
    g.fillRect(10, 15, 1, 1);
    g.fillRect(14, 7, 1, 1);
    // Stone rim mortar detail
    g.fillStyle(0x777788);
    g.fillRect(6, 2, 1, 1);
    g.fillRect(12, 1, 1, 1);
    g.fillRect(17, 2, 1, 1);
    g.fillRect(3, 8, 1, 1);
    g.fillRect(21, 10, 1, 1);
  });
  // town-5: Town path — smooth cobblestone, no grass edges
  generateTile(scene, 'town-5', 0xccbb88, 0xbbaa77, undefined, g => {
    // Cobblestone grid (horizontal mortar)
    g.fillStyle(0xb0a070);
    g.fillRect(0, 6, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 18, 24, 1);
    // Vertical mortar (row 1)
    g.fillRect(5, 0, 1, 6);
    g.fillRect(12, 0, 1, 6);
    g.fillRect(19, 0, 1, 6);
    // Vertical mortar (row 2, offset)
    g.fillRect(3, 7, 1, 5);
    g.fillRect(9, 7, 1, 5);
    g.fillRect(16, 7, 1, 5);
    g.fillRect(22, 7, 1, 5);
    // Vertical mortar (row 3)
    g.fillRect(5, 13, 1, 5);
    g.fillRect(12, 13, 1, 5);
    g.fillRect(19, 13, 1, 5);
    // Vertical mortar (row 4, offset)
    g.fillRect(3, 19, 1, 5);
    g.fillRect(9, 19, 1, 5);
    g.fillRect(16, 19, 1, 5);
    g.fillRect(22, 19, 1, 5);
    // Lighter worn stones
    g.fillStyle(0xddccaa);
    g.fillRect(7, 2, 3, 2);
    g.fillRect(14, 8, 2, 2);
    g.fillRect(5, 14, 3, 2);
    g.fillRect(17, 20, 3, 2);
    // Stone highlights
    g.fillStyle(0xd8c8a0);
    g.fillRect(1, 1, 2, 1);
    g.fillRect(13, 1, 2, 1);
    g.fillRect(4, 8, 3, 1);
    g.fillRect(10, 14, 2, 1);
    g.fillRect(1, 20, 2, 1);
    // Shadow patches
    g.fillStyle(0xaa9966);
    g.fillRect(15, 3, 2, 1);
    g.fillRect(6, 9, 2, 1);
    g.fillRect(18, 15, 2, 1);
    g.fillRect(10, 21, 2, 1);
  });
  // town-6: Save crystal — glowing blue crystal on stone pedestal, sparkles
  generateTile(scene, 'town-6', 0xccbb88, 0xbbaa77, undefined, g => {
    // Ground glow (ambient light from crystal)
    g.fillStyle(0x44bbff, 0.08);
    g.fillCircle(12, 14, 10);
    g.fillStyle(0x44bbff, 0.12);
    g.fillCircle(12, 14, 7);
    // Stone pedestal base
    g.fillStyle(0x666677);
    g.fillRect(6, 18, 12, 5);
    // Pedestal top cap
    g.fillStyle(0x888899);
    g.fillRect(7, 16, 10, 2);
    g.fillStyle(0x9999aa);
    g.fillRect(7, 16, 10, 1);
    // Pedestal base shadow
    g.fillStyle(0x555566);
    g.fillRect(7, 22, 10, 1);
    // Pedestal carved detail
    g.fillStyle(0x777788);
    g.fillRect(8, 19, 8, 1);
    // Crystal body — upper triangle
    g.fillStyle(0x33aaee);
    g.fillTriangle(12, 2, 6, 12, 18, 12);
    // Crystal body — lower triangle
    g.fillTriangle(6, 12, 18, 12, 12, 17);
    // Left facet (shadow side)
    g.fillStyle(0x2299cc, 0.7);
    g.fillTriangle(12, 2, 6, 12, 12, 12);
    // Right facet (lit side)
    g.fillStyle(0x55ccff, 0.6);
    g.fillTriangle(12, 2, 12, 12, 18, 12);
    // Lower left facet
    g.fillStyle(0x2288bb, 0.7);
    g.fillTriangle(6, 12, 12, 12, 12, 17);
    // Lower right facet
    g.fillStyle(0x44bbee, 0.6);
    g.fillTriangle(12, 12, 18, 12, 12, 17);
    // Inner bright highlight
    g.fillStyle(0x88ddff, 0.9);
    g.fillTriangle(12, 4, 9, 9, 12, 9);
    // White-hot center
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(10, 7, 3, 3);
    g.fillStyle(0xffffff);
    g.fillRect(11, 8, 2, 1);
    // Light rays emanating
    g.fillStyle(0x88ddff, 0.4);
    g.fillRect(4, 8, 2, 1);
    g.fillRect(18, 8, 2, 1);
    g.fillRect(11, 0, 2, 2);
    // Sparkle dots
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(3, 5, 1, 1);
    g.fillRect(20, 6, 1, 1);
    g.fillRect(5, 14, 1, 1);
    g.fillRect(19, 14, 1, 1);
    g.fillRect(10, 1, 1, 1);
    g.fillRect(14, 1, 1, 1);
    // Ambient glow dots
    g.fillStyle(0x66ccff, 0.3);
    g.fillRect(2, 10, 1, 1);
    g.fillRect(21, 11, 1, 1);
    g.fillRect(7, 3, 1, 1);
    g.fillRect(17, 4, 1, 1);
  });
  // town-7: Town exit — road continuing south, matching town-5 cobblestone
  generateTile(scene, 'town-7', 0xccbb88, 0xbbaa77, undefined, g => {
    // Cobblestone grid (horizontal mortar)
    g.fillStyle(0xb0a070);
    g.fillRect(0, 6, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 18, 24, 1);
    // Vertical mortar (row 1)
    g.fillRect(5, 0, 1, 6);
    g.fillRect(12, 0, 1, 6);
    g.fillRect(19, 0, 1, 6);
    // Vertical mortar (row 2, offset)
    g.fillRect(3, 7, 1, 5);
    g.fillRect(9, 7, 1, 5);
    g.fillRect(16, 7, 1, 5);
    g.fillRect(22, 7, 1, 5);
    // Vertical mortar (row 3)
    g.fillRect(5, 13, 1, 5);
    g.fillRect(12, 13, 1, 5);
    g.fillRect(19, 13, 1, 5);
    // Vertical mortar (row 4, offset)
    g.fillRect(3, 19, 1, 5);
    g.fillRect(9, 19, 1, 5);
    g.fillRect(16, 19, 1, 5);
    g.fillRect(22, 19, 1, 5);
    // Lighter worn stones
    g.fillStyle(0xddccaa);
    g.fillRect(7, 2, 3, 2);
    g.fillRect(14, 8, 2, 2);
    g.fillRect(5, 14, 3, 2);
    g.fillRect(17, 20, 3, 2);
    // Stone highlights
    g.fillStyle(0xd8c8a0);
    g.fillRect(1, 1, 2, 1);
    g.fillRect(13, 1, 2, 1);
    g.fillRect(4, 8, 3, 1);
    g.fillRect(10, 14, 2, 1);
    g.fillRect(1, 20, 2, 1);
    // Shadow patches
    g.fillStyle(0xaa9966);
    g.fillRect(15, 3, 2, 1);
    g.fillRect(6, 9, 2, 1);
    g.fillRect(18, 15, 2, 1);
    g.fillRect(10, 21, 2, 1);
  });

  // town-13: Clinic roof — white/green roof with red cross symbol
  generateTile(scene, 'town-13', 0xeeffee, 0xddeecc, undefined, g => {
    // Main roof body
    g.fillStyle(0xddeedd);
    g.fillRect(0, 4, 24, 20);
    // Ridge line at top
    g.fillStyle(0xeeffee);
    g.fillRect(0, 3, 24, 2);
    g.fillStyle(0xf0fff0);
    g.fillRect(0, 3, 24, 1);
    // Shingle rows
    g.fillStyle(0xccddbb);
    g.fillRect(0, 8, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 16, 24, 1);
    g.fillRect(0, 20, 24, 1);
    // Shingle vertical gaps (row 1)
    g.fillStyle(0xbbccaa);
    g.fillRect(4, 5, 1, 3);
    g.fillRect(10, 5, 1, 3);
    g.fillRect(16, 5, 1, 3);
    g.fillRect(22, 5, 1, 3);
    // Shingle vertical gaps (row 2, offset)
    g.fillRect(1, 9, 1, 3);
    g.fillRect(7, 9, 1, 3);
    g.fillRect(13, 9, 1, 3);
    g.fillRect(19, 9, 1, 3);
    // Shingle vertical gaps (row 3)
    g.fillRect(4, 13, 1, 3);
    g.fillRect(10, 13, 1, 3);
    g.fillRect(16, 13, 1, 3);
    g.fillRect(22, 13, 1, 3);
    // Shingle vertical gaps (row 4, offset)
    g.fillRect(1, 17, 1, 3);
    g.fillRect(7, 17, 1, 3);
    g.fillRect(13, 17, 1, 3);
    g.fillRect(19, 17, 1, 3);
    // Red cross symbol on roof
    g.fillStyle(0xdd3333);
    g.fillRect(9, 6, 6, 2);  // horizontal bar
    g.fillRect(11, 4, 2, 6);  // vertical bar
    // Cross highlight
    g.fillStyle(0xee5555);
    g.fillRect(11, 4, 1, 1);
    // Eave shadow at bottom
    g.fillStyle(0xaabbaa);
    g.fillRect(0, 22, 24, 2);
    // Shingle highlights
    g.fillStyle(0xe8f5e8);
    g.fillRect(6, 14, 2, 1);
    g.fillRect(18, 6, 2, 1);
    g.fillRect(2, 18, 2, 1);
  });
  // town-14: Clinic wall — white wall with window and green cross
  generateTile(scene, 'town-14', 0xeeeedd, 0xddddcc, undefined, g => {
    // Wall texture — subtle horizontal lines
    g.fillStyle(0xddddcc);
    g.fillRect(0, 6, 24, 1);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(0, 18, 24, 1);
    // Stone foundation
    g.fillStyle(0xccccbb);
    g.fillRect(0, 21, 24, 3);
    g.fillStyle(0xbbbbaa);
    g.fillRect(0, 21, 24, 1);
    // Window outer frame (green wood)
    g.fillStyle(0x447744);
    g.fillRect(5, 2, 14, 12);
    // Window glass (light green tint)
    g.fillStyle(0xccffcc);
    g.fillRect(6, 3, 12, 10);
    // Glass reflection
    g.fillStyle(0xddffdd, 0.5);
    g.fillRect(7, 4, 3, 2);
    g.fillStyle(0xeeffee, 0.3);
    g.fillRect(7, 4, 2, 1);
    // Window cross frame
    g.fillStyle(0x447744);
    g.fillRect(11, 3, 2, 10);
    g.fillRect(6, 7, 12, 2);
    // Cross frame highlight
    g.fillStyle(0x558855);
    g.fillRect(11, 3, 1, 10);
    g.fillRect(6, 7, 12, 1);
    // Green cross symbol visible through glass
    g.fillStyle(0x33aa33);
    g.fillRect(8, 4, 2, 5);  // vertical in left pane
    g.fillRect(7, 5, 4, 2);  // horizontal in left pane
    // Window sill
    g.fillStyle(0xddeecc);
    g.fillRect(4, 13, 16, 2);
    g.fillStyle(0xeeffdd);
    g.fillRect(4, 13, 16, 1);
    // Wall detail
    g.fillStyle(0xe0e0d0);
    g.fillRect(1, 3, 3, 1);
    g.fillRect(20, 16, 3, 1);
    g.fillRect(1, 16, 3, 1);
  });
  // town-15: Clinic counter — medical themed, dark interior with supplies
  generateTile(scene, 'town-15', 0xeeeedd, 0xddddcc, undefined, g => {
    // Dark interior
    g.fillStyle(0x1e2e2e);
    g.fillRect(0, 0, 24, 14);
    // Back wall slightly lighter
    g.fillStyle(0x253838);
    g.fillRect(0, 0, 24, 2);
    // Shelves
    g.fillStyle(0x3a4a4a);
    g.fillRect(2, 2, 20, 1);
    g.fillRect(2, 6, 20, 1);
    // Medical supplies on top shelf
    g.fillStyle(0xcc4444);
    g.fillRect(3, 3, 2, 3);  // red potion/medicine
    g.fillStyle(0xdd6666);
    g.fillRect(3, 3, 1, 1);
    g.fillStyle(0x44cc44);
    g.fillRect(8, 3, 2, 3);  // green herb
    g.fillStyle(0x55dd55);
    g.fillRect(8, 3, 1, 1);
    g.fillStyle(0xffffff);
    g.fillRect(13, 3, 3, 3); // bandage roll
    g.fillStyle(0xdddddd);
    g.fillRect(14, 4, 1, 1);
    g.fillStyle(0xeedd88);
    g.fillRect(19, 3, 2, 3); // salve jar
    // Supplies on bottom shelf
    g.fillStyle(0x88bbee);
    g.fillRect(4, 7, 2, 3);  // blue tonic
    g.fillStyle(0xffaaaa);
    g.fillRect(9, 7, 3, 3);  // medicine box
    g.fillStyle(0xdd3333);
    g.fillRect(10, 8, 1, 1); // cross on box
    g.fillStyle(0xcccccc);
    g.fillRect(15, 7, 1, 5); // thermometer
    g.fillStyle(0xdddddd);
    g.fillRect(15, 7, 1, 1);
    g.fillStyle(0xaaddaa);
    g.fillRect(19, 7, 3, 3); // herb bundle
    // Wooden counter
    g.fillStyle(0x886633);
    g.fillRect(0, 14, 24, 5);
    // Counter top edge (polished)
    g.fillStyle(0xbb9955);
    g.fillRect(0, 14, 24, 1);
    // Counter bottom edge
    g.fillStyle(0x775522);
    g.fillRect(0, 18, 24, 1);
    // Red cross on counter front
    g.fillStyle(0xdd3333);
    g.fillRect(10, 15, 4, 2); // horizontal
    g.fillRect(11, 15, 2, 3); // vertical
    // Cross outline
    g.fillStyle(0xcc2222);
    g.fillRect(10, 15, 1, 1);
    g.fillRect(13, 16, 1, 1);
    // Counter wood grain
    g.fillStyle(0x7a5828);
    g.fillRect(3, 16, 4, 1);
    g.fillRect(17, 15, 3, 1);
    // Floor below counter
    g.fillStyle(0xaa9977);
    g.fillRect(0, 19, 24, 5);
    g.fillStyle(0x9e8e6e);
    g.fillRect(0, 21, 24, 1);
  });

  // Dungeon tiles — dark, atmospheric, with depth and texture (native 24×24)
  // dng-0: Stone dungeon floor with moisture, cracks, moss
  generateTile(scene, 'dng-0', 0x444444, 0x3a3a3a, undefined, g => {
    // Stone block grid
    g.fillStyle(0x3a3a3a);
    g.fillRect(0, 11, 24, 1);
    g.fillRect(8, 0, 1, 11);
    g.fillRect(17, 0, 1, 11);
    g.fillRect(5, 12, 1, 12);
    g.fillRect(12, 12, 1, 12);
    g.fillRect(20, 12, 1, 12);
    // Damp/wet patches (slightly darker)
    g.fillStyle(0x363636, 0.5);
    g.fillRect(1, 2, 5, 3);
    g.fillRect(14, 14, 4, 3);
    g.fillRect(9, 18, 3, 2);
    // Stone highlights (torch-lit side)
    g.fillStyle(0x4e4e4e);
    g.fillRect(10, 1, 3, 3);
    g.fillRect(19, 13, 3, 2);
    g.fillRect(1, 14, 3, 2);
    // Darker worn spots
    g.fillStyle(0x333333);
    g.fillRect(3, 6, 2, 2);
    g.fillRect(13, 3, 2, 1);
    g.fillRect(7, 20, 2, 1);
    // Moisture sheen
    g.fillStyle(0x4a4a5a, 0.2);
    g.fillRect(2, 8, 3, 1);
    g.fillRect(15, 18, 4, 1);
    // Small cracks
    g.fillStyle(0x2e2e2e);
    g.fillRect(6, 4, 1, 2);
    g.fillRect(18, 7, 1, 2);
    g.fillRect(10, 15, 1, 2);
    // Moss specks
    g.fillStyle(0x334433, 0.4);
    g.fillRect(1, 10, 1, 1);
    g.fillRect(21, 22, 1, 1);
    g.fillRect(7, 13, 1, 1);
  });
  // dng-1: Dungeon wall with brick pattern, moss, dampness
  generateTile(scene, 'dng-1', 0x222222, 0x1a1a1a, undefined, g => {
    // Brick mortar grid
    g.fillStyle(0x333333);
    g.fillRect(0, 7, 24, 1);
    g.fillRect(0, 15, 24, 1);
    g.fillRect(0, 23, 24, 1);
    g.fillRect(12, 0, 1, 7);
    g.fillRect(6, 8, 1, 7);
    g.fillRect(18, 8, 1, 7);
    g.fillRect(12, 16, 1, 7);
    // Darker shadow patches
    g.fillStyle(0x111111);
    g.fillRect(1, 9, 4, 3);
    g.fillRect(15, 1, 5, 3);
    g.fillRect(8, 17, 3, 3);
    // Slight brick highlight variation
    g.fillStyle(0x2a2a2a);
    g.fillRect(7, 9, 5, 3);
    g.fillRect(1, 1, 6, 3);
    g.fillRect(14, 17, 3, 2);
    // Brick texture details
    g.fillStyle(0x282828);
    g.fillRect(3, 3, 3, 1);
    g.fillRect(14, 10, 2, 1);
    g.fillRect(8, 20, 2, 1);
    // Moss/mold patches
    g.fillStyle(0x334433, 0.4);
    g.fillRect(2, 18, 3, 3);
    g.fillRect(20, 10, 3, 2);
    g.fillRect(14, 22, 2, 1);
    g.fillStyle(0x2a3a2a, 0.3);
    g.fillRect(1, 20, 2, 2);
    g.fillRect(19, 12, 2, 1);
    // Drip stain
    g.fillStyle(0x1a1a2a, 0.5);
    g.fillRect(9, 8, 1, 6);
    g.fillRect(9, 14, 2, 1);
    // Damp spot
    g.fillStyle(0x1e1e2e, 0.3);
    g.fillRect(16, 4, 3, 2);
    // Crack in wall
    g.fillStyle(0x0e0e0e);
    g.fillRect(21, 2, 1, 4);
    g.fillRect(22, 5, 1, 2);
  });
  // dng-2: Cracked/damaged floor with rubble
  generateTile(scene, 'dng-2', 0x555555, 0x4a4a4a, undefined, g => {
    // Base stone pattern
    g.fillStyle(0x4a4a4a);
    g.fillRect(0, 12, 24, 1);
    g.fillRect(9, 0, 1, 12);
    g.fillRect(16, 13, 1, 11);
    g.fillRect(6, 13, 1, 11);
    // Major crack system 1
    g.fillStyle(0x333333);
    g.fillRect(4, 2, 1, 2);
    g.fillRect(5, 4, 1, 2);
    g.fillRect(6, 6, 1, 1);
    g.fillRect(7, 7, 1, 2);
    g.fillRect(8, 9, 1, 1);
    g.fillRect(9, 10, 1, 2);
    g.fillRect(10, 12, 1, 1);
    g.fillRect(11, 13, 1, 2);
    // Major crack system 2
    g.fillStyle(0x333333);
    g.fillRect(15, 4, 1, 2);
    g.fillRect(16, 6, 1, 2);
    g.fillRect(17, 8, 1, 1);
    g.fillRect(18, 9, 1, 2);
    g.fillRect(19, 11, 1, 2);
    g.fillRect(20, 13, 1, 2);
    // Deep crack shadows
    g.fillStyle(0x222222);
    g.fillRect(6, 5, 1, 1);
    g.fillRect(8, 8, 1, 1);
    g.fillRect(16, 7, 1, 1);
    g.fillRect(19, 12, 1, 1);
    // Rubble pebbles near cracks
    g.fillStyle(0x5a5a5a);
    g.fillRect(7, 8, 1, 1);
    g.fillRect(12, 12, 1, 1);
    g.fillRect(20, 10, 1, 1);
    g.fillStyle(0x4e4e4e);
    g.fillRect(5, 14, 2, 1);
    g.fillRect(11, 15, 1, 1);
    g.fillRect(17, 15, 2, 1);
    // Larger rubble pieces
    g.fillStyle(0x585858);
    g.fillRect(8, 14, 2, 2);
    g.fillRect(14, 18, 2, 1);
    // Small stone chips
    g.fillStyle(0x505050);
    g.fillRect(3, 17, 1, 1);
    g.fillRect(13, 20, 1, 1);
    g.fillRect(21, 17, 1, 1);
    // Dust/dirt in damage
    g.fillStyle(0x3e3e3e, 0.5);
    g.fillRect(9, 11, 2, 1);
    g.fillRect(17, 9, 2, 1);
  });
  // dng-3: Archway with skull warning, torch brackets
  generateTile(scene, 'dng-3', 0x444444, 0x3a3a3a, undefined, g => {
    // Stone pillars with texture
    g.fillStyle(0x666666);
    g.fillRect(1, 3, 5, 20);
    g.fillRect(18, 3, 5, 20);
    // Pillar groove detail
    g.fillStyle(0x555555);
    g.fillRect(3, 4, 1, 18);
    g.fillRect(5, 4, 1, 18);
    g.fillRect(19, 4, 1, 18);
    g.fillRect(22, 4, 1, 18);
    // Pillar highlight
    g.fillStyle(0x777777);
    g.fillRect(1, 3, 1, 20);
    g.fillRect(18, 3, 1, 20);
    // Pillar caps
    g.fillStyle(0x888888);
    g.fillRect(0, 3, 7, 1);
    g.fillRect(17, 3, 7, 1);
    g.fillStyle(0x999999);
    g.fillRect(1, 2, 5, 1);
    g.fillRect(18, 2, 5, 1);
    // Pillar bases
    g.fillStyle(0x777777);
    g.fillRect(0, 22, 7, 2);
    g.fillRect(17, 22, 7, 2);
    // Arch top with carved details
    g.fillStyle(0x777777);
    g.fillRect(1, 0, 22, 3);
    g.fillStyle(0x888888);
    g.fillRect(6, 0, 12, 2);
    g.fillStyle(0x999999);
    g.fillRect(10, 0, 4, 1);
    // Dark opening
    g.fillStyle(0x0a0a0a);
    g.fillRect(6, 3, 12, 20);
    // Warning skull — bone white
    g.fillStyle(0xccbbaa);
    g.fillRect(9, 5, 6, 5);
    g.fillRect(10, 4, 4, 1);
    // Skull dome
    g.fillStyle(0xddccbb);
    g.fillRect(10, 4, 4, 2);
    // Eye sockets
    g.fillStyle(0x111111);
    g.fillRect(10, 7, 2, 2);
    g.fillRect(13, 7, 2, 2);
    // Eye glow
    g.fillStyle(0xff3333, 0.3);
    g.fillRect(10, 7, 2, 2);
    g.fillRect(13, 7, 2, 2);
    // Nose
    g.fillStyle(0xaa9988);
    g.fillRect(12, 9, 1, 1);
    // Jaw/teeth
    g.fillStyle(0xbbaa99);
    g.fillRect(10, 10, 5, 1);
    g.fillStyle(0x0a0a0a);
    g.fillRect(10, 10, 1, 1);
    g.fillRect(12, 10, 1, 1);
    g.fillRect(14, 10, 1, 1);
    // Torch brackets on pillars
    g.fillStyle(0x886644);
    g.fillRect(4, 7, 2, 1);
    g.fillRect(18, 7, 2, 1);
    g.fillStyle(0x775533);
    g.fillRect(5, 8, 1, 1);
    g.fillRect(18, 8, 1, 1);
    // Torch flames
    g.fillStyle(0xff8833);
    g.fillRect(4, 5, 2, 2);
    g.fillRect(18, 5, 2, 2);
    g.fillStyle(0xffcc44);
    g.fillRect(5, 4, 1, 2);
    g.fillRect(18, 4, 1, 2);
    g.fillStyle(0xffee66);
    g.fillRect(5, 4, 1, 1);
    g.fillRect(19, 4, 1, 1);
    // Floor visible through arch
    g.fillStyle(0x333333);
    g.fillRect(6, 20, 12, 3);
  });
  // dng-4: Treasure chest with gold trim, iron bands
  generateTile(scene, 'dng-4', 0x444444, 0x3a3a3a, undefined, g => {
    // Shadow beneath chest
    g.fillStyle(0x222222, 0.5);
    g.fillRect(4, 20, 16, 3);
    // Chest body
    g.fillStyle(0x996622);
    g.fillRect(4, 11, 16, 10);
    g.fillStyle(0xaa7722);
    g.fillRect(5, 12, 14, 8);
    // Chest lid
    g.fillStyle(0xbb8833);
    g.fillRect(4, 7, 16, 5);
    g.fillStyle(0xcc9933);
    g.fillRect(5, 7, 14, 3);
    g.fillStyle(0xddaa44);
    g.fillRect(6, 7, 12, 1);
    // Iron bands
    g.fillStyle(0x666666);
    g.fillRect(4, 12, 16, 1);
    g.fillRect(4, 16, 16, 1);
    g.fillRect(4, 20, 16, 1);
    // Iron band rivets
    g.fillStyle(0x888888);
    g.fillRect(5, 12, 1, 1);
    g.fillRect(18, 12, 1, 1);
    g.fillRect(5, 16, 1, 1);
    g.fillRect(18, 16, 1, 1);
    // Gold lock plate
    g.fillStyle(0xddaa33);
    g.fillRect(9, 13, 6, 3);
    g.fillStyle(0xffcc44);
    g.fillRect(10, 14, 4, 1);
    g.fillStyle(0x886611);
    g.fillRect(11, 14, 2, 2);
    // Corner rivets (iron)
    g.fillStyle(0x888888);
    g.fillRect(4, 11, 1, 1);
    g.fillRect(19, 11, 1, 1);
    g.fillRect(4, 20, 1, 1);
    g.fillRect(19, 20, 1, 1);
    // Wood grain
    g.fillStyle(0x886611);
    g.fillRect(7, 13, 1, 6);
    g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511);
    g.fillRect(10, 17, 1, 3);
    g.fillRect(13, 17, 1, 3);
    // Lid wood grain
    g.fillStyle(0xaa7722);
    g.fillRect(7, 8, 1, 3);
    g.fillRect(16, 8, 1, 3);
    // Dungeon floor hint
    g.fillStyle(0x3a3a3a);
    g.fillRect(0, 22, 4, 2);
    g.fillRect(20, 22, 4, 2);
  });
  // dng-5: Lava with flowing currents, intense glow
  generateTile(scene, 'dng-5', 0x331111, 0x221111, undefined, g => {
    // Molten base
    g.fillStyle(0xcc3300);
    g.fillRect(1, 1, 22, 22);
    // Flowing bright streaks (directional)
    g.fillStyle(0xff6600);
    g.fillRect(3, 3, 8, 4);
    g.fillRect(13, 10, 8, 4);
    g.fillRect(4, 15, 11, 3);
    g.fillRect(1, 7, 5, 3);
    g.fillStyle(0xff7722);
    g.fillRect(15, 2, 6, 3);
    g.fillRect(2, 12, 5, 2);
    g.fillRect(17, 18, 5, 2);
    // Hot bubbling spots
    g.fillStyle(0xffaa22);
    g.fillCircle(7, 5, 3);
    g.fillCircle(17, 12, 3);
    g.fillCircle(10, 17, 2);
    g.fillCircle(4, 9, 2);
    g.fillCircle(20, 6, 2);
    g.fillCircle(14, 20, 2);
    // White-hot center spots
    g.fillStyle(0xffdd44);
    g.fillCircle(7, 5, 1);
    g.fillCircle(17, 12, 1);
    g.fillStyle(0xffee88);
    g.fillRect(7, 4, 1, 1);
    g.fillRect(17, 11, 1, 1);
    g.fillRect(10, 16, 1, 1);
    g.fillRect(20, 5, 1, 1);
    // Cooled crust at edges
    g.fillStyle(0x551100);
    g.fillRect(0, 0, 24, 1);
    g.fillRect(0, 23, 24, 1);
    g.fillRect(0, 0, 1, 24);
    g.fillRect(23, 0, 1, 24);
    // Crust patches breaking up
    g.fillStyle(0x442200);
    g.fillRect(1, 9, 3, 1);
    g.fillRect(18, 5, 3, 1);
    g.fillRect(10, 20, 5, 1);
    g.fillRect(20, 17, 2, 1);
    g.fillRect(1, 19, 2, 1);
    // Dark crust islands
    g.fillStyle(0x331100);
    g.fillRect(11, 7, 2, 2);
    g.fillRect(2, 20, 3, 2);
    g.fillRect(19, 1, 3, 2);
  });
  // dng-6: Stairs up (exit) with worn steps, torch light
  generateTile(scene, 'dng-6', 0x444444, 0x3a3a3a, undefined, g => {
    // 5 steps ascending
    g.fillStyle(0x666666);
    g.fillRect(2, 19, 20, 4);
    g.fillStyle(0x777777);
    g.fillRect(3, 15, 17, 4);
    g.fillStyle(0x888888);
    g.fillRect(4, 11, 14, 4);
    g.fillStyle(0x999999);
    g.fillRect(5, 7, 11, 4);
    g.fillStyle(0xaaaaaa);
    g.fillRect(6, 3, 8, 4);
    // Step edge highlights (lit from above)
    g.fillStyle(0xbbbbbb);
    g.fillRect(2, 19, 20, 1);
    g.fillRect(3, 15, 17, 1);
    g.fillRect(4, 11, 14, 1);
    g.fillRect(5, 7, 11, 1);
    g.fillRect(6, 3, 8, 1);
    // Step shadows
    g.fillStyle(0x555555);
    g.fillRect(2, 22, 20, 1);
    g.fillRect(3, 18, 17, 1);
    g.fillRect(4, 14, 14, 1);
    g.fillRect(5, 10, 11, 1);
    // Worn step details
    g.fillStyle(0x5e5e5e);
    g.fillRect(8, 20, 3, 1);
    g.fillRect(10, 16, 2, 1);
    g.fillRect(7, 12, 2, 1);
    // Light from above
    g.fillStyle(0xddddaa, 0.15);
    g.fillRect(6, 3, 8, 5);
    g.fillStyle(0xddddaa, 0.08);
    g.fillRect(4, 8, 12, 4);
    // Yellow up arrow
    g.fillStyle(0xffcc00);
    g.fillTriangle(10, 1, 7, 4, 13, 4);
  });
  // dng-7: Boss chamber — large beast on dungeon floor
  generateTile(scene, 'dng-7', 0x444444, 0x3a3a3a, undefined, g => {
    // Dungeon floor background
    g.fillStyle(0x3a3a3a);
    g.fillRect(0, 11, 24, 1);
    g.fillRect(8, 0, 1, 11);
    g.fillRect(17, 0, 1, 11);
    // Monster body — large, fills most of the tile
    g.fillStyle(0x551122);
    g.fillRect(6, 7, 12, 11);
    g.fillRect(5, 9, 14, 8);
    // Head — large and distinct
    g.fillStyle(0x661133);
    g.fillRect(8, 3, 8, 5);
    g.fillStyle(0x771144);
    g.fillRect(9, 3, 6, 4);
    // Large horns curving outward
    g.fillStyle(0xccaa66);
    g.fillRect(7, 2, 1, 3);
    g.fillRect(6, 1, 1, 2);
    g.fillRect(5, 0, 1, 2);
    g.fillRect(16, 2, 1, 3);
    g.fillRect(17, 1, 1, 2);
    g.fillRect(18, 0, 1, 2);
    // Horn highlights
    g.fillStyle(0xddbb77);
    g.fillRect(5, 0, 1, 1);
    g.fillRect(18, 0, 1, 1);
    // Bright glowing eyes — large and unmistakable
    g.fillStyle(0xff3333);
    g.fillRect(9, 4, 2, 2);
    g.fillRect(14, 4, 2, 2);
    // Eye glow
    g.fillStyle(0xff0000, 0.4);
    g.fillRect(8, 3, 3, 3);
    g.fillRect(14, 3, 3, 3);
    // Eye pupils
    g.fillStyle(0xffaa00);
    g.fillRect(10, 5, 1, 1);
    g.fillRect(14, 5, 1, 1);
    // Open mouth with fangs
    g.fillStyle(0x220000);
    g.fillRect(9, 7, 6, 2);
    g.fillStyle(0xeeeeee);
    g.fillRect(9, 7, 1, 2);
    g.fillRect(14, 7, 1, 2);
    g.fillRect(11, 7, 1, 1);
    g.fillRect(13, 7, 1, 1);
    // Clawed arms reaching outward
    g.fillStyle(0x551122);
    g.fillRect(3, 10, 3, 5);
    g.fillRect(18, 10, 3, 5);
    // Claws
    g.fillStyle(0xccaa66);
    g.fillRect(2, 11, 1, 1);
    g.fillRect(2, 13, 1, 1);
    g.fillRect(21, 11, 1, 1);
    g.fillRect(21, 13, 1, 1);
    // Legs
    g.fillStyle(0x441020);
    g.fillRect(7, 18, 3, 5);
    g.fillRect(14, 18, 3, 5);
    // Belly highlight
    g.fillStyle(0x772244);
    g.fillRect(9, 10, 6, 5);
    g.fillStyle(0x883355);
    g.fillRect(10, 11, 4, 3);
    // Tail hint
    g.fillStyle(0x441020);
    g.fillRect(19, 16, 2, 1);
    g.fillRect(20, 15, 2, 1);
    g.fillRect(21, 14, 2, 1);
  });
  // dng-8: Opened chest with scattered coins
  generateTile(scene, 'dng-8', 0x444444, 0x3a3a3a, undefined, g => {
    // Shadow
    g.fillStyle(0x222222, 0.4);
    g.fillRect(4, 20, 16, 3);
    // Chest base
    g.fillStyle(0x665533);
    g.fillRect(4, 14, 16, 8);
    g.fillStyle(0x776644);
    g.fillRect(4, 14, 16, 1);
    // Iron bands on base
    g.fillStyle(0x888888);
    g.fillRect(4, 17, 16, 1);
    g.fillRect(4, 21, 16, 1);
    // Open lid tilted back
    g.fillStyle(0x776644);
    g.fillRect(4, 6, 16, 8);
    g.fillStyle(0x887755);
    g.fillRect(5, 6, 14, 1);
    g.fillStyle(0x998866);
    g.fillRect(6, 6, 12, 1);
    // Hinge line
    g.fillStyle(0x886633);
    g.fillRect(4, 13, 16, 1);
    // Metal bands on lid
    g.fillStyle(0x888888);
    g.fillRect(4, 9, 16, 1);
    // Lid interior shadow
    g.fillStyle(0x554422);
    g.fillRect(5, 10, 14, 3);
    // Empty dark interior
    g.fillStyle(0x221111);
    g.fillRect(5, 15, 14, 5);
    // Scattered coins on floor
    g.fillStyle(0xddaa33);
    g.fillRect(2, 20, 1, 1);
    g.fillRect(3, 21, 1, 1);
    g.fillRect(7, 22, 1, 1);
    g.fillRect(18, 20, 1, 1);
    g.fillRect(20, 21, 1, 1);
    g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44);
    g.fillRect(1, 21, 1, 1);
    g.fillRect(5, 22, 1, 1);
    g.fillRect(10, 22, 1, 1);
    g.fillRect(19, 22, 1, 1);
    g.fillRect(22, 21, 1, 1);
    // Coins inside chest
    g.fillStyle(0xddaa33);
    g.fillRect(7, 18, 2, 1);
    g.fillRect(13, 17, 2, 1);
    g.fillStyle(0xffcc44);
    g.fillRect(9, 17, 1, 1);
    g.fillRect(15, 18, 1, 1);
  });
  // dng-9: Descending stairs into darkness
  generateTile(scene, 'dng-9', 0x444444, 0x3a3a3a, undefined, g => {
    // Steps descending (lighter at top, darker at bottom)
    g.fillStyle(0x888888);
    g.fillRect(2, 1, 5, 4);
    g.fillStyle(0x777777);
    g.fillRect(2, 5, 9, 4);
    g.fillStyle(0x666666);
    g.fillRect(2, 9, 13, 4);
    g.fillStyle(0x555555);
    g.fillRect(2, 13, 17, 4);
    g.fillStyle(0x444444);
    g.fillRect(2, 17, 20, 4);
    // Step edge highlights
    g.fillStyle(0x999999);
    g.fillRect(2, 1, 5, 1);
    g.fillRect(2, 5, 9, 1);
    g.fillRect(2, 9, 13, 1);
    g.fillRect(2, 13, 17, 1);
    g.fillRect(2, 17, 20, 1);
    // Step shadows (deeper)
    g.fillStyle(0x3a3a3a);
    g.fillRect(2, 4, 5, 1);
    g.fillRect(2, 8, 9, 1);
    g.fillRect(2, 12, 13, 1);
    g.fillRect(2, 16, 17, 1);
    g.fillRect(2, 20, 20, 1);
    // Worn step marks
    g.fillStyle(0x5e5e5e);
    g.fillRect(4, 2, 2, 1);
    g.fillRect(7, 6, 2, 1);
    g.fillRect(10, 10, 2, 1);
    // Darkness below
    g.fillStyle(0x222222, 0.6);
    g.fillRect(2, 21, 20, 3);
    g.fillStyle(0x111111, 0.4);
    g.fillRect(4, 22, 16, 2);
    // Arrow hint
    g.fillStyle(0xffcc00);
    g.fillTriangle(19, 22, 16, 19, 22, 19);
  });
  // dng-10: Boss exit portal — swirling blue/purple arch
  generateTile(scene, 'dng-10', 0x444444, 0x3a3a3a, undefined, g => {
    // Portal arch frame — stone pillars
    g.fillStyle(0x555588);
    g.fillRect(3, 2, 3, 20);
    g.fillRect(18, 2, 3, 20);
    // Pillar highlights
    g.fillStyle(0x7777aa);
    g.fillRect(3, 2, 1, 20);
    g.fillRect(18, 2, 1, 20);
    // Arch top
    g.fillStyle(0x555588);
    g.fillRect(3, 0, 18, 3);
    g.fillStyle(0x6666aa);
    g.fillRect(6, 0, 12, 2);
    // Keystone
    g.fillStyle(0x8888cc);
    g.fillRect(10, 0, 4, 1);
    // Inner swirl (blue-purple vortex) — layered
    g.fillStyle(0x2244aa);
    g.fillRect(6, 3, 12, 19);
    g.fillStyle(0x3355cc);
    g.fillRect(7, 4, 10, 17);
    g.fillStyle(0x4466dd);
    g.fillRect(8, 5, 8, 15);
    g.fillStyle(0x5577ee);
    g.fillRect(9, 6, 6, 13);
    // Bright center
    g.fillStyle(0x88aaff, 0.7);
    g.fillRect(10, 9, 4, 5);
    g.fillStyle(0xaaccff, 0.8);
    g.fillRect(11, 10, 2, 3);
    g.fillStyle(0xccddff);
    g.fillRect(11, 11, 2, 1);
    // Sparkle highlights
    g.fillStyle(0xaaccff);
    g.fillRect(8, 7, 1, 1);
    g.fillRect(14, 12, 1, 1);
    g.fillRect(10, 16, 1, 1);
    g.fillRect(13, 5, 1, 1);
    g.fillRect(7, 14, 1, 1);
    g.fillRect(15, 8, 1, 1);
    // Swirl marks
    g.fillStyle(0x6688ee, 0.5);
    g.fillRect(7, 8, 2, 1);
    g.fillRect(15, 13, 2, 1);
    g.fillRect(9, 17, 1, 2);
    // Base stones
    g.fillStyle(0x666677);
    g.fillRect(2, 22, 20, 2);
  });
  // dng-11: Boss warp portal — sinister purple vortex with energy ring
  generateTile(scene, 'dng-11', 0x444444, 0x3a3a3a, undefined, g => {
    // Rune circle on floor
    g.fillStyle(0x5533aa, 0.2);
    g.strokeCircle(12, 12, 11);
    g.fillStyle(0x6644bb, 0.12);
    g.strokeCircle(12, 12, 10);
    // Rune marks
    g.fillStyle(0x7755cc, 0.4);
    g.fillRect(2, 6, 1, 1);
    g.fillRect(6, 2, 1, 1);
    g.fillRect(17, 2, 1, 1);
    g.fillRect(21, 6, 1, 1);
    g.fillRect(21, 17, 1, 1);
    g.fillRect(17, 21, 1, 1);
    g.fillRect(6, 21, 1, 1);
    g.fillRect(2, 17, 1, 1);
    // Outer vortex layers
    g.fillStyle(0x221144);
    g.fillCircle(12, 12, 9);
    g.fillStyle(0x332255);
    g.fillCircle(12, 12, 7);
    // Mid vortex
    g.fillStyle(0x5533aa);
    g.fillCircle(12, 12, 5);
    g.fillStyle(0x7744cc);
    g.fillCircle(12, 12, 4);
    // Inner bright core
    g.fillStyle(0x9966ee);
    g.fillCircle(12, 12, 3);
    g.fillStyle(0xbb88ff);
    g.fillCircle(12, 12, 2);
    // White-hot eye
    g.fillStyle(0xddccff);
    g.fillCircle(12, 12, 1);
    g.fillStyle(0xeeddff);
    g.fillRect(12, 12, 1, 1);
    // Swirling sparks (asymmetric for rotation feel)
    g.fillStyle(0xccaaff);
    g.fillRect(5, 7, 1, 1);
    g.fillRect(17, 9, 1, 1);
    g.fillRect(7, 17, 1, 1);
    g.fillRect(15, 15, 1, 1);
    g.fillRect(9, 5, 1, 1);
    g.fillRect(14, 19, 1, 1);
    g.fillStyle(0xaa88dd);
    g.fillRect(4, 12, 1, 1);
    g.fillRect(12, 4, 1, 1);
    g.fillRect(19, 13, 1, 1);
    g.fillRect(10, 19, 1, 1);
    g.fillRect(16, 6, 1, 1);
    g.fillRect(7, 14, 1, 1);
    // Energy wisps (sinister)
    g.fillStyle(0xdd99ff, 0.3);
    g.fillRect(6, 9, 2, 1);
    g.fillRect(16, 14, 2, 1);
    g.fillRect(10, 17, 1, 2);
    g.fillRect(13, 6, 1, 2);
    // Lightning crackling
    g.fillStyle(0xff99ff, 0.25);
    g.fillRect(4, 8, 1, 1);
    g.fillRect(19, 15, 1, 1);
    g.fillRect(8, 19, 1, 1);
    g.fillRect(15, 4, 1, 1);
  });
  // dng-12: Boss exit stairs — stone stairs up with cave walls
  generateTile(scene, 'dng-12', 0x444444, 0x3a3a3a, undefined, g => {
    // Cave walls on sides
    g.fillStyle(0x555544);
    g.fillRect(0, 0, 4, 24);
    g.fillRect(20, 0, 4, 24);
    // Wall texture
    g.fillStyle(0x444433);
    g.fillRect(1, 4, 2, 3);
    g.fillRect(0, 12, 2, 3);
    g.fillRect(21, 7, 2, 3);
    g.fillRect(20, 16, 2, 3);
    g.fillStyle(0x4e4e3e);
    g.fillRect(2, 9, 1, 2);
    g.fillRect(21, 2, 1, 2);
    g.fillRect(1, 19, 1, 2);
    g.fillRect(22, 13, 1, 2);
    // Warm light from above
    g.fillStyle(0xffcc66, 0.1);
    g.fillRect(4, 0, 16, 12);
    g.fillStyle(0xffcc66, 0.05);
    g.fillRect(4, 12, 16, 6);
    // Stone steps ascending (4 steps)
    g.fillStyle(0x777766);
    g.fillRect(4, 18, 16, 5);
    g.fillStyle(0x888877);
    g.fillRect(5, 13, 14, 5);
    g.fillStyle(0x999988);
    g.fillRect(6, 8, 12, 5);
    g.fillStyle(0xaaaa99);
    g.fillRect(8, 3, 8, 5);
    // Step edges (highlights)
    g.fillStyle(0xbbbbaa);
    g.fillRect(4, 18, 16, 1);
    g.fillRect(5, 13, 14, 1);
    g.fillRect(6, 8, 12, 1);
    g.fillRect(8, 3, 8, 1);
    // Step shadows
    g.fillStyle(0x666655);
    g.fillRect(4, 22, 16, 1);
    g.fillRect(5, 17, 14, 1);
    g.fillRect(6, 12, 12, 1);
    g.fillRect(8, 7, 8, 1);
    // Worn step marks
    g.fillStyle(0x6e6e5e);
    g.fillRect(9, 19, 3, 1);
    g.fillRect(8, 14, 2, 1);
    g.fillRect(9, 9, 2, 1);
    // Warm glow at top
    g.fillStyle(0xffdd88, 0.3);
    g.fillRect(8, 1, 8, 3);
    g.fillStyle(0xffeeaa, 0.2);
    g.fillRect(10, 0, 4, 2);
    // Moss on cave walls
    g.fillStyle(0x445544, 0.3);
    g.fillRect(0, 20, 3, 2);
    g.fillRect(21, 21, 3, 2);
    // Yellow up arrow
    g.fillStyle(0xffcc00);
    g.fillTriangle(12, 0, 8, 4, 16, 4);
  });
  // dng-14: Water/ice cavern with crystal pillar
  generateTile(scene, 'dng-14', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x3e3e5e); g.fillRect(0, 8, 24, 16); g.fillRect(2, 6, 20, 2);
    g.fillStyle(0x333355); g.fillRect(8, 16, 8, 4);
    g.fillStyle(0x445eec); g.fillRect(10, 6, 4, 10);
    g.fillStyle(0x557eee); g.fillRect(9, 8, 6, 8);
    g.fillStyle(0x669eff); g.fillRect(10, 7, 4, 6);
    g.fillStyle(0x77beff); g.fillTriangle(12, 2, 9, 8, 15, 8);
    g.fillStyle(0xaaaaff, 0.6); g.fillRect(11, 8, 1, 4); g.fillRect(10, 10, 1, 2);
    g.fillStyle(0x667fff, 0.15); g.fillRect(4, 4, 16, 16);
    g.fillStyle(0x889fff, 0.1); g.fillRect(2, 2, 20, 20);
    g.fillStyle(0xccddff, 0.7); g.fillRect(6, 5, 1, 1); g.fillRect(17, 7, 1, 1); g.fillRect(5, 14, 1, 1); g.fillRect(18, 12, 1, 1);
  });
  // dng-15: Dungeon hallway with sconce
  generateTile(scene, 'dng-15', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x333333); g.fillRect(2, 0, 20, 24);
    g.fillStyle(0x4a2a20); g.fillRect(4, 2, 16, 20);
    g.fillStyle(0x3d1818); g.fillRect(4, 8, 16, 1); g.fillRect(4, 14, 16, 1);
    g.fillStyle(0x555555); g.fillRect(3, 4, 18, 2); g.fillRect(3, 18, 18, 2);
    g.fillStyle(0x666666); g.fillRect(14, 10, 4, 5);
    g.fillStyle(0x777777); g.fillRect(15, 11, 2, 3);
    g.fillStyle(0x111111); g.fillCircle(16, 12, 1); g.fillRect(16, 12, 1, 2);
    g.fillStyle(0xddaa33, 0.5); g.fillRect(14, 10, 1, 1); g.fillRect(18, 10, 1, 1);
  });
  // dng-16: Water cavern pool
  generateTile(scene, 'dng-16', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x3e3e5e); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x3a3a3a); g.fillRect(2, 4, 6, 3); g.fillRect(14, 12, 5, 3);
    g.fillStyle(0xddaa33); g.fillRect(7, 10, 10, 3);
    g.fillStyle(0xeec444); g.fillRect(5, 9, 4, 5);
    g.fillStyle(0x444444); g.fillRect(6, 10, 2, 3);
    g.fillStyle(0xddaa33); g.fillRect(15, 13, 1, 2); g.fillRect(17, 13, 1, 2);
    g.fillStyle(0xffcc88, 0.5); g.fillRect(8, 10, 4, 1); g.fillRect(5, 9, 2, 1);
    g.fillStyle(0xddaa33, 0.08); g.fillRect(3, 7, 18, 10);
  });
  // dng-17: Hidden wall - slightly lighter bricks with a vertical crack
  generateTile(scene, 'dng-17', 0x303030, 0x262626, undefined, g => {
    g.fillStyle(0x383838); g.fillRect(0, 0, 11, 5); g.fillRect(13, 0, 11, 5); g.fillRect(0, 7, 8, 5); g.fillRect(10, 7, 14, 5); g.fillRect(0, 14, 12, 5); g.fillRect(14, 14, 10, 5); g.fillRect(3, 20, 10, 4); g.fillRect(15, 20, 9, 4);
    g.fillStyle(0x242424); g.fillRect(0, 5, 24, 2); g.fillRect(0, 12, 24, 2); g.fillRect(0, 19, 24, 1); g.fillRect(12, 0, 1, 5); g.fillRect(9, 7, 1, 5); g.fillRect(13, 14, 1, 5); g.fillRect(14, 20, 1, 4);
    g.fillStyle(0x444444, 0.65); g.fillRect(2, 1, 6, 2); g.fillRect(15, 8, 6, 2); g.fillRect(3, 15, 5, 2);
    g.fillStyle(0x0f0f0f); g.fillRect(11, 2, 1, 4); g.fillRect(12, 6, 1, 5); g.fillRect(11, 11, 1, 5); g.fillRect(10, 16, 1, 4); g.fillRect(11, 20, 1, 3);
    g.fillStyle(0x565656, 0.45); g.fillRect(13, 3, 1, 3); g.fillRect(13, 12, 1, 3); g.fillRect(12, 21, 1, 2);
  });
  // dng-18: Book/library shelf
  generateTile(scene, 'dng-18', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x333333); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x2a2a2a); g.fillRect(0, 0, 24, 1); g.fillRect(0, 23, 24, 1); g.fillRect(0, 0, 1, 24); g.fillRect(23, 0, 1, 24);
    g.fillStyle(0x8a6a4b); g.fillRect(2, 2, 20, 20);
    g.fillStyle(0x9e8a00); g.fillRect(2, 2, 20, 2); g.fillRect(2, 2, 2, 20);
    g.fillStyle(0x6b5a50); g.fillRect(2, 20, 20, 2); g.fillRect(20, 2, 2, 20);
    g.fillStyle(0x7a6a5c); g.fillRect(4, 4, 16, 16);
    g.fillStyle(0x5e5448); g.fillRect(4, 4, 16, 1); g.fillRect(4, 19, 16, 1); g.fillRect(4, 4, 1, 16); g.fillRect(19, 4, 1, 16);
    // Book rows
    g.fillStyle(0x554400); g.fillRect(6, 7, 12, 1); g.fillRect(6, 9, 12, 1); g.fillRect(6, 11, 10, 1); g.fillRect(6, 13, 12, 1); g.fillRect(6, 15, 8, 1); g.fillRect(6, 17, 11, 1);
    // Corner decorations
    g.fillStyle(0xa09a00); g.fillRect(4, 4, 3, 3); g.fillRect(17, 4, 3, 3); g.fillRect(4, 17, 3, 3); g.fillRect(17, 17, 3, 3);
    g.fillStyle(0x6b5a50); g.fillRect(5, 5, 1, 1); g.fillRect(18, 5, 1, 1); g.fillRect(5, 18, 1, 1); g.fillRect(18, 18, 1, 1);
  });
  // dng-19: Mossy dungeon floor
  generateTile(scene, 'dng-19', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x3a3a3a); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x5a5030); g.fillRect(2, 4, 20, 16); g.fillRect(4, 2, 16, 20); g.fillRect(3, 3, 18, 18);
    g.fillStyle(0x6a6038); g.fillRect(5, 5, 8, 3); g.fillRect(13, 10, 6, 4); g.fillRect(4, 15, 5, 3);
    g.fillStyle(0x757548); g.fillRect(6, 3, 10, 1); g.fillRect(5, 4, 12, 1);
    g.fillStyle(0x484820, 0.8); g.fillRect(8, 7, 1, 4); g.fillRect(9, 10, 3, 1); g.fillRect(15, 5, 1, 3); g.fillRect(6, 14, 4, 1); g.fillRect(14, 15, 1, 3);
    g.fillStyle(0x3a3a30); g.fillRect(3, 19, 18, 2); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x778a3a, 0.2); g.fillRect(1, 6, 2, 1); g.fillRect(21, 9, 2, 1); g.fillRect(1, 14, 2, 1); g.fillRect(21, 17, 2, 1);
    g.fillStyle(0x88aa3a, 0.15); g.fillRect(0, 8, 1, 2); g.fillRect(23, 12, 1, 2);
  });
  // dng-20: Green crystal stalagmite columns
  generateTile(scene, 'dng-20', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x333333); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x2a2a2a); g.fillRect(0, 16, 24, 8);
    g.fillStyle(0x449c4c); g.fillRect(4, 4, 4, 14); g.fillRect(10, 2, 5, 16); g.fillRect(17, 6, 4, 12);
    g.fillStyle(0x66ae6e); g.fillRect(5, 5, 2, 10); g.fillRect(11, 3, 3, 12); g.fillRect(18, 7, 2, 8);
    g.fillStyle(0xaaffbf); g.fillRect(6, 4, 1, 3); g.fillRect(12, 2, 1, 4); g.fillRect(19, 6, 1, 3);
    g.fillStyle(0x66ae6e, 0.15); g.fillRect(2, 2, 20, 20);
    g.fillStyle(0xccffdf, 0.8); g.fillRect(7, 6, 1, 1); g.fillRect(14, 4, 1, 1); g.fillRect(20, 9, 1, 1);
  });
  // dng-21: Blue crystal stalagmite columns
  generateTile(scene, 'dng-21', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x333333); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x2a2a2a); g.fillRect(0, 16, 24, 8);
    g.fillStyle(0x224cbc); g.fillRect(4, 4, 4, 14); g.fillRect(10, 2, 5, 16); g.fillRect(17, 6, 4, 12);
    g.fillStyle(0x446eff); g.fillRect(5, 5, 2, 10); g.fillRect(11, 3, 3, 12); g.fillRect(18, 7, 2, 8);
    g.fillStyle(0x6699ff); g.fillRect(6, 4, 1, 3); g.fillRect(12, 2, 1, 4); g.fillRect(19, 6, 1, 3);
    g.fillStyle(0x2245ff, 0.15); g.fillRect(2, 2, 20, 20);
    g.fillStyle(0xaabbff, 0.8); g.fillRect(7, 6, 1, 1); g.fillRect(14, 4, 1, 1); g.fillRect(20, 9, 1, 1);
  });
  // dng-22: Purple crystal stalagmite columns
  generateTile(scene, 'dng-22', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x333333); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x2a2a2a); g.fillRect(0, 16, 24, 8);
    g.fillStyle(0x22a844); g.fillRect(4, 4, 4, 14); g.fillRect(10, 2, 5, 16); g.fillRect(17, 6, 4, 12);
    g.fillStyle(0x44d666); g.fillRect(5, 5, 2, 10); g.fillRect(11, 3, 3, 12); g.fillRect(18, 7, 2, 8);
    g.fillStyle(0x66ee88); g.fillRect(6, 4, 1, 3); g.fillRect(12, 2, 1, 4); g.fillRect(19, 6, 1, 3);
    g.fillStyle(0x230044, 0.15); g.fillRect(2, 2, 20, 20);
    g.fillStyle(0xaaccbc, 0.8); g.fillRect(7, 6, 1, 1); g.fillRect(14, 4, 1, 1); g.fillRect(20, 9, 1, 1);
  });
  // dng-24: Campfire/bonfire tile
  generateTile(scene, 'dng-24', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x3e3e5e); g.fillRect(0, 8, 24, 8);
    g.fillStyle(0x484848); g.fillRect(4, 4, 16, 16);
    g.fillStyle(0x5a3a1a); g.fillRect(11, 10, 2, 10);
    g.fillStyle(0x4a2a14); g.fillRect(10, 20, 4, 2);
    g.fillStyle(0xff6600, 0.15); g.fillCircle(12, 8, 14);
    g.fillStyle(0xffa000, 0.25); g.fillCircle(12, 8, 11);
    g.fillStyle(0xffcc00, 0.45); g.fillCircle(12, 8, 8);
    g.fillStyle(0xffdd33, 0.5); g.fillCircle(12, 8, 5);
    g.fillStyle(0xff4400); g.fillEllipse(12, 6, 6, 9);
    g.fillStyle(0xffa000); g.fillEllipse(12, 6, 4, 7);
    g.fillStyle(0xffcc00); g.fillEllipse(12, 7, 3, 5);
    g.fillStyle(0xffdd66); g.fillEllipse(12, 8, 2, 3);
    g.fillStyle(0xffff6c, 0.8); g.fillRect(11, 8, 2, 2);
  });
  // dng-25: Ice/frost floor
  generateTile(scene, 'dng-25', 0x88bbdd, 0x99ccee, undefined, g => {
    g.fillStyle(0x7a9acf); g.fillRect(0, 0, 12, 12);
    g.fillStyle(0x99ccee); g.fillRect(12, 12, 12, 12);
    g.fillStyle(0xaabbff, 0.5); g.fillRect(2, 3, 6, 1); g.fillRect(14, 7, 5, 1); g.fillRect(6, 15, 7, 1); g.fillRect(16, 19, 4, 1);
    g.fillStyle(0xccddff, 0.6); g.fillRect(3, 4, 3, 1); g.fillRect(15, 8, 2, 1); g.fillRect(8, 16, 3, 1);
    g.fillStyle(0xddeeff, 0.7); g.fillRect(5, 2, 1, 1); g.fillRect(17, 6, 1, 1); g.fillRect(10, 14, 1, 1); g.fillRect(20, 20, 1, 1);
    g.fillStyle(0x66881b, 0.4); g.fillRect(4, 6, 1, 4); g.fillRect(5, 9, 3, 1); g.fillRect(14, 2, 1, 3); g.fillRect(18, 14, 1, 5); g.fillRect(8, 20, 4, 1);
    g.fillStyle(0xffffff, 0.8); g.fillRect(6, 1, 1, 1); g.fillRect(19, 5, 1, 1); g.fillRect(2, 13, 1, 1); g.fillRect(21, 18, 1, 1); g.fillRect(11, 22, 1, 1);
  });
  // dng-26: Dark ritual circle
  generateTile(scene, 'dng-26', 0x222210, 0x1a1a0e, undefined, g => {
    g.fillStyle(0x111108); g.fillCircle(12, 12, 9);
    g.fillStyle(0x2a2a18, 0.7); g.fillCircle(12, 12, 11);
    g.fillStyle(0x111108); g.fillCircle(12, 12, 8);
    g.fillStyle(0x998866); g.fillRect(0, 0, 24, 2); g.fillRect(0, 22, 24, 2); g.fillRect(0, 0, 2, 24); g.fillRect(22, 0, 2, 24);
    g.fillStyle(0x887755); g.fillRect(2, 2, 3, 1); g.fillRect(19, 2, 3, 1); g.fillRect(2, 21, 3, 1); g.fillRect(19, 21, 3, 1);
    g.fillStyle(0x1a1a10, 0.5); g.fillCircle(12, 12, 6);
    g.fillStyle(0x080804); g.fillCircle(12, 12, 3);
  });
  // dng-27: Earth/dirt floor with stones
  generateTile(scene, 'dng-27', 0xaa8855, 0x997744, undefined, g => {
    g.fillStyle(0x9e8a48); g.fillRect(0, 0, 12, 24);
    g.fillStyle(0xb0a055); g.fillRect(12, 0, 12, 24);
    g.fillStyle(0x888833, 0.5); g.fillCircle(8, 8, 4); g.fillCircle(16, 16, 4);
    g.fillStyle(0x9a9a44, 0.5); g.fillCircle(8, 8, 2); g.fillCircle(16, 16, 2);
    g.fillStyle(0x7a6a30, 0.4); g.fillRect(1, 5, 8, 1); g.fillRect(10, 12, 10, 1); g.fillRect(3, 19, 7, 1); g.fillRect(15, 3, 6, 1);
    g.fillStyle(0xbb9a46, 0.4); g.fillRect(4, 7, 5, 1); g.fillRect(13, 14, 5, 1); g.fillRect(6, 21, 4, 1);
    g.fillStyle(0x664422, 0.6); g.fillCircle(6, 10, 1); g.fillCircle(18, 6, 1); g.fillCircle(10, 18, 1); g.fillCircle(20, 21, 1);
  });
  // dng-29: Poison/acid pool
  generateTile(scene, 'dng-29', 0x1a0a2e, 0x120820, undefined, g => {
    g.fillStyle(0x0d0518); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x3a1a66, 0.7); g.fillCircle(12, 12, 10);
    g.fillStyle(0x2a0e4e, 0.8); g.fillCircle(12, 12, 7);
    g.fillStyle(0x0a0216, 0.9); g.fillCircle(12, 12, 4);
    g.fillStyle(0x773c4c, 0.5); g.fillRect(5, 11, 5, 1); g.fillRect(14, 12, 5, 1); g.fillRect(11, 5, 1, 4); g.fillRect(12, 15, 1, 5);
    g.fillStyle(0xaa5fff, 0.6); g.fillRect(7, 8, 2, 1); g.fillRect(15, 14, 2, 1); g.fillRect(10, 16, 1, 2); g.fillRect(13, 6, 1, 2);
    g.fillStyle(0xcc88ff, 0.4); g.fillCircle(12, 12, 2);
  });
  // dng-30: Armed pressure plate for spike traps
  generateTile(scene, 'dng-30', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x3a3a3a); g.fillRect(0, 11, 24, 1); g.fillRect(8, 0, 1, 11); g.fillRect(17, 0, 1, 11); g.fillRect(5, 12, 1, 12); g.fillRect(12, 12, 1, 12); g.fillRect(20, 12, 1, 12);
    g.fillStyle(0x363636, 0.5); g.fillRect(1, 2, 5, 3); g.fillRect(14, 14, 4, 3); g.fillRect(9, 18, 3, 2);
    g.fillStyle(0x4e4e4e); g.fillRect(10, 1, 3, 3); g.fillRect(19, 13, 3, 2); g.fillRect(1, 14, 3, 2);
    g.fillStyle(0x333333); g.fillRect(3, 6, 2, 2); g.fillRect(13, 3, 2, 1); g.fillRect(7, 20, 2, 1);
    g.fillStyle(0x4a4a5a, 0.2); g.fillRect(2, 8, 3, 1); g.fillRect(15, 18, 4, 1);
    g.fillStyle(0x2e2e2e); g.fillRect(6, 4, 1, 2); g.fillRect(18, 7, 1, 2); g.fillRect(10, 15, 1, 2);
    g.fillStyle(0x333333, 0.4); g.fillRect(1, 10, 1, 1); g.fillRect(21, 22, 1, 1); g.fillRect(7, 13, 1, 1);
    g.fillStyle(0x2a2520, 0.85); g.fillRect(5, 5, 14, 14);
    g.fillStyle(0x5a5144, 0.9); g.fillRect(6, 6, 12, 12);
    g.fillStyle(0x2f2a24, 0.9); g.fillRect(8, 8, 8, 8);
    g.fillStyle(0xbb8844, 0.7); g.fillRect(6, 6, 2, 2); g.fillRect(16, 6, 2, 2); g.fillRect(6, 16, 2, 2); g.fillRect(16, 16, 2, 2);
  });
  // dng-31: Dungeon floor with horizontal bar overlay
  generateTile(scene, 'dng-31', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x3a3a3a); g.fillRect(0, 11, 24, 1); g.fillRect(8, 0, 1, 11); g.fillRect(17, 0, 1, 11); g.fillRect(5, 12, 1, 12); g.fillRect(12, 12, 1, 12); g.fillRect(20, 12, 1, 12);
    g.fillStyle(0x363636, 0.5); g.fillRect(1, 2, 5, 3); g.fillRect(14, 14, 4, 3); g.fillRect(9, 18, 3, 2);
    g.fillStyle(0x4e4e4e); g.fillRect(10, 1, 3, 3); g.fillRect(1, 14, 3, 2);
    g.fillStyle(0x333333); g.fillRect(3, 6, 2, 2); g.fillRect(13, 3, 2, 1);
    g.fillStyle(0x2e2e2e); g.fillRect(6, 4, 1, 2); g.fillRect(18, 7, 1, 2); g.fillRect(10, 15, 1, 2);
    g.fillStyle(0x333333, 0.4); g.fillRect(1, 10, 1, 1); g.fillRect(7, 13, 1, 1);
    // Horizontal bar overlay
    g.fillStyle(0x7a6a30, 0.3); g.fillRect(0, 12, 24, 1);
    g.fillStyle(0x5a4a20, 0.45); g.fillRect(0, 11, 2, 3); g.fillRect(22, 11, 2, 3);
  });
  // dng-32: Dungeon floor with arrow markers
  generateTile(scene, 'dng-32', 0x444444, 0x3a3a3a, undefined, g => {
    g.fillStyle(0x3a3a3a); g.fillRect(0, 11, 24, 1); g.fillRect(8, 0, 1, 11); g.fillRect(17, 0, 1, 11); g.fillRect(5, 12, 1, 12); g.fillRect(12, 12, 1, 12); g.fillRect(20, 12, 1, 12);
    g.fillStyle(0x363636, 0.5); g.fillRect(1, 2, 5, 3); g.fillRect(14, 14, 4, 3);
    g.fillStyle(0x333333); g.fillRect(3, 6, 2, 2);
    // Glowing circles at corners
    g.fillStyle(0x3a1a18, 0.55); g.fillCircle(6, 10, 3); g.fillCircle(18, 10, 3); g.fillCircle(6, 22, 3); g.fillCircle(18, 22, 3);
    // Arrow markers
    const arrowPositions: [number, number][] = [[6, 6], [18, 6], [6, 18], [18, 18]];
    for (const [ax, ay] of arrowPositions) {
      g.fillStyle(0x888877); g.fillTriangle(ax, ay - 4, ax - 4, ay + 4, ax + 4, ay + 4);
      g.fillStyle(0xbbcc4a, 0.75); g.fillTriangle(ax, ay - 3, ax - 2, ay + 3, ax + 1, ay + 3);
    }
  });

  // ── Castle texture cloning from dungeon tiles ──
  for (const idx of [3, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) {
    const dngKey = `dng-${idx}`;
    const castleKey = `castle-${idx}`;
    if (scene.textures.exists(dngKey)) {
      const src = scene.textures.get(dngKey).getSourceImage();
      scene.textures.addImage(castleKey, src as HTMLImageElement);
    }
  }

  // ── Forest theme tiles ──
  // forest-0: Mossy forest floor
  generateTile(scene, 'forest-0', 0x6b5c3e, 0x5e5033, undefined, g => {
    g.fillStyle(0x5e5033); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x7a5c4c); g.fillRect(3, 2, 5, 3); g.fillRect(14, 8, 4, 3); g.fillRect(8, 16, 6, 3); g.fillRect(1, 12, 3, 2);
    g.fillStyle(0x4a3a28); g.fillRect(8, 4, 3, 2); g.fillRect(18, 14, 3, 2); g.fillRect(2, 20, 2, 2);
    g.fillStyle(0x3d701d); g.fillRect(0, 0, 2, 3); g.fillRect(22, 0, 2, 3); g.fillRect(0, 21, 2, 3); g.fillRect(22, 21, 2, 3); g.fillRect(0, 10, 1, 3); g.fillRect(23, 14, 1, 3);
    g.fillStyle(0x2e6a0e); g.fillRect(0, 1, 1, 2); g.fillRect(23, 1, 1, 2); g.fillRect(0, 22, 1, 2); g.fillRect(23, 22, 1, 2);
    g.fillStyle(0x8a6e22, 0.5); g.fillRect(5, 7, 2, 1); g.fillRect(16, 3, 1, 1); g.fillRect(11, 19, 2, 1); g.fillRect(20, 10, 1, 1);
    g.fillStyle(0x4a3a22, 0.4); g.fillRect(6, 13, 4, 1); g.fillRect(15, 20, 3, 1);
  });
  // forest-1: Dense tree line
  generateTile(scene, 'forest-1', 0x0e1e0e, 0x0a160a, undefined, g => {
    g.fillStyle(0x132f13); g.fillRect(0, 0, 24, 14);
    g.fillStyle(0x0e220e); g.fillRect(0, 14, 24, 10);
    g.fillStyle(0x2a2210); g.fillRect(3, 8, 3, 16); g.fillRect(11, 6, 3, 18); g.fillRect(19, 9, 3, 15);
    g.fillStyle(0x352a18); g.fillRect(4, 10, 1, 4); g.fillRect(12, 8, 1, 4); g.fillRect(20, 12, 1, 4); g.fillRect(3, 16, 2, 2); g.fillRect(11, 18, 2, 2); g.fillRect(19, 17, 2, 2);
    g.fillStyle(0x0a180a); g.fillRect(0, 0, 8, 8); g.fillRect(8, 0, 8, 6); g.fillRect(16, 0, 8, 9);
    g.fillStyle(0x1a3a0a); g.fillRect(1, 2, 3, 2); g.fillRect(9, 1, 3, 2); g.fillRect(17, 3, 3, 2); g.fillRect(5, 5, 4, 2); g.fillRect(14, 2, 3, 2);
    g.fillStyle(0x060e06); g.fillRect(6, 10, 5, 4); g.fillRect(14, 12, 5, 3); g.fillRect(0, 16, 3, 4); g.fillRect(22, 14, 2, 6);
    g.fillStyle(0x1a330a); g.fillRect(0, 20, 24, 4);
    g.fillStyle(0x0e1e0e); g.fillRect(5, 21, 4, 3); g.fillRect(15, 20, 4, 4);
    g.fillStyle(0x333333, 0.15); g.fillRect(0, 15, 24, 2);
  });
  // forest-2: Forest path/clearing
  generateTile(scene, 'forest-2', 0x4a7a3a, 0x3e6e2e, undefined, g => {
    g.fillStyle(0x3e6e2e); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x528a52); g.fillRect(3, 4, 6, 4); g.fillRect(14, 12, 5, 4); g.fillRect(8, 18, 4, 3);
    g.fillStyle(0x5ea85e, 0.4); g.fillRect(6, 2, 3, 2); g.fillRect(16, 6, 3, 2); g.fillRect(2, 14, 3, 2); g.fillRect(18, 18, 3, 2);
    g.fillStyle(0x2e6a0e); g.fillRect(10, 8, 4, 2); g.fillRect(1, 20, 3, 2); g.fillRect(19, 2, 3, 2);
    g.fillStyle(0xddcc33); g.fillRect(5, 10, 1, 1); g.fillRect(15, 4, 1, 1);
    g.fillStyle(0xcc5544); g.fillRect(10, 14, 1, 1); g.fillRect(20, 20, 1, 1);
    g.fillStyle(0x88886e); g.fillRect(3, 18, 1, 1); g.fillRect(18, 9, 1, 1);
    g.fillStyle(0x888877); g.fillRect(8, 6, 2, 1); g.fillRect(14, 16, 2, 1);
  });
  // forest-4: Shared treasure chest (same as dng-4)
  generateTile(scene, 'forest-4', 0x6b5c3e, 0x5e5033, undefined, g => {
    // Shadow beneath chest
    g.fillStyle(0x222222, 0.5);
    g.fillRect(4, 20, 16, 3);
    // Chest body
    g.fillStyle(0x996622); g.fillRect(4, 11, 16, 10);
    g.fillStyle(0xaa7722); g.fillRect(5, 12, 14, 8);
    // Chest lid
    g.fillStyle(0xbb8833); g.fillRect(4, 7, 16, 5);
    g.fillStyle(0xcc9933); g.fillRect(5, 7, 14, 3);
    g.fillStyle(0xddaa44); g.fillRect(6, 7, 12, 1);
    // Iron bands
    g.fillStyle(0x666666); g.fillRect(4, 12, 16, 1); g.fillRect(4, 16, 16, 1); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x888888); g.fillRect(5, 12, 1, 1); g.fillRect(18, 12, 1, 1); g.fillRect(5, 16, 1, 1); g.fillRect(18, 16, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(9, 13, 6, 3);
    g.fillStyle(0xffcc44); g.fillRect(10, 14, 4, 1);
    g.fillStyle(0x886611); g.fillRect(11, 14, 2, 2);
    g.fillStyle(0x888811); g.fillRect(4, 11, 1, 1); g.fillRect(19, 11, 1, 1); g.fillRect(4, 20, 1, 1); g.fillRect(19, 20, 1, 1);
    g.fillStyle(0x886611); g.fillRect(7, 13, 1, 6); g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511); g.fillRect(10, 17, 1, 3); g.fillRect(13, 17, 1, 3);
    g.fillStyle(0xaa7722); g.fillRect(7, 8, 1, 3); g.fillRect(16, 8, 1, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(0, 22, 4, 2); g.fillRect(20, 22, 4, 2);
  });
  // forest-8: Shared banner/flag (same as dng-8)
  generateTile(scene, 'forest-8', 0x6b5c3e, 0x5e5033, undefined, g => {
    g.fillStyle(0x222222, 0.4); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x664433); g.fillRect(4, 14, 16, 8);
    g.fillStyle(0x776644); g.fillRect(4, 14, 16, 1);
    g.fillStyle(0x888888); g.fillRect(4, 17, 16, 1); g.fillRect(4, 21, 16, 1);
    g.fillStyle(0x776644); g.fillRect(4, 6, 16, 8);
    g.fillStyle(0x887755); g.fillRect(5, 6, 14, 1);
    g.fillStyle(0x998866); g.fillRect(6, 6, 12, 1);
    g.fillStyle(0x886633); g.fillRect(4, 13, 16, 1);
    g.fillStyle(0x888888); g.fillRect(4, 9, 16, 1);
    g.fillStyle(0x554422); g.fillRect(5, 10, 14, 3);
    g.fillStyle(0x222211); g.fillRect(5, 15, 14, 5);
    g.fillStyle(0xddaa33); g.fillRect(2, 20, 1, 1); g.fillRect(3, 21, 1, 1); g.fillRect(7, 22, 1, 1); g.fillRect(18, 20, 1, 1); g.fillRect(20, 21, 1, 1); g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44); g.fillRect(1, 21, 1, 1); g.fillRect(5, 22, 1, 1); g.fillRect(10, 22, 1, 1); g.fillRect(19, 22, 1, 1); g.fillRect(22, 21, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(7, 18, 2, 1); g.fillRect(13, 17, 2, 1);
    g.fillStyle(0xffcc44); g.fillRect(9, 17, 1, 1); g.fillRect(15, 18, 1, 1);
  });
  // forest-17: Dense tree line variant (same as forest-1 but different context)
  generateTile(scene, 'forest-17', 0x0e1e0e, 0x0a160a, undefined, g => {
    g.fillStyle(0x132f13); g.fillRect(0, 0, 24, 14);
    g.fillStyle(0x0e220e); g.fillRect(0, 14, 24, 10);
    g.fillStyle(0x2a2210); g.fillRect(3, 8, 3, 16); g.fillRect(11, 6, 3, 18); g.fillRect(19, 9, 3, 15);
    g.fillStyle(0x352a18); g.fillRect(4, 10, 1, 4); g.fillRect(12, 8, 1, 4); g.fillRect(20, 12, 1, 4);
    g.fillStyle(0x0a180a); g.fillRect(0, 0, 8, 8); g.fillRect(8, 0, 8, 6); g.fillRect(16, 0, 8, 9);
    g.fillStyle(0x1a3a0a); g.fillRect(1, 2, 3, 2); g.fillRect(9, 1, 3, 2); g.fillRect(17, 3, 3, 2); g.fillRect(5, 5, 4, 2); g.fillRect(14, 2, 3, 2);
    g.fillStyle(0x060e06); g.fillRect(6, 10, 5, 4); g.fillRect(14, 12, 5, 3); g.fillRect(0, 16, 3, 4); g.fillRect(22, 14, 2, 6);
    g.fillStyle(0x1a330a); g.fillRect(0, 20, 24, 4);
    g.fillStyle(0x0e1e0e); g.fillRect(5, 21, 4, 3); g.fillRect(15, 20, 4, 4);
    g.fillStyle(0x333333, 0.15); g.fillRect(0, 15, 24, 2);
  });
  // forest-18: Forest cabin/structure
  generateTile(scene, 'forest-18', 0x6b5c3e, 0x5e5033, undefined, g => {
    g.fillStyle(0x5e5033); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x3d1e1a); g.fillRect(6, 0, 12, 24);
    g.fillStyle(0x4a2ea0); g.fillRect(8, 2, 3, 3); g.fillRect(13, 6, 3, 3); g.fillRect(8, 14, 3, 3); g.fillRect(13, 18, 3, 3);
    g.fillStyle(0x7a5c4c); g.fillRect(4, 6, 16, 10);
    g.fillStyle(0x8a7065); g.fillRect(5, 7, 14, 8);
    g.fillStyle(0x5a4a33); g.fillRect(4, 6, 16, 1); g.fillRect(4, 15, 16, 1); g.fillRect(4, 6, 1, 10); g.fillRect(19, 6, 1, 10);
    g.fillStyle(0x553333); g.fillRect(6, 9, 12, 1); g.fillRect(6, 12, 10, 1);
    g.fillStyle(0x888888); g.fillRect(5, 8, 1, 1); g.fillRect(18, 8, 1, 1); g.fillRect(5, 14, 1, 1); g.fillRect(18, 14, 1, 1);
    g.fillStyle(0x3d5a1d, 0.5); g.fillRect(4, 14, 3, 2); g.fillRect(16, 14, 4, 2);
  });
  // forest-24: Forest campfire/torch
  generateTile(scene, 'forest-24', 0x6b5c3e, 0x5e5033, undefined, g => {
    g.fillStyle(0xff6600, 0.12); g.fillCircle(12, 10, 14);
    g.fillStyle(0xffa020, 0.2); g.fillCircle(12, 10, 10);
    g.fillStyle(0x5e5033); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0xffa122, 0.35); g.fillRect(4, 2, 16, 18);
    g.fillStyle(0xffcc44, 0.25); g.fillRect(6, 4, 12, 14);
    g.fillStyle(0x3d1e1a); g.fillRect(4, 2, 16, 2); g.fillRect(10, 0, 4, 2);
    g.fillStyle(0x666655); g.fillRect(10, 6, 4, 8);
    g.fillStyle(0x777766); g.fillRect(11, 7, 2, 6);
    g.fillStyle(0x555544); g.fillRect(11, 4, 2, 2);
    g.fillStyle(0xff6600); g.fillRect(10, 7, 4, 5);
    g.fillStyle(0xffa022); g.fillRect(11, 8, 2, 3);
    g.fillStyle(0xffcc44); g.fillRect(11, 9, 2, 2);
    g.fillStyle(0xffdd88, 0.9); g.fillRect(11, 9, 2, 1);
    g.fillStyle(0xffdd33, 0.4); g.fillCircle(12, 10, 6);
    g.fillStyle(0xffcc00, 0.3); g.fillCircle(12, 10, 8);
    g.fillStyle(0x3d701d); g.fillRect(0, 21, 3, 3); g.fillRect(21, 21, 3, 3);
  });
  // Clone remaining forest tiles from dungeon tiles
  for (const idx of [3, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 25, 26, 27]) {
    const dngKey = `dng-${idx}`;
    const forestKey = `forest-${idx}`;
    if (scene.textures.exists(dngKey)) {
      const src = scene.textures.get(dngKey).getSourceImage();
      scene.textures.addImage(forestKey, src as HTMLImageElement);
    }
  }

  // ── Tower theme tiles ──
  // tower-0: Tower stone floor
  generateTile(scene, 'tower-0', 0x7a7a78, 0x6e6e6a, undefined, g => {
    g.fillStyle(0x6e6e6a); g.fillRect(0, 11, 24, 1); g.fillRect(8, 0, 1, 11); g.fillRect(17, 0, 1, 11); g.fillRect(5, 12, 1, 12); g.fillRect(12, 12, 1, 12); g.fillRect(20, 12, 1, 12);
    g.fillStyle(0x8a8a88); g.fillRect(2, 2, 4, 3); g.fillRect(10, 13, 3, 2); g.fillRect(15, 4, 3, 2);
    g.fillStyle(0x6a6a68); g.fillRect(4, 7, 2, 2); g.fillRect(14, 18, 3, 1); g.fillRect(1, 15, 2, 1);
    g.fillStyle(0x888880, 0.3); g.fillRect(0, 5, 24, 1); g.fillRect(0, 17, 24, 1);
  });
  // tower-1: Tower dark wall
  generateTile(scene, 'tower-1', 0x4a4a5a, 0x3e3e4e, undefined, g => {
    g.fillStyle(0x555558); g.fillRect(0, 7, 24, 1); g.fillRect(0, 15, 24, 1); g.fillRect(0, 23, 24, 1); g.fillRect(12, 0, 1, 7); g.fillRect(6, 8, 1, 7); g.fillRect(18, 8, 1, 7); g.fillRect(12, 16, 1, 7);
    g.fillStyle(0x3a3a4a); g.fillRect(1, 1, 5, 3); g.fillRect(14, 9, 3, 3); g.fillRect(2, 17, 4, 3);
    g.fillStyle(0x222233); g.fillRect(11, 2, 2, 4);
    g.fillStyle(0x1a1a2a); g.fillRect(11, 3, 2, 2);
    g.fillStyle(0x667a5a, 0.3); g.fillRect(11, 3, 1, 1);
    g.fillStyle(0x555560); g.fillRect(8, 10, 2, 1); g.fillRect(15, 18, 3, 1); g.fillRect(3, 4, 2, 1);
  });
  // tower-2: Tower stair path
  generateTile(scene, 'tower-2', 0x7a7a78, 0x6e6e6a, undefined, g => {
    g.fillStyle(0x6e6e6a); g.fillRect(0, 11, 24, 1); g.fillRect(8, 0, 1, 11); g.fillRect(17, 0, 1, 11); g.fillRect(5, 12, 1, 12); g.fillRect(12, 12, 1, 12); g.fillRect(20, 12, 1, 12);
    g.fillStyle(0x444455); g.fillRect(3, 3, 1, 4); g.fillRect(4, 6, 1, 3); g.fillRect(5, 8, 1, 2); g.fillRect(14, 14, 1, 5); g.fillRect(15, 18, 1, 3); g.fillRect(16, 20, 1, 2); g.fillRect(9, 5, 1, 3); g.fillRect(10, 7, 1, 2);
    g.fillStyle(0x666678); g.fillRect(6, 9, 1, 1); g.fillRect(16, 19, 1, 1); g.fillRect(2, 14, 1, 1);
    g.fillStyle(0x6a6a68, 0.6); g.fillRect(10, 13, 4, 3); g.fillRect(1, 2, 3, 2);
  });
  // tower-4: Shared treasure chest
  generateTile(scene, 'tower-4', 0x7a7a78, 0x6e6e6a, undefined, g => {
    g.fillStyle(0x222222, 0.5); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x996622); g.fillRect(4, 11, 16, 10); g.fillStyle(0xaa7722); g.fillRect(5, 12, 14, 8);
    g.fillStyle(0xbb8833); g.fillRect(4, 7, 16, 5); g.fillStyle(0xcc9933); g.fillRect(5, 7, 14, 3); g.fillStyle(0xddaa44); g.fillRect(6, 7, 12, 1);
    g.fillStyle(0x666666); g.fillRect(4, 12, 16, 1); g.fillRect(4, 16, 16, 1); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x888888); g.fillRect(5, 12, 1, 1); g.fillRect(18, 12, 1, 1); g.fillRect(5, 16, 1, 1); g.fillRect(18, 16, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(9, 13, 6, 3); g.fillStyle(0xffcc44); g.fillRect(10, 14, 4, 1);
    g.fillStyle(0x886611); g.fillRect(11, 14, 2, 2);
    g.fillStyle(0x888811); g.fillRect(4, 11, 1, 1); g.fillRect(19, 11, 1, 1); g.fillRect(4, 20, 1, 1); g.fillRect(19, 20, 1, 1);
    g.fillStyle(0x886611); g.fillRect(7, 13, 1, 6); g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511); g.fillRect(10, 17, 1, 3); g.fillRect(13, 17, 1, 3);
    g.fillStyle(0xaa7722); g.fillRect(7, 8, 1, 3); g.fillRect(16, 8, 1, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(0, 22, 4, 2); g.fillRect(20, 22, 4, 2);
  });
  // tower-8: Shared banner/flag
  generateTile(scene, 'tower-8', 0x7a7a78, 0x6e6e6a, undefined, g => {
    g.fillStyle(0x222222, 0.4); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x664433); g.fillRect(4, 14, 16, 8); g.fillStyle(0x776644); g.fillRect(4, 14, 16, 1);
    g.fillStyle(0x888888); g.fillRect(4, 17, 16, 1); g.fillRect(4, 21, 16, 1);
    g.fillStyle(0x776644); g.fillRect(4, 6, 16, 8); g.fillStyle(0x887755); g.fillRect(5, 6, 14, 1); g.fillStyle(0x998866); g.fillRect(6, 6, 12, 1);
    g.fillStyle(0x886633); g.fillRect(4, 13, 16, 1); g.fillStyle(0x888888); g.fillRect(4, 9, 16, 1);
    g.fillStyle(0x554422); g.fillRect(5, 10, 14, 3); g.fillStyle(0x222211); g.fillRect(5, 15, 14, 5);
    g.fillStyle(0xddaa33); g.fillRect(2, 20, 1, 1); g.fillRect(3, 21, 1, 1); g.fillRect(7, 22, 1, 1); g.fillRect(18, 20, 1, 1); g.fillRect(20, 21, 1, 1); g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44); g.fillRect(1, 21, 1, 1); g.fillRect(5, 22, 1, 1); g.fillRect(10, 22, 1, 1); g.fillRect(19, 22, 1, 1); g.fillRect(22, 21, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(7, 18, 2, 1); g.fillRect(13, 17, 2, 1);
    g.fillStyle(0xffcc44); g.fillRect(9, 17, 1, 1); g.fillRect(15, 18, 1, 1);
  });
  // tower-19: Tower mossy floor variant
  generateTile(scene, 'tower-19', 0x7a7a78, 0x6e6e6a, undefined, g => {
    g.fillStyle(0x6e6e6a); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x5e5e5a); g.fillRect(2, 4, 20, 16); g.fillRect(4, 2, 16, 20); g.fillRect(3, 3, 18, 18);
    g.fillStyle(0x6e6e68); g.fillRect(5, 5, 8, 3); g.fillRect(13, 10, 6, 4); g.fillRect(4, 15, 5, 3);
    g.fillStyle(0x7a7a74); g.fillRect(6, 3, 10, 1); g.fillRect(5, 4, 12, 1);
    g.fillStyle(0x4e4e48, 0.8); g.fillRect(8, 7, 1, 4); g.fillRect(9, 10, 3, 1); g.fillRect(15, 5, 1, 3); g.fillRect(6, 14, 4, 1); g.fillRect(14, 15, 1, 3);
    g.fillStyle(0x444440); g.fillRect(3, 19, 18, 2); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x778a3a, 0.2); g.fillRect(1, 6, 2, 1); g.fillRect(21, 9, 2, 1); g.fillRect(1, 14, 2, 1); g.fillRect(21, 17, 2, 1);
    g.fillStyle(0x7a7a78, 0.3); g.fillRect(0, 22, 24, 2); g.fillRect(0, 0, 24, 1);
  });
  // tower-25: Tower decorative floor
  generateTile(scene, 'tower-25', 0x7a7a78, 0x6e6e6a, undefined, g => {
    g.fillStyle(0x6e6e6a); g.fillRect(0, 11, 24, 1); g.fillRect(8, 0, 1, 11); g.fillRect(17, 0, 1, 11); g.fillRect(5, 12, 1, 12); g.fillRect(13, 12, 1, 12);
    g.fillStyle(0x998866, 0.6); g.fillRect(11, 3, 2, 2); g.fillRect(9, 5, 2, 2); g.fillRect(13, 5, 2, 2); g.fillRect(7, 7, 2, 1); g.fillRect(15, 7, 2, 1); g.fillRect(11, 14, 2, 2); g.fillRect(9, 16, 2, 2); g.fillRect(13, 16, 2, 2); g.fillRect(7, 18, 2, 1); g.fillRect(15, 18, 2, 1);
    g.fillStyle(0xaabb4c, 0.3); g.fillRect(3, 9, 5, 1); g.fillRect(16, 10, 5, 1); g.fillRect(5, 20, 4, 1); g.fillRect(15, 21, 4, 1);
  });
  // Clone remaining tower tiles from dungeon tiles
  for (const idx of [3, 5, 6, 7, 9, 10, 12, 14, 15, 16, 17, 18, 24]) {
    const dngKey = `dng-${idx}`;
    const towerKey = `tower-${idx}`;
    if (scene.textures.exists(dngKey)) {
      const src = scene.textures.get(dngKey).getSourceImage();
      scene.textures.addImage(towerKey, src as HTMLImageElement);
    }
  }

  // ── Crystal theme tiles ──
  // crystal-0: Crystal cavern floor
  generateTile(scene, 'crystal-0', 0x334466, 0x2e3e5a, undefined, g => {
    g.fillStyle(0x334466); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x2e3e5a); g.fillRect(2, 3, 4, 3); g.fillRect(14, 8, 5, 3); g.fillRect(8, 16, 4, 3); g.fillRect(18, 2, 3, 2); g.fillRect(1, 12, 3, 2);
    g.fillStyle(0x88bbdd, 0.6); g.fillRect(5, 5, 1, 1); g.fillRect(15, 3, 1, 1); g.fillRect(10, 11, 1, 1); g.fillRect(20, 15, 1, 1); g.fillRect(3, 19, 1, 1); g.fillRect(17, 20, 1, 1);
    g.fillStyle(0xaaddee, 0.4); g.fillRect(8, 2, 1, 1); g.fillRect(22, 8, 1, 1); g.fillRect(12, 18, 1, 1);
  });
  // crystal-1: Crystal dark wall
  generateTile(scene, 'crystal-1', 0x222e45, 0x1c2a3a, undefined, g => {
    g.fillStyle(0x222e45); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x1c2a3a); g.fillRect(0, 11, 24, 1); g.fillRect(12, 0, 1, 24);
    g.fillStyle(0x1a2840); g.fillRect(2, 2, 6, 5); g.fillRect(14, 14, 7, 5);
    g.fillStyle(0x556cbc); g.fillRect(3, 3, 2, 4); g.fillRect(15, 6, 3, 2); g.fillRect(8, 15, 2, 4); g.fillRect(19, 1, 2, 3);
    g.fillStyle(0x77449a); g.fillRect(6, 8, 2, 3); g.fillRect(17, 15, 2, 3); g.fillRect(1, 18, 2, 3);
    g.fillStyle(0x99ccee, 0.5); g.fillRect(3, 3, 1, 1); g.fillRect(15, 6, 1, 1); g.fillRect(8, 15, 1, 1);
  });
  // crystal-2: Crystal stair path
  generateTile(scene, 'crystal-2', 0x334466, 0x2e3e5a, undefined, g => {
    g.fillStyle(0x334466); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x2e3e5a); g.fillRect(2, 3, 4, 3); g.fillRect(14, 8, 5, 3);
    g.fillStyle(0x558888); g.fillRect(4, 4, 1, 8); g.fillRect(5, 11, 6, 1); g.fillRect(11, 8, 1, 4); g.fillRect(12, 8, 5, 1); g.fillRect(17, 5, 1, 4); g.fillRect(14, 16, 1, 5); g.fillRect(15, 20, 4, 1);
    g.fillStyle(0x88bbdd, 0.4); g.fillRect(8, 2, 1, 1); g.fillRect(20, 14, 1, 1);
  });
  // crystal-4: Shared treasure chest
  generateTile(scene, 'crystal-4', 0x334466, 0x2e3e5a, undefined, g => {
    g.fillStyle(0x222222, 0.5); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x996622); g.fillRect(4, 11, 16, 10); g.fillStyle(0xaa7722); g.fillRect(5, 12, 14, 8);
    g.fillStyle(0xbb8833); g.fillRect(4, 7, 16, 5); g.fillStyle(0xcc9933); g.fillRect(5, 7, 14, 3); g.fillStyle(0xddaa44); g.fillRect(6, 7, 12, 1);
    g.fillStyle(0x666666); g.fillRect(4, 12, 16, 1); g.fillRect(4, 16, 16, 1); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x888888); g.fillRect(5, 12, 1, 1); g.fillRect(18, 12, 1, 1); g.fillRect(5, 16, 1, 1); g.fillRect(18, 16, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(9, 13, 6, 3); g.fillStyle(0xffcc44); g.fillRect(10, 14, 4, 1);
    g.fillStyle(0x886611); g.fillRect(11, 14, 2, 2);
    g.fillStyle(0x888811); g.fillRect(4, 11, 1, 1); g.fillRect(19, 11, 1, 1); g.fillRect(4, 20, 1, 1); g.fillRect(19, 20, 1, 1);
    g.fillStyle(0x886611); g.fillRect(7, 13, 1, 6); g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511); g.fillRect(10, 17, 1, 3); g.fillRect(13, 17, 1, 3);
    g.fillStyle(0xaa7722); g.fillRect(7, 8, 1, 3); g.fillRect(16, 8, 1, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(0, 22, 4, 2); g.fillRect(20, 22, 4, 2);
  });
  // crystal-8: Shared banner/flag
  generateTile(scene, 'crystal-8', 0x334466, 0x2e3e5a, undefined, g => {
    g.fillStyle(0x222222, 0.4); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x664433); g.fillRect(4, 14, 16, 8); g.fillStyle(0x776644); g.fillRect(4, 14, 16, 1);
    g.fillStyle(0x888888); g.fillRect(4, 17, 16, 1); g.fillRect(4, 21, 16, 1);
    g.fillStyle(0x776644); g.fillRect(4, 6, 16, 8); g.fillStyle(0x887755); g.fillRect(5, 6, 14, 1); g.fillStyle(0x998866); g.fillRect(6, 6, 12, 1);
    g.fillStyle(0x886633); g.fillRect(4, 13, 16, 1); g.fillStyle(0x888888); g.fillRect(4, 9, 16, 1);
    g.fillStyle(0x554422); g.fillRect(5, 10, 14, 3); g.fillStyle(0x222211); g.fillRect(5, 15, 14, 5);
    g.fillStyle(0xddaa33); g.fillRect(2, 20, 1, 1); g.fillRect(3, 21, 1, 1); g.fillRect(7, 22, 1, 1); g.fillRect(18, 20, 1, 1); g.fillRect(20, 21, 1, 1); g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44); g.fillRect(1, 21, 1, 1); g.fillRect(5, 22, 1, 1); g.fillRect(10, 22, 1, 1); g.fillRect(19, 22, 1, 1); g.fillRect(22, 21, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(7, 18, 2, 1); g.fillRect(13, 17, 2, 1);
    g.fillStyle(0xffcc44); g.fillRect(9, 17, 1, 1); g.fillRect(15, 18, 1, 1);
  });
  // crystal-20: Crystal pillar columns
  generateTile(scene, 'crystal-20', 0x2a4466, 0x223860, undefined, g => {
    g.fillStyle(0x2a4466); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x447cbc); g.fillRect(2, 0, 4, 24); g.fillRect(10, 0, 5, 24); g.fillRect(18, 0, 4, 24);
    g.fillStyle(0x558edd); g.fillRect(3, 0, 2, 24); g.fillRect(11, 0, 3, 24); g.fillRect(19, 0, 2, 24);
    g.fillStyle(0x88ccee, 0.6); g.fillRect(3, 4, 1, 3); g.fillRect(12, 8, 1, 3); g.fillRect(19, 14, 1, 3);
    g.fillStyle(0xccddff, 0.7); g.fillRect(4, 5, 1, 1); g.fillRect(12, 9, 1, 1); g.fillRect(20, 15, 1, 1);
    g.fillStyle(0x1a2840); g.fillRect(6, 0, 1, 24); g.fillRect(15, 0, 1, 24); g.fillRect(8, 3, 2, 4); g.fillRect(16, 10, 2, 4);
  });
  // crystal-23: Crystal formation/giant crystal
  generateTile(scene, 'crystal-23', 0x334466, 0x2e3e5a, undefined, g => {
    g.fillStyle(0x334466); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x2e3e5a); g.fillRect(2, 3, 4, 3); g.fillRect(14, 8, 5, 3); g.fillRect(8, 16, 4, 3);
    g.fillStyle(0x88bbdd, 0.6); g.fillRect(1, 19, 1, 1); g.fillRect(20, 20, 1, 1); g.fillRect(3, 22, 1, 1);
    g.fillStyle(0xaaddee, 0.4); g.fillRect(22, 17, 1, 1); g.fillRect(0, 15, 1, 1);
    // Crystal glow
    g.fillStyle(0xccddff, 0.15); g.fillCircle(12, 10, 12);
    g.fillStyle(0xccddff, 0.25); g.fillCircle(12, 10, 8);
    // Crystal base
    g.fillStyle(0x886bab); g.fillRect(7, 18, 10, 4);
    // Crystal body
    g.fillStyle(0xddccff); g.fillRect(9, 4, 6, 16);
    g.fillStyle(0xeeddff); g.fillRect(10, 3, 4, 16);
    g.fillStyle(0xffddff); g.fillRect(11, 1, 2, 4);
    g.fillStyle(0xffffff, 0.9); g.fillRect(11, 1, 2, 1);
    g.fillStyle(0xffffff, 0.6); g.fillRect(11, 2, 1, 1);
    g.fillStyle(0xffd8ff, 0.4); g.fillRect(10, 5, 4, 10);
    g.fillStyle(0xffffff, 0.7); g.fillRect(11, 4, 1, 1); g.fillRect(13, 8, 1, 1);
    g.fillStyle(0xffe8ff, 0.6); g.fillRect(10, 7, 1, 1); g.fillRect(12, 12, 1, 1);
  });
  // Clone remaining crystal tiles from dungeon tiles
  for (const idx of [3, 5, 6, 7, 9, 10, 12, 14, 15, 16, 17, 18, 24]) {
    const dngKey = `dng-${idx}`;
    const crystalKey = `crystal-${idx}`;
    if (scene.textures.exists(dngKey)) {
      const src = scene.textures.get(dngKey).getSourceImage();
      scene.textures.addImage(crystalKey, src as HTMLImageElement);
    }
  }

  // ── Ice theme tiles ──
  // ice-0: Ice floor
  generateTile(scene, 'ice-0', 0x556677, 0x4d5e6e, undefined, g => {
    g.fillStyle(0x556677); g.fillRect(0, 0, 12, 12);
    g.fillStyle(0x4d5e6e); g.fillRect(12, 0, 12, 12);
    g.fillStyle(0x506470); g.fillRect(0, 12, 12, 12);
    g.fillStyle(0x587078); g.fillRect(12, 12, 12, 12);
    g.fillStyle(0x88aa4a, 0.3); g.fillRect(3, 2, 1, 1); g.fillRect(18, 7, 1, 1); g.fillRect(7, 17, 1, 1); g.fillRect(20, 20, 1, 1);
    g.fillStyle(0x445566, 0.4); g.fillRect(0, 11, 24, 1); g.fillRect(11, 0, 1, 24);
  });
  // ice-1: Snow/ice wall with snowdrifts
  generateTile(scene, 'ice-1', 0xc8c8e8, 0xb8b8d8, undefined, g => {
    g.fillStyle(0x88aa4a); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x778820); g.fillRect(0, 12, 24, 12);
    g.fillStyle(0xd8d8ee); g.fillRect(0, 0, 24, 6);
    g.fillStyle(0xe8e8f6); g.fillRect(2, 0, 20, 4);
    g.fillStyle(0xf0f0f8); g.fillRect(4, 0, 16, 2);
    g.fillStyle(0xd0d0e6); g.fillRect(6, 6, 2, 2); g.fillRect(14, 5, 3, 2);
    g.fillStyle(0x99882c, 0.6); g.fillRect(3, 10, 4, 3); g.fillRect(16, 14, 5, 3);
    g.fillStyle(0x667788, 0.5); g.fillRect(10, 8, 1, 6); g.fillRect(5, 16, 6, 1); g.fillRect(18, 10, 1, 4);
  });
  // ice-4: Shared treasure chest
  generateTile(scene, 'ice-4', 0x556677, 0x4d5e6e, undefined, g => {
    g.fillStyle(0x222222, 0.5); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x996622); g.fillRect(4, 11, 16, 10); g.fillStyle(0xaa7722); g.fillRect(5, 12, 14, 8);
    g.fillStyle(0xbb8833); g.fillRect(4, 7, 16, 5); g.fillStyle(0xcc9933); g.fillRect(5, 7, 14, 3); g.fillStyle(0xddaa44); g.fillRect(6, 7, 12, 1);
    g.fillStyle(0x666666); g.fillRect(4, 12, 16, 1); g.fillRect(4, 16, 16, 1); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x888888); g.fillRect(5, 12, 1, 1); g.fillRect(18, 12, 1, 1); g.fillRect(5, 16, 1, 1); g.fillRect(18, 16, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(9, 13, 6, 3); g.fillStyle(0xffcc44); g.fillRect(10, 14, 4, 1);
    g.fillStyle(0x886611); g.fillRect(11, 14, 2, 2);
    g.fillStyle(0x888811); g.fillRect(4, 11, 1, 1); g.fillRect(19, 11, 1, 1); g.fillRect(4, 20, 1, 1); g.fillRect(19, 20, 1, 1);
    g.fillStyle(0x886611); g.fillRect(7, 13, 1, 6); g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511); g.fillRect(10, 17, 1, 3); g.fillRect(13, 17, 1, 3);
    g.fillStyle(0xaa7722); g.fillRect(7, 8, 1, 3); g.fillRect(16, 8, 1, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(0, 22, 4, 2); g.fillRect(20, 22, 4, 2);
  });
  // ice-8: Shared banner/flag
  generateTile(scene, 'ice-8', 0x556677, 0x4d5e6e, undefined, g => {
    g.fillStyle(0x222222, 0.4); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x664433); g.fillRect(4, 14, 16, 8); g.fillStyle(0x776644); g.fillRect(4, 14, 16, 1);
    g.fillStyle(0x888888); g.fillRect(4, 17, 16, 1); g.fillRect(4, 21, 16, 1);
    g.fillStyle(0x776644); g.fillRect(4, 6, 16, 8); g.fillStyle(0x887755); g.fillRect(5, 6, 14, 1); g.fillStyle(0x998866); g.fillRect(6, 6, 12, 1);
    g.fillStyle(0x886633); g.fillRect(4, 13, 16, 1); g.fillStyle(0x888888); g.fillRect(4, 9, 16, 1);
    g.fillStyle(0x554422); g.fillRect(5, 10, 14, 3); g.fillStyle(0x222211); g.fillRect(5, 15, 14, 5);
    g.fillStyle(0xddaa33); g.fillRect(2, 20, 1, 1); g.fillRect(3, 21, 1, 1); g.fillRect(7, 22, 1, 1); g.fillRect(18, 20, 1, 1); g.fillRect(20, 21, 1, 1); g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44); g.fillRect(1, 21, 1, 1); g.fillRect(5, 22, 1, 1); g.fillRect(10, 22, 1, 1); g.fillRect(19, 22, 1, 1); g.fillRect(22, 21, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(7, 18, 2, 1); g.fillRect(13, 17, 2, 1);
    g.fillStyle(0xffcc44); g.fillRect(9, 17, 1, 1); g.fillRect(15, 18, 1, 1);
  });
  // ice-25: Frost crystal floor
  generateTile(scene, 'ice-25', 0x88bbdd, 0x99ccee, undefined, g => {
    g.fillStyle(0x7a9acf); g.fillRect(0, 0, 12, 12);
    g.fillStyle(0x88bbdd); g.fillRect(12, 0, 12, 12);
    g.fillStyle(0x80aad5); g.fillRect(0, 12, 12, 12);
    g.fillStyle(0x99ccee); g.fillRect(12, 12, 12, 12);
    g.fillStyle(0xaabbff, 0.4); g.fillRect(2, 3, 6, 1); g.fillRect(14, 7, 5, 1); g.fillRect(6, 15, 7, 1); g.fillRect(16, 19, 4, 1);
    g.fillStyle(0xccddff, 0.5); g.fillRect(3, 4, 3, 1); g.fillRect(15, 8, 2, 1); g.fillRect(8, 16, 3, 1);
    g.fillStyle(0xddeeff, 0.6); g.fillRect(5, 2, 1, 1); g.fillRect(17, 6, 1, 1); g.fillRect(10, 14, 1, 1); g.fillRect(20, 20, 1, 1);
    g.fillStyle(0x66881b, 0.3); g.fillRect(8, 5, 1, 6); g.fillRect(16, 12, 1, 5);
  });
  // ice-28: Frozen lake/pool
  generateTile(scene, 'ice-28', 0x88aacc, 0x779abb, undefined, g => {
    g.fillStyle(0x7a9acf); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x779abb); g.fillRect(3, 4, 18, 16); g.fillRect(4, 3, 16, 18);
    g.fillStyle(0x88aacc); g.fillRect(5, 4, 14, 10);
    g.fillStyle(0x99bbdd); g.fillRect(6, 4, 12, 2);
    g.fillStyle(0xaaccdd, 0.5); g.fillRect(6, 6, 4, 3); g.fillRect(13, 8, 5, 3);
    g.fillStyle(0x556a8a); g.fillRect(4, 18, 16, 2); g.fillRect(5, 19, 14, 1);
    g.fillStyle(0x668a9a, 0.4); g.fillRect(10, 6, 1, 8); g.fillRect(7, 12, 6, 1);
  });
  // Clone remaining ice tiles from dungeon tiles
  for (const idx of [2, 3, 6, 7, 9, 10, 12, 14, 15, 16, 17, 18, 24]) {
    const dngKey = `dng-${idx}`;
    const iceKey = `ice-${idx}`;
    if (scene.textures.exists(dngKey)) {
      const src = scene.textures.get(dngKey).getSourceImage();
      scene.textures.addImage(iceKey, src as HTMLImageElement);
    }
  }

  // ── Shadow theme tiles ──
  // shadow-0: Shadow realm floor
  generateTile(scene, 'shadow-0', 0x706860, 0x685e55, undefined, g => {
    g.fillStyle(0x5e5545); g.fillRect(0, 11, 24, 1); g.fillRect(8, 0, 1, 11); g.fillRect(17, 0, 1, 11); g.fillRect(4, 12, 1, 12); g.fillRect(13, 12, 1, 12);
    g.fillStyle(0x807818); g.fillRect(3, 3, 2, 2); g.fillRect(12, 6, 2, 2); g.fillRect(6, 16, 2, 2); g.fillRect(18, 19, 2, 2);
  });
  // shadow-1: Shadow wall
  generateTile(scene, 'shadow-1', 0x1a1a28, 0x121220, undefined, g => {
    g.fillStyle(0x202030); g.fillRect(0, 7, 24, 1); g.fillRect(0, 15, 24, 1); g.fillRect(0, 23, 24, 1); g.fillRect(12, 0, 1, 7); g.fillRect(6, 8, 1, 7); g.fillRect(18, 8, 1, 7); g.fillRect(12, 16, 1, 7);
    g.fillStyle(0x28282a); g.fillRect(2, 3, 3, 2); g.fillRect(16, 10, 2, 3); g.fillRect(8, 18, 3, 2);
  });
  // shadow-4: Shared treasure chest
  generateTile(scene, 'shadow-4', 0x706860, 0x685e55, undefined, g => {
    g.fillStyle(0x222222, 0.5); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x996622); g.fillRect(4, 11, 16, 10); g.fillStyle(0xaa7722); g.fillRect(5, 12, 14, 8);
    g.fillStyle(0xbb8833); g.fillRect(4, 7, 16, 5); g.fillStyle(0xcc9933); g.fillRect(5, 7, 14, 3); g.fillStyle(0xddaa44); g.fillRect(6, 7, 12, 1);
    g.fillStyle(0x666666); g.fillRect(4, 12, 16, 1); g.fillRect(4, 16, 16, 1); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x888888); g.fillRect(5, 12, 1, 1); g.fillRect(18, 12, 1, 1); g.fillRect(5, 16, 1, 1); g.fillRect(18, 16, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(9, 13, 6, 3); g.fillStyle(0xffcc44); g.fillRect(10, 14, 4, 1);
    g.fillStyle(0x886611); g.fillRect(11, 14, 2, 2);
    g.fillStyle(0x888811); g.fillRect(4, 11, 1, 1); g.fillRect(19, 11, 1, 1); g.fillRect(4, 20, 1, 1); g.fillRect(19, 20, 1, 1);
    g.fillStyle(0x886611); g.fillRect(7, 13, 1, 6); g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511); g.fillRect(10, 17, 1, 3); g.fillRect(13, 17, 1, 3);
    g.fillStyle(0xaa7722); g.fillRect(7, 8, 1, 3); g.fillRect(16, 8, 1, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(0, 22, 4, 2); g.fillRect(20, 22, 4, 2);
  });
  // shadow-8: Shared banner/flag
  generateTile(scene, 'shadow-8', 0x706860, 0x685e55, undefined, g => {
    g.fillStyle(0x222222, 0.4); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x664433); g.fillRect(4, 14, 16, 8); g.fillStyle(0x776644); g.fillRect(4, 14, 16, 1);
    g.fillStyle(0x888888); g.fillRect(4, 17, 16, 1); g.fillRect(4, 21, 16, 1);
    g.fillStyle(0x776644); g.fillRect(4, 6, 16, 8); g.fillStyle(0x887755); g.fillRect(5, 6, 14, 1); g.fillStyle(0x998866); g.fillRect(6, 6, 12, 1);
    g.fillStyle(0x886633); g.fillRect(4, 13, 16, 1); g.fillStyle(0x888888); g.fillRect(4, 9, 16, 1);
    g.fillStyle(0x554422); g.fillRect(5, 10, 14, 3); g.fillStyle(0x222211); g.fillRect(5, 15, 14, 5);
    g.fillStyle(0xddaa33); g.fillRect(2, 20, 1, 1); g.fillRect(3, 21, 1, 1); g.fillRect(7, 22, 1, 1); g.fillRect(18, 20, 1, 1); g.fillRect(20, 21, 1, 1); g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44); g.fillRect(1, 21, 1, 1); g.fillRect(5, 22, 1, 1); g.fillRect(10, 22, 1, 1); g.fillRect(19, 22, 1, 1); g.fillRect(22, 21, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(7, 18, 2, 1); g.fillRect(13, 17, 2, 1);
    g.fillStyle(0xffcc44); g.fillRect(9, 17, 1, 1); g.fillRect(15, 18, 1, 1);
  });
  // shadow-24: Shadow altar/pillar
  generateTile(scene, 'shadow-24', 0x706860, 0x685e55, undefined, g => {
    g.fillStyle(0x554422); g.fillRect(11, 10, 2, 12);
    g.fillStyle(0x664a3a); g.fillRect(10, 4, 4, 6); g.fillRect(11, 2, 2, 3);
    g.fillStyle(0x886c4c); g.fillRect(11, 5, 2, 3);
  });
  // Clone remaining shadow tiles from dungeon tiles
  for (const idx of [2, 3, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 23, 25, 26, 27, 28]) {
    const dngKey = `dng-${idx}`;
    const shadowKey = `shadow-${idx}`;
    if (scene.textures.exists(dngKey)) {
      const src = scene.textures.get(dngKey).getSourceImage();
      scene.textures.addImage(shadowKey, src as HTMLImageElement);
    }
  }

  // ── Tomb theme tiles ──
  // tomb-0: Sandstone floor
  generateTile(scene, 'tomb-0', 0xc8b860, 0xb8a850, undefined, g => {
    g.fillStyle(0xc8b860); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0xd4c86e); g.fillRect(1, 1, 10, 10); g.fillRect(13, 1, 10, 10); g.fillRect(1, 13, 10, 10); g.fillRect(13, 13, 10, 10);
    g.fillStyle(0x9a8a40); g.fillRect(0, 11, 24, 2); g.fillRect(11, 0, 2, 24);
    g.fillStyle(0x8a7a30, 0.6); g.fillRect(4, 4, 2, 1); g.fillRect(4, 6, 1, 2); g.fillRect(16, 16, 2, 1); g.fillRect(17, 18, 1, 2);
  });
  // tomb-1: Tomb wall with hieroglyphs
  generateTile(scene, 'tomb-1', 0x7a5a28, 0x6a4a18, undefined, g => {
    g.fillStyle(0x7a5a28); g.fillRect(0, 0, 24, 24);
    g.fillStyle(0x5a4218); g.fillRect(0, 7, 24, 1); g.fillRect(0, 15, 24, 1); g.fillRect(0, 23, 24, 1); g.fillRect(11, 0, 1, 7); g.fillRect(5, 8, 1, 7); g.fillRect(17, 8, 1, 7); g.fillRect(9, 16, 1, 7); g.fillRect(19, 16, 1, 7);
    g.fillStyle(0x8a6a38, 0.4); g.fillRect(1, 1, 9, 5); g.fillRect(13, 9, 10, 5); g.fillRect(1, 17, 7, 5);
    g.fillStyle(0x4a3a18); g.fillRect(3, 3, 1, 2); g.fillRect(4, 3, 2, 1); g.fillRect(14, 11, 2, 1); g.fillRect(14, 12, 1, 2);
  });
  // tomb-4: Shared treasure chest
  generateTile(scene, 'tomb-4', 0xc8b860, 0xb8a850, undefined, g => {
    g.fillStyle(0x222222, 0.5); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x996622); g.fillRect(4, 11, 16, 10); g.fillStyle(0xaa7722); g.fillRect(5, 12, 14, 8);
    g.fillStyle(0xbb8833); g.fillRect(4, 7, 16, 5); g.fillStyle(0xcc9933); g.fillRect(5, 7, 14, 3); g.fillStyle(0xddaa44); g.fillRect(6, 7, 12, 1);
    g.fillStyle(0x666666); g.fillRect(4, 12, 16, 1); g.fillRect(4, 16, 16, 1); g.fillRect(4, 20, 16, 1);
    g.fillStyle(0x888888); g.fillRect(5, 12, 1, 1); g.fillRect(18, 12, 1, 1); g.fillRect(5, 16, 1, 1); g.fillRect(18, 16, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(9, 13, 6, 3); g.fillStyle(0xffcc44); g.fillRect(10, 14, 4, 1);
    g.fillStyle(0x886611); g.fillRect(11, 14, 2, 2);
    g.fillStyle(0x888811); g.fillRect(4, 11, 1, 1); g.fillRect(19, 11, 1, 1); g.fillRect(4, 20, 1, 1); g.fillRect(19, 20, 1, 1);
    g.fillStyle(0x886611); g.fillRect(7, 13, 1, 6); g.fillRect(16, 13, 1, 6);
    g.fillStyle(0x775511); g.fillRect(10, 17, 1, 3); g.fillRect(13, 17, 1, 3);
    g.fillStyle(0xaa7722); g.fillRect(7, 8, 1, 3); g.fillRect(16, 8, 1, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(0, 22, 4, 2); g.fillRect(20, 22, 4, 2);
  });
  // tomb-8: Shared banner/flag
  generateTile(scene, 'tomb-8', 0xc8b860, 0xb8a850, undefined, g => {
    g.fillStyle(0x222222, 0.4); g.fillRect(4, 20, 16, 3);
    g.fillStyle(0x664433); g.fillRect(4, 14, 16, 8); g.fillStyle(0x776644); g.fillRect(4, 14, 16, 1);
    g.fillStyle(0x888888); g.fillRect(4, 17, 16, 1); g.fillRect(4, 21, 16, 1);
    g.fillStyle(0x776644); g.fillRect(4, 6, 16, 8); g.fillStyle(0x887755); g.fillRect(5, 6, 14, 1); g.fillStyle(0x998866); g.fillRect(6, 6, 12, 1);
    g.fillStyle(0x886633); g.fillRect(4, 13, 16, 1); g.fillStyle(0x888888); g.fillRect(4, 9, 16, 1);
    g.fillStyle(0x554422); g.fillRect(5, 10, 14, 3); g.fillStyle(0x222211); g.fillRect(5, 15, 14, 5);
    g.fillStyle(0xddaa33); g.fillRect(2, 20, 1, 1); g.fillRect(3, 21, 1, 1); g.fillRect(7, 22, 1, 1); g.fillRect(18, 20, 1, 1); g.fillRect(20, 21, 1, 1); g.fillRect(21, 22, 1, 1);
    g.fillStyle(0xffcc44); g.fillRect(1, 21, 1, 1); g.fillRect(5, 22, 1, 1); g.fillRect(10, 22, 1, 1); g.fillRect(19, 22, 1, 1); g.fillRect(22, 21, 1, 1);
    g.fillStyle(0xddaa33); g.fillRect(7, 18, 2, 1); g.fillRect(13, 17, 2, 1);
    g.fillStyle(0xffcc44); g.fillRect(9, 17, 1, 1); g.fillRect(15, 18, 1, 1);
  });
  // tomb-24: Tomb altar/sarcophagus
  generateTile(scene, 'tomb-24', 0xc8b860, 0xb8a850, undefined, g => {
    g.fillStyle(0x7a5a28); g.fillRect(11, 10, 2, 12);
    g.fillStyle(0xddaa22); g.fillRect(10, 4, 4, 6); g.fillRect(11, 2, 2, 3);
    g.fillStyle(0xffcc44); g.fillRect(11, 5, 2, 3);
  });
  // Clone remaining tomb tiles from dungeon tiles
  for (const idx of [2, 3, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 23, 25, 26, 27, 28]) {
    const dngKey = `dng-${idx}`;
    const tombKey = `tomb-${idx}`;
    if (scene.textures.exists(dngKey)) {
      const src = scene.textures.get(dngKey).getSourceImage();
      scene.textures.addImage(tombKey, src as HTMLImageElement);
    }
  }
}

function generateUIAssets(scene: Phaser.Scene): void {
  const TL = TILE_LOGICAL; // 24 — output texture size

  // ── Male NPC (npc) — medieval villager ──
  const gn = scene.add.graphics().setVisible(false);
  const sn = new ScaledGraphics(gn, SPRITE_SCALE);
  // Hair — brown, tidy
  sn.fillStyle(0x664422);
  sn.fillRect(8, 1, 8, 4);
  sn.fillStyle(0x553311);
  sn.fillRect(8, 1, 8, 1);
  sn.fillStyle(0x664422);
  sn.fillRect(7, 2, 1, 3);
  sn.fillRect(16, 2, 1, 3);
  // Face — warm skin
  sn.fillStyle(0xe8c898);
  sn.fillRect(8, 4, 8, 5);
  // Eyes — 1×2 vertical dots
  sn.fillStyle(0x000000);
  sn.fillRect(10, 5, 1, 2);
  sn.fillRect(13, 5, 1, 2);
  // Mouth
  sn.fillStyle(0xd4a070);
  sn.fillRect(11, 8, 2, 1);
  // Green medieval tunic
  sn.fillStyle(0x448844);
  sn.fillRect(7, 9, 10, 6);
  sn.fillStyle(0x336633);
  sn.fillRect(7, 9, 10, 1); // collar
  sn.fillStyle(0x55aa55);
  sn.fillRect(11, 10, 2, 5); // center seam
  // Arms
  sn.fillStyle(0x448844);
  sn.fillRect(5, 10, 2, 4);
  sn.fillRect(17, 10, 2, 4);
  sn.fillStyle(0xe8c898);
  sn.fillRect(5, 14, 2, 1);
  sn.fillRect(17, 14, 2, 1);
  // Brown belt
  sn.fillStyle(0x664422);
  sn.fillRect(7, 15, 10, 1);
  sn.fillStyle(0xccaa33);
  sn.fillRect(11, 15, 2, 1);
  // Brown trousers
  sn.fillStyle(0x665544);
  sn.fillRect(8, 16, 4, 4);
  sn.fillRect(12, 16, 4, 4);
  // Boots
  sn.fillStyle(0x554433);
  sn.fillRect(8, 20, 4, 3);
  sn.fillRect(12, 20, 4, 3);
  gn.generateTexture('npc', TL * SPRITE_SCALE, TL * SPRITE_SCALE);
  gn.destroy();

  // ── Female NPC (npc-f) — medieval village woman ──
  const gf = scene.add.graphics().setVisible(false);
  const sf = new ScaledGraphics(gf, SPRITE_SCALE);
  // Hair — long auburn, flowing
  sf.fillStyle(0x884433);
  sf.fillRect(8, 0, 8, 4);
  sf.fillStyle(0x773322);
  sf.fillRect(8, 0, 8, 1);
  sf.fillStyle(0x884433);
  sf.fillRect(7, 1, 1, 8); // hair L
  sf.fillRect(16, 1, 1, 8); // hair R
  sf.fillRect(17, 5, 1, 5); // flowing end R
  // Face — warm skin
  sf.fillStyle(0xe8c898);
  sf.fillRect(8, 3, 8, 5);
  // Eyes — 1×2 vertical dots
  sf.fillStyle(0x000000);
  sf.fillRect(10, 4, 1, 2);
  sf.fillRect(13, 4, 1, 2);
  // Rosy cheeks
  sf.fillStyle(0xeebb99);
  sf.fillRect(9, 6, 1, 1);
  sf.fillRect(14, 6, 1, 1);
  // Mouth
  sf.fillStyle(0xd4a070);
  sf.fillRect(11, 7, 2, 1);
  // Purple medieval dress
  sf.fillStyle(0x7744aa);
  sf.fillRect(7, 8, 10, 7);
  sf.fillStyle(0x8855bb);
  sf.fillRect(7, 8, 10, 1); // collar
  sf.fillStyle(0xe8c898);
  sf.fillRect(11, 8, 2, 1); // neckline skin
  // Arms
  sf.fillStyle(0x7744aa);
  sf.fillRect(5, 9, 2, 4);
  sf.fillRect(17, 9, 2, 4);
  sf.fillStyle(0xe8c898);
  sf.fillRect(5, 13, 2, 1);
  sf.fillRect(17, 13, 2, 1);
  // A-line skirt
  sf.fillStyle(0x6633aa);
  sf.fillRect(6, 15, 12, 5);
  sf.fillStyle(0x5522aa);
  sf.fillRect(9, 15, 1, 5);
  sf.fillRect(14, 15, 1, 5);
  sf.fillStyle(0x8855cc);
  sf.fillRect(6, 19, 12, 1); // hem
  // Shoes
  sf.fillStyle(0x554433);
  sf.fillRect(8, 20, 3, 3);
  sf.fillRect(13, 20, 3, 3);
  gf.generateTexture('npc-f', TL * SPRITE_SCALE, TL * SPRITE_SCALE);
  gf.destroy();

  // ── Save Crystal (save-point) — native 24×24 ──
  const gs = scene.add.graphics().setVisible(false);
  const ss = new ScaledGraphics(gs, SPRITE_SCALE);
  // Pedestal — stone base (wider bottom)
  ss.fillStyle(0x555555);
  ss.fillRect(5, 19, 14, 4);
  ss.fillStyle(0x666666);
  ss.fillRect(6, 18, 12, 2);
  ss.fillStyle(0x777777);
  ss.fillRect(7, 17, 10, 2);
  ss.fillStyle(0x888888);
  ss.fillRect(5, 19, 14, 1); // top highlight
  // Crystal body — diamond shape (two triangles)
  ss.fillStyle(0x44bbff);
  ss.fillTriangle(12, 2, 5, 11, 19, 11);  // top half
  ss.fillTriangle(5, 11, 19, 11, 12, 17); // bottom half
  // Crystal facet highlights
  ss.fillStyle(0x88ddff, 0.8);
  ss.fillTriangle(12, 3, 6, 10, 12, 10);  // left facet shine
  // Bright center
  ss.fillStyle(0xaaeeff, 0.6);
  ss.fillRect(10, 8, 4, 4);
  ss.fillStyle(0xffffff, 0.7);
  ss.fillRect(11, 9, 2, 2); // core glow
  // Crystal edge highlights
  ss.fillStyle(0x66ddff, 0.5);
  ss.fillRect(12, 3, 1, 4); // top center line
  ss.fillRect(6, 11, 1, 2); // bottom left edge
  ss.fillRect(17, 11, 1, 2); // bottom right edge
  // Sparkle dots around crystal
  ss.fillStyle(0xffffff, 0.9);
  ss.fillRect(3, 5, 2, 2);
  ss.fillRect(19, 7, 2, 2);
  ss.fillRect(8, 0, 2, 2);
  ss.fillRect(16, 3, 1, 1);
  ss.fillRect(2, 10, 1, 1);
  // Light glow effect (faint rings)
  ss.fillStyle(0x44bbff, 0.15);
  ss.fillRect(3, 4, 18, 14);
  ss.fillStyle(0x44bbff, 0.1);
  ss.fillRect(1, 2, 22, 18);
  gs.generateTexture('save-point', TL * SPRITE_SCALE, TL * SPRITE_SCALE);
  gs.destroy();

  // ── Healer NPC (npc-healer) — female face + nurse hat + counter ──
  const gh = scene.add.graphics().setVisible(false);
  const sh = new ScaledGraphics(gh, SPRITE_SCALE);
  // Hair — same auburn as female NPC
  sh.fillStyle(0x884433);
  sh.fillRect(8, 1, 8, 4);
  sh.fillStyle(0x773322);
  sh.fillRect(8, 1, 8, 1);
  sh.fillStyle(0x884433);
  sh.fillRect(7, 2, 1, 7); // hair L
  sh.fillRect(16, 2, 1, 7); // hair R
  sh.fillRect(17, 5, 1, 5); // flowing end R
  // Nurse hat on top — white with red cross
  sh.fillStyle(0xffffff);
  sh.fillRect(9, 0, 6, 2);
  sh.fillStyle(0xdd3333);
  sh.fillRect(11, 0, 2, 2);
  sh.fillRect(10, 1, 4, 1);
  // Face — same as female NPC
  sh.fillStyle(0xe8c898);
  sh.fillRect(8, 3, 8, 5);
  // Eyes — 1×2 vertical dots
  sh.fillStyle(0x000000);
  sh.fillRect(10, 4, 1, 2);
  sh.fillRect(13, 4, 1, 2);
  // Rosy cheeks
  sh.fillStyle(0xeebb99);
  sh.fillRect(9, 6, 1, 1);
  sh.fillRect(14, 6, 1, 1);
  // Mouth
  sh.fillStyle(0xd4a070);
  sh.fillRect(11, 7, 2, 1);
  // Blue uniform
  sh.fillStyle(0x2266bb);
  sh.fillRect(7, 8, 10, 7);
  sh.fillStyle(0x3377cc);
  sh.fillRect(7, 8, 10, 1); // collar
  // White cross on chest
  sh.fillStyle(0xffffff);
  sh.fillRect(11, 10, 2, 3);
  sh.fillRect(10, 11, 4, 1);
  // Arms
  sh.fillStyle(0x2266bb);
  sh.fillRect(5, 9, 2, 4);
  sh.fillRect(17, 9, 2, 4);
  sh.fillStyle(0xe8c898);
  sh.fillRect(5, 13, 2, 1);
  sh.fillRect(17, 13, 2, 1);
  // White counter
  sh.fillStyle(0xeeeedd);
  sh.fillRect(3, 16, 18, 3);
  sh.fillStyle(0xffffff);
  sh.fillRect(3, 16, 18, 1);
  sh.fillStyle(0xddddcc);
  sh.fillRect(3, 18, 18, 1);
  // Red cross on counter
  sh.fillStyle(0xdd3333);
  sh.fillRect(11, 17, 2, 2);
  sh.fillRect(10, 17, 4, 1);
  // Floor below
  sh.fillStyle(0xaa9977);
  sh.fillRect(0, 19, 24, 5);
  sh.fillStyle(0x9e8e6e);
  sh.fillRect(0, 21, 24, 1);
  gh.generateTexture('npc-healer', TL * SPRITE_SCALE, TL * SPRITE_SCALE);
  gh.destroy();

  // ── Shopkeeper — native 24×24 ──
  const gsh = scene.add.graphics().setVisible(false);
  const ssh = new ScaledGraphics(gsh, SPRITE_SCALE);
  // Merchant hat — wide brim
  ssh.fillStyle(0x664422);
  ssh.fillRect(6, 0, 12, 3);
  ssh.fillStyle(0x774433);
  ssh.fillRect(7, 0, 10, 2);
  ssh.fillStyle(0xddaa33);
  ssh.fillRect(9, 1, 6, 1); // gold band
  ssh.fillStyle(0x885533);
  ssh.fillRect(6, 2, 12, 1); // brim shadow
  // Hair sides
  ssh.fillStyle(0x553311);
  ssh.fillRect(7, 3, 1, 3);
  ssh.fillRect(16, 3, 1, 3);
  // Head / face (narrower but stocky)
  ssh.fillStyle(0xddbb88);
  ssh.fillRect(8, 3, 8, 6);
  ssh.fillStyle(0xccaa77);
  ssh.fillRect(7, 4, 1, 2); // ear L
  ssh.fillRect(16, 4, 1, 2); // ear R
  // Eyebrows (bushy)
  ssh.fillStyle(0x553311);
  ssh.fillRect(9, 4, 2, 1);
  ssh.fillRect(13, 4, 2, 1);
  // Eyes (small, beady)
  ssh.fillStyle(0x000000);
  ssh.fillRect(10, 5, 1, 1);
  ssh.fillRect(13, 5, 1, 1);
  // Nose
  ssh.fillStyle(0xccaa77);
  ssh.fillRect(11, 6, 2, 1);
  // Mustache
  ssh.fillStyle(0x553311);
  ssh.fillRect(9, 7, 6, 1);
  ssh.fillRect(10, 8, 4, 1);
  // Tunic — orange/brown
  ssh.fillStyle(0xcc8844);
  ssh.fillRect(6, 9, 12, 6);
  ssh.fillStyle(0xdd9955);
  ssh.fillRect(6, 9, 12, 1); // tunic highlight
  // Belt
  ssh.fillStyle(0x664422);
  ssh.fillRect(6, 10, 12, 1);
  ssh.fillStyle(0xddaa33);
  ssh.fillRect(10, 10, 4, 1); // gold buckle
  // Apron (cream white over tunic)
  ssh.fillStyle(0xeeddcc);
  ssh.fillRect(7, 11, 10, 4);
  ssh.fillStyle(0xddccbb);
  ssh.fillRect(9, 11, 6, 4); // apron center shadow
  ssh.fillStyle(0xeeddcc);
  ssh.fillRect(7, 11, 10, 1); // apron top edge
  // Apron ties (sides)
  ssh.fillStyle(0xeeddcc);
  ssh.fillRect(5, 11, 2, 3);
  ssh.fillRect(17, 11, 2, 3);
  // Arms (stocky)
  ssh.fillStyle(0xcc8844);
  ssh.fillRect(3, 10, 3, 4);
  ssh.fillRect(18, 10, 3, 4);
  // Hands
  ssh.fillStyle(0xddbb88);
  ssh.fillRect(3, 13, 3, 2);
  ssh.fillRect(18, 13, 3, 2);
  // Counter — wooden, in front of lower body
  ssh.fillStyle(0x886644);
  ssh.fillRect(2, 16, 20, 3);
  ssh.fillStyle(0x775533);
  ssh.fillRect(2, 19, 20, 3);
  ssh.fillStyle(0x997755);
  ssh.fillRect(2, 16, 20, 1); // counter top highlight
  ssh.fillStyle(0x664422);
  ssh.fillRect(2, 21, 20, 1); // counter bottom shadow
  // Counter front planks
  ssh.fillStyle(0x886644);
  ssh.fillRect(8, 19, 1, 3);
  ssh.fillRect(15, 19, 1, 3);
  gsh.generateTexture('shopkeeper', TL * SPRITE_SCALE, TL * SPRITE_SCALE);
  gsh.destroy();
}
