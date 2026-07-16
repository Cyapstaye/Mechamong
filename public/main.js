import * as THREE from 'three';

// ---------- 방 / 문 설정 ----------
// u, v: 맵 이미지 기준 정규화 좌표 (0~1, v는 이미지 위쪽이 0)
// to: { room, door } — 목적지 방의 문 인덱스
const MAP_SIZE = 40;
const DOOR_RADIUS = 2.6;

const ROOMS = [
  {
    name: 'REACTOR',
    map: 'maps/room0.png',
    doors: [
      { u: 0.5, v: 0.945, to: { room: 2, door: 0 } }, // 아래문 → 온실 위문
      { u: 0.94, v: 0.5, to: { room: 1, door: 0 } },  // 오른쪽문 → 브릿지 왼쪽문
    ],
  },
  {
    name: 'BRIDGE',
    map: 'maps/room1.png',
    doors: [
      { u: 0.065, v: 0.49, to: { room: 0, door: 1 } }, // 왼쪽문 → 리액터 오른쪽문
      { u: 0.5, v: 0.94, to: { room: 2, door: 1 } },   // 아래문 → 온실 왼쪽문
    ],
  },
  {
    name: 'GREENHOUSE',
    map: 'maps/room2.png',
    doors: [
      { u: 0.49, v: 0.06, to: { room: 0, door: 0 } },  // 위문 → 리액터 아래문
      { u: 0.055, v: 0.52, to: { room: 1, door: 1 } }, // 왼쪽문 → 브릿지 아래문
    ],
  },
];

const doorWorld = (d) => ({ x: (d.u - 0.5) * MAP_SIZE, z: (d.v - 0.5) * MAP_SIZE });

// ---------- 충돌 (맵 이미지의 시설물 마스킹) ----------
// R: 사각형(u1,v1,u2,v2), C: 원(u,v,r) — 모두 이미지 정규화 좌표
const PLAYER_R = 0.5;
const WALL = MAP_SIZE * 0.435;
const R = (u1, v1, u2, v2, deg = 0) => ({
  type: 'r',
  x1: (u1 - 0.5) * MAP_SIZE, z1: (v1 - 0.5) * MAP_SIZE,
  x2: (u2 - 0.5) * MAP_SIZE, z2: (v2 - 0.5) * MAP_SIZE,
  a: (deg * Math.PI) / 180, // 중심 기준 회전각
});
const C = (u, v, r) => ({ type: 'c', x: (u - 0.5) * MAP_SIZE, z: (v - 0.5) * MAP_SIZE, r: r * MAP_SIZE });

const rectCenter = (c) => ({ x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2 });
// 회전 사각형의 로컬 좌표계 (중심 기준 오프셋) 변환
function toLocal(c, x, z) {
  const ctr = rectCenter(c);
  const a = c.a || 0;
  const dx = x - ctr.x, dz = z - ctr.z;
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
}
function toWorld(c, lx, lz) {
  const ctr = rectCenter(c);
  const a = c.a || 0;
  const cos = Math.cos(a), sin = Math.sin(a);
  return [ctr.x + lx * cos - lz * sin, ctr.z + lx * sin + lz * cos];
}

const COLLIDERS = [
  [ // REACTOR
    C(0.499, 0.465, 0.195),
    C(0.196, 0.216, 0.115),
    C(0.793, 0.208, 0.105),
    R(0.221, 0.045, 0.767, 0.162),
    R(-0.013, 0.247, 0.093, 0.751),
    R(0.195, 0.627, 0.301, 0.671, 41),
    R(-0.044, 0.788, 0.186, 1.018, 42),
    R(0.699, 0.641, 0.801, 0.687, -40),
    R(0.807, 0.754, 1.007, 1.014, 45),
    R(0.256, 0.425, 0.379, 0.517),
    R(0.601, 0.434, 0.746, 0.506),
    R(0.225, 0.898, 0.375, 1.048),
    R(0.604, 0.898, 0.754, 1.048),
    R(0.889, 0.608, 1.039, 0.758),
    R(0.829, 0.255, 0.979, 0.405),
    C(0.401, 0.357, 0.075),
    C(0.597, 0.353, 0.075),
  ],
  [ // BRIDGE
    R(0.315, 0.168, 0.669, 0.316),
    R(0.700, 0.240, 0.880, 0.520),
    R(0.720, 0.520, 0.880, 0.740),
    R(0.778, 0.728, 0.975, 0.861),
    R(0.058, 0.186, 0.228, 0.396),
    R(0.275, 0.865, 0.405, 0.975),
    R(-0.008, 0.618, 0.222, 0.818),
    C(0.419, 0.521, 0.086),
    C(0.569, 0.522, 0.084),
    R(0.422, 0.427, 0.561, 0.610),
    R(0.389, 0.259, 0.449, 0.361),
    R(0.546, 0.240, 0.599, 0.365),
    R(-0.070, 0.659, 0.300, 0.892),
    R(0.216, 0.146, 0.774, 0.298),
    R(0.591, 0.851, 0.918, 1.005),
  ],
  [ // GREENHOUSE
    R(0.163, 0.265, 0.411, 0.420),
    R(0.587, 0.270, 0.830, 0.418),
    R(0.165, 0.604, 0.408, 0.752),
    R(0.589, 0.601, 0.829, 0.754),
    R(0.386, 0.462, 0.612, 0.547),
    R(0.083, 0.046, 0.444, 0.160),
    R(0.036, 0.147, 0.113, 0.412),
    R(0.658, 0.079, 0.756, 0.243),
    R(0.011, 0.608, 0.105, 0.926),
    R(0.000, 0.902, 1.013, 1.001),
    R(0.903, 0.050, 1.049, 0.911),
    R(0.586, -0.008, 0.925, 0.148),
    R(0.211, 0.049, 0.395, 0.198),
    R(0.204, 0.800, 0.332, 0.914),
    R(0.605, 0.812, 0.671, 0.953),
    R(0.438, 0.434, 0.551, 0.579),
    R(0.051, 0.788, 0.201, 0.938, 40),
  ],
];
const CORNER_CUT = [27.6, 30, 31]; // |x|+|z| 초과 시 벽 (팔각 모서리)

function blockedAt(x, z, r) {
  if (Math.abs(x) > WALL || Math.abs(z) > WALL) return true;
  if (myRoom < 0) return false; // 로비: 벽만
  if (Math.abs(x) + Math.abs(z) > CORNER_CUT[myRoom]) return true;
  for (const c of COLLIDERS[myRoom]) {
    if (c.type === 'r') {
      const l = toLocal(c, x, z);
      const hx = Math.abs(c.x2 - c.x1) / 2 + r;
      const hz = Math.abs(c.z2 - c.z1) / 2 + r;
      if (Math.abs(l.x) < hx && Math.abs(l.z) < hz) return true;
    } else if (Math.hypot(x - c.x, z - c.z) < c.r + r) {
      return true;
    }
  }
  return false;
}
const blocked = (x, z) => blockedAt(x, z, PLAYER_R);

// ---------- 렌더러 / 씬 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const gameScene = new THREE.Scene();
gameScene.background = new THREE.Color(0x04050a);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);

gameScene.add(new THREE.AmbientLight(0xffffff, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(6, 20, 8);
gameScene.add(sun);

// 바닥 (맵 이미지) — 캐릭터와 같은 픽셀 밀도로 다운샘플 + NearestFilter로 픽셀화
const MAP_TEX_SIZE = 512; // 12.8px/wu — 캐릭터(25px/wu)의 2배 크기 도트, 강한 레트로 느낌
const mapTextures = ROOMS.map((r) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP_TEX_SIZE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const img = new Image();
  img.onload = () => {
    canvas.getContext('2d').drawImage(img, 0, 0, MAP_TEX_SIZE, MAP_TEX_SIZE);
    tex.needsUpdate = true;
  };
  img.src = r.map;
  return tex;
});
const floorMat = new THREE.MeshBasicMaterial({ map: mapTextures[0] });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), floorMat);
floor.rotation.x = -Math.PI / 2;
gameScene.add(floor);

// 로비(대기실)용 우주 배경 — 랜딩과 같은 시드 고정 스타필드
const starTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  let seed = 20260715;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const base = g.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#070818');
  base.addColorStop(1, '#04040e');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  const blob = (x, y, r, rgb, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
  };
  blob(475, 110, 260, '110,72,168', 0.18);
  blob(55, 430, 230, '95,62,155', 0.15);
  blob(210, 90, 190, '58,74,150', 0.08);
  const cols = ['221,226,238', '255,255,255', '157,184,255', '168,232,240'];
  for (let i = 0; i < 380; i++) {
    g.fillStyle = `rgba(${cols[Math.floor(rnd() * 4)]},${0.25 + rnd() * 0.55})`;
    g.fillRect(Math.floor(rnd() * 512), Math.floor(rnd() * 512), rnd() < 0.08 ? 2 : 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
})();

