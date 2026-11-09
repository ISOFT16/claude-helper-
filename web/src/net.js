// Multiplayer over WebRTC (PeerJS). The host runs physics; clients send inputs/actions.
import { Peer } from 'peerjs';
import { G } from './state.js';

const PREFIX = 'sandforge-room-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Room codes use Latin letters and digits. People often type them on a Russian layout, where
// К/М/Р/С/Х/... look identical but are different letters: convert those to Latin.
const LOOKALIKE = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y', 'З': '3', 'Ё': 'E', 'О': 'Q', 'Г': 'G', 'Д': 'D', 'Л': 'L', 'П': 'N', 'Ф': 'F', 'Ж': 'J', 'Ш': 'W', 'Б': '6' };
export function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/[А-ЯЁ]/g, ch => LOOKALIKE[ch] || ch);
}

export function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function peerOptions() {
  const opts = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
    },
  };
  // Optional own PeerJS server: "host:port/path" (for LAN parties or self-hosting)
  const custom = (G.settings.peerServer || '').trim();
  if (custom) {
    const m = custom.match(/^(?:(https?):\/\/)?([^:/]+)(?::(\d+))?(\/.*)?$/);
    if (m) {
      opts.host = m[2];
      opts.port = Number(m[3] || (m[1] === 'http' ? 80 : 443));
      opts.path = m[4] || '/';
      opts.secure = m[1] ? m[1] === 'https' : opts.port === 443;
    }
  }
  return opts;
}

