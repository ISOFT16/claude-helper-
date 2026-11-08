// Procedural PBR materials: every texture is generated in code (albedo + normal + roughness/metalness),
// tileable, so the game ships with no image files and no third-party art.
import * as THREE from 'three';

// ---------- tileable gradient noise ----------
function makePerm(seed) {
  const p = new Uint8Array(512);
  const a = [];
  for (let i = 0; i < 256; i++) a.push(i);
  let s = seed * 9301 + 49297;
  for (let i = 255; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return p;
}
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

function noise2(perm, x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X0 = ((xi % period) + period) % period, Y0 = ((yi % period) + period) % period;
  const X1 = (X0 + 1) % period, Y1 = (Y0 + 1) % period;
  const g = (X, Y, dx, dy) => { const gr = GRAD[perm[perm[X] + Y] & 7]; return gr[0] * dx + gr[1] * dy; };
  const u = fade(xf), v = fade(yf);
  const n00 = g(X0, Y0, xf, yf), n10 = g(X1, Y0, xf - 1, yf), n01 = g(X0, Y1, xf, yf - 1), n11 = g(X1, Y1, xf - 1, yf - 1);
  return (n00 + u * (n10 - n00)) + v * ((n01 + u * (n11 - n01)) - (n00 + u * (n10 - n00)));
}

// fbm over [0,1)^2, tileable; base = number of cells across the texture at the first octave
function fbmField(N, base, octaves, seed, gain = 0.5, sx = 1, sy = 1) {
  const perm = makePerm(seed);
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let amp = 1, freq = base, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        const px = Math.max(1, Math.round(freq * sx)), py = Math.max(1, Math.round(freq * sy));
        sum += amp * noise2(perm, (x / N) * px, (y / N) * py, Math.max(px, py)) ;
        norm += amp; amp *= gain; freq *= 2;
      }
      out[y * N + x] = sum / norm;
    }
  }
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// ---------- map builder ----------
// gen(ctx) fills arrays: col (r,g,b 0..1), h (height 0..1), rough (0..1), metal (0..1)
function buildMaps(N, gen, normalStrength = 2) {
  const col = new Float32Array(N * N * 3).fill(0.5);
  const h = new Float32Array(N * N).fill(0.5);
  const rough = new Float32Array(N * N).fill(0.8);
  const metal = new Float32Array(N * N).fill(0);
  gen({ N, col, h, rough, metal });

  const cA = document.createElement('canvas'); cA.width = cA.height = N;
  const cN = document.createElement('canvas'); cN.width = cN.height = N;
  const cR = document.createElement('canvas'); cR.width = cR.height = N;
  const iA = cA.getContext('2d').createImageData(N, N);
  const iN = cN.getContext('2d').createImageData(N, N);
  const iR = cR.getContext('2d').createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, p = i * 4;
      iA.data[p] = clamp01(col[i * 3]) * 255; iA.data[p + 1] = clamp01(col[i * 3 + 1]) * 255; iA.data[p + 2] = clamp01(col[i * 3 + 2]) * 255; iA.data[p + 3] = 255;
      const l = h[y * N + ((x - 1 + N) % N)], r = h[y * N + ((x + 1) % N)];
      const u = h[((y - 1 + N) % N) * N + x], d = h[((y + 1) % N) * N + x];
      let nx = (l - r) * normalStrength * N / 64, ny = (d - u) * normalStrength * N / 64, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      iN.data[p] = (nx * 0.5 + 0.5) * 255; iN.data[p + 1] = (ny * 0.5 + 0.5) * 255; iN.data[p + 2] = (nz * 0.5 + 0.5) * 255; iN.data[p + 3] = 255;
      iR.data[p] = 255; iR.data[p + 1] = clamp01(rough[i]) * 255; iR.data[p + 2] = clamp01(metal[i]) * 255; iR.data[p + 3] = 255;
    }
  }
  cA.getContext('2d').putImageData(iA, 0, 0);
  cN.getContext('2d').putImageData(iN, 0, 0);
  cR.getContext('2d').putImageData(iR, 0, 0);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { map: tex(cA, true), normalMap: tex(cN, false), ormMap: tex(cR, false), canvas: cA };
}

