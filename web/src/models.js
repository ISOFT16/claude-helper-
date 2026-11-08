// Detailed visual models. Physics stays simple (boxes/spheres/cylinders); what you see is built here
// from smooth, bevelled geometry with PBR materials. No sharp-edged "boxes".
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { material, surfaceScale, canvasTexture } from './textures.js';

// ---------- geometry helpers ----------
// Box-project UVs in world units so textures keep a real-world scale on any size
export function boxUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv.setXY(i, u / scale, v / scale);
  }
  geo.setAttribute('uv', uv);
  return geo;
}

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

export function roundedBox(w, h, d, surface = 'concrete', r) {
  const rad = r ?? Math.min(0.06, Math.max(0.012, Math.min(w, h, d) * 0.12));
  return cached(`rb${w}|${h}|${d}|${rad}|${surface}`, () => boxUV(new RoundedBoxGeometry(w, h, d, 3, rad), surfaceScale(surface)));
}

// Cylinder with rounded rims (lathe). rt/rb top/bottom radius, bevel radius b
export function bevelCylinder(rt, rb, h, b, seg = 40) {
  const bb = Math.min(b ?? Math.min(rt, rb, h) * 0.12, Math.min(rt, rb) * 0.5, h * 0.25);
  return cached(`bc${rt}|${rb}|${h}|${bb}|${seg}`, () => {
    const pts = [];
    pts.push(new THREE.Vector2(0, -h / 2));
    for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(rb - bb + Math.cos(a) * bb, -h / 2 + bb + Math.sin(a) * bb)); }
    for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(rt - bb + Math.cos(a) * bb, h / 2 - bb + Math.sin(a) * bb)); }
    pts.push(new THREE.Vector2(0, h / 2));
    const g = new THREE.LatheGeometry(pts, seg);
    g.computeVertexNormals();
    return g;
  });
}

