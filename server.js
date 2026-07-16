// 메챠몽 서버 — 의존성 없는 순수 Node (정적 파일 + WebSocket RFC6455 직접 구현)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
};

const ROUTES = { '/': 'landing.html', '/play': 'index.html' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(PUBLIC_DIR, ROUTES[urlPath] || urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- WebSocket (RFC6455) ----------
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(str, opcode = 1) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  handleClient(socket);
});

// ---------- 게임 상태 ----------
const MAX_STROKES = 50000;
const MAX_PLAYERS = 30;
let nextId = 1;
const players = new Map(); // id -> { id, x, z, room, strokes }
const sockets = new Map(); // id -> socket
const waiting = []; // 대기열 소켓 (선착순)

function sendTo(socket, obj) {
  if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(obj)));
}

function broadcast(exceptId, obj) {
  const frame = encodeFrame(JSON.stringify(obj));
  for (const [pid, s] of sockets) {
    if (pid !== exceptId && !s.destroyed) s.write(frame);
  }
}

// ---------- 게임 상태머신 ----------
// lobby → headstart(60s) → play(240s) → reveal(30s) → lobby
const T_HEAD = +process.env.T_HEAD || 60;
const T_PLAY = +process.env.T_PLAY || 240;
const T_REVEAL = +process.env.T_REVEAL || 30;
const T_END = +process.env.T_END || 50; // 라운드 종료 후 로비 복귀까지
let phase = 'lobby';
let phaseTimers = [];

function clearPhaseTimers() {
  phaseTimers.forEach(clearTimeout);
  phaseTimers = [];
}

function broadcastAll(obj) {
  broadcast(0, obj);
}

function tryStart() {
  if (phase !== 'lobby' || players.size === 0) return;
  const ps = [...players.values()];
  const hiders = ps.filter((p) => p.role === 'hider').length;
  if (!hiders || hiders === ps.length) return; // 양쪽 역할 최소 1명
  if (!ps.every((p) => p.ready)) return;
  startGame();
}

function startGame() {
  phase = 'headstart';
  console.log('game started');
  const roles = {};
  const rooms = {};
  for (const p of players.values()) {
    p.caught = false;
    roles[p.id] = p.role;
    if (p.role === 'hider') {
      p.room = Math.floor(Math.random() * 3);
      rooms[p.id] = p.room;
    }
  }
  broadcastAll({ t: 'game-start', roles, rooms, headstart: T_HEAD });
  phaseTimers.push(setTimeout(() => {
    phase = 'play';
    const frooms = {};
    for (const p of players.values()) {
      if (p.role === 'finder') {
        p.room = Math.floor(Math.random() * 3);
        frooms[p.id] = p.room;
      }
    }
    broadcastAll({ t: 'play-start', rooms: frooms, playTime: T_PLAY });
    phaseTimers.push(setTimeout(() => {
      phase = 'reveal'; // hider 생존
      broadcastAll({ t: 'reveal', duration: T_REVEAL });
      phaseTimers.push(setTimeout(() => endRound('hider'), T_REVEAL * 1000));
    }, T_PLAY * 1000));
  }, T_HEAD * 1000));
}

function endRound(result, sur = false) {
  clearPhaseTimers();
  phase = 'ending';
  console.log(`round ended: ${result} win${sur ? ' (surrender)' : ''}`);
  broadcastAll({ t: 'round-end', result, sur: sur ? 1 : 0, stay: T_END });
  // 셀레브레이션 동안 ending 유지 후 로비 복귀
  phaseTimers.push(setTimeout(() => resetLobby(), T_END * 1000 + 300));
}

function resetLobby() {
  clearPhaseTimers();
  phase = 'lobby';
  for (const p of players.values()) {
    p.ready = 0;
    p.caught = false;
    p.room = -1;
    p.strokes = []; // 라운드 종료 — 색칠 초기화
  }
  while (players.size < MAX_PLAYERS && waiting.length) {
    const s = waiting.shift();
    if (!s.destroyed) activate(s);
  }
  sendWaitUpdates();
}