// helper to set a pixel
function put(ctx, i, r, g, b) { ctx.col[i * 3] = r; ctx.col[i * 3 + 1] = g; ctx.col[i * 3 + 2] = b; }

// ---------- generators ----------
const GEN = {
  concrete: (N) => buildMaps(N, (c) => {
    const big = fbmField(N, 2, 4, 11), mid = fbmField(N, 8, 4, 12), fine = fbmField(N, 64, 2, 13);
    const R = rng(5);
    for (let i = 0; i < N * N; i++) {
      const v = 0.56 + big[i] * 0.12 + mid[i] * 0.06 + fine[i] * 0.05;
      put(c, i, v * 0.98, v * 0.97, v * 0.95);
      c.h[i] = 0.5 + mid[i] * 0.25 + fine[i] * 0.2;
      c.rough[i] = 0.82 + fine[i] * 0.1 - big[i] * 0.06;
    }
    for (let k = 0; k < N * 6; k++) { // pores
      const x = Math.floor(R() * N), y = Math.floor(R() * N), i = y * N + x;
      c.h[i] -= 0.4; c.col[i * 3] *= 0.7; c.col[i * 3 + 1] *= 0.7; c.col[i * 3 + 2] *= 0.7;
    }
  }, 2.5),

  tiles: (N) => buildMaps(N, (c) => {
    // concrete slabs, 2x2 per texture, with seams
    const big = fbmField(N, 4, 4, 21), mid = fbmField(N, 16, 3, 22), fine = fbmField(N, 64, 2, 23);
    const R = rng(9);
    const slabTint = [0, 1, 2, 3].map(() => (R() - 0.5) * 0.06);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const sx = x % (N / 2), sy = y % (N / 2);
      const edge = Math.min(sx, sy, N / 2 - sx, N / 2 - sy);
      const slab = (x < N / 2 ? 0 : 1) + (y < N / 2 ? 0 : 2);
      let v = 0.47 + big[i] * 0.08 + mid[i] * 0.035 + fine[i] * 0.02 + slabTint[slab];
      let hh = 0.6 + mid[i] * 0.12 + fine[i] * 0.06;
      if (edge < 3) { v *= 0.55; hh = 0.1; } else if (edge < 6) { hh -= (6 - edge) * 0.06; v *= 0.92; }
      put(c, i, v * 1.0, v * 0.97, v * 0.92);
      c.h[i] = hh;
      c.rough[i] = 0.85 + fine[i] * 0.08;
    }
  }, 2),

  asphalt: (N) => buildMaps(N, (c) => {
    const mid = fbmField(N, 8, 3, 31), fine = fbmField(N, 128, 1, 32);
    const R = rng(3);
    for (let i = 0; i < N * N; i++) {
      const v = 0.2 + mid[i] * 0.04 + fine[i] * 0.06;
      put(c, i, v, v, v * 1.02);
      c.h[i] = 0.5 + fine[i] * 0.4;
      c.rough[i] = 0.9;
    }
    for (let k = 0; k < N * N / 30; k++) {
      const i = Math.floor(R() * N * N), v = 0.3 + R() * 0.25;
      put(c, i, v, v, v); c.h[i] += 0.3;
    }
  }, 3),

  grass: (N) => buildMaps(N, (c) => {
    const patch = fbmField(N, 3, 4, 41), mid = fbmField(N, 12, 3, 42);
    const blades = fbmField(N, 48, 3, 43, 0.6, 1, 6); // stretched noise -> blade-like streaks
    const blades2 = fbmField(N, 48, 3, 44, 0.6, 6, 1);
    for (let i = 0; i < N * N; i++) {
      const b = Math.max(blades[i], blades2[i]);
      const dry = clamp01(patch[i] * 2 + 0.2);
      const l = 0.75 + b * 0.6 + mid[i] * 0.2;
      put(c, i, (0.18 + dry * 0.2) * l, (0.36 + dry * 0.05) * l, (0.1 + dry * 0.02) * l);
      c.h[i] = 0.5 + b * 0.5;
      c.rough[i] = 0.9 - b * 0.1;
    }
  }, 2),

  wood: (N) => buildMaps(N, (c) => {
    // four planks across, grain along X
    const warp = fbmField(N, 4, 4, 51), fine = fbmField(N, 64, 2, 52, 0.5, 8, 1);
    const R = rng(77);
    const planks = 4;
    const tone = Array.from({ length: planks }, () => [0.85 + R() * 0.3, R() * 100]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const pi = Math.floor(y / (N / planks));
      const py = (y % (N / planks)) / (N / planks);
      const [t, off] = tone[pi];
      const g = Math.sin((py * 18 + warp[i] * 6 + off) * Math.PI) * 0.5 + 0.5;
      const ring = Math.pow(g, 3);
      const base = (0.5 + fine[i] * 0.1) * t;
      let r = base * (0.78 - ring * 0.25), gg = base * (0.52 - ring * 0.2), bb = base * (0.3 - ring * 0.12);
      let hh = 0.6 + fine[i] * 0.2 - ring * 0.1;
      const edge = Math.min(py, 1 - py) * (N / planks);
      if (edge < 2) { r *= 0.45; gg *= 0.45; bb *= 0.45; hh = 0.05; } else if (edge < 4) hh -= 0.15;
      put(c, i, r, gg, bb);
      c.h[i] = hh;
      c.rough[i] = 0.62 + ring * 0.15 + fine[i] * 0.05;
    }
  }, 2),

  brick: (N) => buildMaps(N, (c) => {
    const fine = fbmField(N, 64, 3, 61), mid = fbmField(N, 16, 3, 62);
    const R = rng(13);
    const rows = 8, cols = 4;
    const bh = N / rows, bw = N / cols;
    const tint = Array.from({ length: rows * cols * 2 }, () => 0.8 + R() * 0.35);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const row = Math.floor(y / bh);
      const shift = row % 2 ? bw / 2 : 0;
      const xx = (x + shift) % N;
      const col = Math.floor(xx / bw);
      const lx = xx % bw, ly = y % bh;
      const edge = Math.min(lx, bw - lx, ly, bh - ly);
      const t = tint[row * cols * 2 + col];
      if (edge < 3) {
        const m = 0.62 + fine[i] * 0.08;
        put(c, i, m, m * 0.97, m * 0.92);
        c.h[i] = 0.15 + fine[i] * 0.05; c.rough[i] = 0.95;
      } else {
        const v = t * (0.85 + mid[i] * 0.15 + fine[i] * 0.1);
        put(c, i, 0.56 * v, 0.27 * v, 0.2 * v);
        c.h[i] = 0.6 + Math.min(edge - 3, 4) * 0.05 + fine[i] * 0.15;
        c.rough[i] = 0.82 + fine[i] * 0.1;
      }
    }
  }, 2.5),

  plaster: (N) => buildMaps(N, (c) => {
    const mid = fbmField(N, 8, 4, 71), fine = fbmField(N, 96, 2, 72);
    for (let i = 0; i < N * N; i++) {
      const v = 0.82 + mid[i] * 0.04 + fine[i] * 0.03;
      put(c, i, v, v * 0.98, v * 0.94);
      c.h[i] = 0.5 + fine[i] * 0.4 + mid[i] * 0.2;
      c.rough[i] = 0.9;
    }
  }, 1.5),

  // white paint over steel: tint with the object colour; scratches show bare metal
  paint: (N) => buildMaps(N, (c) => {
    const wear = fbmField(N, 6, 5, 81), fine = fbmField(N, 64, 2, 82);
    const R = rng(21);
    for (let i = 0; i < N * N; i++) {
      const v = 0.9 + fine[i] * 0.03;
      put(c, i, v, v, v);
      c.h[i] = 0.55 + fine[i] * 0.05;
      c.rough[i] = 0.45 + wear[i] * 0.15;
      if (wear[i] > 0.42) { // worn patch: bare steel
        put(c, i, 0.55, 0.56, 0.58); c.metal[i] = 1; c.rough[i] = 0.4; c.h[i] = 0.45;
      }
    }
    for (let k = 0; k < 60; k++) { // scratches
      let x = R() * N, y = R() * N; const a = R() * Math.PI, len = 10 + R() * 60;
      for (let s = 0; s < len; s++) {
        const xi = ((Math.floor(x) % N) + N) % N, yi = ((Math.floor(y) % N) + N) % N, i = yi * N + xi;
        put(c, i, 0.6, 0.6, 0.62); c.metal[i] = 1; c.rough[i] = 0.3; c.h[i] = 0.4;
        x += Math.cos(a); y += Math.sin(a);
      }
    }
  }, 1.5),

  steel: (N) => buildMaps(N, (c) => {
    const brushed = fbmField(N, 64, 3, 91, 0.6, 1, 12), mid = fbmField(N, 6, 3, 92);
    for (let i = 0; i < N * N; i++) {
      const v = 0.66 + brushed[i] * 0.06 + mid[i] * 0.04;
      put(c, i, v, v, v * 1.02);
      c.h[i] = 0.5 + brushed[i] * 0.2;
      c.rough[i] = 0.3 + brushed[i] * 0.08 + mid[i] * 0.06;
      c.metal[i] = 1;
    }
  }, 0.8),

  rust: (N) => buildMaps(N, (c) => {
    const m = fbmField(N, 6, 5, 101), fine = fbmField(N, 64, 3, 102);
    for (let i = 0; i < N * N; i++) {
      const r = clamp01(m[i] * 2 + 0.4);
      put(c, i, 0.45 * r + 0.4 * (1 - r), 0.25 * r + 0.4 * (1 - r), 0.12 * r + 0.42 * (1 - r));
      c.metal[i] = 1 - r; c.rough[i] = 0.5 + r * 0.4; c.h[i] = 0.5 + fine[i] * 0.4 * r;
    }
  }, 2),

  rubber: (N) => buildMaps(N, (c) => {
    const fine = fbmField(N, 96, 2, 111);
    for (let i = 0; i < N * N; i++) {
      const v = 0.09 + fine[i] * 0.02;
      put(c, i, v, v, v); c.h[i] = 0.5 + fine[i] * 0.3; c.rough[i] = 0.85;
    }
  }, 1),

  plastic: (N) => buildMaps(N, (c) => {
    const fine = fbmField(N, 64, 2, 121), mid = fbmField(N, 8, 3, 122);
    for (let i = 0; i < N * N; i++) {
      const v = 0.9 + mid[i] * 0.02;
      put(c, i, v, v, v); c.h[i] = 0.5 + fine[i] * 0.08; c.rough[i] = 0.38 + mid[i] * 0.05;
    }
  }, 1),

  fabric: (N) => buildMaps(N, (c) => {
    const fine = fbmField(N, 32, 3, 131);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const w = (Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2));
      const v = 0.82 + w * 0.06 + fine[i] * 0.05;
      put(c, i, v, v, v); c.h[i] = 0.5 + w * 0.3; c.rough[i] = 0.95;
    }
  }, 2),

  bark: (N) => buildMaps(N, (c) => {
    const ridges = fbmField(N, 8, 5, 141, 0.55, 1, 6), fine = fbmField(N, 64, 2, 142);
    for (let i = 0; i < N * N; i++) {
      const r = Math.abs(ridges[i]) * 2;
      const v = 0.25 + r * 0.2 + fine[i] * 0.05;
      put(c, i, v * 1.0, v * 0.8, v * 0.6); c.h[i] = r; c.rough[i] = 0.95;
    }
  }, 3),
};