// ---------- 픽셀 캐릭터 (어몽어스풍 크루메이트) ----------
// 60x60 픽셀 캔버스: 페인트 캔버스(칠하는 대상)를 방향별 실루엣 마스크에 씌워 합성
const SPR = 60;
const BASE_COLOR = '#c9ced8';
const OUTLINE = '#141824';
const VISOR = '#8fe3ff';
const VISOR_HI = '#eafcff';

const mkCanvas = () => {
  const c = document.createElement('canvas');
  c.width = c.height = SPR;
  return c;
};

// AA로 생긴 반투명 가장자리를 잘라 픽셀 느낌을 살림
function posterizeAlpha(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, SPR, SPR);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

// 방향별 정적 파츠: mask(몸통 실루엣 = 페인트 적용 영역), detail(외곽선/바이저/백팩)
function makeParts(facing) {
  const mask = mkCanvas();
  const detail = mkCanvas();
  const m = mask.getContext('2d');
  const d = detail.getContext('2d');

  const side = facing === 'left' || facing === 'right';
  const body = side
    ? { x: 19, y: 10, w: 24, h: 40, r: 10 }
    : { x: 16, y: 10, w: 28, h: 40, r: 11 };

  const packs = [];
  if (facing === 'up') packs.push({ x: 20, y: 21, w: 20, h: 22, r: 5 });
  if (facing === 'left') packs.push({ x: 39, y: 20, w: 9, h: 19, r: 3 });
  if (facing === 'right') packs.push({ x: 12, y: 20, w: 9, h: 19, r: 3 });

  // 실루엣
  m.fillStyle = '#000';
  m.beginPath();
  m.roundRect(body.x, body.y, body.w, body.h, body.r);
  m.fill();
  for (const p of packs) {
    m.beginPath();
    m.roundRect(p.x, p.y, p.w, p.h, p.r);
    m.fill();
  }

  // 외곽선
  d.strokeStyle = OUTLINE;
  d.lineWidth = 2;
  for (const p of packs) {
    d.beginPath();
    d.roundRect(p.x, p.y, p.w, p.h, p.r);
    d.stroke();
  }
  d.beginPath();
  d.roundRect(body.x, body.y, body.w, body.h, body.r);
  d.stroke();

  posterizeAlpha(mask);
  posterizeAlpha(detail);

  // 바이저 (뒤를 볼 땐 없음): 페인트 위에 20% 투명도로만 겹침 —
  // 몸을 칠하면 바이저도 같이 칠해지고 형태만 살짝 비친다.
  // 반투명이라 알파 이진화(posterize) 이후에 그린다.
  let visor = null;
  if (facing === 'down') visor = { x: 20, y: 17, w: 20, h: 11, r: 5 };
  if (facing === 'left') visor = { x: 14, y: 17, w: 15, h: 10, r: 5 };
  if (facing === 'right') visor = { x: 31, y: 17, w: 15, h: 10, r: 5 };
  if (visor) {
    d.globalAlpha = 0.2;
    d.fillStyle = VISOR;
    d.beginPath();
    d.roundRect(visor.x, visor.y, visor.w, visor.h, visor.r);
    d.fill();
    d.strokeStyle = OUTLINE;
    d.beginPath();
    d.roundRect(visor.x, visor.y, visor.w, visor.h, visor.r);
    d.stroke();
    d.fillStyle = VISOR_HI;
    d.fillRect(visor.x + 3, visor.y + 2, 5, 3);
    d.globalAlpha = 1;
  }

  return { mask, detail };
}

const PARTS = {
  down: makeParts('down'),
  up: makeParts('up'),
  left: makeParts('left'),
  right: makeParts('right'),
};

// 발: 몸통 아래에서 뽈뽈거림 (4프레임 왜들)
const FEET = {
  down: [{ x: 19, y: 48, w: 9, h: 8 }, { x: 32, y: 48, w: 9, h: 8 }],
  up: [{ x: 19, y: 48, w: 9, h: 8 }, { x: 32, y: 48, w: 9, h: 8 }],
  left: [{ x: 21, y: 48, w: 9, h: 8 }, { x: 31, y: 48, w: 9, h: 8 }],
  right: [{ x: 20, y: 48, w: 9, h: 8 }, { x: 30, y: 48, w: 9, h: 8 }],
};
const WALK = [[3, 0], [1, 1], [0, 3], [1, 1]]; // 프레임별 [왼발, 오른발] 들어올림(px)

const work = mkCanvas();
const wctx = work.getContext('2d');

// 페인트 캔버스 + 방향/프레임 → 완성 스프라이트 합성
function composeTo(ctx, paintCanvas, facing, frame, bob) {
  ctx.clearRect(0, 0, SPR, SPR);
  ctx.imageSmoothingEnabled = false;

  const feet = FEET[facing];
  const lifts = frame < 0 ? [0, 0] : WALK[frame];

  // 1) 발 (몸통보다 먼저 → 몸통 아래로 삐져나옴)
  wctx.clearRect(0, 0, SPR, SPR);
  wctx.globalCompositeOperation = 'source-over';
  wctx.fillStyle = '#000';
  feet.forEach((f, i) => wctx.fillRect(f.x, f.y - lifts[i], f.w, f.h));
  wctx.globalCompositeOperation = 'source-in';
  wctx.drawImage(paintCanvas, 0, 0);
  wctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(work, 0, 0);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  feet.forEach((f, i) => ctx.strokeRect(f.x + 1, f.y - lifts[i] + 1, f.w - 2, f.h - 2));

  // 2) 몸통 (페인트 → 실루엣 마스크, 걸을 때 1px 바운스)
  const P = PARTS[facing];
  wctx.clearRect(0, 0, SPR, SPR);
  wctx.drawImage(P.mask, 0, bob);
  wctx.globalCompositeOperation = 'source-in';
  wctx.drawImage(paintCanvas, 0, 0);
  wctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(work, 0, 0);
  ctx.drawImage(P.detail, 0, bob);

  // 3) 하단 음영
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(8, 10, 20, 0.2)';
  ctx.fillRect(0, 45 + bob, SPR, 9);
  ctx.globalCompositeOperation = 'source-over';
}