export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conns = new Map(); // host: peerId -> conn
    this.hostConn = null;   // client: connection to host
    this.isHost = false;
    this.code = '';
  }

  // ----- host: registers the room code on the signalling server and keeps it registered -----
  host() {
    this.isHost = true;
    this.code = randomCode();
    // The same secret token on every (re)registration lets the signalling server hand the room code
    // straight back to us after a dropped connection, instead of refusing it as "taken" for a minute.
    this.token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => this._hostPeer(resolve, reject));
  }

  _hostPeer(resolve, reject) {
    const peer = new Peer(PREFIX + this.code, { ...peerOptions(), token: this.token });
    this.peer = peer;
    let opened = false;
    const first = !!resolve;
    const timer = setTimeout(() => { if (!opened && first && reject) { peer.destroy(); reject(new Error('Сервер связи не отвечает. Проверьте интернет.')); resolve = reject = null; } }, 15000);
    // When the server still remembers our registration it takes us back silently (no "open" message),
    // and the room is reachable again: treat a quiet re-registration as success.
    if (!first) setTimeout(() => this._assumeOnline(peer, () => { opened = true; }), 3000);
    peer.on('open', () => {
      opened = true; clearTimeout(timer);
      this._retry = 0;
      this._status('online');
      if (resolve) { resolve(this.code); resolve = reject = null; }
    });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') return;
      if (peer !== this.peer && !reject) return;
      if (!opened && e.type === 'unavailable-id') {
        if (reject) { // first start: the random code is taken, pick another one
          clearTimeout(timer); peer.destroy();
          this.code = randomCode();
          this._hostPeer(resolve, reject);
        } else this._rehost();     // re-registering: the old registration has not expired yet
        return;
      }
      if (!opened && reject) { clearTimeout(timer); reject(e); resolve = reject = null; return; }
      if (peer !== this.peer) return;
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) this._rehost();
      this.h.onError?.(e);
    });
    peer.on('disconnected', () => {
      // lost the signalling server (e.g. the app was in the background): get the room back
      if (this.closed || peer !== this.peer || peer.destroyed) return;   // ignore peers we replaced ourselves
      this._status('reconnecting');
      try { peer.reconnect(); setTimeout(() => this._assumeOnline(peer), 3000); } catch (err) { this._rehost(); }
      clearTimeout(this._rt);
      this._rt = setTimeout(() => { if (!this.closed && peer === this.peer && peer.disconnected && !peer.destroyed) this._rehost(); }, 6000);
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        this.h.onJoin(conn.peer);
      });
      conn.on('data', (d) => this.h.onData(conn.peer, d));
      const gone = () => {
        if (this.conns.has(conn.peer)) { this.conns.delete(conn.peer); this.h.onLeave(conn.peer); }
      };
      conn.on('close', gone);
      conn.on('error', gone);
    });
  }

  _rehost() {
    if (this.closed || this._rehosting) return;
    this._rehosting = true;
    this._status('reconnecting');
    const delay = Math.min(10000, 1000 * (this._retry = (this._retry || 0) + 1));
    setTimeout(() => {
      this._rehosting = false;
      if (this.closed) return;
      const old = this.peer;
      this.peer = null;                 // mark as replaced before destroying, so its events are ignored
      try { old?.destroy(); } catch (e) { /* ignore */ }
      this._hostPeer(null, null);   // same room code; players already connected stay connected
    }, delay);
  }

  // Called when the app returns to the foreground
  wake() {
    if (!this.isHost || this.closed || !this.peer) return;
    if (this.peer.destroyed) this._rehost();
    else if (this.peer.disconnected) { this._status('reconnecting'); const p = this.peer; try { p.reconnect(); setTimeout(() => this._assumeOnline(p), 3000); } catch (e) { this._rehost(); } }
  }

  _assumeOnline(peer, mark) {
    if (this.closed || peer !== this.peer || peer.destroyed || peer.disconnected || this.status === 'online') return;
    mark?.();
    this._retry = 0;
    this._status('online');
  }

  _status(s) { this.status = s; this.h.onStatus?.(s); }

  // ----- client: joins a room by code, with a few retries -----
  join(code) {
    this.isHost = false;
    this.code = normalizeCode(code);
    if (!/^[A-Z2-9]{5}$/.test(this.code)) return Promise.reject(new Error('Код комнаты — 5 символов: латинские буквы и цифры 2–9.'));
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let tries = 0, done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Не удалось подключиться за 35 секунд. Проверьте интернет и попросите хоста не сворачивать игру.'), 35000);
      let attemptTimer = 0;
      const attempt = () => {
        if (done) return;
        tries++;
        this.h.onStatus?.(`attempt:${tries}`);
        const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        // a handshake that went nowhere (e.g. the room was re-registering at that moment): start a fresh one
        clearTimeout(attemptTimer);
        attemptTimer = setTimeout(() => {
          if (done || conn.open) return;
          try { conn.close(); } catch (e) { /* ignore */ }
          if (tries < 5) attempt();
        }, 6500);
        conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); clearTimeout(attemptTimer); resolve(peer.id); });
        conn.on('data', (d) => this.h.onData('host', d));
        conn.on('close', () => { if (done) this.h.onDisconnect?.(); });
        conn.on('error', () => { if (done) this.h.onDisconnect?.(); });
      };
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') {
          // the room may be re-registering (host app was in the background): try again
          clearTimeout(attemptTimer);
          if (tries < 3) { setTimeout(attempt, 1500); return; }
          fail(`Комната ${this.code} не найдена. Проверьте код. Хост должен держать игру открытой: если он свернул её, комната пропадает на время.`);
          return;
        }
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) fail('Нет связи с сервером связи. Проверьте интернет.');
        else if (!done) fail('Ошибка сети: ' + e.type);
      });
      peer.on('open', attempt);
    });
  }

  get myId() { return this.peer ? this.peer.id : 'local'; }

  broadcast(msg, except) {
    if (!this.isHost) return;
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg);
  }
  sendTo(id, msg) {
    const c = this.conns.get(id);
    if (c && c.open) c.send(msg);
  }
  sendToHost(msg) {
    if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }
  kick(id) {
    const c = this.conns.get(id);
    if (c) c.close();
  }
  close() {
    this.closed = true;
    clearTimeout(this._rt);
    try { this.peer?.destroy(); } catch (e) { /* ignore */ }
    this.conns.clear();
    this.hostConn = null;
  }
}
