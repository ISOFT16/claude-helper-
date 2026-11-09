// Player's own sounds: every game event has a slot; a file chosen on the device replaces the
// built-in synthesized sound. Files are kept only on this device (IndexedDB), never in the game files.

export const SOUND_SLOTS = [
  ['ui', 'Кнопки меню'],
  ['select', 'Выбор предмета или инструмента в меню'],
  ['weapon', 'Смена оружия'],
  ['denied', 'Отказ («нельзя», неверный PIN)'],
  ['warning', 'Предупреждение (только хост, потеря связи, очистка карты)'],
  ['impact', 'Попадание пули'],
  ['shoot', 'Выстрел бластера'],
  ['boom', 'Взрыв'],
  ['zap', 'Тулган'],
  ['grab', 'Физпушка: захват'],
  ['drop', 'Физпушка: отпустить'],
  ['spawn', 'Появление предмета'],
  ['pop', 'Хлопок (удаление, лопнувший шарик)'],
];

const DB = 'sandforge-sounds', STORE = 'sounds';
const buffers = new Map();   // slot -> AudioBuffer
const names = new Map();     // slot -> file name
let getCtx = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  });
}

async function decode(data) {
  const ctx = getCtx();
  return ctx.decodeAudioData(data.slice(0));
}

// ctxGetter returns the game's AudioContext (it may still be suspended; decoding works anyway)
export async function initSounds(ctxGetter) {
  getCtx = ctxGetter;
  let all = [];
  try {
    const db = await openDb();
    all = await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  } catch (e) { return; }
  for (const rec of all) {
    try { buffers.set(rec.slot, await decode(rec.data)); names.set(rec.slot, rec.name); } catch (e) { console.warn('sound', rec.slot, e); }
  }
}

export function customBuffer(slot) { return buffers.get(slot) || null; }
export function soundName(slot) { return names.get(slot) || null; }

export async function setSoundFile(slot, file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Файл больше 8 МБ');
  const data = await file.arrayBuffer();
  let buf;
  try { buf = await decode(data); } catch (e) { throw new Error('Не удалось прочитать звук (подходят mp3, wav, ogg)'); }
  if (buf.duration > 20) throw new Error('Звук длиннее 20 секунд');
  await tx('readwrite', s => s.put({ slot, name: file.name, data }));
  buffers.set(slot, buf);
  names.set(slot, file.name);
}

export async function clearSound(slot) {
  await tx('readwrite', s => s.delete(slot));
  buffers.delete(slot);
  names.delete(slot);
}
