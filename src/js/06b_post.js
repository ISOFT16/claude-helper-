/* ================= постобработка ================= */
// Цепочка: сцена (MSAA при включённом сглаживании) → AO (только «Ультра») → умеренное свечение →
// тональная компрессия ACES и экспозиция (OutputPass) → цветокоррекция с лёгкой виньеткой → FXAA, если MSAA выключен.
// Низкое качество обходится без постобработки вовсе: рисуем напрямую, как раньше.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.08 }, contrast: { value: 1.05 }, vign: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vign; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      // раздельное тонирование: прохладные тени, тёплые света
      col += mix(vec3(-0.008, 0.0, 0.02), vec3(0.018, 0.008, -0.012), smoothstep(0.15, 0.85, l));
      vec2 d = vUv - 0.5; col *= 1.0 - vign * dot(d, d) * 1.4;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
const POST = { composer: null, bloom: null, ao: null, fxaa: null, key: '' };
const postWanted = () => !!(SET.grading || effBloom() || effAO());
// AO считается только по статичной геометрии (слой 1): иначе он заново рисует всех бойцов
// и удваивает число вызовов отрисовки (замер v8: 492 → 888)
const aoCam = new THREE.PerspectiveCamera();
function buildPost() {
  const key = [SET.grading, effBloom(), effAO(), SET.antialias, renderer.getPixelRatio()].join('|');
  if (key === POST.key) { resizePost(); return; }
  POST.key = key;
  if (POST.composer) { POST.composer.renderTarget1.dispose(); POST.composer.renderTarget2.dispose(); POST.ao && POST.ao.dispose && POST.ao.dispose(); }
  POST.composer = POST.bloom = POST.ao = POST.fxaa = null;
  if (!postWanted()) return;
  const gl2 = renderer.capabilities.isWebGL2;
  // MSAA: 4 выборки при обычной плотности, 2 — при высокой (там зубцы и так мельче)
  const msaa = SET.antialias && gl2 ? (renderer.getPixelRatio() <= 1.25 ? 4 : 2) : 0;
  const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: msaa });
  const c = new EffectComposer(renderer, rt);
  c.addPass(new RenderPass(scene, camera));
  if (effAO()) {
    // AO в половинном разрешении: мягкое контактное затенение в углах и под объектами
    POST.ao = new GTAOPass(scene, aoCam, innerWidth / 2, innerHeight / 2);
    POST.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 });
    POST.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    POST.ao.blendIntensity = 0.75; c.addPass(POST.ao);
  }
  if (effBloom()) { POST.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.35, 0.9); c.addPass(POST.bloom); }
  c.addPass(new OutputPass());
  if (SET.grading) c.addPass(new ShaderPass(GradeShader));
  if (!SET.antialias || !gl2) { POST.fxaa = new ShaderPass(FXAAShader); c.addPass(POST.fxaa); }
  POST.composer = c; resizePost();
}
function resizePost() {
  if (!POST.composer) return;
  const pr = renderer.getPixelRatio();
  POST.composer.setPixelRatio(pr); POST.composer.setSize(innerWidth, innerHeight);
  if (POST.ao) POST.ao.setSize(innerWidth * pr / 2, innerHeight * pr / 2);
  if (POST.fxaa) POST.fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
}
addEventListener('resize', resizePost);
function renderWorld() {
  if (POST.ao) { aoCam.copy(camera); aoCam.layers.set(1); }
  if (POST.composer) POST.composer.render();
  else { renderer.clear(); renderer.render(scene, camera); }
}
bootMark('06b_post');