function createCharacter() {
  const paintCanvas = mkCanvas();
  const pctx = paintCanvas.getContext('2d');
  pctx.fillStyle = BASE_COLOR;
  pctx.fillRect(0, 0, SPR, SPR);

  const spriteCanvas = mkCanvas();
  const sctx = spriteCanvas.getContext('2d');

  const tex = new THREE.CanvasTexture(spriteCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
  sprite.scale.set(2.4, 2.4, 1);
  sprite.position.y = 1.05;

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;

  const group = new THREE.Group();
  group.add(sprite, shadow);

  const char = {
    paintCanvas, pctx, sctx, tex, group, sprite, shadow,
    facing: 'down', moving: false, phase: 0,
    dancing: false, dancePhase: 0,
    bobSeed: Math.random() * Math.PI * 2, caught: false, rainbow: false,
  };
  compose(char);
  return char;
}

// 쌈바 춤: 빵댕이가 좌우로 슉슉, 상체는 반대로 기울고 발은 바닥 고정 — 4프레임 루프
const danceWork = mkCanvas();
const danceCtx = danceWork.getContext('2d');
const DANCE_SWAY = [0, 3, 0, -3];
const HIP_TOP = 30; // 머리~허리 | 빵댕이 경계
const HIP_BOT = 48; // 빵댕이 | 발 경계

function compose(char) {
  if (char.dancing) {
    composeTo(danceCtx, char.paintCanvas, char.facing, -1, 0);
    const s = char.sctx;
    s.clearRect(0, 0, SPR, SPR);
    s.imageSmoothingEnabled = false;
    const f = Math.floor(char.dancePhase) % 4;
    const sway = DANCE_SWAY[f];
    const bob = f % 2; // 씰룩일 때 살짝 바운스
    // 상체: 반대쪽으로 살짝 기울기
    s.drawImage(danceWork, 0, 0, SPR, HIP_TOP, -Math.round(sway / 2), bob, SPR, HIP_TOP);
    // 빵댕이: 크게 슉
    s.drawImage(danceWork, 0, HIP_TOP, SPR, HIP_BOT - HIP_TOP, sway, HIP_TOP + bob, SPR, HIP_BOT - HIP_TOP);
    // 발: 제자리
    s.drawImage(danceWork, 0, HIP_BOT, SPR, SPR - HIP_BOT, 0, HIP_BOT, SPR, SPR - HIP_BOT);
  } else {
    const frame = char.moving ? Math.floor(char.phase) % 4 : -1;
    const bob = char.moving && Math.floor(char.phase) % 2 === 1 ? 1 : 0;
    composeTo(char.sctx, char.paintCanvas, char.facing, frame, bob);
  }
  // 리빌: 무지개 발광 / 잡힘: 회색 처리
  if (char.rainbow) {
    char.sctx.globalCompositeOperation = 'source-atop';
    char.sctx.fillStyle = `hsl(${(performance.now() / 2) % 360}, 100%, 60%)`;
    char.sctx.globalAlpha = 0.65;
    char.sctx.fillRect(0, 0, SPR, SPR);
    char.sctx.globalAlpha = 1;
    char.sctx.globalCompositeOperation = 'source-over';
  } else if (char.caught) {
    char.sctx.globalCompositeOperation = 'source-atop';
    char.sctx.fillStyle = 'rgba(70, 74, 84, 0.7)';
    char.sctx.fillRect(0, 0, SPR, SPR);
    char.sctx.globalCompositeOperation = 'source-over';
  }
  char.tex.needsUpdate = true;
}

// 스트로크: 60x60 페인트 캔버스에 정사각 도트 스탬프. u,v ∈ [0,1], a: 불투명도
function drawStroke(char, s) {
  const x = Math.round(s.u * SPR);
  const y = Math.round(s.v * SPR);
  const half = Math.floor(s.s / 2);
  char.pctx.globalAlpha = s.a === undefined ? 1 : s.a;
  char.pctx.fillStyle = s.c;
  char.pctx.fillRect(x - half, y - half, s.s, s.s);
  char.pctx.globalAlpha = 1;
}

function clearChar(char) {
  char.pctx.fillStyle = BASE_COLOR;
  char.pctx.fillRect(0, 0, SPR, SPR);
}

// 대기실 머리 위 닉네임: READY와 같은 서체, 절반 크기, 박스 없이 텍스트만
function makeNameLabel(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const FS = 16; // 캔버스엔 크게 그려서 월드에서 축소 (선명도 유지)
  const font = `${FS}px 'Press Start 2P', monospace`;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const draw = () => {
    g.font = font;
    const w = Math.max(24, Math.ceil(g.measureText(text).width) + 4);
    c.width = w;
    c.height = FS + 6;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f2f4f8';
    g.fillText(text, w / 2, (FS + 6) / 2);
    tex.needsUpdate = true;
    // READY(13px)와 같은 크기로 보이게
    const s = 0.021;
    spr.scale.set(w * s, (FS + 6) * s, 1);
  };
  draw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw); // 픽셀 폰트 로드 후 다시
  // 로비 카메라가 거의 수직이라 월드 높이 대신 화면 기준으로 위에 띄움
  // (center y가 라벨 높이 단위 — -3 ≈ 캐릭터 머리 위 여백)
  spr.center.set(0.5, -3);
  spr.position.y = 0;
  spr.visible = false; // 로비에서만 표시
  return spr;
}

function attachLabel(char, name) {
  if (char.label) char.group.remove(char.label);
  char.label = makeNameLabel(name || '???');
  char.group.add(char.label);
}

// 내 캐릭터
const me = createCharacter();
gameScene.add(me.group);
let myRoom = 0;
const myPos = new THREE.Vector3(0, 0, 10);

// 다른 플레이어들
const others = new Map(); // id -> { char, target: {x,z}, room }

function addOther(p) {
  const char = createCharacter();
  attachLabel(char, p.name);
  for (const s of p.strokes || []) drawStroke(char, s);
  char.facing = p.f || 'down';
  char.moving = !!p.mv;
  char.dancing = !!p.d;
  char.group.position.set(p.x, 0, p.z);
  compose(char);
  gameScene.add(char.group);
  const o = { char, target: { x: p.x, z: p.z }, room: p.room };
  others.set(p.id, o);
  updateOtherVisibility(o);
}

function updateOtherVisibility(o) {
  o.char.group.visible = o.room === myRoom;
}

// ---------- 네트워크 ----------
let ws = null;
let connected = false;
let waitingRoom = false; // 서버 정원(30명) 초과로 대기 중
const myStrokes = []; // 재접속 시 페인트 복원용 전체 히스토리
const myName = (localStorage.getItem('mechamon-name') || '').slice(0, 16);
attachLabel(me, myName);
const waitOverlay = document.getElementById('waitOverlay');
const waitPosEl = document.getElementById('waitPos');

// 시크릿 입장: 대기 중 "숫자"를 10번 클릭한 뒤 스페이스바.
// 10번을 못 채웠으면 스페이스는 완전 무반응이어야 한다.
let secretClicks = 0;
let lastForceAttempt = 0;
waitPosEl.addEventListener('click', () => {
  if (waitingRoom) secretClicks++;
});
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !waitingRoom || !connected || !ws) return;
  if (secretClicks < 10) return; // 시퀀스 미완성 — 아무 일도 일어나지 않음
  lastForceAttempt = Date.now();
  ws.send(JSON.stringify({ t: 'force-join' }));
});

function connectNet() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    connected = true;
    ws.send(JSON.stringify({ t: 'hello', name: myName, role: myRoleWanted }));
  };
  ws.onmessage = onNetMessage;
  ws.onclose = () => {
    connected = false;
    ws = null;
    for (const o of others.values()) gameScene.remove(o.char.group);
    others.clear();
  };
}

// 프리렌더 중이거나 화면 없는 숨은 인스턴스(hidden + 0x0)는 접속하지 않음 (유령 플레이어 방지)
const deferConnect = () => document.prerendering || (document.hidden && innerWidth === 0);
if (deferConnect()) {
  const tryConnect = () => {
    if (!deferConnect() && !ws) connectNet();
  };
  document.addEventListener('prerenderingchange', tryConnect);
  document.addEventListener('visibilitychange', tryConnect);
  addEventListener('resize', tryConnect);
} else {
  connectNet();
}
// 페이지를 떠나면 즉시 종료
addEventListener('pagehide', () => { if (ws) ws.close(); });

// 15초 이상 숨겨진 페이지는 접속 해제, 다시 보이면 재접속 (숨은 중복 인스턴스 정리)
let hideTimer = null;
function updateVisibilityNet() {
  if (document.hidden) {
    if (!hideTimer) {
      hideTimer = setTimeout(() => {
        hideTimer = null;
        if (ws) ws.close();
      }, 15000);
    }
  } else {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!deferConnect()) connectNet();
  }
}
document.addEventListener('visibilitychange', updateVisibilityNet);
updateVisibilityNet();

