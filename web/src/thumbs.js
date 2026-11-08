// Spawn-menu previews: each prop is rendered in 3D by the game itself (no image files).
import * as THREE from 'three';
import { G } from './state.js';
import { buildDefVisual } from './entities.js';

const cache = new Map();
let scene = null, cam = null;
const SIZE = 192;
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

function setup() {
  scene = new THREE.Scene();
  scene.environment = G.scene.environment;
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight(0xdde8ff, 0x403830, 0.6));
  cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
}

export function thumbnail(type) {
  if (cache.has(type)) return cache.get(type);
  const def = G.propDefs.get(type);
  if (!def || !G.renderer) return BLANK;
  if (!scene) setup();
  const r = G.renderer;
  const obj = buildDefVisual(def);
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = new THREE.Vector3(1, 0.75, 1.5).normalize();
  cam.position.copy(sphere.center).addScaledVector(dir, sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05);
  cam.lookAt(sphere.center);

  const pr = r.getPixelRatio();
  const cssSize = SIZE / pr;
  const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
  r.setRenderTarget(null);
  r.setScissorTest(true);
  r.setViewport(0, 0, cssSize, cssSize);
  r.setScissor(0, 0, cssSize, cssSize);
  r.setClearColor(0x22303d, 1);
  r.clear();
  r.render(scene, cam);
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const dom = r.domElement;
  c.getContext('2d').drawImage(dom, 0, dom.height - SIZE, SIZE, SIZE, 0, 0, SIZE, SIZE);
  r.setScissorTest(false);
  const size = r.getSize(new THREE.Vector2());
  r.setViewport(0, 0, size.x, size.y);
  r.setClearColor(prevClear, prevAlpha);
  scene.remove(obj);
  const url = c.toDataURL('image/jpeg', 0.85);
  cache.set(type, url);
  return url;
}
