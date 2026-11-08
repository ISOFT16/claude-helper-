// Player's own 3D models (.glb / .gltf binary) loaded from the device.
// Files are stored only on this device (IndexedDB) and are never bundled with the game.
// Each model becomes a spawnable "NPC without AI": it stands upright, can be pushed and carried.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { G } from './state.js';
import { MODELS } from './models.js';
import { registerProp } from './entities.js';

const DB = 'sandforge', STORE = 'models';
const templates = new Map(); // id -> { scene, size: Vector3, center: Vector3, scale }
export const customList = [];  // { id, name, height }

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
async function dbPut(rec) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

function parseGlb(buffer) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, (e) => {
    const msg = String(e && e.message || e);
    reject(new Error(/draco/i.test(msg) ? 'Модель сжата Draco — такой формат не поддерживается. Сохраните её без Draco-сжатия.' : msg));
  }));
}

// Register a parsed model as a spawnable prop
function addTemplate(rec, gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  if (!isFinite(size.y) || size.y <= 0) throw new Error('В файле нет видимой модели');
  const scale = rec.height > 0 ? rec.height / size.y : 1;
  const center = box.getCenter(new THREE.Vector3());
  scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  templates.set(rec.id, { scene, size, center, scale });

  const modelKey = 'custom_' + rec.id;
  MODELS[modelKey] = () => {
    const t = templates.get(rec.id);
    const obj = cloneSkinned(t.scene);
    obj.scale.setScalar(t.scale);
    // centre the model on the physics box
    obj.position.set(-t.center.x * t.scale, -t.center.y * t.scale, -t.center.z * t.scale);
    const g = new THREE.Group();
    g.add(obj);
    return g;
  };
  const s = size.clone().multiplyScalar(scale);
  const half = new THREE.Vector3(Math.max(0.1, s.x), Math.max(0.1, s.y), Math.max(0.1, s.z));
  registerProp(modelKey, {
    name: rec.name, category: 'Свои модели', fixedRotation: true, damping: 0.3,
    parts: [{ mass: Math.min(200, Math.max(5, half.x * half.y * half.z * 150)), model: modelKey, shapes: [{ type: 'box', size: [half.x, half.y, half.z], hidden: true }] }],
  });
  if (!customList.find(m => m.id === rec.id)) customList.push({ id: rec.id, name: rec.name, height: rec.height });
}

// Load everything saved on this device (called once at start)
export async function loadCustomModels() {
  let all = [];
  try { all = await dbAll(); } catch (e) { return; }
  for (const rec of all) {
    try { addTemplate(rec, await parseGlb(rec.data)); } catch (e) { console.warn('custom model', rec.name, e); }
  }
}

// Add a model file picked by the player. height: metres (0 = keep original size)
export async function importModelFile(file, height) {
  if (file.size > 60 * 1024 * 1024) throw new Error('Файл больше 60 МБ');
  const data = await file.arrayBuffer();
  const gltf = await parseGlb(data);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const name = file.name.replace(/\.(glb|gltf)$/i, '').slice(0, 40) || 'Модель';
  const rec = { id, name, height: Number(height) || 0, data };
  addTemplate(rec, gltf);
  await dbPut(rec);
  return rec;
}

export async function deleteCustomModel(id) {
  await dbDelete(id);
  const i = customList.findIndex(m => m.id === id);
  if (i >= 0) customList.splice(i, 1);
  const key = 'custom_' + id;
  for (const ent of [...G.ents.values()]) if (ent.type === key) G.api.remove(ent.id);
  G.propDefs.delete(key);
  templates.delete(id);
}