function onNetMessage(e) {
  const msg = JSON.parse(e.data);
  switch (msg.t) {
    case 'init':
      // 입장 확정 (대기열이었다면 승격) — 내 상태 전체 전송
      myId = msg.id;
      waitingRoom = false;
      secretClicks = 0;
      waitOverlay.hidden = true;
      readyBtn.hidden = false;
      for (const p of msg.players) addOther(p);
      sendMove();
      for (let i = 0; i < myStrokes.length; i += 400) {
        ws.send(JSON.stringify({ t: 'paint', strokes: myStrokes.slice(i, i + 400) }));
      }
      break;
    case 'wait':
      if (!waitingRoom) secretClicks = 0; // 대기 세션 새로 시작 — 클릭 카운트 리셋
      waitingRoom = true;
      waitOverlay.hidden = false;
      waitTitleEl.textContent = 'WAITLIST';
      waitPosEl.style.display = '';
      waitTipEl.textContent = "Server is full (30 max) — you'll join automatically when a slot opens";
      waitPosEl.textContent = `${msg.pos} / ${msg.total}`;
      break;
    case 'in-progress':
      waitingRoom = true;
      waitOverlay.hidden = false;
      waitTitleEl.textContent = 'GAME IN PROGRESS';
      waitPosEl.style.display = 'none';
      waitTipEl.textContent = "A round is running — you'll join the lobby when it ends";
      break;
    case 'game-start': {
      roles = msg.roles || {};
      myRole = roles[myId] || myRoleWanted;
      gameMode = 'headstart';
      readyBtn.hidden = true;
      if (myRole === 'hider') {
        fadeToRoom(msg.rooms[myId] ?? 0);
        topTimerEnd = Date.now() + msg.headstart * 1000;
      } else {
        bigTimerEnd = Date.now() + msg.headstart * 1000;
      }
      break;
    }
    case 'play-start': {
      gameMode = 'play';
      bigTimerEnd = 0;
      topTimerEnd = Date.now() + msg.playTime * 1000;
      playSting(sfxGameStart); // 파인더 투입 — 브금 멈추고 스팅 후 페이드 인
      if (myRole === 'finder') {
        fadeToRoom(msg.rooms[myId] ?? 0);
      } else {
        flyBanner('START', 'rainbow');
      }
      break;
    }
    case 'reveal': {
      gameMode = 'reveal';
      topTimerEnd = Date.now() + msg.duration * 1000;
      flyBanner('HAHA~~', 'rainbow');
      if (myRole === 'hider' && !me.caught) {
        frozen = true;
        me.rainbow = true;
        me.dancing = true; // 생존 하이더는 지랄발광 쌈바
      }
      for (const [id, o] of others) {
        if (roles[id] === 'hider' && !o.char.caught) {
          o.char.rainbow = true;
          o.char.dancing = true;
        }
      }
      break;
    }
    case 'caught': {
      if (msg.id === myId) {
        me.caught = true;
        me.dancing = false;
        frozen = true;
      } else {
        const o = others.get(msg.id);
        if (o) {
          o.char.caught = true;
          o.char.dancing = false;
        }
      }
      break;
    }
    case 'round-end': {
      const stay = (msg.stay || 50) * 1000;
      topTimerEnd = Date.now() + stay; // 로비 복귀까지 카운트다운
      bigTimerEnd = 0;
      playSting(sfxGameEnd); // 라운드 종료 — 브금 멈추고 스팅 후 페이드 인
      if (msg.result === 'finder') {
        flyBanner('EZ~~~', 'red');
      } else {
        if (msg.sur) flyBanner('HAHA~~', 'rainbow'); // 자연 승리는 리빌 때 이미 지나감
        // 하이더 승리 셀레브레이션: 생존 하이더 무지개 + 쌈바
        if (myRole === 'hider' && !me.caught) {
          frozen = true;
          me.rainbow = true;
          me.dancing = true;
        }
        for (const [oid, o] of others) {
          if (roles[oid] === 'hider' && !o.char.caught) {
            o.char.rainbow = true;
            o.char.dancing = true;
          }
        }
      }
      clearTimeout(endTimer);
      endTimer = setTimeout(backToLobby, stay);
      lobbyBtn.hidden = false; // 승자 결정 — 바로 로비로 갈 수 있는 버튼
      break;
    }
    case 'chat':
      addChatLine(msg.name, msg.text, msg.sys);
      break;
    case 'abort':
      location.href = '/';
      break;
    case 'name': {
      const o = others.get(msg.id);
      if (o) attachLabel(o.char, msg.name);
      break;
    }
    case 'lobby-reset':
      // 서버 기준 로비 리셋 — READY 표시를 서버 상태(전원 해제)와 맞춤
      readyOn = false;
      readyBtn.classList.remove('on');
      break;
    case 'force-denied':
      // 시크릿 입장 거부 (오버플로우 2명 꽉 참) — 내가 방금 시도한 경우에만 붉게
      if (Date.now() - lastForceAttempt < 2000) {
        waitPosEl.classList.add('denied');
        setTimeout(() => waitPosEl.classList.remove('denied'), 600);
      }
      break;
    case 'player-join':
      addOther(msg.player);
      break;
    case 'player-update': {
      const o = others.get(msg.id);
      if (!o) break;
      o.target.x = msg.x;
      o.target.z = msg.z;
      o.char.facing = msg.f || o.char.facing;
      o.char.moving = !!msg.mv;
      // 리빌 강제 춤(rainbow)은 이동 패킷이 꺼도 유지
      if (!o.char.rainbow) o.char.dancing = !!msg.d;
      if (o.room !== msg.room) {
        o.room = msg.room;
        o.char.group.position.set(msg.x, 0, msg.z);
        updateOtherVisibility(o);
      }
      break;
    }
    case 'player-leave': {
      const o = others.get(msg.id);
      if (o) {
        gameScene.remove(o.char.group);
        others.delete(msg.id);
      }
      break;
    }
    case 'paint': {
      const o = others.get(msg.id);
      if (o) {
        for (const s of msg.strokes) drawStroke(o.char, s);
        compose(o.char);
      }
      break;
    }
    case 'clear': {
      const o = others.get(msg.id);
      if (o) {
        clearChar(o.char);
        compose(o.char);
      }
      break;
    }
    case 'shoot':
      spawnBullet(msg.x, msg.z, msg.dx, msg.dz, msg.room, false);
      break;
    case 'taunt': {
      if (msg.room === myRoom) {
        // 같은 공간: 실제 상대 위치에서 (거리 감쇠 포함)
        playTaunt(msg.x - myPos.x, msg.z - myPos.z);
      } else if (myRoom >= 0 && msg.room >= 0) {
        // 다른 방: 그 방으로 향하는 문 쪽에서 들림
        const door = ROOMS[myRoom].doors.find((dr) => dr.to.room === msg.room);
        if (door) {
          const dw = doorWorld(door);
          playTaunt(dw.x - myPos.x, dw.z - myPos.z);
        } else {
          playTaunt(null, 0);
        }
      } else {
        playTaunt(null, 0); // 로비↔방 사이 — 무지향으로 작게
      }
      break;
    }
  }
}

function sendMove() {
  if (!connected || !ws) return;
  ws.send(JSON.stringify({
    t: 'move',
    x: +myPos.x.toFixed(2),
    z: +myPos.z.toFixed(2),
    room: myRoom,
    f: me.facing,
    mv: me.moving ? 1 : 0,
    d: me.dancing ? 1 : 0,
  }));
}

// ---------- 게임 플로우 (로비 → 헤드스타트 → 플레이 → 리빌) ----------
const myRoleWanted = localStorage.getItem('mechamon-role') === 'hider' ? 'hider' : 'finder';
let myId = 0;
let gameMode = 'lobby'; // lobby | headstart | play | reveal
let roles = {}; // id -> 'hider' | 'finder'
let myRole = myRoleWanted;
let frozen = false; // 잡혔거나 리빌 중인 hider
let readyOn = false;
let topTimerEnd = 0;
let bigTimerEnd = 0;

const readyBtn = document.getElementById('readyBtn');
const lobbyBtn = document.getElementById('lobbyBtn');
let endTimer = null;

lobbyBtn.addEventListener('click', () => {
  lobbyBtn.blur();
  backToLobby(); // 셀레브레이션 스킵하고 즉시 로비로
});
const topTimerEl = document.getElementById('topTimer');
const bigTimerEl = document.getElementById('bigTimer');
const bannerEl = document.getElementById('banner');
const waitTitleEl = document.getElementById('waitTitle');
const waitTipEl = document.getElementById('waitTip');

readyBtn.addEventListener('click', () => {
  readyBtn.blur(); // 포커스가 남으면 Enter/Space가 버튼을 다시 눌러버림
  if (gameMode !== 'lobby' || waitingRoom || !connected) return;
  readyOn = !readyOn;
  readyBtn.classList.toggle('on', readyOn);
  ws.send(JSON.stringify({ t: 'ready', on: readyOn ? 1 : 0 }));
});

function flyBanner(text, mode) {
  bannerEl.textContent = text;
  bannerEl.style.color = mode === 'red' ? '#fb4343' : '#ffffff';
  bannerEl.classList.remove('fly');
  void bannerEl.offsetWidth; // 애니메이션 재시작
  bannerEl.classList.add('fly');
  if (mode === 'rainbow') {
    const int = setInterval(() => {
      bannerEl.style.color = `hsl(${Math.floor(Math.random() * 360)}, 100%, 55%)`;
    }, 55);
    setTimeout(() => clearInterval(int), 2700);
  }
}

// 방 배정 스폰: 해당 방의 문 안쪽 지점
function roomSpawn(roomIdx) {
  const door = ROOMS[roomIdx].doors[Math.floor(Math.random() * ROOMS[roomIdx].doors.length)];
  const dw = doorWorld(door);
  const dir = new THREE.Vector2(-dw.x, -dw.z).normalize();
  return { x: dw.x + dir.x * 3.2, z: dw.z + dir.y * 3.2 };
}