function lathe(key, points, seg = 40) {
  return cached('lathe' + key, () => { const g = new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), seg); g.computeVertexNormals(); return g; });
}
function sphere(r, sx = 1, sy = 1, sz = 1) {
  return cached(`sp${r}|${sx}|${sy}|${sz}`, () => { const g = new THREE.SphereGeometry(r, 40, 28); g.scale(sx, sy, sz); return g; });
}
function capsule(r, len) {
  return cached(`cap${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 8, 24));
}
function torus(R, r, seg = 48) {
  return cached(`to${R}|${r}`, () => new THREE.TorusGeometry(R, r, 16, seg));
}

// mesh factory: tint=true means the entity colour multiplies this part
function M(geo, mat, pos = [0, 0, 0], rot = null, tint = false, scale = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.tint = tint;
  m.userData.baseMat = mat;
  return m;
}
function G(...children) { const g = new THREE.Group(); children.forEach(c => c && g.add(c)); return g; }

// ---------- decals ----------
const stripeTex = (a, b, n = 8) => canvasTexture(256, 64, (g, w, h) => {
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  g.fillStyle = b;
  for (let i = -n; i < n * 2; i++) { g.beginPath(); g.moveTo(i * w / n, 0); g.lineTo(i * w / n + w / n / 2, 0); g.lineTo(i * w / n + w / n / 2 - h, h); g.lineTo(i * w / n - h, h); g.fill(); }
});
let _hazardLabel = null;
function hazardLabel() {
  if (_hazardLabel) return _hazardLabel;
  _hazardLabel = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#e8c21f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#151515';
    for (let i = -8; i < 24; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 - 24, 24); g.lineTo(i * 32 - 24, 24); g.fill(); }
    for (let i = -8; i < 24; i++) { g.beginPath(); g.moveTo(i * 32, h - 24); g.lineTo(i * 32 + 16, h - 24); g.lineTo(i * 32 + 16 - 24, h); g.lineTo(i * 32 - 24, h); g.fill(); }
    g.font = '800 54px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ОГНЕОПАСНО', w / 2, h / 2 + 2);
  });
  return _hazardLabel;
}
let _marker = null;
function dummyMarker() {
  if (_marker) return _marker;
  _marker = canvasTexture(128, 128, (g, w) => {
    g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, 7); g.fill();
    g.fillStyle = '#121212';
    g.beginPath(); g.moveTo(w / 2, w / 2); g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI / 2); g.fill();
    g.beginPath(); g.moveTo(w / 2, w / 2); g.arc(w / 2, w / 2, w / 2 - 2, Math.PI, Math.PI * 1.5); g.fill();
  });
  return _marker;
}
function decal(tex, w, h, pos, rot) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  const m = new THREE.Mesh(cached(`pl${w}|${h}`, () => new THREE.PlaneGeometry(w, h)), mat);
  m.position.set(...pos); if (rot) m.rotation.set(...rot);
  m.userData.tint = false;
  return m;
}

// ---------- legacy texture names used by shapes -> surfaces ----------
const LEGACY = { wood: 'wood', plank: 'wood', metal: 'paint', concrete: 'concrete', wall: 'brick', stripes: 'plastic', hazard: 'paint', checker: 'rubber', floor: 'tiles' };

// Generic visual for a physics shape {type, size|r|rt,rb,h, mat|tex, color, emissive, opacity, metal, tint}
export function shapeVisual(s) {
  if (s.model && MODELS[s.model]) return MODELS[s.model](s);
  const surf = s.mat || LEGACY[s.tex] || (s.metal ? 'paint' : 'plastic');
  const opts = {};
  if (s.emissive != null) { opts.emissive = s.emissive; opts.emissiveIntensity = 2; }
  if (s.opacity != null) opts.opacity = s.opacity;
  if (s.clearcoat) opts.clearcoat = s.clearcoat;
  const tint = s.tint !== false;
  const base = material(surf, opts);
  let geo;
  if (s.type === 'box') geo = roundedBox(s.size[0], s.size[1], s.size[2], surf);
  else if (s.type === 'sphere') geo = sphere(s.r);
  else if (s.type === 'cylinder') geo = bevelCylinder(s.rt ?? s.r, s.rb ?? s.r, s.h);
  else geo = roundedBox(1, 1, 1, surf);
  const m = M(geo, base, [0, 0, 0], null, tint);
  // colour from the definition is applied as the "default tint"
  m.userData.defColor = s.color ?? 0xffffff;
  return m;
}

// ---------- prop models ----------
export const MODELS = {
  crate(s) {
    const [w, h, d] = s.size;
    const wood = material('wood');
    const g = new THREE.Group();
    const t = Math.min(w, h, d) * 0.09;
    // inner panels
    g.add(M(roundedBox(w - t * 0.6, h - t * 0.6, d - t * 0.6, 'wood', t * 0.3), wood, [0, 0, 0], null, true));
    // frame beams along the 12 edges
    const ex = [w / 2 - t / 2, h / 2 - t / 2, d / 2 - t / 2];
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) g.add(M(roundedBox(w, t, t, 'wood', t * 0.3), wood, [0, sy * ex[1], sz * ex[2]], null, true));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(M(roundedBox(t, h, t, 'wood', t * 0.3), wood, [sx * ex[0], 0, sz * ex[2]], null, true));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.add(M(roundedBox(t, t, d, 'wood', t * 0.3), wood, [sx * ex[0], sy * ex[1], 0], null, true));
    // diagonal braces on the four side faces
    const diag = Math.hypot(w, h) - t * 2;
    for (const sz of [-1, 1]) g.add(M(roundedBox(diag, t * 0.9, t * 0.6, 'wood', t * 0.25), wood, [0, 0, sz * (d / 2 - t * 0.2)], [0, 0, Math.atan2(h, w)], true));
    const diag2 = Math.hypot(d, h) - t * 2;
    for (const sx of [-1, 1]) g.add(M(roundedBox(t * 0.6, t * 0.9, diag2, 'wood', t * 0.25), wood, [sx * (w / 2 - t * 0.2), 0, 0], [Math.atan2(h, d), 0, 0], true));
    return g;
  },

  barrel(s, hazard = false) {
    const r = s.r ?? s.rt, h = s.h;
    const paint = material('paint', { clearcoat: 0.3 });
    const steel = material('steel');
    const prof = [[0, -h / 2], [r * 0.92, -h / 2], [r * 0.97, -h / 2 + 0.01], [r, -h / 2 + 0.04]];
    for (const y of [-0.17, 0.17]) { prof.push([r, h * y - 0.035], [r * 1.035, h * y - 0.012], [r * 1.035, h * y + 0.012], [r, h * y + 0.035]); }
    prof.push([r, h / 2 - 0.04], [r * 0.97, h / 2 - 0.01], [r * 0.92, h / 2], [r * 0.9, h / 2 - 0.02], [0, h / 2 - 0.02]);
    prof.sort((a, b) => a[1] - b[1]);
    const body = M(lathe(`barrel${r}|${h}`, prof, 48), paint, [0, 0, 0], null, true);
    body.userData.defColor = hazard ? 0xb3261e : (s.color ?? 0x2e5f8a);
    const rimTop = M(torus(r * 0.93, 0.018), steel, [0, h / 2 - 0.01, 0], [Math.PI / 2, 0, 0]);
    const rimBot = M(torus(r * 0.93, 0.018), steel, [0, -h / 2 + 0.01, 0], [Math.PI / 2, 0, 0]);
    const cap1 = M(bevelCylinder(0.05, 0.05, 0.03, 0.008, 20), steel, [r * 0.5, h / 2 - 0.005, 0]);
    const cap2 = M(bevelCylinder(0.035, 0.035, 0.03, 0.008, 20), steel, [-r * 0.55, h / 2 - 0.005, r * 0.2]);
    const g = G(body, rimTop, rimBot, cap1, cap2);
    if (hazard) {
      const band = new THREE.Mesh(cached(`band${r}`, () => new THREE.CylinderGeometry(r * 1.004, r * 1.004, h * 0.26, 48, 1, true)),
        new THREE.MeshStandardMaterial({ map: hazardLabel(), roughness: 0.55, metalness: 0.1 }));
      band.castShadow = true; band.userData.tint = false;
      g.add(band);
    }
    return g;
  },
  barrel_boom(s) { return MODELS.barrel(s, true); },

  ball(s) {
    const m = M(sphere(s.r), material('plastic', { roughness: 0.6 }), [0, 0, 0], null, true);
    m.userData.defColor = s.color ?? 0xd8342c;
    const seamMat = material('flat', { color: 0x1a1a1a, roughness: 0.8 });
    const seam1 = M(torus(s.r * 1.001, s.r * 0.025), seamMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
    const seam2 = M(torus(s.r * 1.001, s.r * 0.025), seamMat, [0, 0, 0], [0, Math.PI / 2, 0]);
    // flattened sphere so the matte rubber colour shows (seams stay dark)
    seam1.scale.z = seam2.scale.z = 0.3;
    return G(m, seam1, seam2);
  },

  beachball(s) {
    const tex = canvasTexture(512, 256, (g, w, h) => {
      const cols = ['#e83d3d', '#ffffff', '#2f7de1', '#ffffff', '#f2c230', '#ffffff'];
      cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / 6, 0, w / 6 + 1, h); });
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h * 0.08); g.fillRect(0, h * 0.92, w, h * 0.08);
    });
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    const m = M(sphere(s.r), mat, [0, 0, 0], null, false);
    return G(m);
  },

  cone(s) {
    const h = s.h, rb = s.rb ?? 0.4;
    const orange = material('plastic', { roughness: 0.45 });
    const body = M(lathe(`cone${h}`, [[0, -h / 2 + 0.05], [rb * 0.72, -h / 2 + 0.05], [rb * 0.12, h / 2 - 0.02], [rb * 0.08, h / 2], [0, h / 2]], 40), orange, [0, 0, 0], null, true);
    body.userData.defColor = s.color ?? 0xff6a1a;
    const refl = material('flat', { color: 0xf4f4f4, roughness: 0.15, metalness: 0.3 });
    const band = (y0, y1) => {
      const ra = rb * 0.72 + (rb * 0.12 - rb * 0.72) * ((y0 + h / 2 - 0.05) / (h - 0.07));
      const rc = rb * 0.72 + (rb * 0.12 - rb * 0.72) * ((y1 + h / 2 - 0.05) / (h - 0.07));
      return M(cached(`cb${y0}|${h}`, () => new THREE.CylinderGeometry(rc + 0.004, ra + 0.004, y1 - y0, 40, 1, true)), refl, [0, (y0 + y1) / 2, 0]);
    };
    const base = M(roundedBox(rb * 2, 0.05, rb * 2, 'rubber', 0.02), material('rubber'), [0, -h / 2 + 0.025, 0]);
    return G(body, band(0.0, h * 0.14), band(h * 0.24, h * 0.33), base);
  },

  wheel(s) {
    // built around the Y axis like the physics cylinder; the shape's rot turns it sideways
    const R = s.r, w = s.h;
    const tire = M(torus(R - w * 0.32, w * 0.42, 64), material('rubber'), [0, 0, 0], [Math.PI / 2, 0, 0]);
    tire.scale.set(1, 1, 1.15);
    const rim = M(bevelCylinder(R * 0.55, R * 0.55, w * 0.7, 0.02, 40), material('steel'), [0, 0, 0], null, true);
    rim.userData.defColor = 0xd0d4d8;
    const hub = M(bevelCylinder(R * 0.15, R * 0.15, w * 0.85, 0.01, 24), material('steel'), [0, 0, 0]);
    const g = G(tire, rim, hub);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(M(roundedBox(0.06, 0.04, R * 0.45, 'steel', 0.015), material('steel'), [Math.cos(a) * R * 0.3, w * 0.36, Math.sin(a) * R * 0.3], [0, -a + Math.PI / 2, 0]));
    }
    return g;
  },

  brick(s) {
    const m = M(roundedBox(...s.size, 'plaster', 0.025), material('plaster'), [0, 0, 0], null, true);
    m.userData.defColor = 0xa4553a;
    return G(m);
  },

  melon(s) {
    const tex = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#4c8f2e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        g.fillStyle = '#1f4a16';
        g.beginPath();
        for (let y = 0; y <= h; y += 4) g.lineTo(i * w / 16 + Math.sin(y * 0.15 + i) * 5, y);
        for (let y = h; y >= 0; y -= 4) g.lineTo(i * w / 16 + 12 + Math.sin(y * 0.15 + i) * 5, y);
        g.fill();
      }
    });
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.6 });
    return G(M(sphere(s.r, 1.25, 1, 1), mat, [0, 0, 0], [0, 0, Math.PI / 2]));
  },

  balloon(s) {
    const r = s.r;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = -Math.PI / 2 + t * Math.PI;
      const rr = Math.cos(a) * r * (1 - 0.18 * (1 - t));
      pts.push([Math.max(0.0001, rr), Math.sin(a) * r * 1.15]);
    }
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.9 });
    const body = M(lathe(`balloon${r}`, pts, 40), mat, [0, 0.05, 0], null, true);
    body.userData.defColor = s.color ?? 0xe0283c;
    const knot = M(lathe('knot', [[0, -0.07], [0.03, -0.05], [0.012, 0], [0, 0.01]], 16), mat, [0, -r * 1.15 + 0.05, 0], null, true);
    knot.userData.defColor = body.userData.defColor;
    return G(body, knot);
  },

  dynamite() {
    const paper = material('fabric', { roughness: 0.8 });
    const g = new THREE.Group();
    for (const x of [-0.13, 0, 0.13]) {
      const st = M(bevelCylinder(0.06, 0.06, 0.6, 0.01, 24), paper, [x, 0, x === 0 ? 0.09 : 0], [Math.PI / 2, 0, 0], true);
      st.userData.defColor = 0xb4221c;
      g.add(st);
    }
    const tape = material('flat', { color: 0x2a2a2a, roughness: 0.6 });
    for (const z of [-0.18, 0.18]) g.add(M(roundedBox(0.42, 0.14, 0.05, 'rubber', 0.02), tape, [0, 0.02, z]));
    const box = M(roundedBox(0.16, 0.08, 0.12, 'plastic', 0.02), material('plastic', { color: 0x333333 }), [0, 0.1, 0]);
    const led = M(sphere(0.015), material('flat', { color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 4 }), [0.05, 0.145, 0]);
    const wire = M(torus(0.08, 0.008), material('flat', { color: 0xd04020 }), [-0.05, 0.12, 0], [0, 0, 0.3]);
    g.add(box, led, wire);
    return g;
  },

  grenade() {
    const body = M(lathe('gren', [[0, -0.18], [0.1, -0.16], [0.16, -0.06], [0.16, 0.06], [0.1, 0.15], [0.05, 0.18], [0, 0.18]], 32), material('paint', { roughness: 0.6 }), [0, 0, 0], null, true);
    body.userData.defColor = 0x4a5a32;
    const top = M(bevelCylinder(0.05, 0.05, 0.08, 0.01, 20), material('steel'), [0, 0.22, 0]);
    const lever = M(roundedBox(0.03, 0.2, 0.05, 'steel', 0.01), material('steel'), [0.07, 0.12, 0], [0, 0, -0.35]);
    const ring = M(torus(0.035, 0.006), material('steel'), [-0.06, 0.24, 0], [0, Math.PI / 2, 0]);
    return G(body, top, lever, ring);
  },

  thruster() {
    const steel = material('steel');
    const body = M(bevelCylinder(0.22, 0.22, 0.45, 0.04), material('paint', { clearcoat: 0.4 }), [0, 0.05, 0], null, true);
    body.userData.defColor = 0x6b7480;
    const nozzle = M(lathe('nozzle', [[0.1, 0.1], [0.12, 0], [0.24, -0.25], [0.22, -0.26], [0.1, -0.02], [0.05, 0.1]], 32), steel, [0, -0.18, 0]);
    const glow = M(cached('glowdisc', () => new THREE.CircleGeometry(0.2, 32)), material('flat', { color: 0xff7a20, emissive: 0xff5a10, emissiveIntensity: 6 }), [0, -0.4, 0], [Math.PI / 2, 0, 0]);
    return G(body, nozzle, glow);
  },

  // ----- crash-test style mannequin parts (ragdoll + NPC + players) -----
  dummy_torso(s) { return dummyTorso(s.color); },
  dummy_head(s) { return dummyHead(s.color); },
  dummy_arm(s) { return dummyLimb(s.color, false); },
  dummy_leg(s) { return dummyLimb(s.color, true); },
  dummy_full(s) { const d = buildHumanoid(s.color ?? 0x5fa860); d.group.position.y = s.offsetY ?? -1.0; return G(d.group); },
};

// ---------- mannequin ----------
const joint = () => material('rubber', { roughness: 0.7 });
const shell = () => material('plastic', { clearcoat: 0.5 });
function tinted(mesh, color) { mesh.userData.defColor = color ?? 0xe0b840; return mesh; }

function dummyTorso(color) {
  const g = new THREE.Group();
  g.add(tinted(M(sphere(0.3, 1.15, 0.95, 0.68), shell(), [0, 0.12, 0], null, true), color));       // chest
  g.add(tinted(M(capsule(0.17, 0.12), shell(), [0, -0.16, 0], null, true), color));                  // abdomen
  g.add(tinted(M(sphere(0.22, 1.25, 0.7, 0.85), shell(), [0, -0.34, 0], null, true), color));       // pelvis
  g.add(M(bevelCylinder(0.07, 0.08, 0.12, 0.02, 20), joint(), [0, 0.42, 0]));                         // neck
  for (const sx of [-1, 1]) g.add(M(sphere(0.085), joint(), [sx * 0.37, 0.27, 0]));                  // shoulders
  for (const sx of [-1, 1]) g.add(M(sphere(0.09), joint(), [sx * 0.15, -0.42, 0]));                   // hips
  g.add(decal(dummyMarker(), 0.12, 0.12, [0.16, 0.22, 0.205], [0, 0.35, 0]));
  g.add(decal(dummyMarker(), 0.12, 0.12, [-0.16, 0.22, 0.205], [0, -0.35, 0]));
  return g;
}
function dummyHead(color) {
  const g = new THREE.Group();
  g.add(tinted(M(sphere(0.2, 0.92, 1.12, 1.0), shell(), [0, 0.02, 0], null, true), color));
  g.add(tinted(M(sphere(0.07, 1.2, 0.8, 1), shell(), [0, -0.1, 0.11], null, true), color));          // jaw/chin
  g.add(tinted(M(sphere(0.03, 0.8, 1.2, 1), shell(), [0, 0.0, 0.19], null, true), color));           // nose
  for (const sx of [-1, 1]) {
    g.add(M(bevelCylinder(0.05, 0.05, 0.03, 0.01, 20), joint(), [sx * 0.185, 0.0, 0], [0, 0, Math.PI / 2]));
    g.add(decal(dummyMarker(), 0.1, 0.1, [sx * 0.186, 0.1, 0.0], [0, sx * Math.PI / 2, 0]));
    g.add(M(sphere(0.022, 1.4, 0.7, 0.5), material('flat', { color: 0x1a1a1a, roughness: 0.3 }), [sx * 0.065, 0.06, 0.175]));  // eye recess
  }
  return g;
}
function dummyLimb(color, leg) {
  const g = new THREE.Group();
  const r1 = leg ? 0.095 : 0.07, r2 = leg ? 0.075 : 0.06;
  g.add(tinted(M(capsule(r1, 0.24), shell(), [0, 0.19, 0], null, true), color));
  g.add(M(sphere(r1 * 0.9), joint(), [0, 0.0, 0]));
  g.add(tinted(M(capsule(r2, 0.22), shell(), [0, -0.17, 0], null, true), color));
  if (leg) g.add(tinted(M(roundedBox(0.15, 0.08, 0.28, 'plastic', 0.035), shell(), [0, -0.35, 0.06], null, true), color));
  else g.add(tinted(M(sphere(0.065, 0.8, 1.2, 0.55), shell(), [0, -0.37, 0], null, true), color));
  return g;
}

// Full articulated mannequin for players / NPC; returns pivots for animation
export function buildHumanoid(color) {
  const g = new THREE.Group();
  const torso = dummyTorso(color); torso.position.set(0, 1.12, 0); g.add(torso);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 1.55, 0); g.add(headPivot);
  const head = dummyHead(color); head.position.set(0, 0.22, 0); headPivot.add(head);
  const limb = (x, y, leg) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0); g.add(piv);
    const l = dummyLimb(color, leg); l.position.y = -0.36; piv.add(l);
    return piv;
  };
  const armL = limb(-0.42, 1.42, false), armR = limb(0.42, 1.42, false);
  const legL = limb(-0.15, 0.74, true), legR = limb(0.15, 0.74, true);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, head: headPivot, armL, armR, legL, legR };
}

// Change tint of every tintable mesh under obj
const tintCache = new Map();
export function applyTint(obj, color) {
  obj.traverse((m) => {
    if (!m.isMesh || !m.userData.baseMat) return;
    const base = m.userData.baseMat;
    if (!m.userData.tint) { m.material = base; return; }
    const c = color ?? m.userData.defColor ?? 0xffffff;
    const key = base.uuid + '|' + c;
    if (!tintCache.has(key)) { const mm = base.clone(); mm.color = new THREE.Color(c); tintCache.set(key, mm); }
    m.material = tintCache.get(key);
  });
}

// ---------- first-person weapons ----------
export function buildWeapon(kind) {
  const steel = material('steel');
  const dark = material('paint', { color: 0x2a2f36, clearcoat: 0.6 });
  const g = new THREE.Group();
  if (kind === 'physgun') {
    const body = material('paint', { color: 0x38424e, clearcoat: 0.8 });
    g.add(M(roundedBox(0.13, 0.15, 0.42, 'paint', 0.04), body, [0, 0, 0.02]));
    g.add(M(bevelCylinder(0.055, 0.075, 0.32, 0.015), steel, [0, 0.015, -0.3], [Math.PI / 2, 0, 0]));
    const glow = material('flat', { color: 0x9fe8ff, emissive: 0x40c8ff, emissiveIntensity: 4 });
    for (let i = 0; i < 3; i++) g.add(M(torus(0.07, 0.012), glow, [0, 0.015, -0.2 - i * 0.07]));
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      g.add(M(roundedBox(0.02, 0.02, 0.16, 'steel', 0.008), steel, [Math.cos(a) * 0.07, 0.015 + Math.sin(a) * 0.07, -0.5], [Math.sin(a) * 0.3, -Math.cos(a) * 0.3, 0]));
    }
    g.add(M(sphere(0.03), glow, [0, 0.015, -0.47]));
    g.add(M(roundedBox(0.08, 0.17, 0.1, 'rubber', 0.03), material('rubber'), [0, -0.13, 0.12], [0.3, 0, 0]));
  } else if (kind === 'toolgun') {
    const body = material('paint', { color: 0xc8ccd2, clearcoat: 0.5 });
    g.add(M(roundedBox(0.11, 0.16, 0.4, 'paint', 0.035), body, [0, 0, 0]));
    g.add(M(bevelCylinder(0.022, 0.03, 0.22, 0.008, 20), steel, [0, 0.03, -0.3], [Math.PI / 2, 0, 0]));
    g.add(M(sphere(0.02), material('flat', { color: 0x9fffd0, emissive: 0x30ff90, emissiveIntensity: 4 }), [0, 0.03, -0.42]));
    g.add(M(roundedBox(0.08, 0.17, 0.1, 'rubber', 0.03), material('rubber'), [0, -0.13, 0.1], [0.3, 0, 0]));
    const screen = new THREE.Mesh(cached('scr', () => new THREE.PlaneGeometry(0.095, 0.06)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    screen.position.set(0, 0.04, 0.201);
    screen.userData.isScreen = true;
    g.add(screen);
  } else if (kind === 'pistol') {
    g.add(M(roundedBox(0.075, 0.1, 0.3, 'paint', 0.025), dark, [0, 0, -0.04]));
    g.add(M(bevelCylinder(0.02, 0.02, 0.12, 0.005, 16), steel, [0, 0.01, -0.24], [Math.PI / 2, 0, 0]));
    g.add(M(roundedBox(0.065, 0.16, 0.08, 'rubber', 0.025), material('rubber'), [0, -0.11, 0.07], [0.25, 0, 0]));
    g.add(M(roundedBox(0.03, 0.025, 0.08, 'plastic', 0.008), material('flat', { color: 0xff5522, emissive: 0xff3300, emissiveIntensity: 3 }), [0, 0.06, -0.08]));
  } else if (kind === 'launcher') {
    const olive = material('paint', { color: 0x4b5838 });
    g.add(M(bevelCylinder(0.085, 0.085, 0.7, 0.02), olive, [0, 0, -0.12], [Math.PI / 2, 0, 0]));
    g.add(M(bevelCylinder(0.1, 0.1, 0.08, 0.02), steel, [0, 0, -0.46], [Math.PI / 2, 0, 0]));
    g.add(M(roundedBox(0.07, 0.16, 0.09, 'rubber', 0.03), material('rubber'), [0, -0.14, 0.05], [0.3, 0, 0]));
    g.add(M(roundedBox(0.04, 0.05, 0.12, 'paint', 0.015), dark, [0, 0.1, -0.05]));
  }
  return g;
}

// gloved hand + forearm that holds the weapons
export function buildHand(color) {
  const g = new THREE.Group();
  const glove = material('fabric', { color: 0x2b2b2b, roughness: 0.9 });
  const sleeve = material('plastic', { clearcoat: 0.4 });
  g.add(M(sphere(0.06, 1.0, 1.1, 1.3), glove, [0, -0.08, 0.1]));
  const arm = M(capsule(0.055, 0.35), sleeve, [0.04, -0.14, 0.33], [Math.PI / 2 - 0.25, 0, 0], true);
  arm.userData.defColor = color;
  g.add(arm);
  return g;
}

export function updateToolScreen(weaponGroup, text) {
  weaponGroup.traverse(o => {
    if (!o.userData.isScreen) return;
    if (o.userData.text === text) return;
    o.userData.text = text;
    const tex = canvasTexture(256, 160, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0c2a1c'); gr.addColorStop(1, '#06140d');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5dffa8'; g.font = '700 34px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const words = text.split(' ');
      if (words.length > 1 && text.length > 10) { g.fillText(words[0], w / 2, h / 2 - 20); g.fillText(words.slice(1).join(' '), w / 2, h / 2 + 22); } else g.fillText(text, w / 2, h / 2);
    });
    if (o.material.map) o.material.map.dispose();
    o.material.map = tex; o.material.needsUpdate = true;
  });
}