const SIZES = { low: 256, medium: 512, high: 512, ultra: 1024 };
let texSize = 512;
export function setTextureQuality(q) { texSize = SIZES[q] || 512; }

const mapCache = new Map();
function maps(name) {
  if (!mapCache.has(name)) mapCache.set(name, GEN[name](name === 'grass' || name === 'tiles' ? Math.max(texSize, 512) : texSize));
  return mapCache.get(name);
}

// physical description of each surface
const SURF = {
  concrete: { maps: 'concrete', scale: 3 },
  tiles: { maps: 'tiles', scale: 6 },
  asphalt: { maps: 'asphalt', scale: 4 },
  grass: { maps: 'grass', scale: 5 },
  wood: { maps: 'wood', scale: 1.2 },
  brick: { maps: 'brick', scale: 2.4 },
  plaster: { maps: 'plaster', scale: 3 },
  paint: { maps: 'paint', scale: 1.5, metalness: 1 },
  steel: { maps: 'steel', scale: 1, metalness: 1 },
  rust: { maps: 'rust', scale: 1.5, metalness: 1 },
  rubber: { maps: 'rubber', scale: 0.5 },
  plastic: { maps: 'plastic', scale: 1 },
  fabric: { maps: 'fabric', scale: 0.6 },
  bark: { maps: 'bark', scale: 1 },
};
export const SURFACE_NAMES = Object.keys(SURF);
export function surfaceScale(name) { return (SURF[name] || SURF.concrete).scale; }