function fadeToRoom(roomIdx) {
  transitioning = true;
  fadeEl.style.opacity = '1';
  setTimeout(() => {
    if (roomIdx < 0) {
      myPos.set((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16);
    } else {
      const s = roomSpawn(roomIdx);
      myPos.set(s.x, 0, s.z);
    }
    setRoom(roomIdx);
    doorLock = null;
    sendMove();
    fadeEl.style.opacity = '0';
    setTimeout(() => { transitioning = false; }, 380);
  }, 380);
}

function backToLobby() {
  clearTimeout(endTimer);
  lobbyBtn.hidden = true;
  gameMode = 'lobby';
  frozen = false;
  readyOn = false;
  readyBtn.hidden = false;
  readyBtn.classList.remove('on');
  topTimerEnd = 0;
  bigTimerEnd = 0;
  me.caught = false;
  me.rainbow = false;
  me.dancing = false;
  roles = {};
  // 라운드 종료 — 모두의 색칠 초기화 (서버도 스트로크 리셋)
  clearChar(me);
  compose(me);
  myStrokes.length = 0;
  strokeOutbox.length = 0;
  for (const o of others.values()) {
    o.char.caught = false;
    o.char.rainbow = false;
    o.char.dancing = false;
    clearChar(o.char);
    compose(o.char);
  }
  fadeToRoom(-1);
}

// 총알
const BULLET_SPEED = 18; // 캐릭터 속도(9)의 2배
const bullets = []; // { x, z, dx, dz, room, mine, sprite }
const bulletTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,240,170,0.9)');
  gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

function spawnBullet(x, z, dx, dz, room, mine) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: bulletTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  sprite.scale.set(0.55, 0.55, 1);
  sprite.position.set(x, 0.9, z);
  sprite.visible = room === myRoom;
  gameScene.add(sprite);
  bullets.push({ x, z, dx, dz, room, mine, sprite });
}

let lastShot = 0;
function tryShoot(e) {
  if (gameMode !== 'play' || myRole !== 'finder' || frozen || myRoom < 0) return;
  if (performance.now() - lastShot < 250) return;
  const p = floorPoint(e);
  if (!p) return;
  const dx = p.x - myPos.x, dz = p.z - myPos.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  lastShot = performance.now();
  const nx = dx / len, nz = dz / len;
  spawnBullet(myPos.x, myPos.z, nx, nz, myRoom, true);
  if (connected && ws) {
    ws.send(JSON.stringify({
      t: 'shoot',
      x: +myPos.x.toFixed(2), z: +myPos.z.toFixed(2),
      dx: +nx.toFixed(3), dz: +nz.toFixed(3), room: myRoom,
    }));
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx * BULLET_SPEED * dt;
    b.z += b.dz * BULLET_SPEED * dt;
    b.sprite.position.set(b.x, 0.9, b.z);
    b.sprite.visible = b.room === myRoom;
    let dead = false;
    // 벽/장애물에 닿으면 소멸
    const savedRoom = myRoom;
    if (b.room >= 0) {
      myRoom = b.room; // blockedAt이 방 기준이라 잠시 스왑
      dead = blockedAt(b.x, b.z, 0.12);
      myRoom = savedRoom;
    } else {
      dead = Math.abs(b.x) > WALL || Math.abs(b.z) > WALL;
    }
    // 내 총알만 명중 판정 → 서버에 태그 요청
    if (!dead && b.mine && gameMode === 'play') {
      for (const [id, o] of others) {
        if (o.room !== b.room || roles[id] !== 'hider' || o.char.caught) continue;
        if (Math.hypot(o.char.group.position.x - b.x, o.char.group.position.z - b.z) < 0.9) {
          if (connected && ws) ws.send(JSON.stringify({ t: 'tag', id }));
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      gameScene.remove(b.sprite);
      bullets.splice(i, 1);
    }
  }
}

// 페인트 스트로크 배치 전송
const strokeOutbox = [];
setInterval(() => {
  if (connected && strokeOutbox.length) {
    ws.send(JSON.stringify({ t: 'paint', strokes: strokeOutbox.splice(0) }));
  }
}, 100);

// ---------- 게임 BGM (계속 루프) ----------
// 자동재생이 막히면 성공할 때까지 모든 상호작용에서 재시도
const bgm = new Audio('audio/bgm.m4a');
bgm.loop = true;
bgm.volume = 0.4;
const bgmEvs = ['pointerdown', 'click', 'keydown', 'touchend'];
const startBgm = () => {
  if (!bgm.paused) return;
  bgm.play()
    .then(() => bgmEvs.forEach((ev) => removeEventListener(ev, startBgm)))
    .catch(() => {});
};
bgmEvs.forEach((ev) => addEventListener(ev, startBgm));
startBgm();

// 스팅어: 브금 잠깐 멈추고 1회 재생 → 끝나면 브금 페이드 인
const sfxGameStart = new Audio('audio/game-start.m4a');
const sfxGameEnd = new Audio('audio/game-end.m4a');
sfxGameStart.volume = 0.7;
sfxGameEnd.volume = 0.7;
const BGM_VOL = 0.4;
let bgmFadeTimer = null;

function fadeInBgm() {
  clearInterval(bgmFadeTimer);
  bgm.volume = 0;
  bgm.play().catch(() => {});
  bgmFadeTimer = setInterval(() => {
    bgm.volume = Math.min(BGM_VOL, bgm.volume + BGM_VOL / 20);
    if (bgm.volume >= BGM_VOL) clearInterval(bgmFadeTimer);
  }, 100); // 약 2초에 걸쳐 페이드 인
}

function playSting(sting) {
  clearInterval(bgmFadeTimer);
  bgm.pause();
  sting.currentTime = 0;
  sting.onended = fadeInBgm;
  sting.play().catch(fadeInBgm); // 재생 실패 시에도 브금은 복귀
}

// ---------- 뮤트 (M) ----------
let muted = false;
function toggleMute() {
  muted = !muted;
  bgm.muted = muted;
  sfxGameStart.muted = muted;
  sfxGameEnd.muted = muted;
  document.getElementById('muteTag').hidden = !muted;
}

// ---------- 입력 ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (chatOpen) return; // 채팅 입력 중엔 게임 키 무시
  if (e.code === 'KeyM' && e.metaKey && e.altKey) {
    e.preventDefault();
    toggleEditMode();
    return;
  }
  if (e.code === 'KeyM' && !e.repeat && !e.metaKey && !e.altKey && !e.ctrlKey) {
    toggleMute();
    return;
  }
  if (e.code === 'Escape' && !e.repeat) {
    toggleEscMenu();
    return;
  }
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !paintMode && !editMode && !escOpen && !waitingRoom) {
    openChat();
    return;
  }
  if (e.code === 'KeyP' && !e.repeat && !editMode) togglePaintMode();
  if (e.code === 'KeyT' && !e.repeat && !editMode) tryTaunt();
  keys.add(e.code);
});

// ---------- 채팅 (Enter로 열기, /gg.gg = 항복) ----------
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
let chatOpen = false;

function openChat() {
  chatOpen = true;
  chatInput.hidden = false;
  chatInput.value = '';
  keys.clear();
  setTimeout(() => chatInput.focus(), 0);
}

function closeChat() {
  chatOpen = false;
  chatInput.hidden = true;
  chatInput.blur();
}

chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.code === 'Escape') {
    closeChat();
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    const text = chatInput.value.trim().slice(0, 120);
    if (text && connected && ws) ws.send(JSON.stringify({ t: 'chat', text }));
    closeChat();
  }
});

// ---------- 메롱 (T) — 하이더 도발, 입체음향 ----------
const tauntCtx = new (window.AudioContext || window.webkitAudioContext)();
let tauntBuf = null;
fetch('audio/taunt.m4a')
  .then((r) => r.arrayBuffer())
  .then((b) => tauntCtx.decodeAudioData(b))
  .then((buf) => { tauntBuf = buf; })
  .catch(() => {});

// dx/dz: 내 캐릭터 기준 상대 위치 (화면 위 = 정면). dx가 null이면 무지향(멀리서 나는 소리).
function playTaunt(dx, dz) {
  if (!tauntBuf || muted) return;
  if (tauntCtx.state === 'suspended') tauntCtx.resume().catch(() => {});
  const src = tauntCtx.createBufferSource();
  src.buffer = tauntBuf;
  const gain = tauntCtx.createGain();
  if (dx === null) {
    gain.gain.value = 0.45;
    src.connect(gain);
    gain.connect(tauntCtx.destination);
  } else {
    gain.gain.value = 0.9;
    const pan = tauntCtx.createPanner();
    pan.panningModel = 'HRTF'; // 에어팟 등에서 상하좌우 입체감
    pan.distanceModel = 'linear';
    pan.refDistance = 3;
    pan.maxDistance = 50;
    // WebAudio 리스너 정면 = -z → 화면 위쪽(-z)이 그대로 '앞'
    pan.positionX.value = dx;
    pan.positionY.value = 0;
    pan.positionZ.value = dz;
    src.connect(pan);
    pan.connect(gain);
    gain.connect(tauntCtx.destination);
  }
  src.start();
}

