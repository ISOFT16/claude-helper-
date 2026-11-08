/* ================= models ================= */
// Все модели собираются процедурно из гладких примитивов (капсулы, сферы, скруглённые блоки,
// выдавленные профили), затем статичные части сливаются в несколько мешей для скорости.
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex; vmScene.environment = envTex;

const woodTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6a4224'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,8' : '150,95,50'},${rand(0.15, 0.4)})`; g.lineWidth = rand(1, 3);
    g.beginPath(); const y = Math.random() * h; g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 6 + rand(-2, 2));
    g.stroke();
  }
});
function camoTex(base, cols) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = pick(cols); const x = Math.random() * w, y = Math.random() * h, r = rand(4, 11);
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + rand(-r, r), y + rand(-r, r), r * rand(0.6, 1), 0, 7); g.fill(); }
    }
    speckle(g, w, h, 4000, 0.1);
  }, 1, 1);
}
const std = (o) => new THREE.MeshStandardMaterial(o);
const MT = {
  metal: std({ color: 0x3b3f47, metalness: 0.85, roughness: 0.36 }),
  metalDS: std({ color: 0x2a2d33, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide }),
  metalLight: std({ color: 0x80868f, metalness: 0.95, roughness: 0.25 }),
  poly: std({ color: 0x1d1f23, metalness: 0.05, roughness: 0.6 }),
  tan: std({ color: 0x7d6a4b, metalness: 0.05, roughness: 0.68 }),
  wood: std({ map: woodTex, metalness: 0, roughness: 0.5 }),
  steel: std({ color: 0xd0d6dd, metalness: 1, roughness: 0.15 }),
  brass: std({ color: 0xd4a84f, metalness: 1, roughness: 0.28 }),
  shell: std({ color: 0xb3261e, metalness: 0.1, roughness: 0.45 }),
  black: std({ color: 0x0c0d0f, metalness: 0.2, roughness: 0.8 }),
  glass: std({ color: 0x0b1622, metalness: 1, roughness: 0.03, emissive: 0x123a55, emissiveIntensity: 0.5 }),
  accent: std({ color: 0x7dffb0, emissive: 0x2dbf6a, emissiveIntensity: 1.2 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  glove: std({ color: 0x2c3138, roughness: 0.85 }),
  gloveDark: std({ color: 0x17191c, roughness: 0.75 }),
  skin: std({ color: 0xc79a76, roughness: 0.65 }),
  hair: std({ color: 0x2a1f17, roughness: 0.9 }),
  boot: std({ color: 0x1e1b18, roughness: 0.7 }),
  sole: std({ color: 0x0b0b0b, roughness: 0.95 }),
};
const teamMats = [0, 1].map(t => ({
  fabric: std({ envMapIntensity: 0.3, map: t ? camoTex('#5b4632', ['#3c2c1e', '#7a6042', '#4b3826', '#8a7352']) : camoTex('#3d4b5c', ['#2b3644', '#56677a', '#33404f', '#6b7c8f']), roughness: 0.92 }),
  vest: std({ color: t ? 0x56432c : 0x28323e, roughness: 0.82 }),
  vest2: std({ color: t ? 0x6b5536 : 0x34404e, roughness: 0.82 }),
  helmet: std({ color: t ? 0x6a5a3e : 0x2f3a46, roughness: 0.55, metalness: 0.2 }),
  glow: std({ color: t ? 0xff8a3d : 0x4fb3ff, emissive: t ? 0xff6a1a : 0x2a8cff, emissiveIntensity: 2 }),
  lens: std({ color: 0x111111, metalness: 1, roughness: 0.05, emissive: t ? 0xff6a1a : 0x2a8cff, emissiveIntensity: 0.9 }),
}));

/* --- примитивы --- */
function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; }
function sc(m, x, y, z) { m.scale.set(x, y, z); return m; }
let RB_SEG = 2;
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return mesh(new RoundedBoxGeometry(w, h, d, RB_SEG, Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))), mat, x, y, z, rx, ry, rz);
}
// цилиндр вдоль оси «вперёд»: f — расстояние вперёд до центра; rBack/rFront — радиусы концов
function tube(rBack, len, mat, f, y, x = 0, rFront = rBack, seg = 18, open = false) { return mesh(new THREE.CylinderGeometry(rFront, rBack, len, seg, 1, open), mat, x, y, -f, -Math.PI / 2); }
function vcyl(r, len, mat, x, y, z, seg = 14) { return mesh(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z); }
function ball(r, mat, x, y, z) { return mesh(new THREE.SphereGeometry(r, RB_SEG > 1 ? 16 : 12, RB_SEG > 1 ? 12 : 8), mat, x, y, z); }
// профиль в плоскости (вперёд, вверх), выдавленный в ширину; точки: [f, y] или ['q', cf, cy, f, y]
function prof(pts, width, mat, bevel = 0.003, x = 0, holes = []) {
  const draw = (s, list) => list.forEach((p, i) => { if (p[0] === 'q') s.quadraticCurveTo(-p[1], p[2], -p[3], p[4]); else if (i === 0) s.moveTo(-p[0], p[1]); else s.lineTo(-p[0], p[1]); });
  const s = new THREE.Shape(); draw(s, pts);
  for (const h of holes) { const p = new THREE.Path(); draw(p, h); s.holes.push(p); }
  const d = Math.max(0.0005, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -d / 2); geo.rotateY(-Math.PI / 2);
  return mesh(geo, mat, x, 0, 0);
}
function anchor(name, x, y, z) { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); return o; }
// сливает все статичные меши группы по материалам (меши с userData.keep и объекты-якоря остаются)
function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map(), keep = [];
  group.traverse(o => {
    if (o === group) return;
    let p = o.parent, kept = false; while (p && p !== group) { if (p.userData.keep) kept = true; p = p.parent; }
    if (kept) return;
    if (o.userData.keep || !o.isMesh) { if (o.parent === group) keep.push(o); return; }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new THREE.Group(); out.name = group.name; out.userData = group.userData;
  for (const [mat, geos] of byMat) { const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  for (const k of keep) out.add(k);
  return out;
}
const flashTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,210,120,.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr; g.translate(64, 64);
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-9, 0); g.lineTo(0, -64); g.lineTo(9, 0); g.fill(); }
  g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill();
});
const flashMat = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function makeFlash(size) {
  const g = new THREE.Group(); g.name = 'flash'; g.userData.keep = true; g.visible = false;
  const pl = new THREE.PlaneGeometry(size, size);
  g.add(new THREE.Mesh(pl, flashMat));
  const side = new THREE.PlaneGeometry(size * 0.6, size * 1.6); side.translate(0, size * 0.55, 0);
  const a = new THREE.Mesh(side, flashMat); a.rotation.x = -Math.PI / 2; g.add(a);
  const b = new THREE.Mesh(side, flashMat); b.rotation.set(-Math.PI / 2, 0, Math.PI / 2); g.add(b);
  return g;
}

/* --- оружие --- */
// начало координат — верх рукояти (где правая рука), «вперёд» — -Z
function railTeeth(g, f0, f1, y, w) { g.add(rbox(w, 0.01, f1 - f0, 0.002, MT.metal, 0, y, -(f0 + f1) / 2)); for (let f = f0 + 0.008; f < f1 - 0.004; f += 0.016) g.add(rbox(w + 0.004, 0.006, 0.007, 0.0015, MT.metal, 0, y + 0.007, -f)); }
function pistolGrip(g, mat, f = 0) {
  g.add(prof([[f - 0.008, 0.002], [f + 0.036, 0.002], [f + 0.03, -0.03], ['q', f + 0.022, -0.075, f + 0.004, -0.118], [f - 0.034, -0.118], ['q', f - 0.03, -0.07, f - 0.042, -0.022], [f - 0.03, 0.002]], 0.032, mat, 0.005));
  for (let i = 0; i < 3; i++) g.add(rbox(0.034, 0.004, 0.012, 0.0015, MT.black, 0, -0.03 - i * 0.025, -(f + 0.03 - i * 0.004)));
}
function triggerGroup(g, f, y) {
  const tg = new THREE.TorusGeometry(0.026, 0.0035, 6, 16, Math.PI);
  g.add(mesh(tg, MT.metal, 0, y + 0.002, -f, 0, Math.PI / 2, Math.PI));
  g.add(rbox(0.006, 0.022, 0.006, 0.002, MT.metalLight, 0, y - 0.01, -(f - 0.004), 0.3));
}
function redDot(g, f, y, big = false) {
  g.add(rbox(0.03, 0.016, 0.05, 0.004, MT.metal, 0, y, -f));
  g.add(tube(0.02, 0.07, MT.metalDS, f, y + 0.03, 0, 0.02, 24, true));
  g.add(mesh(new THREE.TorusGeometry(0.021, 0.004, 8, 24), MT.metal, 0, y + 0.03, -(f + 0.035)));
  const lens = mesh(new THREE.CircleGeometry(0.018, 24), MT.glass, 0, y + 0.03, -(f + 0.034)); lens.material = MT.glass; g.add(lens);
  const dot = ball(0.0022, MT.red, 0, y + 0.03, -(f + 0.03)); dot.userData.keep = true; g.add(dot);
}
/* --- генераторы моделей для остального оружия --- */
const matOf = n => MT[n] || MT.metal;
function scopeOn(g, f, y, s = 1) {
  for (const ff of [f - 0.07 * s, f + 0.07 * s]) { g.add(rbox(0.024, y - 0.098, 0.018, 0.004, MT.metal, 0, (y + 0.098) / 2 - 0.004, -ff)); g.add(mesh(new THREE.TorusGeometry(0.017 * s, 0.005, 8, 22), MT.metal, 0, y, -ff)); }
  g.add(tube(0.014 * s, 0.2 * s, MT.metal, f, y));
  g.add(tube(0.016 * s, 0.07 * s, MT.metal, f + 0.13 * s, y, 0, 0.027 * s));
  g.add(tube(0.022 * s, 0.045 * s, MT.metal, f - 0.12 * s, y, 0, 0.015 * s));
  g.add(mesh(new THREE.CircleGeometry(0.024 * s, 24), MT.glass, 0, y, -(f + 0.166 * s), 0, Math.PI));
  g.add(mesh(new THREE.CircleGeometry(0.02 * s, 24), MT.glass, 0, y, -(f - 0.143 * s)));
  g.add(vcyl(0.011 * s, 0.025, MT.metal, 0, y + 0.022 * s, -f));
}
function holo(g, f, y) {
  g.add(rbox(0.036, 0.012, 0.075, 0.004, MT.metal, 0, y, -f));
  for (const x of [-0.016, 0.016]) g.add(rbox(0.005, 0.038, 0.06, 0.002, MT.metal, x, y + 0.024, -f));
  g.add(rbox(0.037, 0.005, 0.06, 0.002, MT.metal, 0, y + 0.043, -f));
  g.add(mesh(new THREE.PlaneGeometry(0.027, 0.03), MT.glass, 0, y + 0.024, -(f - 0.025)));
  const r = mesh(new THREE.TorusGeometry(0.005, 0.0009, 4, 16), MT.red, 0, y + 0.024, -(f - 0.027)); r.userData.keep = true; g.add(r);
}
function frontPost(g, f, y) { g.add(prof([[f - 0.012, y - 0.02], [f + 0.012, y - 0.02], [f + 0.006, y + 0.012], [f - 0.006, y + 0.012]], 0.006, MT.metal, 0.001)); }
function opticOn(g, kind, f, y) {
  if (kind === 'reddot') redDot(g, f, y);
  else if (kind === 'holo') holo(g, f, y);
  else if (kind === 'scope') scopeOn(g, f + 0.02, y + 0.036);
  else { g.add(rbox(0.03, 0.02, 0.025, 0.004, MT.metal, 0, y + 0.006, -(f - 0.12))); }
}
function curvedMag(scale, mat) {
  const s = scale;
  return prof([[-0.04, 0.0], [0.04, 0.0], [0.036, -0.08 * s], ['q', 0.03, -0.15 * s, 0.06, -0.2 * s], [-0.012, -0.22 * s], ['q', -0.04, -0.15 * s, -0.035, -0.08 * s]], 0.03, mat, 0.004);
}
const GEN = {
  pistol(g, A, keep, o) {
    const L = o.len || 0.17, b = o.bulky || 1, H = 0.038 * b, Wd = 0.03 * b, top = 0.03 + H;
    g.add(prof([[-0.025, 0.002], [L - 0.02, 0.002], [L - 0.02, 0.03], [-0.025, 0.03]], Wd, matOf(o.frame || 'poly'), 0.004));
    g.add(prof([[-0.022, -0.005], [0.024, -0.005], ['q', 0.03, -0.05, 0.018, -0.1], [-0.03, -0.1], ['q', -0.036, -0.05, -0.03, -0.005]], 0.032 * b, matOf(o.frame || 'poly'), 0.006));
    for (let i = 0; i < 5; i++) g.add(rbox(0.034 * b, 0.004, 0.03, 0.0015, MT.black, 0, -0.02 - i * 0.016, 0.002 * i));
    triggerGroup(g, 0.035, 0.0);
    if (o.extMag) g.add(rbox(0.026, o.extMag + 0.01, 0.03, 0.004, MT.metal, 0, -0.1 - o.extMag / 2, 0.006));
    else g.add(rbox(0.032 * b, 0.008, 0.014, 0.003, MT.poly, 0, -0.103, 0.004));
    const slide = new THREE.Group();
    slide.add(prof([[-0.035, 0.03], [L, 0.03], [L, top - 0.008], ['q', L, top, L - 0.01, top], [-0.025, top], ['q', -0.035, top, -0.035, top - 0.01]], Wd + 0.001, matOf(o.slide || 'metal'), 0.004));
    for (let i = 0; i < 6; i++) for (const x of [-Wd / 2 - 0.0005, Wd / 2 + 0.0005]) slide.add(rbox(0.002, H * 0.75, 0.003, 0.0008, MT.black, x, 0.03 + H / 2, 0.03 - i * 0.006));
    slide.add(rbox(0.004, 0.012, 0.035, 0.0015, MT.black, Wd / 2 + 0.0005, 0.03 + H * 0.6, -0.05));
    slide.add(rbox(0.02, 0.008, 0.008, 0.002, MT.metal, 0, top + 0.004, 0.02));
    slide.add(rbox(0.005, 0.008, 0.006, 0.0015, MT.metal, 0, top + 0.004, -(L - 0.012)));
    slide.add(ball(0.0022, MT.accent, 0, top + 0.006, -(L - 0.012)));
    if (o.comp) for (let i = 0; i < 3; i++) slide.add(rbox(0.012, 0.004, 0.008, 0.0015, MT.black, 0, top + 0.0005, -(L - 0.03 - i * 0.014)));
    slide.add(mesh(new THREE.CircleGeometry(0.006, 16), MT.black, 0, 0.03 + H / 2, -(L + 0.0005), 0, Math.PI));
    keep(slide, 'slide');
    const mag = new THREE.Group(); mag.add(rbox(0.024, 0.09, 0.03, 0.004, MT.metal, 0, -0.06, 0.0, 0.25)); keep(mag, 'mag');
    let muz = L + 0.005;
    if (o.supp) { g.add(tube(0.016, 0.13, MT.metal, L + 0.065, 0.03 + H / 2)); g.add(mesh(new THREE.CircleGeometry(0.006, 14), MT.black, 0, 0.03 + H / 2, -(L + 0.1305), 0, Math.PI)); muz = L + 0.13; }
    A.muzzle = [0, 0.03 + H / 2, -muz]; A.fore = [-0.012, -0.06, 0.005]; A.eject = [0.02, 0.06, -0.05]; A.magDrop = [0, -0.14, 0.01]; A.rack = [0, 0.05, 0.02];
  },
  smg(g, A, keep, o) {
    const L = o.len || 0.26, body = matOf(o.body || 'metal');
    let magF = 0.085;
    if (o.stock === 'bullpup') {
      g.add(prof([[-0.34, 0.0], [L, 0.0], [L, 0.078], ['q', L, 0.09, L - 0.015, 0.09], [-0.3, 0.095], ['q', -0.345, 0.095, -0.345, 0.06]], 0.056, o.body ? body : MT.poly, 0.008));
      g.add(rbox(0.05, 0.13, 0.02, 0.006, MT.black, 0, 0.04, 0.35));
      magF = -0.14;
    } else {
      g.add(prof([[-0.06, 0.002], [L, 0.002], [L, 0.074], ['q', L, 0.086, L - 0.015, 0.086], [-0.045, 0.086], ['q', -0.06, 0.086, -0.06, 0.07]], 0.05, body, 0.005));
      if (o.stock === 'solid') g.add(prof([[-0.06, 0.075], [-0.3, 0.08], [-0.31, 0.07], [-0.31, -0.03], [-0.27, -0.03], [-0.1, 0.02], [-0.06, 0.03]], 0.04, MT.poly, 0.006));
      else if (o.stock === 'wire') { for (const y of [0.07, 0.01]) g.add(tube(0.006, 0.26, MT.metal, -0.19, y)); g.add(rbox(0.04, 0.1, 0.014, 0.005, MT.poly, 0, 0.04, 0.32)); }
    }
    g.add(rbox(0.058, 0.008, L * 0.6, 0.003, MT.accent, 0, 0.03, -L * 0.5));
    g.add(rbox(0.004, 0.018, 0.05, 0.002, MT.black, 0.029, 0.06, -0.06));
    g.add(vcyl(0.006, 0.04, MT.metalLight, -0.04, 0.065, -0.17).rotateZ(Math.PI / 2));
    railTeeth(g, -0.04, L - 0.02, 0.092, 0.022);
    let muz;
    if (o.supp) { g.add(tube(0.024, 0.17, MT.metal, L + 0.085, 0.044)); for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.024, 0.0025, 6, 20), MT.black, 0, 0.044, -(L + 0.03 + i * 0.035))); muz = L + 0.17; }
    else { g.add(tube(0.011, 0.07, MT.metal, L + 0.035, 0.044)); g.add(tube(0.015, 0.025, MT.metal, L + 0.065, 0.044)); muz = L + 0.08; }
    if (o.foregrip) { g.add(vcyl(0.014, 0.085, MT.poly, 0, -0.035, -(L - 0.08))); g.add(ball(0.016, MT.poly, 0, -0.078, -(L - 0.08))); }
    pistolGrip(g, MT.poly); triggerGroup(g, 0.045, 0.002);
    if (o.optic === 'reflex') {
      g.add(rbox(0.03, 0.012, 0.04, 0.003, MT.metal, 0, 0.105, -0.07));
      g.add(mesh(new THREE.TorusGeometry(0.018, 0.0035, 8, 24), MT.metal, 0, 0.13, -0.07));
      g.add(mesh(new THREE.CircleGeometry(0.016, 20), MT.glass, 0, 0.13, -0.072));
      const d = ball(0.002, MT.red, 0, 0.13, -0.068); d.userData.keep = true; g.add(d);
    } else if (o.optic === 'reddot') redDot(g, 0.08, 0.104);
    const mag = new THREE.Group(); mag.position.set(0, 0, -magF);
    const ml = o.magLen || 0.2;
    if (o.mag === 'curved') mag.add(curvedMag(0.85, MT.metal));
    else mag.add(prof([[-0.022, 0.0], [0.022, 0.0], [0.026, -ml], [-0.018, -ml]], 0.026, MT.metal, 0.004));
    keep(mag, 'mag');
    A.muzzle = [0, 0.044, -muz]; A.fore = o.foregrip ? [0, -0.04, -(L - 0.08)] : [0, 0.0, -(L - 0.07)]; A.eject = [0.03, 0.06, -0.06]; A.magDrop = [0, -0.15, -magF]; A.rack = [-0.04, 0.065, -0.17];
  },
  rifle(g, A, keep, o) {
    const hg = o.hg || 0.3, bl = o.barrel || 0.2, br = o.barrelR || 0.011, furn = matOf(o.furn || 'poly'), hgEnd = 0.28 + hg, wood = o.furn === 'wood';
    g.add(prof([[-0.035, 0.004], [0.06, 0.004], [0.07, -0.03], [0.165, -0.03], [0.175, 0.004], [0.215, 0.004], [0.215, 0.042], [-0.035, 0.042]], 0.044, MT.metal, 0.004));
    g.add(prof([[-0.07, 0.042], [0.28, 0.042], [0.28, 0.088], [-0.06, 0.088], ['q', -0.07, 0.088, -0.07, 0.078]], 0.048, MT.metal, 0.005));
    g.add(rbox(0.004, 0.02, 0.065, 0.002, MT.black, 0.025, 0.066, -0.085));
    g.add(vcyl(0.008, 0.02, MT.metalLight, 0.03, 0.06, -0.02).rotateZ(Math.PI / 2));
    if (wood) {
      g.add(prof([[0.28, 0.012], [hgEnd, 0.02], [hgEnd, 0.058], [0.28, 0.064]], 0.056, furn, 0.01));
      g.add(prof([[0.3, 0.07], [hgEnd - 0.05, 0.07], [hgEnd - 0.05, 0.096], [0.3, 0.096]], 0.04, furn, 0.008));
      g.add(rbox(0.05, 0.012, 0.3, 0.004, MT.metal, 0, 0.094, -0.1));
    } else {
      const vents = []; for (let f = 0.31; f < hgEnd - 0.05; f += 0.045) vents.push([[f, 0.04], [f + 0.028, 0.04], [f + 0.028, 0.066], [f, 0.066]]);
      g.add(prof([[0.28, 0.018], [hgEnd, 0.018], [hgEnd, 0.092], [0.28, 0.092]], 0.058, furn, 0.008, 0, vents));
      railTeeth(g, -0.06, hgEnd - 0.02, 0.094, 0.024);
      g.add(rbox(0.061, 0.007, hg * 0.7, 0.003, MT.accent, 0, 0.026, -(0.28 + hg * 0.5)));
    }
    const bEnd = hgEnd + bl;
    if (o.shield) { g.add(tube(0.024, bl * 0.75, MT.metalDS, hgEnd + bl * 0.4, 0.058, 0, 0.024, 16, true)); for (let i = 0; i < 5; i++) g.add(mesh(new THREE.TorusGeometry(0.024, 0.003, 6, 18), MT.black, 0, 0.058, -(hgEnd + 0.03 + i * bl * 0.15))); }
    g.add(tube(br, bEnd - 0.28, MT.metal, (0.28 + bEnd) / 2, 0.058));
    g.add(tube(br + 0.006, 0.075, MT.metal, bEnd + 0.035, 0.058));
    for (let i = 0; i < 3; i++) g.add(rbox((br + 0.006) * 2 + 0.002, 0.006, 0.01, 0.002, MT.black, 0, 0.058, -(bEnd + 0.015 + i * 0.02)));
    if (o.optic === 'irons' || wood) frontPost(g, bEnd - 0.03, 0.085);
    pistolGrip(g, wood ? MT.wood : MT.poly); triggerGroup(g, 0.045, 0.004);
    const st = o.stock || 'tube';
    if (st === 'tube') { g.add(tube(0.017, 0.2, MT.metal, -0.16, 0.06)); g.add(prof([[-0.1, 0.09], [-0.33, 0.1], ['q', -0.35, 0.1, -0.35, 0.075], [-0.35, -0.03], ['q', -0.35, -0.052, -0.32, -0.05], [-0.22, -0.01], [-0.12, 0.03], [-0.1, 0.045]], 0.046, furn, 0.007)); }
    else if (st === 'skeleton') g.add(prof([[-0.07, 0.085], [-0.34, 0.095], [-0.35, 0.075], [-0.35, -0.05], [-0.31, -0.05], [-0.1, 0.02], [-0.07, 0.03]], 0.04, furn, 0.006, 0, [[[-0.13, 0.055], [-0.31, 0.065], [-0.31, -0.02], [-0.16, 0.03]]]));
    else if (st === 'wood') g.add(prof([[-0.06, 0.075], [-0.38, 0.045], [-0.4, 0.045], [-0.4, -0.085], [-0.36, -0.085], [-0.1, 0.0], [-0.06, 0.02]], 0.044, MT.wood, 0.009));
    else g.add(prof([[-0.07, 0.085], [-0.35, 0.09], ['q', -0.37, 0.09, -0.37, 0.07], [-0.37, -0.06], ['q', -0.37, -0.075, -0.34, -0.075], [-0.12, 0.0], [-0.07, 0.03]], 0.046, furn, 0.008));
    g.add(rbox(0.05, 0.14, 0.02, 0.007, MT.black, 0, 0.015, st === 'wood' ? 0.405 : 0.36));
    if (o.carry) { for (const f of [-0.04, 0.12]) g.add(rbox(0.016, 0.05, 0.016, 0.004, MT.metal, 0, 0.115, -f)); g.add(rbox(0.02, 0.014, 0.19, 0.005, MT.poly, 0, 0.142, -0.04)); }
    opticOn(g, o.optic || 'reddot', o.carry ? 0.22 : 0.12, 0.108);
    if (o.bipod) for (const x of [-0.016, 0.016]) g.add(tube(0.005, 0.2, MT.metal, hgEnd - 0.12, 0.004, x));
    const mag = new THREE.Group(); mag.position.set(0, 0, -0.118);
    const ms = o.magSize || 1;
    if (o.mag === 'straight') mag.add(prof([[-0.04, 0.0], [0.04, 0.0], [0.042, -0.17 * ms], [-0.034, -0.17 * ms]], 0.03, MT.metal, 0.004));
    else if (o.mag === 'box') { mag.add(rbox(0.07, 0.13, 0.12, 0.012, MT.poly, 0.012, -0.07, 0)); mag.add(rbox(0.074, 0.02, 0.124, 0.006, MT.black, 0.012, -0.01, 0)); }
    else if (o.mag === 'drum') { mag.add(vcyl(0.08, 0.06, MT.metal, 0.0, -0.09, 0.0, 24).rotateZ(Math.PI / 2)); mag.add(vcyl(0.03, 0.065, MT.black, 0, -0.09, 0).rotateZ(Math.PI / 2)); }
    else mag.add(curvedMag(ms, MT.metal));
    keep(mag, 'mag');
    A.muzzle = [0, 0.058, -(bEnd + 0.075)]; A.fore = [0, 0.012, -(0.28 + hg * 0.42)]; A.eject = [0.03, 0.066, -0.085]; A.magDrop = [0, -0.16, -0.13]; A.rack = [0, 0.1, 0.07];
  },
  double(g, A, keep, o) {
    g.add(rbox(0.05, 0.06, 0.13, 0.012, MT.steel, 0, 0.03, -0.02));
    triggerGroup(g, 0.04, 0.0);
    g.add(prof([[-0.04, 0.055], [-0.13, 0.04], ['q', -0.26, 0.03, -0.41, 0.06], [-0.425, 0.06], [-0.425, -0.08], ['q', -0.3, -0.075, -0.16, -0.055], ['q', -0.06, -0.04, -0.04, 0.0]], 0.046, MT.wood, 0.008));
    g.add(rbox(0.05, 0.15, 0.022, 0.008, MT.black, 0, -0.01, 0.43));
    const brl = new THREE.Group(); brl.position.set(0, 0.05, -0.06);
    for (const x of [-0.017, 0.017]) { brl.add(tube(0.017, 0.6, MT.metal, 0.3, 0.0, x)); brl.add(mesh(new THREE.CircleGeometry(0.012, 14), MT.black, x, 0, -0.6005, 0, Math.PI)); }
    brl.add(rbox(0.012, 0.006, 0.58, 0.002, MT.metal, 0, 0.019, -0.3));
    brl.add(ball(0.004, MT.brass, 0, 0.025, -0.59));
    brl.add(prof([[0.05, -0.04], [0.3, -0.035], [0.3, -0.01], [0.05, -0.01]], 0.05, MT.wood, 0.008));
    keep(brl, 'barrels');
    A.muzzle = [0, 0.05, -0.665]; A.fore = [0, -0.005, -0.25]; A.eject = [0, 0.05, -0.06]; A.magDrop = [0, -0.02, -0.12]; A.rack = [0, 0.05, -0.06];
  },
  sniper(g, A, keep, o) {
    const heavy = !!o.heavy, ch = matOf(o.chassis || 'tan'), bl = heavy ? 0.78 : 0.6, br = heavy ? 0.021 : 0.016;
    g.add(prof([[-0.05, 0.002], [0.24, 0.002], ['q', 0.42, 0.01, 0.46, 0.025], [0.46, 0.062], [-0.05, 0.062]], 0.058, ch, 0.008));
    g.add(tube(0.024, 0.26, MT.metal, 0.08, 0.075));
    g.add(rbox(0.004, 0.018, 0.07, 0.002, MT.black, 0.025, 0.08, -0.06));
    g.add(tube(br, bl, MT.metal, 0.4 + bl / 2, 0.075, 0, br * 0.8));
    const bEnd = 0.4 + bl;
    if (heavy) { g.add(rbox(0.06, 0.045, 0.11, 0.01, MT.metal, 0, 0.075, -(bEnd + 0.05))); for (let i = 0; i < 3; i++) g.add(rbox(0.062, 0.03, 0.012, 0.003, MT.black, 0, 0.075, -(bEnd + 0.02 + i * 0.03))); }
    else g.add(tube(0.021, 0.07, MT.metal, bEnd + 0.035, 0.075));
    pistolGrip(g, MT.poly); triggerGroup(g, 0.045, 0.004);
    g.add(prof([[-0.05, 0.065], [-0.42, 0.08], ['q', -0.445, 0.08, -0.445, 0.06], [-0.445, -0.07], ['q', -0.44, -0.088, -0.4, -0.085], [-0.2, -0.03], [-0.08, -0.02], [-0.05, 0.0]], 0.044, ch, 0.007, 0, [[[-0.17, 0.035], [-0.36, 0.045], [-0.37, -0.03], [-0.22, -0.005]]]));
    g.add(rbox(0.04, 0.03, 0.15, 0.01, ch, 0, 0.095, 0.25));
    g.add(rbox(0.05, 0.17, 0.02, 0.008, MT.black, 0, 0.0, 0.455));
    scopeOn(g, 0.1, 0.15, heavy ? 1.25 : 1.1);
    for (const x of [-0.02, 0.02]) {
      if (heavy) g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8), MT.metal, x * 4, -0.1, -0.42, 0.35, 0, x > 0 ? -0.35 : 0.35));
      else g.add(tube(0.005, 0.2, MT.metal, 0.33, -0.004, x));
    }
    const mag = new THREE.Group(); mag.position.set(0, 0, -0.07);
    mag.add(prof([[-0.04, 0.0], [0.045, 0.0], [0.04, heavy ? -0.1 : -0.08], [-0.035, heavy ? -0.1 : -0.08]], 0.04, MT.metal, 0.004)); keep(mag, 'mag');
    if (!o.semi) {
      const bolt = new THREE.Group(); bolt.position.set(0, 0.075, 0.0);
      bolt.add(vcyl(0.0055, 0.055, MT.steel, 0.045, 0, 0.015).rotateZ(Math.PI / 2)); bolt.add(ball(0.012, MT.poly, 0.075, 0, 0.015));
      keep(bolt, 'bolt');
    }
    A.muzzle = [0, 0.075, -(bEnd + (heavy ? 0.11 : 0.075))]; A.fore = [0, 0.0, -0.3]; A.eject = [0.03, 0.08, -0.06]; A.magDrop = [0, -0.1, -0.07]; A.rack = [0.075, 0.075, -0.015];
  },
};
const GUNS = {};
function buildGun(id) {
  const g = new THREE.Group(); g.name = id;
  const A = {}; // якоря: muzzle, grip, fore, eject, magDrop
  const keep = (o, name) => { o.name = name; o.userData.keep = true; g.add(o); return o; };
  switch (id) {
    case 'buran': {
      g.add(prof([[-0.035, 0.004], [0.06, 0.004], [0.07, -0.03], [0.165, -0.03], [0.175, 0.004], [0.215, 0.004], [0.215, 0.042], [-0.035, 0.042]], 0.044, MT.metal, 0.004));
      g.add(prof([[-0.07, 0.042], [0.28, 0.042], [0.28, 0.088], [-0.06, 0.088], ['q', -0.07, 0.088, -0.07, 0.078]], 0.048, MT.metal, 0.005));
      g.add(rbox(0.004, 0.02, 0.065, 0.002, MT.black, 0.025, 0.066, -0.085));
      g.add(vcyl(0.008, 0.02, MT.metalLight, 0.03, 0.06, -0.02).rotateZ(Math.PI / 2));
      g.add(rbox(0.05, 0.012, 0.03, 0.004, MT.metal, 0, 0.088, 0.075));
      railTeeth(g, -0.06, 0.6, 0.094, 0.024);
      const vents = []; for (let f = 0.31; f < 0.58; f += 0.045) vents.push([[f, 0.04], [f + 0.028, 0.04], [f + 0.028, 0.066], [f, 0.066]]);
      g.add(prof([[0.28, 0.018], [0.62, 0.018], [0.62, 0.092], [0.28, 0.092]], 0.058, MT.poly, 0.008, 0, vents));
      g.add(rbox(0.061, 0.007, 0.24, 0.003, MT.accent, 0, 0.026, -0.45));
      g.add(tube(0.011, 0.42, MT.metal, 0.6, 0.058));
      g.add(rbox(0.03, 0.03, 0.035, 0.006, MT.metal, 0, 0.062, -0.66));
      g.add(prof([[0.65, 0.075], [0.675, 0.075], [0.672, 0.115], [0.66, 0.115]], 0.006, MT.metal, 0.001));
      g.add(tube(0.017, 0.075, MT.metal, 0.84, 0.058));
      for (let i = 0; i < 3; i++) g.add(rbox(0.036, 0.006, 0.01, 0.002, MT.black, 0, 0.058, -(0.82 + i * 0.018)));
      pistolGrip(g, MT.poly); triggerGroup(g, 0.045, 0.004);
      g.add(tube(0.017, 0.2, MT.metal, -0.16, 0.06));
      g.add(prof([[-0.1, 0.09], [-0.33, 0.1], ['q', -0.35, 0.1, -0.35, 0.075], [-0.35, -0.03], ['q', -0.35, -0.052, -0.32, -0.05], [-0.22, -0.01], [-0.12, 0.03], [-0.1, 0.045]], 0.046, MT.poly, 0.007));
      g.add(rbox(0.05, 0.13, 0.018, 0.006, MT.black, 0, 0.03, 0.352));
      redDot(g, 0.12, 0.108);
      const mag = new THREE.Group(); mag.position.set(0, 0, -0.118);
      mag.add(prof([[-0.04, 0.0], [0.04, 0.0], [0.036, -0.08], ['q', 0.03, -0.15, 0.06, -0.2], [-0.012, -0.22], ['q', -0.04, -0.15, -0.035, -0.08]], 0.03, MT.metal, 0.004));
      mag.add(rbox(0.036, 0.014, 0.08, 0.004, MT.poly, 0, -0.218, -0.025, 0.35));
      keep(mag, 'mag');
      A.muzzle = [0, 0.058, -0.885]; A.fore = [0, 0.012, -0.37]; A.eject = [0.03, 0.066, -0.085]; A.magDrop = [0, -0.16, -0.13]; A.rack = [0, 0.1, 0.07];
      break;
    }
    case 'shershen': {
      g.add(prof([[-0.06, 0.002], [0.26, 0.002], [0.26, 0.074], ['q', 0.26, 0.086, 0.245, 0.086], [-0.045, 0.086], ['q', -0.06, 0.086, -0.06, 0.07]], 0.05, MT.metal, 0.005));
      g.add(rbox(0.052, 0.008, 0.2, 0.003, MT.accent, 0, 0.03, -0.12));
      g.add(rbox(0.004, 0.018, 0.05, 0.002, MT.black, 0.026, 0.06, -0.06));
      g.add(vcyl(0.006, 0.04, MT.metalLight, -0.04, 0.065, -0.17).rotateZ(Math.PI / 2));
      railTeeth(g, -0.04, 0.24, 0.092, 0.022);
      g.add(tube(0.023, 0.17, MT.metal, 0.34, 0.044));
      for (let i = 0; i < 5; i++) g.add(mesh(new THREE.TorusGeometry(0.023, 0.0025, 6, 20), MT.black, 0, 0.044, -(0.27 + i * 0.03)));
      g.add(vcyl(0.014, 0.085, MT.poly, 0, -0.035, -0.2)); g.add(ball(0.016, MT.poly, 0, -0.078, -0.2));
      pistolGrip(g, MT.poly); triggerGroup(g, 0.045, 0.002);
      for (const y of [0.07, 0.01]) g.add(tube(0.006, 0.26, MT.metal, -0.19, y));
      g.add(rbox(0.04, 0.1, 0.014, 0.005, MT.poly, 0, 0.04, 0.32));
      g.add(rbox(0.03, 0.012, 0.04, 0.003, MT.metal, 0, 0.105, -0.07));
      g.add(mesh(new THREE.TorusGeometry(0.018, 0.0035, 8, 24), MT.metal, 0, 0.13, -0.07));
      g.add(mesh(new THREE.CircleGeometry(0.016, 20), MT.glass, 0, 0.13, -0.072));
      const dot = ball(0.002, MT.red, 0, 0.13, -0.068); dot.userData.keep = true; g.add(dot);
      const mag = new THREE.Group(); mag.position.set(0, 0, -0.085);
      mag.add(prof([[-0.022, 0.0], [0.022, 0.0], [0.026, -0.2], [-0.018, -0.2]], 0.026, MT.metal, 0.004));
      mag.add(rbox(0.03, 0.012, 0.05, 0.004, MT.poly, 0, -0.205, -0.004));
      keep(mag, 'mag');
      A.muzzle = [0, 0.044, -0.43]; A.fore = [0, -0.04, -0.2]; A.eject = [0.03, 0.06, -0.06]; A.magDrop = [0, -0.15, -0.085]; A.rack = [-0.06, 0.065, -0.17];
      break;
    }
    case 'molot': {
      g.add(prof([[-0.04, 0.002], [0.2, 0.002], [0.2, 0.078], [-0.02, 0.078], ['q', -0.04, 0.078, -0.04, 0.06]], 0.05, MT.metal, 0.005));
      g.add(rbox(0.004, 0.022, 0.06, 0.002, MT.black, 0.026, 0.05, -0.08));
      g.add(rbox(0.03, 0.006, 0.08, 0.002, MT.black, 0, 0.0, -0.08));
      g.add(tube(0.017, 0.56, MT.metal, 0.47, 0.058));
      g.add(rbox(0.012, 0.006, 0.55, 0.002, MT.metal, 0, 0.078, -0.47));
      const bead = ball(0.004, MT.brass, 0, 0.084, -0.74); g.add(bead);
      g.add(tube(0.014, 0.46, MT.metal, 0.43, 0.022)); g.add(tube(0.016, 0.02, MT.metalLight, 0.665, 0.022));
      triggerGroup(g, 0.05, 0.004);
      g.add(prof([[-0.035, 0.068], [-0.13, 0.05], ['q', -0.26, 0.04, -0.41, 0.072], [-0.425, 0.072], [-0.425, -0.075], ['q', -0.3, -0.07, -0.16, -0.05], ['q', -0.06, -0.035, -0.035, 0.0]], 0.046, MT.wood, 0.008));
      g.add(rbox(0.05, 0.155, 0.022, 0.008, MT.black, 0, 0.0, 0.43));
      const pump = new THREE.Group();
      pump.add(tube(0.025, 0.16, MT.wood, 0.4, 0.026));
      for (let i = 0; i < 7; i++) pump.add(mesh(new THREE.TorusGeometry(0.025, 0.0028, 6, 22), MT.wood, 0, 0.026, -(0.335 + i * 0.022)));
      keep(pump, 'pump');
      A.muzzle = [0, 0.058, -0.76]; A.fore = [0, 0.0, -0.4]; A.eject = [0.03, 0.05, -0.08]; A.magDrop = [0, -0.02, -0.08]; A.rack = [0, 0.0, -0.4];
      break;
    }
    case 'igla': {
      g.add(prof([[-0.05, 0.002], [0.24, 0.002], ['q', 0.42, 0.01, 0.46, 0.025], [0.46, 0.062], [-0.05, 0.062]], 0.056, MT.tan, 0.008));
      g.add(tube(0.023, 0.26, MT.metal, 0.08, 0.075));
      g.add(rbox(0.004, 0.018, 0.07, 0.002, MT.black, 0.024, 0.08, -0.06));
      g.add(tube(0.017, 0.64, MT.metal, 0.72, 0.075, 0, 0.013));
      g.add(tube(0.021, 0.075, MT.metal, 1.07, 0.075));
      for (let i = 0; i < 3; i++) g.add(rbox(0.046, 0.008, 0.012, 0.002, MT.black, 0, 0.075, -(1.05 + i * 0.02)));
      pistolGrip(g, MT.poly); triggerGroup(g, 0.045, 0.004);
      g.add(prof([[-0.05, 0.065], [-0.42, 0.08], ['q', -0.445, 0.08, -0.445, 0.06], [-0.445, -0.07], ['q', -0.44, -0.088, -0.4, -0.085], [-0.2, -0.03], [-0.08, -0.02], [-0.05, 0.0]], 0.044, MT.tan, 0.007, 0, [[[-0.17, 0.035], [-0.36, 0.045], [-0.37, -0.03], [-0.22, -0.005]]]));
      g.add(rbox(0.04, 0.03, 0.15, 0.01, MT.tan, 0, 0.095, 0.25));
      g.add(rbox(0.05, 0.17, 0.02, 0.008, MT.black, 0, 0.0, 0.455));
      g.add(prof([[0.03, 0.002], [0.115, 0.002], [0.11, -0.07], [0.035, -0.07]], 0.04, MT.metal, 0.004));
      for (const f of [0.0, 0.17]) { g.add(rbox(0.026, 0.035, 0.02, 0.004, MT.metal, 0, 0.11, -f)); g.add(mesh(new THREE.TorusGeometry(0.02, 0.006, 8, 24), MT.metal, 0, 0.142, -f)); }
      g.add(tube(0.016, 0.24, MT.metal, 0.09, 0.142));
      g.add(tube(0.018, 0.08, MT.metal, 0.25, 0.142, 0, 0.032));
      g.add(tube(0.025, 0.05, MT.metal, -0.06, 0.142, 0, 0.017));
      g.add(mesh(new THREE.CircleGeometry(0.029, 28), MT.glass, 0, 0.142, -0.291, 0, Math.PI));
      g.add(mesh(new THREE.CircleGeometry(0.022, 28), MT.glass, 0, 0.142, 0.086));
      g.add(vcyl(0.013, 0.03, MT.metal, 0, 0.17, -0.1)); g.add(vcyl(0.013, 0.03, MT.metal, 0.03, 0.142, -0.1).rotateZ(Math.PI / 2));
      for (const x of [-0.014, 0.014]) g.add(tube(0.005, 0.2, MT.metal, 0.33, -0.004, x));
      const bolt = new THREE.Group(); bolt.position.set(0, 0.075, 0.0);
      bolt.add(vcyl(0.0055, 0.055, MT.steel, 0.045, 0, 0.015).rotateZ(Math.PI / 2)); bolt.add(ball(0.012, MT.poly, 0.075, 0, 0.015));
      keep(bolt, 'bolt');
      A.muzzle = [0, 0.075, -1.11]; A.fore = [0, 0.0, -0.3]; A.eject = [0.03, 0.08, -0.06]; A.magDrop = [0, -0.1, -0.07]; A.rack = [0.075, 0.075, -0.015];
      break;
    }
    case 'osa': {
      g.add(prof([[-0.025, 0.002], [0.135, 0.002], [0.135, 0.03], [-0.025, 0.03]], 0.03, MT.poly, 0.004));
      g.add(prof([[-0.022, -0.005], [0.024, -0.005], ['q', 0.03, -0.05, 0.018, -0.1], [-0.03, -0.1], ['q', -0.036, -0.05, -0.03, -0.005]], 0.032, MT.poly, 0.006));
      for (let i = 0; i < 5; i++) g.add(rbox(0.034, 0.004, 0.03, 0.0015, MT.black, 0, -0.02 - i * 0.016, -(0.0 - i * 0.002)));
      triggerGroup(g, 0.035, 0.0);
      g.add(rbox(0.032, 0.008, 0.014, 0.003, MT.poly, 0, -0.103, 0.004));
      const slide = new THREE.Group();
      slide.add(prof([[-0.035, 0.03], [0.15, 0.03], [0.15, 0.06], ['q', 0.15, 0.068, 0.14, 0.068], [-0.025, 0.068], ['q', -0.035, 0.068, -0.035, 0.058]], 0.031, MT.metal, 0.004));
      for (let i = 0; i < 6; i++) for (const x of [-0.0158, 0.0158]) slide.add(rbox(0.002, 0.03, 0.003, 0.0008, MT.black, x, 0.049, -(-0.03 + i * 0.006)));
      slide.add(rbox(0.004, 0.012, 0.035, 0.0015, MT.black, 0.0158, 0.052, -0.05));
      slide.add(rbox(0.02, 0.008, 0.008, 0.002, MT.metal, 0, 0.072, 0.02));
      slide.add(rbox(0.005, 0.008, 0.006, 0.0015, MT.metal, 0, 0.072, -0.14));
      const tri = ball(0.0022, MT.accent, 0, 0.074, -0.14); slide.add(tri);
      slide.add(mesh(new THREE.CircleGeometry(0.006, 16), MT.black, 0, 0.045, -0.1505, 0, Math.PI));
      keep(slide, 'slide');
      const mag = new THREE.Group(); mag.add(rbox(0.024, 0.09, 0.03, 0.004, MT.metal, 0, -0.06, 0.0, 0.25)); keep(mag, 'mag');
      A.muzzle = [0, 0.045, -0.16]; A.fore = [-0.012, -0.06, 0.005]; A.eject = [0.02, 0.06, -0.05]; A.magDrop = [0, -0.14, 0.01]; A.rack = [0, 0.05, 0.02];
      break;
    }
    case 'gadyuka': {
      g.add(prof([[-0.035, 0.0], [0.065, 0.0], [0.065, 0.074], [-0.02, 0.074], ['q', -0.04, 0.074, -0.04, 0.05]], 0.032, MT.steel, 0.004, 0, [[[ -0.005, 0.016], [0.045, 0.016], [0.045, 0.068], [-0.005, 0.068]]]));
      g.add(tube(0.012, 0.17, MT.steel, 0.15, 0.056));
      g.add(rbox(0.018, 0.016, 0.15, 0.005, MT.steel, 0, 0.034, -0.145));
      g.add(rbox(0.01, 0.009, 0.16, 0.003, MT.metal, 0, 0.07, -0.145));
      g.add(prof([[0.2, 0.074], [0.215, 0.074], [0.212, 0.09], [0.204, 0.09]], 0.004, MT.metal, 0.001));
      g.add(mesh(new THREE.CircleGeometry(0.0075, 16), MT.black, 0, 0.056, -0.2355, 0, Math.PI));
      g.add(prof([[-0.025, 0.002], [0.022, 0.002], ['q', 0.03, -0.05, 0.002, -0.105], [-0.05, -0.105], ['q', -0.052, -0.04, -0.035, -0.002]], 0.036, MT.wood, 0.007));
      triggerGroup(g, 0.03, 0.0);
      const cyl = new THREE.Group(); cyl.position.set(0, 0.042, -0.02);
      cyl.add(tube(0.027, 0.048, MT.steel, 0, 0));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl.add(mesh(new THREE.CircleGeometry(0.0055, 12), MT.black, Math.cos(a) * 0.016, Math.sin(a) * 0.016, -0.0245, 0, Math.PI)); cyl.add(rbox(0.004, 0.004, 0.04, 0.0015, MT.metal, Math.cos(a + 0.52) * 0.026, Math.sin(a + 0.52) * 0.026, 0)); }
      keep(cyl, 'cyl');
      const ham = new THREE.Group(); ham.position.set(0, 0.07, 0.03);
      ham.add(prof([[-0.004, -0.01], [0.01, -0.01], [0.006, 0.012], [-0.012, 0.016]], 0.008, MT.metal, 0.001)); keep(ham, 'hammer');
      A.muzzle = [0, 0.056, -0.24]; A.fore = [-0.012, -0.06, 0.005]; A.eject = [0, 0.042, -0.02]; A.magDrop = [0, 0.042, -0.02]; A.rack = [0, 0.042, -0.02];
      break;
    }
    case 'knife': {
      g.add(prof([[0.0, -0.012], [0.16, -0.012], ['q', 0.215, -0.012, 0.24, 0.012], ['q', 0.2, 0.02, 0.16, 0.022], [0.0, 0.022]], 0.005, MT.steel, 0.0018));
      g.add(rbox(0.006, 0.004, 0.12, 0.001, MT.metal, 0, 0.012, -0.07));
      g.add(rbox(0.024, 0.06, 0.012, 0.004, MT.metal, 0, 0.005, 0.0));
      g.add(tube(0.014, 0.11, MT.poly, -0.06, 0.005));
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.0145, 0.003, 6, 16), MT.black, 0, 0.005, (0.02 + i * 0.025)));
      g.add(ball(0.017, MT.metal, 0, 0.005, 0.12));
      g.add(rbox(0.016, 0.006, 0.03, 0.002, MT.accent, 0, 0.022, 0.06));
      A.muzzle = [0, 0.005, -0.25]; A.fore = [-0.05, -0.08, 0.05]; A.eject = [0, 0, 0]; A.magDrop = [0, 0, 0]; A.rack = [0, 0, 0];
      break;
    }
    default: GEN[WEAPONS[id].model.gen](g, A, keep, WEAPONS[id].model);
  }
  A.grip = id === 'knife' ? [0, 0.04, 0.07] : [0, -0.004, 0.012];
  for (const k in A) g.add(anchor(k, ...A[k]));
  const W = WEAPONS[id];
  const fl = makeFlash(W.quiet ? 0.07 : ['shotgun', 'sniper', 'mg'].includes(W.cat) ? 0.32 : W.cat === 'pistol' ? 0.16 : 0.22); fl.position.set(...A.muzzle); g.add(fl);
  return bake(g);
}
function gunParts(g) {
  const p = {}; g.traverse(o => { if (o.name && o !== g) p[o.name] = o; });
  for (const k of ['mag', 'slide', 'pump', 'bolt', 'cyl', 'hammer', 'barrels']) if (p[k]) p[k].userData.base = p[k].position.clone();
  return p;
}
for (const id of Object.keys(WEAPONS)) GUNS[id] = buildGun(id);

/* --- кисти рук --- */
function makeHand(left, gloveMat = MT.glove) {
  const h = new THREE.Group();
  const s = left ? -1 : 1;
  h.add(rbox(0.026, 0.075, 0.07, 0.012, gloveMat, s * 0.022, -0.035, 0.0));
  h.add(rbox(0.012, 0.05, 0.05, 0.005, MT.gloveDark, s * 0.036, -0.03, 0.0));
  for (let i = 0; i < 4; i++) {
    const y = -0.012 - i * 0.02;
    h.add(mesh(new THREE.CapsuleGeometry(0.0095, 0.03, 3, 8), gloveMat, s * 0.008, y, -0.033, 0, 0, Math.PI / 2));
    h.add(ball(0.01, gloveMat, -s * 0.014, y, -0.03));
  }
  h.add(mesh(new THREE.CapsuleGeometry(0.01, 0.035, 3, 8), gloveMat, -s * 0.02, -0.0, -0.01, -1.2, 0, 0));
  h.add(rbox(0.05, 0.06, 0.03, 0.012, MT.gloveDark, s * 0.016, -0.04, 0.05));
  return bake(h);
}
const handR = makeHand(false), handL = makeHand(true);

/* --- общие функции скелета --- */
const UPV = new THREE.Vector3(0, 1, 0), _ik = new THREE.Vector3(), _ik2 = new THREE.Vector3();
function ik(root, target, l1, l2, pole, mid) {
  const d = _ik.subVectors(target, root); const dist = d.length() || 1e-4; d.divideScalar(dist);
  const dc = clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _ik2.copy(pole).addScaledVector(d, -pole.dot(d)); if (_ik2.lengthSq() < 1e-6) _ik2.set(0, 1, 0); _ik2.normalize();
  return mid.copy(root).addScaledVector(d, a).addScaledVector(_ik2, h);
}
const _sd = new THREE.Vector3();
function placeSeg(m, a, b, L) {
  _sd.subVectors(b, a); const d = _sd.length() || 1e-4;
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UPV, _sd.divideScalar(d));
  m.scale.set(1, d / L, 1);
}
function seg(r, L, mat, parent) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, L - 2 * r), 3, 10), mat); m.castShadow = true; parent.add(m); return m; }

/* --- солдат (бот) --- */
const LEG = { thigh: 0.44, shin: 0.43, upper: 0.31, fore: 0.29, hipY: 0.92 };
const gunPose = id => { const c = WEAPONS[id].cat; return c === 'pistol' ? [0.04, 0.32, -0.4] : c === 'knife' ? [0.2, 0.12, -0.25] : [0.085, 0.3, -0.24]; };
RB_SEG = 1;
const SOLDIER_PARTS = [0, 1].map(team => {
  const T = teamMats[team];
  const pv = new THREE.Group();
  pv.add(sc(ball(0.15, T.fabric, 0, 0, 0), 1.1, 0.7, 0.8));
  pv.add(rbox(0.33, 0.05, 0.24, 0.02, MT.black, 0, 0.055, 0));
  pv.add(rbox(0.045, 0.035, 0.015, 0.005, MT.metalLight, 0, 0.055, -0.122));
  pv.add(rbox(0.08, 0.1, 0.07, 0.02, T.vest, 0.17, -0.0, 0.04));
  pv.add(rbox(0.07, 0.085, 0.06, 0.02, T.vest2, -0.17, 0.0, 0.05));
  const ch = new THREE.Group();
  ch.add(sc(mesh(new THREE.CapsuleGeometry(0.12, 0.08, 4, 14), T.fabric, 0, 0.1, 0), 1.25, 1, 0.85));
  ch.add(sc(mesh(new THREE.CapsuleGeometry(0.15, 0.14, 4, 14), T.fabric, 0, 0.31, 0), 1.3, 1, 0.82));
  ch.add(rbox(0.39, 0.33, 0.27, 0.06, T.vest, 0, 0.29, 0));
  ch.add(rbox(0.3, 0.25, 0.04, 0.015, T.vest2, 0, 0.32, -0.14));
  for (const x of [-0.09, 0, 0.09]) { ch.add(rbox(0.075, 0.11, 0.05, 0.014, T.vest2, x, 0.19, -0.165)); ch.add(rbox(0.078, 0.03, 0.054, 0.01, T.vest, x, 0.24, -0.166)); }
  ch.add(rbox(0.065, 0.13, 0.065, 0.015, T.vest2, 0.21, 0.25, 0.03));
  ch.add(vcyl(0.004, 0.36, MT.black, 0.16, 0.6, 0.15, 6)); ch.add(ball(0.007, MT.black, 0.16, 0.78, 0.15));
  ch.add(rbox(0.3, 0.3, 0.13, 0.045, T.vest, 0, 0.3, 0.19));
  ch.add(rbox(0.26, 0.08, 0.1, 0.03, T.vest2, 0, 0.43, 0.2));
  for (const x of [-0.13, 0.13]) ch.add(rbox(0.07, 0.03, 0.3, 0.012, T.vest, x, 0.465, 0));
  ch.add(mesh(new THREE.TorusGeometry(0.085, 0.03, 8, 18), T.vest, 0, 0.48, 0, Math.PI / 2));
  ch.add(vcyl(0.052, 0.12, MT.skin, 0, 0.53, 0));
  for (const s of [-1, 1]) { ch.add(sc(ball(0.078, T.vest2, s * 0.215, 0.43, 0), 1, 0.85, 1.05)); ch.add(rbox(0.05, 0.03, 0.012, 0.005, T.glow, s * 0.24, 0.43, -0.07, 0, -s * 0.5)); }
  ch.add(rbox(0.26, 0.014, 0.012, 0.004, T.glow, 0, 0.43, -0.162));
  const hd = new THREE.Group();
  hd.add(sc(ball(0.105, MT.skin, 0, 0.02, 0), 0.95, 1.08, 1));
  hd.add(mesh(new THREE.SphereGeometry(0.109, 18, 12, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.42), MT.black, 0, 0.02, 0));
  hd.add(mesh(new THREE.TorusGeometry(0.104, 0.011, 6, 24), MT.black, 0, 0.045, 0, Math.PI / 2));
  for (const s of [-1, 1]) hd.add(sc(ball(0.03, T.lens, s * 0.04, 0.045, -0.093), 1, 0.8, 0.5));
  // волосы под головным убором (видны у кепки, банданы и т. п.)
  hd.add(sc(mesh(new THREE.SphereGeometry(0.108, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), MT.hair, 0, 0.03, 0.004), 1, 0.95, 1.04));
  // гарнитура (шлем и прочие головные уборы — отдельно, см. cosmetics)
  for (const s of [-1, 1]) hd.add(vcyl(0.036, 0.03, MT.black, s * 0.11, -0.0, 0.0).rotateZ(Math.PI / 2));
  hd.add(vcyl(0.0035, 0.08, MT.black, 0.1, -0.04, -0.06).rotateX(1.2));
  const boot = new THREE.Group();
  boot.add(rbox(0.105, 0.1, 0.24, 0.035, MT.boot, 0, 0.055, -0.045));
  boot.add(rbox(0.112, 0.03, 0.255, 0.01, MT.sole, 0, 0.012, -0.045));
  boot.add(rbox(0.1, 0.06, 0.1, 0.03, MT.boot, 0, 0.12, 0.0));
  return { pelvis: bake(pv), chest: bake(ch), head: bake(hd), boot: bake(boot) };
});
RB_SEG = 2;
function makeSoldier(team) {
  const T = teamMats[team], SP = SOLDIER_PARTS[team];
  const root = new THREE.Group(); scene.add(root);
  const body = new THREE.Group(); body.rotation.order = 'YXZ'; root.add(body);
  const pelvis = new THREE.Group(); body.add(pelvis); pelvis.add(SP.pelvis.clone());
  const chest = new THREE.Group(); chest.position.y = 0.05; chest.rotation.order = 'YXZ'; pelvis.add(chest); chest.add(SP.chest.clone());
  const head = new THREE.Group(); head.position.set(0, 0.6, 0); chest.add(head); head.add(SP.head.clone());
  const shL = anchor('shL', -0.21, 0.42, 0.0), shR = anchor('shR', 0.21, 0.42, 0.0); chest.add(shL, shR);
  const hipL = anchor('hipL', -0.1, -0.04, 0), hipR = anchor('hipR', 0.1, -0.04, 0); pelvis.add(hipL, hipR);
  const gunHolder = new THREE.Group(); chest.add(gunHolder);
  const R = {
    root, body, pelvis, chest, head, shL, shR, hipL, hipR, gunHolder, guns: {}, gun: null, gunId: null, parts: null,
    thigh: [seg(0.078, LEG.thigh, T.fabric, root), seg(0.078, LEG.thigh, T.fabric, root)],
    shin: [seg(0.062, LEG.shin, T.fabric, root), seg(0.062, LEG.shin, T.fabric, root)],
    upper: [seg(0.056, LEG.upper, T.fabric, root), seg(0.056, LEG.upper, T.fabric, root)],
    fore: [seg(0.047, LEG.fore, T.fabric, root), seg(0.047, LEG.fore, T.fabric, root)],
    knee: [0, 1].map(() => { const m = sc(ball(0.058, T.vest2, 0, 0, 0), 1, 1, 1); m.castShadow = true; root.add(m); return m; }),
    elbow: [0, 1].map(() => { const m = ball(0.048, T.vest2, 0, 0, 0); m.castShadow = true; root.add(m); return m; }),
    boot: [SP.boot.clone(), SP.boot.clone()], hand: [handL.clone(), handR.clone()],
    phase: rand(0, 6), kick: 0, flinch: 0, flashT: 0, fallDir: 1, deadT: 0, reloadP: -1,
  };
  R.holster = rbox(0.06, 0.12, 0.05, 0.015, T.vest, 0, 0, 0); R.thigh[1].add(R.holster); R.holster.position.set(0.075, 0.02, 0.0);
  for (const m of [...R.boot, ...R.hand]) root.add(m);
  root.traverse(o => { if (o.isMesh) o.castShadow = SET.charShadows; });
  return R;
}
function setRigGun(R, id) {
  if (R.gunId === id) return;
  if (R.gun) R.gun.visible = false;
  if (!R.guns[id]) { const g = GUNS[id].clone(); g.traverse(o => { if (o.isMesh) o.castShadow = false; }); skinGun(g, R.cos && R.cos.w && R.cos.w[id]); R.gunHolder.add(g); R.guns[id] = { g, p: gunParts(g) }; R.lodDirty = true; }
  R.gun = R.guns[id].g; R.parts = R.guns[id].p; R.gun.visible = true; R.gunId = id;
  R.gun.position.set(...gunPose(id));
}
function resetRig(a) {
  const R = a.rig; R.deadT = 0;
  if (R.dropped) { scene.remove(R.dropped); R.dropped = null; }
  if (R.gun) R.gun.visible = true; R.kick = R.flinch = 0; R.body.rotation.set(0, a.yaw, 0); R.root.visible = true;
  for (const k in R.guns) R.guns[k].p.flash.visible = false;
  R.hand[0].visible = true; setRigGun(R, a.gun().id);
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _q1 = new THREE.Quaternion();
const POLE_KNEE = new THREE.Vector3(), POLE_ELB = new THREE.Vector3();
const sm = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function animateSoldier(a, dt) {
  const R = a.rig;
  // LOD: поза не пересчитывается (боец за кадром или далеко), но фаза шагов и их звук идут всегда
  if (R.lodSkip && a.alive) {
    const sp = Math.hypot(a.vel.x, a.vel.z), prev = R.phase;
    R.phase += dt * (1.6 + sp * 2.1) * (sp > 0.3 ? 1 : 0);
    if (!a.proneK) R.body.position.set(a.pos.x, a.pos.y, a.pos.z);
    if (sp > 3 && Math.floor(R.phase / Math.PI) !== Math.floor(prev / Math.PI)) sfx('step', a.pos, 0.8);
    return;
  }
  const B = R.body, id = a.gun().id, W = WEAPONS[id];
  setRigGun(R, id);
  const yaw = a.yaw;
  // скорость в локальных координатах
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const lvx = a.vel.x * c - a.vel.z * s, lvz = a.vel.x * s + a.vel.z * c;
  const speed = a.alive ? Math.hypot(lvx, lvz) : 0, k = Math.min(1, speed / 2.5);
  R.phase += dt * (1.6 + speed * 2.1) * (speed > 0.3 ? 1 : 0);
  R.kick = Math.max(0, R.kick - dt * 10); R.flinch = Math.max(0, R.flinch - dt * 5);
  const t = now;
  // смерть: падение с подгибанием коленей и небольшим отскоком
  let fall = 0, slump = 0;
  if (!a.alive) {
    if (!R.dropped && R.deadT > 0.25) {
      R.dropped = GUNS[id].clone(); skinGun(R.dropped, R.cos && R.cos.w && R.cos.w[id]); R.root.parent.add(R.dropped); R.gun.visible = false;
      const side = rand(0.5, 0.9) * (Math.random() < 0.5 ? 1 : -1);
      R.dropped.position.set(a.pos.x + Math.cos(yaw) * side, 0.035, a.pos.z - Math.sin(yaw) * side);
      R.dropped.rotation.set(0, yaw + rand(-1, 1), Math.PI / 2);
    }
    R.deadT += dt; const ft = R.deadT;
    const e = Math.min(1, ft / 0.75); fall = e * e; if (ft > 0.75) fall = 1 - Math.sin(Math.min(1, (ft - 0.75) / 0.25) * Math.PI) * 0.05;
    slump = Math.min(1, ft / 0.35);
  }
  // позы: присед, лёжа (тело вдоль bodyYaw, поворот вокруг ступней), висит на краю; наклон при резком рывке вбок
  const pw = a.alive ? (a.proneK || 0) : 0, ease = Math.min(1, dt * 10);
  R.cw = (R.cw || 0) + ((a.alive && a.posture === 1 ? 1 : 0) - (R.cw || 0)) * ease;
  R.hw = (R.hw || 0) + ((a.alive && a.posture === 3 ? 1 : 0) - (R.hw || 0)) * ease;
  R.lean = (R.lean || 0) + ((a.alive && speed > 6.5 ? clamp(lvx / 12, -1, 1) * 0.32 : 0) - (R.lean || 0)) * Math.min(1, dt * 12);
  const byaw = pw > 0 && a.bodyYaw !== undefined ? a.bodyYaw : yaw, lie = pw * (Math.PI / 2 - 0.22), dip = Math.abs(R.lean) * 0.6;
  B.position.set(a.pos.x + Math.sin(byaw) * 0.85 * pw, a.pos.y + fall * 0.12 + pw * 0.1, a.pos.z + Math.cos(byaw) * 0.85 * pw);
  B.rotation.set(R.fallDir * fall * Math.PI * 0.47 - lie, byaw, fall * 0.15 * R.fallDir - R.lean, 'YXZ');
  // корпус
  const pitch = a.alive ? a.pitch : -0.15 * slump;
  R.pelvis.position.y = LEG.hipY - 0.025 * k + 0.03 * k * Math.cos(2 * R.phase) - slump * 0.06 + Math.sin(t * 2) * 0.004 * (1 - k) - 0.36 * R.cw - 0.2 * dip;
  R.pelvis.rotation.set(0, Math.sin(R.phase) * 0.12 * k, Math.cos(R.phase) * 0.04 * k);
  const twist = id === 'knife' ? 0 : -0.3;
  R.chest.rotation.set(pitch * 0.55 - 0.1 * k + R.kick * 0.06 + R.flinch * 0.25 + Math.sin(t * 2.1) * 0.012 - slump * 0.1 - 0.24 * R.cw - 0.15 * dip + pw * 0.55, -Math.sin(R.phase) * 0.1 * k * (1 - pw) + twist, 0);
  R.head.rotation.set(pitch * 0.4 + R.flinch * 0.2 + pw * 0.55, -twist, 0); R.gunHolder.rotation.y = -twist;
  // оружие
  const gp = gunPose(id);
  let reloadP = a.reloading > 0 && W.reload ? 1 - a.reloading / W.reload : -1;
  const tilt = reloadP >= 0 ? sm(reloadP, 0, 0.15) * (1 - sm(reloadP, 0.85, 1)) : 0;
  R.gun.position.set(gp[0], gp[1] - tilt * 0.05 - slump * 0.1, gp[2] + R.kick * 0.045 + tilt * 0.06);
  R.gun.rotation.set(pitch * 0.45 + R.kick * 0.12 - tilt * 0.3 - slump * 0.6 + pw * 0.62, 0, tilt * 0.5);
  if (a.alive && R.gun) R.gun.visible = R.hw < 0.5; // на краю руки заняты
  const P_ = R.parts;
  if (P_.mag) P_.mag.position.y = P_.mag.userData.base.y - (reloadP >= 0 ? sm(reloadP, 0.22, 0.38) * (1 - sm(reloadP, 0.5, 0.66)) * 0.25 : 0);
  if (P_.flash.visible) { R.flashT -= dt; P_.flash.rotation.z = Math.random() * 6; P_.flash.scale.setScalar(rand(0.7, 1.2)); if (R.flashT <= 0) P_.flash.visible = false; }
  B.updateMatrixWorld(true);
  // руки (IK к рукояти и цевью)
  POLE_ELB.set(0, -1, 0.35).applyQuaternion(B.quaternion);
  const gripW = P_.grip.getWorldPosition(_v1);
  const foreW = (reloadP >= 0 && id !== 'knife' ? _v2.copy(P_.fore.position).lerp(P_.magDrop.position, sm(reloadP, 0.1, 0.25) * (1 - sm(reloadP, 0.7, 0.85))) : _v2.copy(P_.fore.position));
  R.gun.localToWorld(foreW);
  if (id === 'knife') { foreW.set(-0.22, 0.25 - slump * 0.2, -0.15); R.chest.localToWorld(foreW); }
  if (!a.alive) { gripW.lerp(_v5.set(0.35, 0.2, 0.05).applyMatrix4(R.chest.matrixWorld), slump * 0.6); foreW.lerp(_v5.set(-0.4, 0.25, 0.05).applyMatrix4(R.chest.matrixWorld), slump * 0.8); }
  if (R.hw > 0.01) { // висит: ладони на кромке над головой
    gripW.lerp(_v6.set(0.2, 1.08, -0.22).applyMatrix4(R.chest.matrixWorld), R.hw);
    foreW.lerp(_v6.set(-0.2, 1.08, -0.22).applyMatrix4(R.chest.matrixWorld), R.hw);
  }
  R.gun.getWorldQuaternion(_q1);
  for (let i = 0; i < 2; i++) {
    const sh = (i ? R.shR : R.shL).getWorldPosition(_v3), hand = i ? gripW : foreW;
    POLE_ELB.set(i ? 0.6 : -0.6, -1, 0.3).applyQuaternion(B.quaternion);
    const wrist = _v4.copy(hand).addScaledVector(_v5.set(0, 0.03, 0.05).applyQuaternion(_q1), 1);
    const el = ik(sh, wrist, LEG.upper, LEG.fore, POLE_ELB, new THREE.Vector3());
    placeSeg(R.upper[i], sh, el, LEG.upper); placeSeg(R.fore[i], el, wrist, LEG.fore); R.elbow[i].position.copy(el);
    R.hand[i].position.copy(hand); R.hand[i].quaternion.copy(_q1);
  }
  // ноги: шаговый цикл в локальных координатах тела
  POLE_KNEE.set(0, 0.15, -1).applyQuaternion(B.quaternion);
  const mvx = speed > 0.1 ? lvx / speed : 0, mvz = speed > 0.1 ? lvz / speed : 0;
  const stride = clamp(speed * 0.085, 0, 0.3);
  for (let i = 0; i < 2; i++) {
    const hip = (i ? R.hipR : R.hipL).getWorldPosition(_v3);
    const ph = R.phase + (i ? Math.PI : 0);
    const along = -Math.cos(ph) * stride, lift = Math.max(0, Math.sin(ph)) * 0.13 * k;
    const side = i ? 0.12 : -0.12;
    _v4.set(side * (1 + 0.35 * R.cw) + mvx * along, 0.075 + lift, (i ? 0.05 : -0.07) * (1 - k) + mvz * along + (i ? 0.16 : -0.1) * R.cw);
    if (pw > 0.01) { // ползание: ноги поочерёдно подтягиваются вдоль тела
      const cr = Math.max(0, Math.sin(ph)) * 0.24 * Math.min(1, speed / 0.6);
      _v4.set(side * (1 + 0.8 * pw) + side * cr * 0.6, 0.075 + cr * pw, 0.04 * pw);
      POLE_KNEE.set(i ? 1 : -1, 0.2, -0.6).applyQuaternion(B.quaternion);
    }
    if (!a.alive) _v4.set(side * (1.5 + i * 0.5), 0.075 - slump * 0.12, 0.05 * R.fallDir * slump + (i ? 0.06 : -0.04) * slump);
    const foot = B.localToWorld(_v4);
    if (a.alive) foot.y = Math.max(foot.y, a.pos.y + 0.075);
    const kn = ik(hip, foot, LEG.thigh, LEG.shin, POLE_KNEE, new THREE.Vector3());
    placeSeg(R.thigh[i], hip, kn, LEG.thigh); placeSeg(R.shin[i], kn, foot, LEG.shin); R.knee[i].position.copy(kn);
    R.boot[i].position.set(foot.x, foot.y - 0.075, foot.z);
    R.boot[i].quaternion.copy(B.quaternion); R.boot[i].rotateX(a.alive ? -Math.cos(ph) * 0.25 * k : 0);
  }
  // шаги — звук
  if (a.alive && speed > 3 && Math.floor(R.phase / Math.PI) !== Math.floor((R.phase - dt * (1.6 + speed * 2.1)) / Math.PI)) sfx('step', a.pos, 0.8);
}

/* --- гильзы --- */
const casingGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.028, 10), shellGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 12);
const casings = []; let casingI = 0;
for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(casingGeo, MT.brass); m.visible = false; m.castShadow = false; scene.add(m); casings.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, bounced: 0 }); }
function ejectCasing(pos, right, baseVel, shotgun = false) {
  const c = casings[casingI++ % casings.length];
  c.m.geometry = shotgun ? shellGeo : casingGeo; c.m.material = shotgun ? MT.shell : MT.brass;
  c.m.position.copy(pos); c.m.visible = true; c.life = 2.5; c.bounced = 0;
  c.v.copy(right).multiplyScalar(rand(1.8, 2.8)).add(_v5.set(0, rand(1.5, 2.5), 0)).add(baseVel);
  c.w.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
}
function updateCasings(dt) {
  for (const c of casings) if (c.life > 0) {
    c.life -= dt; c.v.y -= 12 * dt; c.m.position.addScaledVector(c.v, dt);
    c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
    const fx = Math.floor(c.m.position.x / CELL), fz = Math.floor(c.m.position.z / CELL), fl = floorAt(fx, fz, c.m.position.y);
    if (c.m.position.y < fl + 0.006 && c.v.y < 0) {
      c.m.position.y = fl + 0.006; c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.4);
      if (c.bounced++ < 2 && c.m.position.distanceTo(camera.position) < 6) tone(rand(3200, 4200), 0.04, 'triangle', 0.03);
      if (Math.abs(c.v.y) < 0.3) { c.v.set(0, 0, 0); c.w.set(0, 0, 0); c.m.rotation.x = Math.PI / 2; }
    }
    if (c.life <= 0) c.m.visible = false;
  }
}

/* --- вид от первого лица --- */
vmScene.add(new THREE.HemisphereLight(0xd8e2ff, 0x40301f, 0.9));
const vmSun = new THREE.DirectionalLight(0xffe2c0, 2.2); vmSun.position.set(1, 2, 1.5); vmScene.add(vmSun);
const vmFill = new THREE.DirectionalLight(0x9fc4ff, 0.8); vmFill.position.set(-2, 0.5, -1); vmScene.add(vmFill);
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
const vmPivot = new THREE.Group(); vmRoot.add(vmPivot);
const vmBase = id => { const c = WEAPONS[id].cat; return c === 'pistol' ? [0.12, -0.145, -0.4] : c === 'knife' ? [0.2, -0.17, -0.38] : c === 'mg' || id === 'garpun' ? [0.2, -0.23, -0.42] : [0.2, -0.215, -0.42]; };
const vmGuns = {};
for (const id of Object.keys(WEAPONS)) {
  const g = GUNS[id].clone(); g.visible = false; vmPivot.add(g);
  const p = gunParts(g);
  const hr = handR.clone(); hr.position.copy(p.grip.position); hr.rotation.x = id === 'knife' ? 0 : 0.28; g.add(hr);
  const hl = handL.clone(); g.add(hl);
  if (isPistolCat(id)) hl.rotation.set(0.3, 0, 0.15); else hl.rotation.set(0.15, 0, -1.25);
  hl.visible = id !== 'knife';
  vmGuns[id] = { g, p, hr, hl };
}
const vmSleeveMat = std({ map: teamMats[0].fabric.map, color: 0x9aa4b0, roughness: 1, envMapIntensity: 0.25 });
const vmArm = [0, 1].map(() => ({ up: seg(0.05, 0.34, vmSleeveMat, vmRoot), fo: seg(0.042, 0.32, vmSleeveMat, vmRoot) }));
const VM_SH = [new THREE.Vector3(-0.24, -0.5, 0.0), new THREE.Vector3(0.24, -0.47, 0.12)];
const vmFlashLight = new THREE.PointLight(0xffb84d, 0, 6); scene.add(vmFlashLight);
const vm = { cur: null, t: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), rp: new THREE.Vector3(), rv: new THREE.Vector3(), flashT: 0, knifeT: -1, knifeSide: 1, pumpT: -1, boltT: -1, slideT: -1, cylA: 0, cylT: 0, hamT: -1, inspectT: -1 };
function vmOnFire(id, W) {
  const heavy = W.recoil >= 0.045;
  vm.v.z += (heavy ? 2.6 : 1.3) * rand(0.9, 1.1); vm.v.y += heavy ? 0.4 : 0.15;
  vm.rv.x += (heavy ? 9 : 4) * rand(0.8, 1.2); vm.rv.z += rand(-1, 1) * (heavy ? 3 : 1.5); vm.rv.y += rand(-1, 1) * 1.2;
  vm.flashT = 0.05; vm.inspectT = -1;
  if (W.act === 'pump') vm.pumpT = 0; if (W.act === 'bolt') vm.boltT = 0; if (W.act === 'slide') vm.slideT = 0;
  if (W.act === 'rev') { vm.cylT += Math.PI / 3; vm.hamT = 0; }
  if (W.act === 'pump' || W.act === 'bolt') setTimeout(() => sfxAct(W.act), W.act === 'pump' ? 250 : 350);
  // гильза
  if (W.act !== 'rev' && W.act !== 'break') {
    const V = vmGuns[id]; V.p.eject.getWorldPosition(_v1);
    _v1.applyMatrix4(camera.matrixWorld);
    _v2.set(1, 0.3, 0.2).applyQuaternion(camera.quaternion);
    if (SET.effects) setTimeout(() => ejectCasing(_v1.clone(), _v2.clone(), _v3.set(P.vel.x, 0, P.vel.z).clone(), W.cat === 'shotgun'), W.act === 'pump' ? 350 : W.act === 'bolt' ? 600 : 0);
  }
}
function vmOnMelee() { vm.knifeT = 0; vm.knifeSide *= -1; vm.inspectT = -1; }
function updateViewmodel(dt) {
  const id = P.alive ? P.gun().id : 'knife', W = WEAPONS[id], V = vmGuns[id], p = V.p;
  if (vm.cur !== id) { vm.cur = id; vm.inspectT = -1; vm.knifeT = -1; vm.pumpT = vm.boltT = vm.slideT = -1; }
  for (const k in vmGuns) vmGuns[k].g.visible = k === id;
  vmRoot.visible = !P.scoped;
  vm.t += dt;
  // пружины отдачи
  vm.v.addScaledVector(vm.p, -260 * dt).multiplyScalar(Math.exp(-17 * dt)); vm.p.addScaledVector(vm.v, dt);
  vm.rv.addScaledVector(vm.rp, -220 * dt).multiplyScalar(Math.exp(-15 * dt)); vm.rp.addScaledVector(vm.rv, dt);
  const base = vmBase(id);
  let px = base[0], py = base[1], pz = base[2], rx = 0, ry = 0, rz = 0;
  const hs = Math.hypot(P.vel.x, P.vel.z), bob = P.onGround && SET.bob ? Math.min(1, hs / 6) : 0;
  px += Math.cos(bobT) * 0.012 * bob; py -= Math.abs(Math.sin(bobT)) * 0.013 * bob; rz += Math.cos(bobT) * 0.02 * bob; rx += Math.abs(Math.sin(bobT)) * 0.01 * bob;
  py += Math.sin(vm.t * 1.7) * 0.0022; rx += Math.sin(vm.t * 1.7) * 0.005; px += Math.sin(vm.t * 0.9) * 0.0012;
  const lx = clamp(lookDX, -80, 80), ly = clamp(lookDY, -80, 80);
  px -= lx * 0.00028; py += ly * 0.00025; ry -= lx * 0.0012; rx -= ly * 0.001; rz -= lx * 0.0008;
  if (P.crouch) { px -= 0.018; py += 0.008; rz += 0.07; }
  // лёжа оружие ниже и устойчивее; на краю, при подъёме и в переходе позы — опущено
  if (P.posture === 2) { py += 0.012 * P.proneK; rz -= 0.04 * P.proneK; }
  const lowT = busyMove(P) ? 1 : (P.proneK > 0.02 && P.proneK < 0.98) ? 0.7 : P.mstate === 'dodge' ? 0.25 : 0;
  vm.low = (vm.low || 0) + (lowT - (vm.low || 0)) * Math.min(1, 10 * dt);
  py -= vm.low * 0.32; rx -= vm.low * 0.9; rz += vm.low * 0.35;
  if (!P.onGround) { py -= clamp(P.vel.y, -7, 7) * 0.0025; rx += clamp(P.vel.y, -7, 7) * 0.008; }
  if (P.switchT > 0) { const e = P.switchT / 0.35; py -= e * e * 0.28; rx -= e * 0.9; rz += e * 0.3; }
  px += vm.p.x * 0.3; py += vm.p.y * 0.3; pz += vm.p.z * 0.3; rx += vm.rp.x * 0.2; ry += vm.rp.y * 0.2; rz += vm.rp.z * 0.2;
  // перезарядка
  const rp = P.reloading > 0 ? 1 - P.reloading / W.reload : -1;
  const lhBase = _v1.copy(p.fore.position);
  let lh = _v2.copy(lhBase), magY = 0, magHide = false;
  if (rp >= 0) {
    const tilt = sm(rp, 0, 0.13) * (1 - sm(rp, 0.86, 1));
    if (W.act === 'rev') { rz -= tilt * 0.9; rx += tilt * 0.4; px -= tilt * 0.05; }
    else if (W.act === 'break') { rx += tilt * 0.5; rz += tilt * 0.3; py += tilt * 0.04; }
    else { rz += tilt * 0.6; rx += tilt * 0.22; py += tilt * 0.01; px -= tilt * 0.03; }
    if (W.act === 'break') {
      const open = sm(rp, 0.08, 0.22) * (1 - sm(rp, 0.78, 0.9));
      p.barrels.rotation.x = -0.55 * open;
      lh.lerp(_v3.copy(p.magDrop.position).add(_v4.set(0, -0.08 + Math.sin(sm(rp, 0.3, 0.7) * Math.PI) * 0.05, 0.03)), sm(rp, 0.2, 0.32) * (1 - sm(rp, 0.7, 0.8)));
    } else if (W.act === 'pump') {
      const cyc = sm(rp, 0.13, 0.85) * 4, f = cyc % 1;
      lh.lerp(_v3.copy(p.magDrop.position).add(_v4.set(0, -0.06 + Math.sin(f * Math.PI) * 0.04, 0.02)), sm(rp, 0.1, 0.18) * (1 - sm(rp, 0.82, 0.9)));
      rx += Math.sin(f * Math.PI) * 0.03 * (rp < 0.85 ? 1 : 0);
    } else if (W.act === 'rev') {
      p.cyl.rotation.z = rp * 18;
      lh.lerp(_v3.copy(p.magDrop.position).add(_v4.set(-0.03, -0.03, 0)), sm(rp, 0.12, 0.3) * (1 - sm(rp, 0.75, 0.9)));
    } else {
      const magPos = _v3.copy(p.magDrop.position);
      magY = -sm(rp, 0.22, 0.36) * 0.35 * (1 - sm(rp, 0.45, 0.62));
      magHide = rp > 0.36 && rp < 0.45;
      const toMag = sm(rp, 0.1, 0.22) * (1 - sm(rp, 0.62, 0.7));
      lh.lerp(magPos.add(_v4.set(0, magY - 0.04, 0.0)), toMag);
      const rack = sm(rp, 0.66, 0.73) * (1 - sm(rp, 0.82, 0.9));
      if (rack > 0) lh.lerp(_v4.copy(p.rack.position).add(_v5.set(W.cat === 'smg' ? -0.03 : 0, 0.0, 0.03 * sm(rp, 0.73, 0.78))), rack);
      if (W.act === 'slide' && p.slide) p.slide.position.z = p.slide.userData.base.z + sm(rp, 0.73, 0.77) * (1 - sm(rp, 0.79, 0.84)) * 0.03;
      if (p.bolt) p.bolt.rotation.z = sm(rp, 0.68, 0.72) * (1 - sm(rp, 0.82, 0.86)), p.bolt.position.z = p.bolt.userData.base.z + sm(rp, 0.72, 0.76) * (1 - sm(rp, 0.78, 0.82)) * 0.08;
    }
  }
  if (p.mag) { p.mag.position.y = p.mag.userData.base.y + magY; p.mag.visible = !magHide; }
  // помпа / затвор / слайд / барабан после выстрела
  if (vm.pumpT >= 0 && p.pump) { vm.pumpT += dt; const e = Math.sin(clamp((vm.pumpT - 0.12) / 0.45, 0, 1) * Math.PI) * 0.09; p.pump.position.z = p.pump.userData.base.z + e; lh.z += e; rx += e * 0.4; if (vm.pumpT > 0.6) vm.pumpT = -1; }
  if (vm.boltT >= 0 && p.bolt) {
    vm.boltT += dt; const b = vm.boltT;
    p.bolt.rotation.z = sm(b, 0.2, 0.32) * (1 - sm(b, 0.75, 0.88)) * 1.1;
    p.bolt.position.z = p.bolt.userData.base.z + sm(b, 0.32, 0.48) * (1 - sm(b, 0.55, 0.72)) * 0.09;
    rz += sm(b, 0.15, 0.3) * (1 - sm(b, 0.8, 1)) * 0.25; if (b > 1.05) vm.boltT = -1;
  }
  if (p.slide && vm.slideT >= 0) { vm.slideT += dt; p.slide.position.z = p.slide.userData.base.z + Math.max(0, 1 - vm.slideT / 0.07) * 0.03; if (vm.slideT > 0.08) vm.slideT = -1; }
  if (p.slide && W.act === 'slide' && P.alive && P.gun().mag === 0 && rp < 0) p.slide.position.z = p.slide.userData.base.z + 0.028;
  if (p.cyl && rp < 0) { vm.cylA += (vm.cylT - vm.cylA) * Math.min(1, dt * 25); p.cyl.rotation.z = vm.cylA; }
  if (p.hammer) { if (vm.hamT >= 0) { vm.hamT += dt; if (vm.hamT > 0.12) vm.hamT = -1; } p.hammer.rotation.x = vm.hamT >= 0 ? -0.1 : (mouseDown ? -0.5 : 0); }
  // нож
  if (id === 'knife' && vm.knifeT >= 0) {
    vm.knifeT += dt; const k = clamp(vm.knifeT / 0.38, 0, 1), sd = vm.knifeSide;
    const sw = Math.sin(k * Math.PI);
    px += (-0.18 * sm(k, 0.1, 0.6) + 0.06 * (1 - sm(k, 0, 0.15))) * sw * 2 * (sd > 0 ? 1 : 0.7);
    py += 0.05 * sw; pz -= 0.08 * sw; ry += sd * 1.1 * sw; rz += sd * 0.9 * sw; rx -= 0.4 * sw;
    if (vm.knifeT > 0.38) vm.knifeT = -1;
  }
  // осмотр оружия (F)
  if (vm.inspectT >= 0) {
    vm.inspectT += dt; const q = vm.inspectT;
    const a1 = sm(q, 0, 0.5) * (1 - sm(q, 1.4, 1.8)), a2 = sm(q, 1.4, 1.8) * (1 - sm(q, 2.3, 2.8));
    ry += -1.0 * a1 + 0.5 * a2; rz += 0.55 * a1 - 0.9 * a2; px -= 0.06 * a1 - 0.04 * a2; py += 0.03 * a1 + 0.05 * a2; rx += 0.15 * a2;
    if (q > 2.8) vm.inspectT = -1;
  }
  vmPivot.position.set(px, py, pz); vmPivot.rotation.set(rx, ry, rz, 'YXZ');
  V.hl.position.copy(lh);
  // вспышка
  if (vm.flashT > 0) { vm.flashT -= dt; p.flash.visible = true; p.flash.rotation.z = Math.random() * 6; p.flash.scale.setScalar(rand(0.8, 1.3)); } else p.flash.visible = false;
  vmFlashLight.intensity = Math.max(0, vmFlashLight.intensity - dt * 120);
  // руки-рукава (IK от плеч к кистям)
  vmRoot.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const A = vmArm[i], h = i ? V.hr : V.hl;
    const show = i === 1 || h.visible; A.up.visible = A.fo.visible = show; if (!show) continue;
    const wrist = h.localToWorld(_v3.set(i ? 0.012 : -0.012, -0.04, 0.06));
    const el = ik(VM_SH[i], wrist, 0.34, 0.32, _v4.set(i ? 0.8 : -0.8, -1, 0.2), _v5);
    placeSeg(A.up, VM_SH[i], el, 0.34); placeSeg(A.fo, el, wrist, 0.32);
  }
}