function checkAbort() {
  if (phase === 'lobby' || phase === 'ending') return;
  const ps = [...players.values()];
  const hiders = ps.filter((p) => p.role === 'hider').length;
  if (ps.length === 0 || hiders === 0 || hiders === ps.length) {
    console.log('game aborted (role count reached 0)');
    clearPhaseTimers();
    phase = 'lobby';
    for (const p of players.values()) {
      p.ready = 0;
      p.caught = false;
      p.room = -1;
    }
    broadcastAll({ t: 'abort' });
  }
}

function sendWaitUpdates() {
  if (phase !== 'lobby') {
    waiting.forEach((s) => sendTo(s, { t: 'in-progress' }));
  } else {
    waiting.forEach((s, i) => sendTo(s, { t: 'wait', pos: i + 1, total: waiting.length }));
  }
}

function activate(socket, force = false) {
  const id = nextId++;
  socket._pid = id;
  const player = {
    id, x: 0, z: 0, room: -1, f: 'down', mv: 0, d: 0,
    name: socket._name || '', role: socket._role || 'finder',
    ready: 0, caught: false, force, strokes: [],
  };
  players.set(id, player);
  sockets.set(id, socket);
  console.log(`player ${id} joined${force ? ' (FORCE)' : ''} (${players.size} online, ${waiting.length} waiting)`);
  sendTo(socket, { t: 'init', id, players: [...players.values()].filter((p) => p.id !== id) });
  broadcast(id, { t: 'player-join', player });
}

function handleClient(socket) {
  socket._pid = null;
  let buf = Buffer.alloc(0);
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    const id = socket._pid;
    if (id !== null && players.has(id)) {
      players.delete(id);
      sockets.delete(id);
      broadcast(id, { t: 'player-leave', id });
      console.log(`player ${id} left (${players.size} online)`);
      checkAbort(); // 게임 중 역할 한쪽이 0명이 되면 즉시 종료
      // 빈 슬롯에 대기열 선두 승격 (게임 중엔 승격 안 함)
      if (phase === 'lobby') {
        while (players.size < MAX_PLAYERS && waiting.length) {
          const next = waiting.shift();
          if (!next.destroyed) activate(next);
        }
        tryStart(); // 준비 안 한 사람이 나가서 조건이 충족될 수도 있음
      }
      sendWaitUpdates();
    } else {
      const i = waiting.indexOf(socket);
      if (i >= 0) {
        waiting.splice(i, 1);
        sendWaitUpdates();
      }
    }
  };

  socket.on('data', (chunk) => {
    socket._lastSeen = Date.now();
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) break;
      const opcode = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) break;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) break;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      let maskKey = null;
      if (masked) {
        if (buf.length < off + 4) break;
        maskKey = buf.subarray(off, off + 4);
        off += 4;
      }
      if (buf.length < off + len) break;
      const payload = Buffer.from(buf.subarray(off, off + len));
      buf = buf.subarray(off + len);
      if (maskKey) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];

      if (opcode === 8) { // close
        socket.end(encodeFrame('', 8));
        cleanup();
        return;
      }
      if (opcode === 9) { // ping → pong
        socket.write(encodeFrame(payload.toString(), 10));
        continue;
      }
      if (opcode === 1) routeMessage(socket, payload.toString('utf8'));
    }
  });

  socket._lastSeen = Date.now();
  socket.on('close', cleanup);
  socket.on('error', cleanup);

  if (phase !== 'lobby') {
    // 게임 진행 중 — 입장 불가, 라운드 끝나면 자동 입장
    waiting.push(socket);
    sendTo(socket, { t: 'in-progress' });
    console.log(`blocked: game in progress (${waiting.length} waiting)`);
  } else if (players.size < MAX_PLAYERS) {
    activate(socket);
  } else {
    waiting.push(socket);
    console.log(`waitlisted (${waiting.length} waiting)`);
    sendWaitUpdates();
  }
}