let lastTaunt = 0;
function tryTaunt() {
  if (performance.now() - lastTaunt < 120) return; // 연타 OK, 플러드만 방지
  if (me.caught || !connected || !ws) return;
  if (gameMode !== 'lobby' && myRole !== 'hider') return; // 게임 중엔 하이더만
  lastTaunt = performance.now();
  playTaunt(0, 0); // 내 귀엔 정면
  ws.send(JSON.stringify({ t: 'taunt' }));
}

function addChatLine(name, text, sys) {
  const line = document.createElement('div');
  line.className = sys ? 'line sys' : 'line';
  if (sys) {
    line.textContent = text;
  } else {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${name || '???'}: `;
    line.append(who, document.createTextNode(text));
  }
  chatLog.appendChild(line);
  while (chatLog.children.length > 6) chatLog.firstChild.remove();
  setTimeout(() => line.remove(), 9000);
}

// ---------- ESC 메뉴 (Leave Round) ----------
const escMenu = document.getElementById('escMenu');
let escOpen = false;

function toggleEscMenu() {
  escOpen = !escOpen;
  escMenu.hidden = !escOpen;
  keys.clear();
}

document.getElementById('leaveBtn').addEventListener('click', () => {
  location.href = '/';
});
addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- 페이드 / 방 전환 ----------
const fadeEl = document.getElementById('fade');
const roomNameEl = document.getElementById('roomName');

function setRoom(idx) {
  myRoom = idx;
  if (idx < 0) {
    // 로비(대기실): 우주 배경에 둥둥
    floor.visible = false;
    gameScene.background = starTex;
    roomNameEl.textContent = 'LOBBY';
  } else {
    floor.visible = true;
    gameScene.background = new THREE.Color(0x04050a);
    floorMat.map = mapTextures[idx];
    floorMat.needsUpdate = true;
    roomNameEl.textContent = ROOMS[idx].name;
  }
  for (const o of others.values()) updateOtherVisibility(o);
  buildDebugOverlay();
}

// 콜라이더 오버레이 (?debug 또는 편집 모드에서 표시)
let debugGroup = null;
function buildDebugOverlay() {
  if (debugGroup) {
    gameScene.remove(debugGroup);
    debugGroup = null;
  }
  if (myRoom < 0) return;
  if (!location.search.includes('debug') && !editMode) return;
  debugGroup = new THREE.Group();
  for (const c of COLLIDERS[myRoom]) {
    const sel = editMode && c === editSel;
    const mat = new THREE.MeshBasicMaterial({
      color: sel ? 0xffd23f : 0xff3355,
      transparent: true,
      opacity: sel ? 0.55 : 0.4,
      depthWrite: false,
    });
    let mesh;
    if (c.type === 'r') {
      const w = Math.max(0.1, Math.abs(c.x2 - c.x1));
      const h = Math.max(0.1, Math.abs(c.z2 - c.z1));
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set((c.x1 + c.x2) / 2, 0.06, (c.z1 + c.z2) / 2);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotateZ(-(c.a || 0));
    } else {
      mesh = new THREE.Mesh(new THREE.CircleGeometry(c.r, 32), mat);
      mesh.position.set(c.x, 0.06, c.z);
      mesh.rotation.x = -Math.PI / 2;
    }
    debugGroup.add(mesh);
  }
  if (editMode && editSel) {
    handlePositions(editSel).forEach(([hx, hz], i) => {
      const isRot = editSel.type === 'r' && i === 4;
      const h = new THREE.Mesh(
        isRot ? new THREE.CircleGeometry(0.55, 20) : new THREE.PlaneGeometry(0.9, 0.9),
        new THREE.MeshBasicMaterial({ color: isRot ? 0x4fd8ff : 0xffffff, depthWrite: false })
      );
      h.rotation.x = -Math.PI / 2;
      h.position.set(hx, 0.1, hz);
      debugGroup.add(h);
    });
  }
  gameScene.add(debugGroup);
}

// ---------- 콜라이더 편집기 (⌘⌥M) ----------
const editUI = document.getElementById('editUI');
const editHint = document.getElementById('editHint');
const exportModal = document.getElementById('exportModal');
const exportText = document.getElementById('exportText');
let editMode = false;
let editSel = null;
let editDrag = null;

function toggleEditMode() {
  if (!editMode && myRoom < 0) return; // 로비에선 편집기 사용 불가
  editMode = !editMode;
  editUI.hidden = !editMode;
  editHint.hidden = !editMode;
  if (editMode && paintMode) togglePaintMode();
  if (!editMode) {
    editSel = null;
    editDrag = null;
    exportModal.hidden = true;
  }
  keys.clear();
  buildDebugOverlay();
}

function handlePositions(c) {
  if (c.type === 'r') {
    const hx = Math.abs(c.x2 - c.x1) / 2;
    const hz = Math.abs(c.z2 - c.z1) / 2;
    return [
      toWorld(c, -hx, -hz), toWorld(c, hx, -hz),
      toWorld(c, -hx, hz), toWorld(c, hx, hz),
      toWorld(c, 0, -(hz + 2)), // 회전 핸들 (윗변 바깥)
    ];
  }
  return [[c.x, c.z], [c.x + c.r, c.z]];
}

function applyHandle(c, i, p, snap15) {
  if (c.type === 'r') {
    if (i === 4) {
      // 회전: 핸들 방향 → 각도 (1° 스냅, Shift로 15°)
      const ctr = rectCenter(c);
      let deg = (Math.atan2(p.x - ctr.x, -(p.z - ctr.z)) * 180) / Math.PI;
      deg = Math.round(snap15 ? deg / 15 : deg) * (snap15 ? 15 : 1);
      c.a = (deg * Math.PI) / 180;
      return;
    }
    // 모서리: 로컬 프레임에서 리사이즈
    const ctr = rectCenter(c);
    const l = toLocal(c, p.x, p.z);
    const ax = ctr.x + l.x, az = ctr.z + l.z;
    if (i === 0) { c.x1 = ax; c.z1 = az; }
    else if (i === 1) { c.x2 = ax; c.z1 = az; }
    else if (i === 2) { c.x1 = ax; c.z2 = az; }
    else { c.x2 = ax; c.z2 = az; }
  } else if (i === 0) {
    c.x = p.x;
    c.z = p.z;
  } else {
    c.r = Math.max(0.4, Math.hypot(p.x - c.x, p.z - c.z));
  }
}

function colliderContains(c, p) {
  if (c.type === 'r') {
    const l = toLocal(c, p.x, p.z);
    return Math.abs(l.x) < Math.abs(c.x2 - c.x1) / 2 && Math.abs(l.z) < Math.abs(c.z2 - c.z1) / 2;
  }
  return Math.hypot(p.x - c.x, p.z - c.z) < c.r;
}

function floorPoint(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(floor)[0];
  return hit ? hit.point : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!editMode || e.button !== 0) return;
  const p = floorPoint(e);
  if (!p) return;
  if (editSel) {
    const hs = handlePositions(editSel);
    for (let i = 0; i < hs.length; i++) {
      if (Math.hypot(p.x - hs[i][0], p.z - hs[i][1]) < 0.9) {
        editDrag = { type: 'handle', i };
        return;
      }
    }
  }
  const list = COLLIDERS[myRoom];
  for (let i = list.length - 1; i >= 0; i--) {
    if (colliderContains(list[i], p)) {
      editSel = list[i];
      editDrag = { type: 'move', last: { x: p.x, z: p.z } };
      buildDebugOverlay();
      return;
    }
  }
  editSel = null;
  buildDebugOverlay();
});
addEventListener('pointermove', (e) => {
  if (!editMode || !editDrag || !editSel) return;
  const p = floorPoint(e);
  if (!p) return;
  if (editDrag.type === 'move') {
    const dx = p.x - editDrag.last.x;
    const dz = p.z - editDrag.last.z;
    if (editSel.type === 'r') {
      editSel.x1 += dx; editSel.x2 += dx;
      editSel.z1 += dz; editSel.z2 += dz;
    } else {
      editSel.x += dx;
      editSel.z += dz;
    }
    editDrag.last = { x: p.x, z: p.z };
  } else {
    applyHandle(editSel, editDrag.i, p, e.shiftKey);
  }
  buildDebugOverlay();
});
addEventListener('pointerup', () => {
  if (editDrag && editSel && editSel.type === 'r') {
    if (editSel.x1 > editSel.x2) [editSel.x1, editSel.x2] = [editSel.x2, editSel.x1];
    if (editSel.z1 > editSel.z2) [editSel.z1, editSel.z2] = [editSel.z2, editSel.z1];
    buildDebugOverlay();
  }
  editDrag = null;
});

document.getElementById('roomBtn').addEventListener('click', () => {
  editSel = null;
  setRoom((myRoom + 1) % ROOMS.length);
  sendMove();
});
document.getElementById('addRectBtn').addEventListener('click', () => {
  const c = { type: 'r', x1: -3, z1: -3, x2: 3, z2: 3 };
  COLLIDERS[myRoom].push(c);
  editSel = c;
  buildDebugOverlay();
});
document.getElementById('addCircleBtn').addEventListener('click', () => {
  const c = { type: 'c', x: 0, z: 0, r: 3 };
  COLLIDERS[myRoom].push(c);
  editSel = c;
  buildDebugOverlay();
});
document.getElementById('delBtn').addEventListener('click', () => {
  if (!editSel) return;
  const list = COLLIDERS[myRoom];
  const i = list.indexOf(editSel);
  if (i >= 0) list.splice(i, 1);
  editSel = null;
  buildDebugOverlay();
});

function exportColliders() {
  const f = (w) => (w / MAP_SIZE + 0.5).toFixed(3);
  const fr = (w) => (w / MAP_SIZE).toFixed(3);
  let out = 'const COLLIDERS = [\n';
  COLLIDERS.forEach((list, i) => {
    out += `  [ // ${ROOMS[i].name}\n`;
    for (const c of list) {
      if (c.type === 'r') {
        const deg = ((c.a || 0) * 180) / Math.PI;
        const rot = Math.abs(deg) > 0.05 ? `, ${+deg.toFixed(1)}` : '';
        out += `    R(${f(Math.min(c.x1, c.x2))}, ${f(Math.min(c.z1, c.z2))}, ${f(Math.max(c.x1, c.x2))}, ${f(Math.max(c.z1, c.z2))}${rot}),\n`;
      } else {
        out += `    C(${f(c.x)}, ${f(c.z)}, ${fr(c.r)}),\n`;
      }
    }
    out += '  ],\n';
  });
  out += '];';
  return out;
}

