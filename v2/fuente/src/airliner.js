import * as THREE from 'three';
import { canvas, texFromCanvas, smoothstep } from './util.js';

// Avión comercial bimotor de fuselaje estrecho, construido por código.
// Origen: punto de contacto del tren principal con el suelo. Nariz hacia +X.
// Eje del fuselaje a 4 m del suelo; longitud 38.3 m; envergadura 35.4 m.

const NAVY = '#12284c';
const GOLD = '#d9a441';
const WHITE = '#f4f6f9';
const AXIS = 4.0;

// ───────── geometría ─────────

function profileFrom(keys, n) {
  const curve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k[0], k[1], k[2])), false, 'centripetal');
  return curve.getSpacedPoints(n).map((p) => ({ x: p.x, r: Math.max(p.y, 0), y: p.z }));
}

// Tubo a lo largo de X con normales analíticas (sin costura visible en el lomo)
function tube(profile, seg) {
  const n = profile.length, pos = [], nor = [], uv = [], idx = [];
  const x0 = profile[0].x, L = profile[n - 1].x - x0;
  for (let i = 0; i < n; i++) {
    const p = profile[i], a = profile[Math.max(i - 1, 0)], b = profile[Math.min(i + 1, n - 1)];
    const dx = b.x - a.x || 1e-4, dr = (b.r - a.r) / dx, dy = (b.y - a.y) / dx;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(p.x, p.y + c * p.r, s * p.r);
      const nx = -dr - dy * c, l = Math.hypot(nx, c, s);
      nor.push(nx / l, c / l, s / l);
      uv.push((p.x - x0) / L, j / seg);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function airfoil(K) {
  const pts = [];
  for (let i = 0; i <= K; i++) pts.push([0.5 * (1 + Math.cos((Math.PI * i) / K)), 1]);
  for (let i = 1; i <= K; i++) pts.push([0.5 * (1 - Math.cos((Math.PI * i) / K)), -1]);
  return pts;
}
const yt = (a, t) => 5 * t * (0.2969 * Math.sqrt(a) - 0.126 * a - 0.3516 * a * a + 0.2843 * a ** 3 - 0.1036 * a ** 4);

// Superficie sustentadora: perfiles NACA unidos entre secciones.
// sections: { le:[x,y,z] borde de ataque, chord, t espesor, tdir dirección del espesor }
function loft(sections, { K = 22, camber = 0.025 } = {}) {
  const af = airfoil(K), R = af.length, S = sections.length;
  const pos = [], uv = [], idx = [];
  sections.forEach((s, si) => {
    const td = s.tdir || [0, 1, 0];
    for (const [a, side] of af) {
      const off = (camber * 4 * a * (1 - a) + side * yt(a, s.t)) * s.chord;
      pos.push(s.le[0] - a * s.chord + td[0] * off, s.le[1] + td[1] * off, s.le[2] + td[2] * off);
      uv.push(a, si / (S - 1));
    }
  });
  for (let si = 0; si < S - 1; si++)
    for (let k = 0; k < R - 1; k++) {
      const A = si * R + k, B = A + 1, C = A + R, D = C + 1;
      idx.push(A, C, B, B, C, D);
    }
  // orientar hacia afuera: comprobar un triángulo del extradós
  const k0 = Math.floor(K / 2), A = k0, B = A + 1, C = A + R;
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const nrm = new THREE.Vector3().crossVectors(v(C).sub(v(A)), v(B).sub(v(A)));
  if (nrm.dot(new THREE.Vector3(...(sections[0].tdir || [0, 1, 0]))) < 0)
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  // tapas en ambos extremos (doble cara)
  for (const si of [0, S - 1]) {
    const c = [0, 0, 0];
    for (let k = 0; k < R; k++) for (let q = 0; q < 3; q++) c[q] += pos[(si * R + k) * 3 + q] / R;
    const base = pos.length / 3;
    for (let k = 0; k < R; k++) {
      pos.push(pos[(si * R + k) * 3], pos[(si * R + k) * 3 + 1], pos[(si * R + k) * 3 + 2]);
      uv.push(0.5, si / (S - 1));
    }
    pos.push(...c);
    uv.push(0.5, si / (S - 1));
    const cc = base + R;
    for (let k = 0; k < R - 1; k++) idx.push(base + k, base + k + 1, cc, base + k + 1, base + k, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function mirrorZ(g) {
  const m = g.clone();
  m.scale(1, 1, -1);
  const idx = m.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  m.index.needsUpdate = true;
  m.computeVertexNormals();
  return m;
}

// ───────── texturas (librea ficticia "AERORUTA") ─────────

function fuselageTexture(x0, L) {
  const W = 4096, H = 1024;
  const [c, g] = canvas(W, H);
  const X = (x) => ((x - x0) / L) * W;
  const Y = (deg) => (deg / 360) * H;
  g.fillStyle = WHITE;
  g.fillRect(0, 0, W, H);
  // panza y barrido azul que sube hacia la cola
  for (let px = 0; px < W; px++) {
    const x = x0 + (px / W) * L;
    const lo = 113 - smoothstep(-5, -20.6, x) * 84;
    g.fillStyle = NAVY;
    g.fillRect(px, Y(lo), 1.2, Y(360 - 2 * lo));
    g.fillStyle = GOLD;
    g.fillRect(px, Y(lo - 4.2), 1.2, Y(1.6));
    g.fillRect(px, Y(360 - lo + 2.6), 1.2, Y(1.6));
  }
  // líneas de paneles muy sutiles
  g.fillStyle = 'rgba(40,50,70,0.07)';
  for (let x = -19; x < 17; x += 0.52) g.fillRect(X(x), 0, 1.5, H);
  for (const d of [36, 140, 220, 324]) g.fillRect(0, Y(d), W, 1.5);
  // ventanillas
  const win = (cx, thc, side) => {
    const w = (0.25 / L) * W, h = Y(10.6);
    const x = X(cx) - w / 2, y = Y(thc) - h / 2;
    g.fillStyle = '#0f1724';
    g.beginPath();
    g.roundRect(x, y, w, h, w * 0.45);
    g.fill();
    g.fillStyle = 'rgba(120,150,190,0.35)';
    g.fillRect(x + w * 0.2, y + h * (side > 0 ? 0.15 : 0.6), w * 0.6, h * 0.22);
  };
  for (let x = -10.4; x < 11.4; x += 0.53) {
    if ((x > -0.7 && x < 1.4) || (x > 11.9)) continue;
    win(x, 74, 1);
    win(x, 286, -1);
  }
  // puertas y salidas sobre el ala
  g.strokeStyle = 'rgba(30,38,52,0.55)';
  g.lineWidth = 3;
  const door = (xa, xb, ta, tb) => {
    for (const [a, b] of [[ta, tb], [360 - tb, 360 - ta]]) {
      g.beginPath();
      g.roundRect(X(xa), Y(a), X(xb) - X(xa), Y(b - a), 10);
      g.stroke();
    }
  };
  door(12.35, 13.2, 50, 105);
  door(-12.3, -11.45, 50, 105);
  door(-0.55, -0.05, 62, 92);
  door(0.55, 1.05, 62, 92);
  door(-6.0, -4.8, 112, 132);
  door(7.2, 8.6, 112, 132);
  // cabina de mando
  g.fillStyle = '#0c121c';
  const pane = (xa, xb, ta, tb) => {
    for (const [a, b] of [[ta, tb], [360 - tb, 360 - ta]]) {
      g.beginPath();
      g.moveTo(X(xa), Y(a + 3));
      g.lineTo(X(xb), Y(a));
      g.lineTo(X(xb), Y(b));
      g.lineTo(X(xa), Y(b - 2));
      g.closePath();
      g.fill();
    }
  };
  pane(15.72, 16.3, 10, 44);
  pane(15.06, 15.62, 47, 72);
  pane(14.45, 14.95, 53, 74);
  g.fillStyle = 'rgba(160,190,220,0.25)';
  g.fillRect(X(15.8), Y(16), X(16.2) - X(15.8), Y(6));
  // nombre a ambos lados
  const name = (thc, flip) => {
    g.save();
    g.translate(X(3.4), Y(thc));
    if (flip) g.rotate(Math.PI);
    g.scale(1, 0.92);
    g.font = `italic 800 ${Y(19)}px "Segoe UI", "Bahnschrift", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = NAVY;
    g.fillText('AERORUTA', 0, 0);
    g.restore();
  };
  name(50, false);
  name(310, true);
  const reg = (thc, flip) => {
    g.save();
    g.translate(X(-15.4), Y(thc));
    if (flip) g.rotate(Math.PI);
    g.font = `600 ${Y(6)}px "Segoe UI", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = NAVY;
    g.fillText('AR-2026', 0, 0);
    g.restore();
  };
  reg(48, false);
  reg(312, true);
  const t = texFromCanvas(c, { flipY: false, aniso: 16 });
  return t;
}

function wingTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#d9dde2';
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#c3c8cf';
  g.fillRect(0, 0, 512 * 0.06, 512);
  g.fillStyle = 'rgba(60,70,85,0.35)';
  for (const a of [0.14, 0.7, 0.86]) g.fillRect(a * 512, 0, 2, 512);
  for (const v of [0.18, 0.42, 0.63, 0.82]) g.fillRect(0.7 * 512, v * 512, 0.3 * 512, 2);
  g.fillStyle = 'rgba(60,70,85,0.12)';
  for (let v = 0; v < 512; v += 26) g.fillRect(0.14 * 512, v, 0.56 * 512, 1);
  return texFromCanvas(c, { flipY: false });
}

function finTexture() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = NAVY;
  g.fillRect(0, 0, 1024, 1024);
  // barrido dorado (u = cuerda, v = altura)
  g.fillStyle = GOLD;
  g.beginPath();
  g.moveTo(0, 230);
  g.bezierCurveTo(350, 330, 700, 300, 1024, 120);
  g.lineTo(1024, 175);
  g.bezierCurveTo(700, 360, 350, 390, 0, 290);
  g.closePath();
  g.fill();
  // emblema simétrico: círculo con alas
  g.save();
  g.translate(420, 600);
  g.scale(1, 1.25);
  g.strokeStyle = WHITE;
  g.lineWidth = 22;
  g.beginPath();
  g.arc(0, 0, 120, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = WHITE;
  g.beginPath();
  g.moveTo(0, -80);
  g.lineTo(95, 55);
  g.lineTo(0, 15);
  g.lineTo(-95, 55);
  g.closePath();
  g.fill();
  g.restore();
  return texFromCanvas(c, { flipY: false });
}

function nacelleTexture() {
  const [c, g] = canvas(512, 64);
  g.fillStyle = NAVY;
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#c9ced6';
  g.fillRect(512 * 0.9, 0, 512 * 0.1, 64);
  g.fillStyle = GOLD;
  g.fillRect(512 * 0.86, 0, 6, 64);
  g.fillStyle = '#6b7380';
  g.fillRect(0, 0, 512 * 0.05, 64);
  return texFromCanvas(c, { flipY: false });
}

function spinnerTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#e8ebef';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#101418';
  g.lineWidth = 9;
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const u = i / 64;
    g.lineTo(u * 128, ((u * 0.9 + 0.1) * 256) % 256);
  }
  g.stroke();
  return texFromCanvas(c, { flipY: false });
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glowTex = texFromCanvas(c, { srgb: false });
  return glowTex;
}

// ───────── ensamblaje ─────────

export function createAirliner() {
  const root = new THREE.Group();
  root.name = 'airliner';
  const body = new THREE.Group();
  root.add(body);

  const keys = [
    [-20.75, 0.0, 1.15], [-20.6, 0.28, 1.12], [-19.0, 0.72, 0.95], [-17.0, 1.17, 0.68], [-15.0, 1.55, 0.42],
    [-13.0, 1.84, 0.18], [-11.0, 1.97, 0.03], [-8, 1.98, 0], [10, 1.98, 0], [12.6, 1.96, -0.02],
    [14.2, 1.86, -0.1], [15.4, 1.62, -0.22], [16.4, 1.22, -0.36], [17.1, 0.72, -0.48], [17.45, 0.3, -0.55], [17.58, 0.0, -0.58],
  ];
  const prof = profileFrom(keys, 200).map((p) => ({ ...p, y: p.y + AXIS }));
  const fusGeo = tube(prof, 96);
  const x0 = prof[0].x, L = prof[prof.length - 1].x - x0;
  const fusMat = new THREE.MeshPhysicalMaterial({
    map: fuselageTexture(x0, L), roughness: 0.3, metalness: 0.06, clearcoat: 0.9, clearcoatRoughness: 0.1,
  });
  const fus = new THREE.Mesh(fusGeo, fusMat);
  body.add(fus);

  const wingMat = new THREE.MeshPhysicalMaterial({ map: wingTexture(), roughness: 0.34, metalness: 0.45, clearcoat: 0.4 });
  const navyMat = new THREE.MeshPhysicalMaterial({ color: NAVY, roughness: 0.3, metalness: 0.2, clearcoat: 0.8 });
  const finMat = new THREE.MeshPhysicalMaterial({ map: finTexture(), roughness: 0.28, metalness: 0.1, clearcoat: 0.9 });
  const greyMat = new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.45, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1b1e23', roughness: 0.6, metalness: 0.4 });

  // ala derecha (+Z) con quiebre, y su espejo
  const wingR = loft([
    { le: [4.5, 2.45, 0], chord: 7.2, t: 0.15 },
    { le: [1.3, 3.11, 6.3], chord: 4.3, t: 0.13 },
    { le: [-4.15, 4.23, 17.0], chord: 1.5, t: 0.11 },
  ]);
  body.add(new THREE.Mesh(wingR, wingMat), new THREE.Mesh(mirrorZ(wingR), wingMat));
  // sharklets
  const wl = loft(
    [
      { le: [-4.2, 4.18, 17.0], chord: 1.45, t: 0.1, tdir: [0, 0, 1] },
      { le: [-4.75, 5.0, 17.18], chord: 1.15, t: 0.1, tdir: [0, 0, 1] },
      { le: [-5.65, 6.75, 17.36], chord: 0.68, t: 0.09, tdir: [0, 0, 1] },
    ],
    { camber: 0 }
  );
  body.add(new THREE.Mesh(wl, navyMat), new THREE.Mesh(mirrorZ(wl), navyMat));
  // estabilizador horizontal
  const htp = loft([
    { le: [-14.3, 4.55, 0], chord: 3.9, t: 0.1 },
    { le: [-17.9, 5.0, 6.2], chord: 1.5, t: 0.09 },
  ], { camber: 0 });
  body.add(new THREE.Mesh(htp, wingMat), new THREE.Mesh(mirrorZ(htp), wingMat));
  // deriva
  const fin = loft([
    { le: [-12.4, 5.4, 0], chord: 6.4, t: 0.11, tdir: [0, 0, 1] },
    { le: [-14.9, 8.6, 0], chord: 4.4, t: 0.1, tdir: [0, 0, 1] },
    { le: [-17.6, 11.7, 0], chord: 2.6, t: 0.09, tdir: [0, 0, 1] },
  ], { camber: 0 });
  body.add(new THREE.Mesh(fin, finMat));
  // carenado ventral ala-fuselaje
  const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshPhysicalMaterial({ color: '#d4d8de', roughness: 0.35, metalness: 0.1, clearcoat: 0.6 }));
  fair.scale.set(8.2, 1.15, 2.05);
  fair.position.set(1.0, 2.55, 0);
  body.add(fair);
  // carenados de rieles de flaps
  const pod = new THREE.SphereGeometry(1, 16, 8);
  for (const [x, y, z] of [[-1.0, 2.62, 5.0], [-2.3, 3.1, 9.2], [-3.6, 3.52, 13.0]])
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(pod, greyMat);
      m.scale.set(1.5, 0.24, 0.2);
      m.position.set(x, y - 0.3, z * s);
      body.add(m);
    }
  // antenas
  for (const [x, y, up] of [[6, AXIS + 1.97, 1], [-4, AXIS + 1.96, 1], [9, AXIS - 1.95, -1]]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.05), greyMat);
    a.position.set(x, y + 0.13 * up, 0);
    a.rotation.z = -0.25;
    body.add(a);
  }

  // motores
  const fans = [];
  const nacProf = profileFrom([[-3.75, 0.7, 0], [-3.3, 0.86, 0], [-2.2, 1.04, 0], [-0.75, 1.1, 0], [-0.15, 1.06, 0], [0, 0.97, 0]], 60);
  const nacGeo = tube(nacProf, 64);
  const nacMat = new THREE.MeshPhysicalMaterial({ map: nacelleTexture(), roughness: 0.28, metalness: 0.35, clearcoat: 0.8 });
  const inner = tube(profileFrom([[-0.55, 0.9, 0], [-0.2, 0.93, 0], [0.01, 0.97, 0]], 8), 48);
  const innerMat = new THREE.MeshStandardMaterial({ color: '#5a6069', roughness: 0.4, metalness: 0.8, side: THREE.BackSide });
  const core = tube(profileFrom([[-5.0, 0.0, 0], [-4.85, 0.22, 0], [-4.4, 0.45, 0], [-3.6, 0.66, 0]], 20), 40);
  const spin = tube(profileFrom([[-0.55, 0.36, 0], [-0.35, 0.3, 0], [-0.1, 0.12, 0], [0.02, 0.0, 0]], 16), 32);
  const spinMat = new THREE.MeshStandardMaterial({ map: spinnerTexture(), roughness: 0.3, metalness: 0.3 });
  const blade = new THREE.BoxGeometry(0.06, 0.58, 0.2);
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#9aa1aa', metalness: 0.9, roughness: 0.3 });
  blade.translate(0, 0.62, 0);
  const pylon = loft([
    { le: [0.6, 1.0, 0], chord: 4.6, t: 0.12, tdir: [0, 0, 1] },
    { le: [-0.2, 1.55, 0], chord: 4.4, t: 0.12, tdir: [0, 0, 1] },
  ], { camber: 0 });
  for (const s of [1, -1]) {
    const eng = new THREE.Group();
    eng.position.set(4.25, 1.72, 5.75 * s);
    eng.add(new THREE.Mesh(nacGeo, nacMat), new THREE.Mesh(inner, innerMat), new THREE.Mesh(core, darkMat));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.92, 48), new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.7, metalness: 0.5 }));
    face.rotation.y = Math.PI / 2;
    face.position.x = -0.56;
    eng.add(face);
    const fan = new THREE.Group();
    fan.position.x = -0.42;
    for (let i = 0; i < 24; i++) {
      const b = new THREE.Mesh(blade, bladeMat);
      const holder = new THREE.Group();
      holder.rotation.x = (i / 24) * Math.PI * 2;
      b.rotation.set(0, 0.55, 0);
      holder.add(b);
      fan.add(holder);
    }
    fan.add(new THREE.Mesh(spin, spinMat));
    eng.add(fan);
    fans.push(fan);
    const py = new THREE.Mesh(pylon, navyMat);
    py.position.set(-0.6, 0, 0);
    eng.add(py);
    body.add(eng);
  }

  // tren de aterrizaje
  const tireMat = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.92 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#a8adb4', roughness: 0.35, metalness: 0.9 });
  const strutMat = new THREE.MeshStandardMaterial({ color: '#d0d4da', roughness: 0.25, metalness: 0.95 });
  const wheel = (r, w) => {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.3, 14, 32), tireMat);
    tire.scale.z = w / (r * 0.6);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, w * 0.9, 24), hubMat);
    hub.rotation.x = Math.PI / 2;
    g.add(tire, hub);
    return g;
  };
  const gears = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 2.45, 3.8 * s);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.9, 12), strutMat);
    strut.position.y = -0.95;
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), strutMat);
    brace.position.set(0, -0.7, -0.55 * s);
    brace.rotation.x = 0.6 * s;
    pivot.add(strut, brace);
    for (const dz of [0.42, -0.42]) {
      const w = wheel(0.58, 0.36);
      w.position.set(0, -1.87, dz);
      pivot.add(w);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), strutMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.y = -1.87;
    pivot.add(axle);
    body.add(pivot);
    gears.push({ pivot, axis: 'x', sign: s });
  }
  {
    const pivot = new THREE.Group();
    pivot.position.set(12.6, 2.05, 0);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.7, 12), strutMat);
    strut.position.y = -0.85;
    pivot.add(strut);
    for (const dz of [0.3, -0.3]) {
      const w = wheel(0.38, 0.24);
      w.position.set(0, -1.67, dz);
      pivot.add(w);
    }
    // faro de rodaje
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.5) }));
    lamp.position.set(0.15, -0.6, 0);
    pivot.add(lamp);
    body.add(pivot);
    gears.push({ pivot, axis: 'z', sign: 1 });
  }

  body.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // luces de navegación y anticolisión
  const lights = new THREE.Group();
  const glow = glowTexture();
  const mkLight = (pos, col, size) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.position.set(...pos);
    sp.scale.setScalar(size);
    sp.userData.base = size;
    lights.add(sp);
    return sp;
  };
  const navR = mkLight([-4.3, 4.24, -17.08], new THREE.Color(9, 0.25, 0.15), 1.6);
  const navG = mkLight([-4.3, 4.24, 17.08], new THREE.Color(0.2, 8, 1.2), 1.6);
  const tail = mkLight([-20.75, 5.15, 0], new THREE.Color(6, 6, 6), 1.2);
  const beaconT = mkLight([0, AXIS + 2.05, 0], new THREE.Color(14, 0.3, 0.2), 2.2);
  const beaconB = mkLight([2, AXIS - 2.05, 0], new THREE.Color(14, 0.3, 0.2), 2.2);
  const strobeL = mkLight([-4.6, 4.24, -17.15], new THREE.Color(30, 30, 32), 4);
  const strobeR = mkLight([-4.6, 4.24, 17.15], new THREE.Color(30, 30, 32), 4);
  // faros de aterrizaje en el encastre del ala
  const landingL = [mkLight([4.0, 2.35, 2.7], new THREE.Color(12, 11.5, 10), 0.1), mkLight([4.0, 2.35, -2.7], new THREE.Color(12, 11.5, 10), 0.1)];
  root.add(lights);

  let gearState = 1;
  const api = {
    root,
    body,
    lights,
    fanSpeed: 0.6,
    strobes: true,
    setGear(g) {
      gearState = g;
      const a = (1 - g) * (Math.PI / 2) * 0.98;
      for (const gr of gears) {
        if (gr.axis === 'x') gr.pivot.rotation.x = a * gr.sign;
        else gr.pivot.rotation.z = a;
        gr.pivot.visible = g > 0.02;
      }
    },
    get gear() {
      return gearState;
    },
    setLanding(v) {
      for (const s of landingL) {
        s.visible = v > 0.01;
        s.scale.setScalar(3 * v);
      }
    },
    update(t, dt, nightness = 0) {
      for (const f of fans) f.rotation.x -= dt * api.fanSpeed * 40;
      const b = Math.max(0, Math.sin(t * Math.PI * 2 * 0.9)) ** 8;
      beaconT.scale.setScalar(beaconT.userData.base * (0.15 + b * 1.4));
      beaconB.scale.setScalar(beaconB.userData.base * (0.15 + Math.max(0, Math.sin(t * Math.PI * 2 * 0.9 + 1.6)) ** 8 * 1.4));
      const ph = (t * 0.9) % 1;
      const flash = api.strobes ? (ph < 0.04 || (ph > 0.1 && ph < 0.14) ? 1 : 0) : 0;
      strobeL.visible = strobeR.visible = flash > 0;
      const k = 0.5 + nightness * 1.2;
      for (const s of [navR, navG, tail]) s.scale.setScalar(s.userData.base * k);
    },
  };
  api.setGear(1);
  return api;
}

// Copia estática para aviones estacionados (sin luces ni animación)
export function parkedClone(plane) {
  const g = plane.body.clone(true);
  return g;
}