const matCache = new Map();
// opts: { color, emissive, emissiveIntensity, glass, clearcoat, opacity, roughness, metalness, side }
export function material(name, opts = {}) {
  const key = name + '|' + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (opts.glass) {
    m = new THREE.MeshPhysicalMaterial({
      color: opts.color ?? 0xbfd8e8, roughness: 0.05, metalness: 0, transparent: true, opacity: opts.opacity ?? 0.25,
      envMapIntensity: 1.5, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    });
  } else if (name === 'flat' || !SURF[name]) {
    const Cls = opts.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    m = new Cls({ color: opts.color ?? 0xffffff, roughness: opts.roughness ?? 0.5, metalness: opts.metalness ?? 0 });
    if (opts.clearcoat) { m.clearcoat = opts.clearcoat; m.clearcoatRoughness = 0.1; }
  } else {
    const s = SURF[name];
    const mp = maps(s.maps);
    const Cls = opts.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    m = new Cls({
      color: opts.color ?? 0xffffff,
      map: mp.map, normalMap: mp.normalMap, roughnessMap: mp.ormMap, metalnessMap: mp.ormMap,
      roughness: opts.roughness ?? 1, metalness: opts.metalness ?? (s.metalness || 0),
    });
    m.normalScale = new THREE.Vector2(1, 1);
    if (opts.clearcoat) { m.clearcoat = opts.clearcoat; m.clearcoatRoughness = 0.15; }
  }
  if (opts.emissive != null) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1.5; }
  if (opts.opacity != null && !opts.glass) { m.transparent = true; m.opacity = opts.opacity; }
  if (opts.side) m.side = opts.side;
  m.userData.surface = name;
  matCache.set(key, m);
  return m;
}

// Canvas texture helper for decals (labels, stripes, screens)
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Soft round sprite for smoke and fire particles
let smokeTex = null;
export function smokeTexture() {
  if (smokeTex) return smokeTex;
  smokeTex = canvasTexture(128, 128, (g, w) => {
    const R = rng(4);
    for (let k = 0; k < 18; k++) {
      const x = w / 2 + (R() - 0.5) * 40, y = w / 2 + (R() - 0.5) * 40, r = 20 + R() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
  });
  return smokeTex;
}

// Leaf cluster card with alpha
let leafTex = null;
export function leafTexture() {
  if (leafTex) return leafTex;
  leafTex = canvasTexture(256, 256, (g, w) => {
    const R = rng(8);
    for (let k = 0; k < 260; k++) {
      const x = w / 2 + (R() - 0.5) * w * 0.85 * Math.sqrt(R()), y = w / 2 + (R() - 0.5) * w * 0.85 * Math.sqrt(R());
      const s = 6 + R() * 10, a = R() * Math.PI * 2;
      const l = 0.6 + R() * 0.4;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `rgb(${Math.floor(50 * l)},${Math.floor(105 * l)},${Math.floor(35 * l)})`;
      g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  });
  return leafTex;
}
