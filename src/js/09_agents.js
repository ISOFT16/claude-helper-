/* ================= agents ================= */
// имена ботов: [кириллица, латиница] по индексу бойца (0–4 — «Вектор», 5–9 — «Ржавчина»)
const NAMES = [['Вы', 'Сыч', 'Крот', 'Грач', 'Кедр', 'Шмель', 'Ёрш', 'Вяз', 'Жук', 'Клык'], ['You', 'Sych', 'Krot', 'Grach', 'Kedr', 'Shmel', 'Yorsh', 'Vyaz', 'Zhuk', 'Klyk']];
const DIFF = [
  { react: [0.55, 0.9], err: 0.06, turn: 4, label: 'Новобранцы' },
  { react: [0.32, 0.55], err: 0.038, turn: 6.5, label: 'Бойцы' },
  { react: [0.18, 0.32], err: 0.022, turn: 10, label: 'Ветераны' },
];
let diff = DIFF[SET.diff] || DIFF[1];
class Agent {
  constructor(team, name, isPlayer) {
    Object.assign(this, { team, name, isPlayer, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, hp: 100, armor: 0, alive: true, kills: 0, deaths: 0, money: 800, onGround: true, crouch: false, eye: 1.62 });
    this.inv = { 1: null, 2: newGun('osa'), 3: { id: 'knife' } }; this.slot = 2; this.lastSlot = 3; this.gren = { he: 0, smoke: 0, flash: 0 }; this.nadeSel = 'he'; this.blindT = 0; this.burstLeft = 0;
    this.fireCd = 0; this.reloading = 0; this.spreadAcc = 0; this.punchP = 0; this.punchY = 0; this.switchT = 0;
    this.spot = [0, 0]; this.lastHitBy = null; this.tp = 0; this.net = isPlayer ? 'local' : 'bot';
    this.rig = makeSoldier(team); this.model = this.rig.root; this.ai = {};
    applyCos(this, isPlayer ? myCos() : randomCos());
  }
  height() { return this.crouch ? 1.2 : 1.8; }
  gun() { return this.inv[this.slot]; }
  w() { return WEAPONS[this.gun().id]; }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.isPlayer ? this.eye : this.crouch ? 1.05 : 1.62), this.pos.z); }
  forward(out = new THREE.Vector3(), yaw = this.yaw, pitch = this.pitch) { const cp = Math.cos(pitch); return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp); }
}
const agents = [];
for (let tm = 0; tm < 2; tm++) for (let i = 0; i < 5; i++) agents.push(new Agent(tm, NAMES[LANG === 'ru' || LANG === 'uk' ? 0 : 1][tm * 5 + i], tm === 0 && i === 0));
let P = agents[0];

