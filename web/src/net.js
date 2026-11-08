// Multiplayer over WebRTC (PeerJS). The host runs physics; clients send inputs/actions.
import { Peer } from 'peerjs';
import { G } from './state.js';

const PREFIX = 'sandforge-room-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

  host() {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.code = randomCode();
      const peer = new Peer(PREFIX + this.code, peerOptions());
      this.peer = peer;
      const timer = setTimeout(() => reject(new Error('Сервер связи не отвечает. Проверьте интернет.')), 15000);
      peer.on('open', () => { clearTimeout(timer); resolve(this.code); });
      peer.on('error', (e) => {
        clearTimeout(timer);
        if (e.type === 'unavailable-id') { peer.destroy(); this.host().then(resolve, reject); return; }
        if (e.type === 'peer-unavailable') return;
        this.h.onError?.(e);
        reject(e);
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
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.code = code.toUpperCase().trim();
      const peer = new Peer(peerOptions());
      this.peer = peer;
      const timer = setTimeout(() => reject(new Error('Не удалось подключиться. Проверьте код комнаты.')), 20000);
      peer.on('error', (e) => {
        clearTimeout(timer);
        reject(new Error(e.type === 'peer-unavailable' ? 'Комната не найдена. Проверьте код.' : 'Ошибка сети: ' + e.type));
      });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        conn.on('open', () => { clearTimeout(timer); resolve(peer.id); });
        conn.on('data', (d) => this.h.onData('host', d));
        conn.on('close', () => this.h.onDisconnect?.());
        conn.on('error', () => this.h.onDisconnect?.());
      });
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
    try { this.peer?.destroy(); } catch (e) { /* ignore */ }
    this.conns.clear();
    this.hostConn = null;
  }
}