document.getElementById('exportBtn').addEventListener('click', () => {
  exportText.value = exportColliders();
  exportModal.hidden = false;
  exportText.focus();
  exportText.select();
  if (navigator.clipboard) navigator.clipboard.writeText(exportText.value).catch(() => {});
});
document.getElementById('exportClose').addEventListener('click', () => { exportModal.hidden = true; });

let transitioning = false;
let doorLock = null; // 방금 통과해 나온 문 — 벗어나야 다시 발동

function goThroughDoor(door) {
  transitioning = true;
  fadeEl.style.opacity = '1';
  setTimeout(() => {
    const dest = ROOMS[door.to.room].doors[door.to.door];
    const dw = doorWorld(dest);
    // 도착 문에서 방 중앙 쪽으로 살짝 들어간 위치에 스폰
    const dir = new THREE.Vector2(-dw.x, -dw.z).normalize();
    myPos.x = dw.x + dir.x * 3.2;
    myPos.z = dw.z + dir.y * 3.2;
    setRoom(door.to.room);
    doorLock = dest;
    sendMove();
    fadeEl.style.opacity = '0';
    setTimeout(() => { transitioning = false; }, 380);
  }, 380);
}

function checkDoors() {
  if (transitioning) return;
  const room = ROOMS[myRoom];
  for (const door of room.doors) {
    const dw = doorWorld(door);
    const dist = Math.hypot(myPos.x - dw.x, myPos.z - dw.z);
    if (door === doorLock) {
      if (dist > DOOR_RADIUS * 1.6) doorLock = null;
      continue;
    }
    if (dist < DOOR_RADIUS) {
      goThroughDoor(door);
      return;
    }
  }
}

// ---------- 페인팅 모드 ----------
// P로 열리는 작은 도구 패널(색상/스포이트/붓 두께)만 띄우고,
// 게임 화면 속 내 캐릭터에 직접 드래그해서 칠한다.
const paintUI = document.getElementById('paintUI');
const paintDrag = document.getElementById('paintDrag');
const brushSizeEl = document.getElementById('brushSize');
const brushSizeVal = document.getElementById('brushSizeVal');
const eyedropBtn = document.getElementById('eyedropBtn');
let paintMode = false;
let eyedrop = false;

brushSizeEl.addEventListener('input', () => { brushSizeVal.textContent = brushSizeEl.value; });

// ---------- 커스텀 팔레트 (SV 사각형 + 휴/알파 슬라이더) ----------
const svBox = document.getElementById('svBox');
const svThumb = document.getElementById('svThumb');
const hueBar = document.getElementById('hueBar');
const hueThumb = document.getElementById('hueThumb');
const alphaBar = document.getElementById('alphaBar');
const alphaFill = document.getElementById('alphaFill');
const alphaThumb = document.getElementById('alphaThumb');

let brushHue = 349, brushSat = 0.7, brushVal = 1, brushAlpha = 1;

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, max ? d / max : 0, max];
}

function brushHex() {
  const [r, g, b] = hsvToRgb(brushHue, brushSat, brushVal);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function refreshPalette() {
  const [hr, hg, hb] = hsvToRgb(brushHue, 1, 1);
  svBox.style.setProperty('--hue-color', `rgb(${hr},${hg},${hb})`);
  const hex = brushHex();
  svThumb.style.left = `${brushSat * 100}%`;
  svThumb.style.top = `${(1 - brushVal) * 100}%`;
  svThumb.style.background = hex;
  hueThumb.style.left = `${(brushHue / 360) * 100}%`;
  hueThumb.style.top = '50%';
  hueThumb.style.background = `rgb(${hr},${hg},${hb})`;
  alphaFill.style.background = `linear-gradient(to right, transparent, ${hex})`;
  alphaThumb.style.left = `${brushAlpha * 100}%`;
  alphaThumb.style.top = '50%';
  alphaThumb.style.background = hex;
}

function bindDrag(el, fn) {
  let active = false;
  el.addEventListener('pointerdown', (e) => {
    active = true;
    el.setPointerCapture(e.pointerId);
    fn(e);
  });
  el.addEventListener('pointermove', (e) => { if (active) fn(e); });
  el.addEventListener('pointerup', () => { active = false; });
  el.addEventListener('lostpointercapture', () => { active = false; });
}

const frac = (e, el, horiz = true) => {
  const r = el.getBoundingClientRect();
  const v = horiz ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  return Math.max(0, Math.min(1, v));
};

bindDrag(svBox, (e) => {
  brushSat = frac(e, svBox);
  brushVal = 1 - frac(e, svBox, false);
  refreshPalette();
});
bindDrag(hueBar, (e) => {
  brushHue = frac(e, hueBar) * 360;
  refreshPalette();
});
bindDrag(alphaBar, (e) => {
  brushAlpha = frac(e, alphaBar);
  refreshPalette();
});
refreshPalette();

function setEyedrop(on) {
  eyedrop = on;
  eyedropBtn.classList.toggle('on', on);
  renderer.domElement.style.cursor = on ? 'crosshair' : '';
}
eyedropBtn.addEventListener('click', () => setEyedrop(!eyedrop));

function togglePaintMode() {
  paintMode = !paintMode;
  paintUI.hidden = !paintMode;
  if (!paintMode) setEyedrop(false);
  keys.clear();
}

// 패널 드래그
let dragOff = null;
paintDrag.addEventListener('pointerdown', (e) => {
  const r = paintUI.getBoundingClientRect();
  dragOff = { x: e.clientX - r.left, y: e.clientY - r.top };
  paintDrag.setPointerCapture(e.pointerId);
});
paintDrag.addEventListener('pointermove', (e) => {
  if (!dragOff) return;
  paintUI.style.left = `${e.clientX - dragOff.x}px`;
  paintUI.style.top = `${e.clientY - dragOff.y}px`;
  paintUI.style.right = 'auto';
});
paintDrag.addEventListener('pointerup', () => { dragOff = null; });

// 캐릭터 직접 칠하기 (스프라이트 레이캐스트 → 60x60 페인트 캔버스)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let painting = false;
let lastPx = null;

function toHex(n) { return n.toString(16).padStart(2, '0'); }

// 스포이트: 커서 아래 화면 픽셀을 그대로 샘플 (맵이든 캐릭터든)
function sampleColorAt(e) {
  renderer.render(gameScene, camera); // 방금 그린 프레임에서 읽기
  const gl = renderer.getContext();
  const ratio = renderer.getPixelRatio();
  const x = Math.min(gl.drawingBufferWidth - 1, Math.max(0, Math.floor(e.clientX * ratio)));
  const y = Math.min(gl.drawingBufferHeight - 1, Math.max(0, Math.floor(gl.drawingBufferHeight - e.clientY * ratio - 1)));
  const buf = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  [brushHue, brushSat, brushVal] = rgbToHsv(buf[0], buf[1], buf[2]);
  refreshPalette();
  setEyedrop(false);
}

function paintFromEvent(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(me.sprite)[0];
  if (!hit || !hit.uv) { lastPx = null; return; }
  const px = hit.uv.x * SPR;
  const py = (1 - hit.uv.y) * SPR;

  const size = +brushSizeEl.value;
  const color = brushHex();
  const pts = [];
  if (lastPx) {
    const dist = Math.hypot(px - lastPx.x, py - lastPx.y);
    const steps = Math.max(1, Math.ceil(dist));
    for (let i = 1; i <= steps; i++) {
      pts.push({ x: lastPx.x + (px - lastPx.x) * (i / steps), y: lastPx.y + (py - lastPx.y) * (i / steps) });
    }
  } else {
    pts.push({ x: px, y: py });
  }
  for (const p of pts) {
    const s = { u: +(p.x / SPR).toFixed(4), v: +(p.y / SPR).toFixed(4), s: size, c: color, a: +brushAlpha.toFixed(2) };
    drawStroke(me, s);
    strokeOutbox.push(s);
    myStrokes.push(s);
  }
  if (myStrokes.length > 20000) myStrokes.splice(0, myStrokes.length - 20000);
  lastPx = { x: px, y: py };
  compose(me);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!paintMode || e.button !== 0) return;
  if (eyedrop) {
    sampleColorAt(e);
    return;
  }
  painting = true;
  lastPx = null;
  paintFromEvent(e);
});