function routeMessage(socket, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.t === 'hello') {
    socket._name = String(msg.name || '').slice(0, 16);
    socket._role = msg.role === 'hider' ? 'hider' : 'finder';
    const p = socket._pid !== null ? players.get(socket._pid) : null;
    if (p) {
      p.name = socket._name;
      p.role = socket._role;
    }
    return;
  }
  if (msg.t === 'force-join') {
    // 시크릿 입장: 정원과 별개로 오버플로우 슬롯 최대 2명 (게임 중엔 불가)
    if (socket._pid !== null || phase !== 'lobby') return;
    const i = waiting.indexOf(socket);
    if (i < 0) return;
    const forceCount = [...players.values()].filter((p) => p.force).length;
    if (players.size < MAX_PLAYERS || forceCount < 2) {
      waiting.splice(i, 1);
      activate(socket, players.size >= MAX_PLAYERS);
      sendWaitUpdates();
    } else {
      sendTo(socket, { t: 'force-denied' });
    }
    return;
  }
  if (socket._pid !== null) handleMessage(socket._pid, msg);
}

// 하트비트: 10초마다 ping, 30초 무응답 소켓은 정리 (대기열 포함, 유령 방지)
setInterval(() => {
  const now = Date.now();
  for (const s of [...sockets.values(), ...waiting]) {
    if (now - (s._lastSeen || 0) > 30000) s.destroy();
    else if (!s.destroyed) s.write(encodeFrame('', 9));
  }
}, 10000);

function handleMessage(id, msg) {
  const p = players.get(id);
  if (!p) return;

  if (msg.t === 'move') {
    p.x = +msg.x || 0;
    p.z = +msg.z || 0;
    p.room = msg.room | 0;
    p.f = typeof msg.f === 'string' ? msg.f.slice(0, 8) : p.f;
    p.mv = msg.mv ? 1 : 0;
    p.d = msg.d ? 1 : 0;
    broadcast(id, { t: 'player-update', id, x: p.x, z: p.z, room: p.room, f: p.f, mv: p.mv, d: p.d });
  } else if (msg.t === 'paint' && Array.isArray(msg.strokes)) {
    const strokes = msg.strokes.slice(0, 500);
    p.strokes.push(...strokes);
    if (p.strokes.length > MAX_STROKES) p.strokes.splice(0, p.strokes.length - MAX_STROKES);
    broadcast(id, { t: 'paint', id, strokes });
  } else if (msg.t === 'clear') {
    p.strokes = [];
    broadcast(id, { t: 'clear', id });
  } else if (msg.t === 'ready') {
    if (phase !== 'lobby') return;
    p.ready = msg.on ? 1 : 0;
    console.log(`player ${id} ready=${p.ready} (${[...players.values()].filter((q) => q.ready).length}/${players.size})`);
    tryStart();
  } else if (msg.t === 'shoot') {
    if (phase !== 'play' || p.role !== 'finder' || p.caught) return;
    broadcast(id, {
      t: 'shoot', id,
      x: +msg.x || 0, z: +msg.z || 0,
      dx: +msg.dx || 0, dz: +msg.dz || 0,
      room: msg.room | 0,
    });
  } else if (msg.t === 'chat') {
    const text = String(msg.text || '').trim().slice(0, 120);
    if (!text) return;
    if (text === '/gg.gg') {
      // 항복: 친 놈이 진 걸로 라운드 종료
      if (phase !== 'headstart' && phase !== 'play') return;
      broadcastAll({ t: 'chat', sys: 1, text: `${p.name || 'player ' + id} surrendered` });
      endRound(p.role === 'hider' ? 'finder' : 'hider', true);
      return;
    }
    broadcastAll({ t: 'chat', id, name: p.name || `player ${id}`, text });
  } else if (msg.t === 'tag') {
    if (phase !== 'play' || p.role !== 'finder') return;
    const target = players.get(msg.id | 0);
    if (!target || target.role !== 'hider' || target.caught) return;
    target.caught = true;
    console.log(`hider ${target.id} caught`);
    broadcastAll({ t: 'caught', id: target.id });
    const hiders = [...players.values()].filter((q) => q.role === 'hider');
    if (hiders.every((q) => q.caught)) endRound('finder');
  }
}

server.listen(PORT, () => {
  console.log(`Mechamon server running: http://localhost:${PORT}`);
});