// finder 발사: 페인트/편집 모드가 아닐 때 클릭한 방향으로
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (paintMode || editMode || escOpen || waitingRoom || e.button !== 0) return;
  tryShoot(e);
});
addEventListener('pointermove', (e) => { if (painting) paintFromEvent(e); });
addEventListener('pointerup', () => { painting = false; lastPx = null; });

// ---------- 게임 루프 ----------
const SPEED = 9;
const BOUND = MAP_SIZE * 0.47;
let camH = 20, camOff = 9;

// 로비 플로팅: 아주 느린 시계방향 회전 + 둥실둥실 바운스
function applyFloat(char, dt, on) {
  if (on) {
    char.sprite.material.rotation -= dt * 0.1;
    char.sprite.position.y = 1.05 + Math.sin(performance.now() / 1000 + char.bobSeed) * 0.2;
    char.shadow.visible = false;
  } else {
    char.sprite.material.rotation = 0;
    char.sprite.position.y = 1.05;
    char.shadow.visible = true;
  }
  if (char.label) char.label.visible = on; // 닉네임은 대기실에서만
}
const clock = new THREE.Clock();
let moveTimer = 0;

// 부팅: 대기실(로비)에서 시작
myPos.set((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16);
setRoom(-1);
requestAnimationFrame(() => { fadeEl.style.opacity = '0'; });

function update(dt) {
  const inLobby = myRoom < 0;
  if (!paintMode && !transitioning && !editMode && !waitingRoom && !escOpen && !frozen && !chatOpen) {
    let dx = 0, dz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('ArrowRight')) dx += 1; // D는 춤 키
    me.moving = !!(dx || dz);
    // D 홀드 = 제자리 쌈바 (이동 중엔 무시) — 리빌 강제 춤 중엔 유지
    if (gameMode !== 'reveal' || !me.rainbow) {
      me.dancing = keys.has('KeyD') && !me.moving;
    }
    if (me.moving) {
      const speed = inLobby ? SPEED / 6 : SPEED; // 로비에선 둥둥 (1/6배)
      const bound = inLobby ? 13 : BOUND; // 로비는 고정 화면 안에서만
      const len = Math.hypot(dx, dz);
      const nx = THREE.MathUtils.clamp(myPos.x + (dx / len) * speed * dt, -bound, bound);
      const nz = THREE.MathUtils.clamp(myPos.z + (dz / len) * speed * dt, -bound, bound);
      // 장애물 충돌: 막히면 축 단위로 미끄러짐.
      // 이미 콜라이더 안에 끼어 있으면 자유 이동 허용 (탈출용)
      if (blocked(myPos.x, myPos.z) || !blocked(nx, nz)) {
        myPos.x = nx;
        myPos.z = nz;
      } else if (!blocked(nx, myPos.z)) {
        myPos.x = nx;
      } else if (!blocked(myPos.x, nz)) {
        myPos.z = nz;
      }
      // 바라보는 방향: 우세한 축 기준
      if (Math.abs(dx) >= Math.abs(dz)) me.facing = dx > 0 ? 'right' : 'left';
      else me.facing = dz > 0 ? 'down' : 'up';
      me.phase += dt * (inLobby ? 3 : 9);
    }
    if (!inLobby) checkDoors();

    moveTimer += dt;
    if (moveTimer > 0.08) {
      moveTimer = 0;
      sendMove();
    }
  } else {
    me.moving = false;
    moveTimer += dt;
    if (moveTimer > 0.25) {
      moveTimer = 0;
      sendMove(); // 멈춤 상태(mv=0)도 전파
    }
  }

  me.group.position.set(myPos.x, 0, myPos.z);
  applyFloat(me, dt, inLobby);
  if (me.dancing) me.dancePhase += dt * 8;
  compose(me);

  // 다른 플레이어: 위치 보간 + 걸음/춤 애니메이션
  for (const o of others.values()) {
    const g = o.char.group;
    g.position.x += (o.target.x - g.position.x) * Math.min(1, dt * 12);
    g.position.z += (o.target.z - g.position.z) * Math.min(1, dt * 12);
    if (g.visible) {
      if (o.char.moving) o.char.phase += dt * (inLobby ? 3 : 9);
      if (o.char.dancing) o.char.dancePhase += dt * 8;
      applyFloat(o.char, dt, inLobby && o.room < 0);
      compose(o.char);
    }
  }

  updateBullets(dt);

  // 카메라: 편집 모드 → 방 전체 / 로비 → 고정 (캐릭터가 화면 위를 떠다님) / 게임 → 플레이어 팔로우
  if (editMode) {
    camera.position.set(0, 46, 0.1);
    camera.lookAt(0, 0, 0);
  } else if (inLobby) {
    camera.position.set(0, 34, 0.1);
    camera.lookAt(0, 0, 0);
  } else {
    camera.position.set(myPos.x, camH, myPos.z + camOff);
    camera.lookAt(myPos.x, 0, myPos.z);
  }
}

function tick() {
  requestAnimationFrame(tick);
  update(Math.min(clock.getDelta(), 0.05));

  // 타이머 HUD
  const now = Date.now();
  if (topTimerEnd > now) {
    topTimerEl.hidden = false;
    topTimerEl.textContent = Math.ceil((topTimerEnd - now) / 1000);
  } else {
    topTimerEl.hidden = true;
  }
  if (bigTimerEnd > now) {
    bigTimerEl.hidden = false;
    bigTimerEl.textContent = Math.ceil((bigTimerEnd - now) / 1000);
  } else {
    bigTimerEl.hidden = true;
  }

  renderer.render(gameScene, camera);
}
tick();

// 디버그용 (숨김 탭에서는 rAF가 멈추므로 수동 스텝 제공)
window.__dbg = {
  keys, myPos, others, me,
  get room() { return myRoom; },
  get paint() { return paintMode; },
  get trans() { return transitioning; },
  get clicks() { return secretClicks; },
  bgm,
  get conn() { return connected; },
  get waitFlag() { return waitingRoom; },
  step(dt, n = 1) { for (let i = 0; i < n; i++) update(dt); },
  get mode() { return gameMode; },
  get role() { return myRole; },
  shoot(dx, dz) {
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    spawnBullet(myPos.x, myPos.z, nx, nz, myRoom, true);
    if (connected && ws) {
      ws.send(JSON.stringify({
        t: 'shoot',
        x: +myPos.x.toFixed(2), z: +myPos.z.toFixed(2),
        dx: +nx.toFixed(3), dz: +nz.toFixed(3), room: myRoom,
      }));
    }
  },
  blocked,
  teleport(room, x, z) { setRoom(room); myPos.set(x, 0, z); },
  cam(h, off) { camH = h; camOff = off; },
  testStroke(u, v, size, color) {
    const s = { u, v, s: size, c: color };
    drawStroke(me, s);
    compose(me);
    strokeOutbox.push(s);
    myStrokes.push(s);
  },
};

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
