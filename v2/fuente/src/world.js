import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { canvas, texFromCanvas, tileNoise, rng, clamp } from './util.js';
import { glowTexture, parkedClone } from './airliner.js';

// Distribución del aeropuerto (metros):
//  pista 09/27 sobre el eje X, z = 0, de x = -1500 a 1500, 45 m de ancho
//  calle de rodaje paralela en z = 95, conectores A1 (x = -1450), A2, A3
//  plataforma z 107–335, terminal z 340–420, torre en (-654, 575)
//  ciudad al sureste, centro (3800, -2600)
export const STAND = { x: -250, z: 307.5 };
export const TOWER = { x: -654, z: 575 };

const shared = {
  groundOffset: { value: new THREE.Vector2() },
  night: { value: 0 },
  cityNight: { value: 0 },
  detail: { value: null },
};

// Añade variación de detalle en coordenadas de mundo a cualquier material
function withDetail(mat, s1 = 37, s2 = 3.3, amt = 0.35, scroll = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = shared.detail;
    sh.uniforms.uOff = shared.groundOffset;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail;\nuniform vec2 uOff;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 gp = vWPos.xz ${scroll ? '+ uOff' : ''};
        float d1 = texture2D(uDetail, gp / ${s1.toFixed(1)}).r;
        float d2 = texture2D(uDetail, gp / ${s2.toFixed(2)}).r;
        diffuseColor.rgb *= 1.0 + (d1 - 0.5) * ${(amt * 1.6).toFixed(3)} + (d2 - 0.5) * ${amt.toFixed(3)};`
      );
  };
  return mat;
}

function detailTexture() {
  const N = 256;
  const v = tileNoise(N, [4, 8, 16, 32, 64], 7);
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const x = clamp((v[i] - 0.5) * 2.2 + 0.5, 0, 1) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = x;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = texFromCanvas(c, { srgb: false, repeat: true });
  return t;
}

// Mosaico de campos de cultivo, bosques, pueblos y ríos (24 km por mosaico)
function fieldsTextures() {
  const S = 2048, r = rng(42);
  const [c, g] = canvas(S, S);
  const [cn, gn] = canvas(S, S);
  g.fillStyle = '#58663a';
  g.fillRect(0, 0, S, S);
  gn.fillStyle = '#000';
  gn.fillRect(0, 0, S, S);
  const pal = ['#6b7a3f', '#7d8a46', '#93904f', '#a79a5a', '#5f6f37', '#4f5f30', '#8a7c4c', '#77843f', '#9c9a62', '#6a6a3c', '#56693a'];
  const wrap = (fn) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
  };
  const angles = [0, 0.21, -0.35, 0.6];
  for (let i = 0; i < 2400; i++) {
    const x = r() * S, y = r() * S, w = 18 + r() * 70, h = 14 + r() * 50, a = angles[Math.floor(r() * angles.length)] + (r() - 0.5) * 0.08;
    const col = pal[Math.floor(r() * pal.length)];
    wrap((ox, oy) => {
      g.save();
      g.translate(x + ox, y + oy);
      g.rotate(a);
      g.fillStyle = col;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(40,45,25,0.35)';
      g.lineWidth = 1;
      g.strokeRect(-w / 2, -h / 2, w, h);
      g.restore();
    });
  }
  // bosques
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, n = 6 + r() * 30;
    for (let k = 0; k < n; k++) {
      const px = x + (r() - 0.5) * 60, py = y + (r() - 0.5) * 60, rad = 4 + r() * 12;
      wrap((ox, oy) => {
        g.fillStyle = r() > 0.5 ? '#2f3d22' : '#36462a';
        g.beginPath();
        g.arc(px + ox, py + oy, rad, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  // ríos
  for (let k = 0; k < 2; k++) {
    let x = r() * S, y = 0, a = Math.PI / 2 + (r() - 0.5);
    g.strokeStyle = '#3f5560';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 700 && y < S; i++) {
      a += (r() - 0.5) * 0.25;
      a = Math.max(0.4, Math.min(Math.PI - 0.4, a));
      x += Math.cos(a) * 4;
      y += Math.sin(a) * 4;
      g.lineTo(((x % S) + S) % S === x ? x : x, y);
    }
    g.stroke();
  }
  // carreteras
  for (let k = 0; k < 40; k++) {
    let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
    g.strokeStyle = 'rgba(150,140,115,0.8)';
    gn.strokeStyle = 'rgba(255,150,60,0.18)';
    g.lineWidth = gn.lineWidth = 1.6;
    g.beginPath();
    gn.beginPath();
    g.moveTo(x, y);
    gn.moveTo(x, y);
    for (let i = 0; i < 120; i++) {
      a += (r() - 0.5) * 0.12;
      x += Math.cos(a) * 6;
      y += Math.sin(a) * 6;
      g.lineTo(x, y);
      gn.lineTo(x, y);
    }
    g.stroke();
    gn.stroke();
  }
  // pueblos (de día casas grises, de noche luces cálidas)
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S, n = 30 + r() * 160, spread = 10 + r() * 30;
    for (let k = 0; k < n; k++) {
      const px = x + (r() - 0.5) * spread * 2, py = y + (r() - 0.5) * spread * 2;
      wrap((ox, oy) => {
        g.fillStyle = r() > 0.5 ? '#8c8578' : '#7a7468';
        g.fillRect(px + ox, py + oy, 2.2, 2.2);
        gn.fillStyle = r() > 0.3 ? '#ffb15a' : '#ffe1a8';
        gn.fillRect(px + ox, py + oy, 1.2, 1.2);
      });
    }
  }
  const day = texFromCanvas(c, { repeat: true, aniso: 16 });
  const night = texFromCanvas(cn, { repeat: true });
  return { day, night };
}

function makeGround(fields) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = shared.detail;
    sh.uniforms.uOff = shared.groundOffset;
    sh.uniforms.uFields = { value: fields.day };
    sh.uniforms.uLights = { value: fields.night };
    sh.uniforms.uNight = shared.night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail, uFields, uLights;\nuniform vec2 uOff;\nuniform float uNight;')
      .replace(
        '#include <map_fragment>',
        `vec2 gp = vWPos.xz + uOff;
        vec3 f = texture2D(uFields, gp / 24000.0).rgb;
        float d1 = texture2D(uDetail, gp / 41.0).r, d2 = texture2D(uDetail, gp / 3.7).r, d3 = texture2D(uDetail, gp / 900.0).r;
        diffuseColor.rgb *= f * (1.0 + (d1 - 0.5) * 0.45 + (d2 - 0.5) * 0.3 + (d3 - 0.5) * 0.5);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `totalEmissiveRadiance += texture2D(uLights, gp / 24000.0).rgb * uNight * 2.5;`
      );
  };
  const m = new THREE.Mesh(new THREE.CircleGeometry(160000, 96), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function flat(w, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

// Rectángulos de pintura instanciados: [cx, cz, largoX, anchoZ, rotY]
function paint(list, color, y) {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const im = new THREE.InstancedMesh(g, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach(([x, z, lx, wz, ry = 0], i) => {
    q.setFromAxisAngle(up, ry);
    m.compose(p.set(x, y, z), q, s.set(lx, 1, wz));
    im.setMatrixAt(i, m);
  });
  im.receiveShadow = true;
  return im;
}

function runwayTexture() {
  const [c, g] = canvas(4096, 64);
  const r = rng(5);
  g.fillStyle = '#5b5e63';
  g.fillRect(0, 0, 4096, 64);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '30,30,34' : '120,120,124'},${0.05 + r() * 0.08})`;
    g.fillRect(r() * 4096, r() * 64, 2 + r() * 30, 1 + r() * 2);
  }
  // marcas de caucho en las zonas de toma de contacto
  for (const [a, b] of [[160, 1000], [3096, 3936]]) {
    for (let i = 0; i < 900; i++) {
      const x = a + r() * (b - a), y = 32 + (r() - 0.5) * 26 * (1 - Math.abs(r() - 0.5));
      g.fillStyle = `rgba(14,14,16,${0.05 + r() * 0.12})`;
      g.fillRect(x, y, 10 + r() * 60, 1 + r() * 2.5);
    }
  }
  return texFromCanvas(c, { aniso: 16 });
}

function concreteTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(9);
  g.fillStyle = '#a3a39c';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '70,70,66' : '190,190,182'},${0.03 + r() * 0.06})`;
    const s = 4 + r() * 40;
    g.fillRect(r() * 512, r() * 512, s, s * (0.5 + r()));
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(40,38,34,${0.04 + r() * 0.08})`;
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, 6 + r() * 22, 3 + r() * 10, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(55,55,52,0.55)';
  for (let k = 0; k < 4; k++) {
    g.fillRect(k * 128, 0, 2, 512);
    g.fillRect(0, k * 128, 512, 2);
  }
  return texFromCanvas(c, { repeat: true, aniso: 16 });
}

function textTexture(text, { w = 256, h = 256, font = 'bold 200px Arial', color = '#fff', bg = null, pad = 0 } = {}) {
  const [c, g] = canvas(w, h);
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + pad);
  return texFromCanvas(c, { aniso: 8 });
}

function signPanel(parts, height = 1.0) {
  // parts: [{text, fg, bg, w}] de izquierda a derecha
  const total = parts.reduce((a, p) => a + p.w, 0);
  const pxPerM = 220;
  const [c, g] = canvas(Math.round(total * pxPerM), Math.round(height * pxPerM));
  let x = 0;
  for (const p of parts) {
    g.fillStyle = p.bg;
    g.fillRect(x, 0, p.w * pxPerM, height * pxPerM);
    g.fillStyle = p.fg;
    g.font = `600 ${height * pxPerM * 0.62}px Bahnschrift, "Segoe UI", Arial`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(p.text, x + (p.w * pxPerM) / 2, height * pxPerM * 0.54);
    if (p.border) {
      g.strokeStyle = p.border;
      g.lineWidth = 10;
      g.strokeRect(x + 14, 14, p.w * pxPerM - 28, height * pxPerM - 28);
    }
    x += p.w * pxPerM;
  }
  const tex = texFromCanvas(c);
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(total, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.05 }));
  const box = new THREE.Mesh(new THREE.BoxGeometry(total + 0.08, height + 0.08, 0.25), new THREE.MeshStandardMaterial({ color: '#202225', roughness: 0.6 }));
  face.position.z = 0.13;
  grp.add(box, face);
  for (const lx of [-total / 2 + 0.3, total / 2 - 0.3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#888' }));
    leg.position.set(lx, -height / 2 - 0.3, 0);
    grp.add(leg);
  }
  grp.traverse((o) => o.isMesh && (o.castShadow = true));
  return grp;
}

// ───────── luces del aeropuerto (un solo objeto de puntos) ─────────

function airportLights() {
  const pos = [], col = [], size = [], order = [], kind = [];
  const add = (x, y, z, c, s, o, k = 0) => {
    pos.push(x, y, z);
    col.push(...c);
    size.push(s);
    order.push(o);
    kind.push(k);
  };
  const W = [3.2, 2.9, 2.3], G = [0.3, 3.4, 0.9], R = [3.6, 0.25, 0.15], B = [0.35, 0.6, 3.6], A = [3.4, 1.7, 0.5], Y = [3.2, 2.4, 0.9];
  const ord = (x) => clamp((x + 2500) / 4200, 0, 1);
  for (let x = -1500; x <= 1500; x += 60) for (const z of [-24, 24]) add(x, 0.45, z, x > 900 ? Y : W, 2.2, ord(x));
  for (let x = -1480; x <= 1480; x += 15) add(x, 0.15, 0, x > 1200 ? R : W, 1.1, ord(x));
  for (let z = -22; z <= 22; z += 3) {
    add(-1502, 0.4, z, G, 2.0, ord(-1502));
    add(1502, 0.4, z, R, 2.0, 0.99);
  }
  // sistema de luces de aproximación con destellos secuenciales
  for (let x = -1530; x >= -2400; x -= 30) {
    for (let dz = -2; dz <= 2; dz++) add(x, 1.2 + (-1530 - x) * 0.004, dz * 1.1, W, 2.4, ord(x));
    add(x, 2.2 + (-1530 - x) * 0.004, 0, [16, 16, 18], 3.5, (-1530 - x) / 870, 1);
  }
  for (let dz = -15; dz <= 15; dz += 1.5) add(-1830, 2.4, dz, W, 2.4, ord(-1830));
  // calles de rodaje
  for (let x = -1480; x <= 900; x += 30) for (const z of [83, 107]) add(x, 0.35, z, B, 1.6, 0.55 + Math.random() * 0.4);
  for (let x = -1480; x <= 900; x += 15) add(x, 0.12, 95, G, 0.9, 0.55 + Math.random() * 0.4);
  for (const cx of [-1450, -400, 600])
    for (let z = 25; z <= 92; z += 6) {
      add(cx - 12, 0.35, z, B, 1.6, 0.6);
      add(cx + 12, 0.35, z, B, 1.6, 0.6);
      add(cx, 0.12, z, G, 0.9, 0.6);
    }
  // barras de parada y postes de plataforma
  for (let dz = -10; dz <= 10; dz += 1.5) add(-1450 + dz, 0.2, 60, [4, 0.2, 0.1], 1.0, 0.5);
  for (let x = -700; x <= 300; x += 150) for (const z of [175, 255]) add(x, 30, z, A, 7, 0.4);
  // torre y obstáculos
  add(-654, 82, 575, R, 3, 0.2, 2);
  add(-654, 75, 575, [0.6, 4, 1.2], 4, 0.2, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aOrder', new THREE.Float32BufferAttribute(order, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 1 }, uI: { value: 1 }, uScale: { value: 800 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize, aOrder, aKind;
      uniform float uTime, uOn, uI, uScale;
      varying vec3 vC;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        float on = smoothstep(aOrder - 0.015, aOrder + 0.015, uOn);
        float k = 1.0;
        if (aKind > 0.5 && aKind < 1.5) { float ph = fract(uTime * 2.0 - aOrder); k = ph < 0.06 ? 1.0 : 0.0; on *= step(0.999, uOn); }
        if (aKind > 1.5) k = 0.3 + 0.7 * step(0.5, fract(uTime * 0.75 + aOrder));
        vC = aColor * on * k * uI;
        gl_PointSize = clamp(aSize * uScale / -mv.z, 1.6, 22.0) * step(0.001, on * k);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 5.0) + 0.6 * exp(-d * d * 40.0);
        gl_FragColor = vec4(vC * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ───────── edificios ─────────

function glassTextures() {
  const [c, g] = canvas(512, 320);
  const [ce, ge] = canvas(512, 320);
  const r = rng(77);
  const grad = g.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, '#6d8794');
  grad.addColorStop(1, '#40545f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 320);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 512, 320);
  for (let fl = 0; fl < 3; fl++) {
    const y = 20 + fl * 100;
    for (let i = 0; i < 16; i++) {
      if (r() > 0.35) {
        ge.fillStyle = `rgba(255,${190 + r() * 40},${120 + r() * 60},${0.4 + r() * 0.6})`;
        ge.fillRect(i * 32 + 2, y + 52, 28, 22);
      }
    }
    ge.fillStyle = 'rgba(255,230,190,0.85)';
    ge.fillRect(0, y + 2, 512, 4);
  }
  g.fillStyle = '#2a2f33';
  for (let i = 0; i <= 16; i++) g.fillRect(i * 32 - 1.5, 0, 3, 320);
  for (let fl = 0; fl <= 3; fl++) g.fillRect(0, fl * 100 + 18, 512, 6);
  ge.fillStyle = '#000';
  for (let i = 0; i <= 16; i++) ge.fillRect(i * 32 - 1.5, 0, 3, 320);
  return { map: texFromCanvas(c, { repeat: true }), emis: texFromCanvas(ce, { repeat: true }) };
}

function corrugated(base = '#9da3aa') {
  const [c, g] = canvas(256, 64);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 256; i += 8) {
    g.fillStyle = 'rgba(0,0,0,0.13)';
    g.fillRect(i, 0, 3, 64);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(i + 4, 0, 2, 64);
  }
  return texFromCanvas(c, { repeat: true });
}

class JetBridge {
  constructor(sx, mats) {
    this.group = new THREE.Group();
    this.rot = new THREE.Vector3(sx + 16, 0, 331);
    this.door = new THREE.Vector3(sx + 3.6, 4.35, 320.3);
    const { metal, glass, dark } = mats;
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.4, 20), metal);
    rot.position.set(this.rot.x, 4.6, this.rot.z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 3, 12), dark);
    col.position.set(this.rot.x, 1.5, this.rot.z);
    const link = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.0, 9.5), metal);
    link.position.set(this.rot.x, 5.0, this.rot.z + 4.8);
    this.group.add(rot, col, link);
    this.t1 = new THREE.Mesh(new THREE.BoxGeometry(1, 3.0, 2.9), metal);
    this.t2 = new THREE.Mesh(new THREE.BoxGeometry(1, 2.75, 2.65), metal);
    this.cab = new THREE.Group();
    const cabBox = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 3.6), metal);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 3.4), dark);
    canopy.position.x = 1.85;
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.42, 1.0, 3.2), glass);
    win.position.y = 0.6;
    this.cab.add(cabBox, canopy, win);
    this.leg = new THREE.Group();
    for (const dz of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 0.35), dark);
      l.position.set(0, 1.7, dz);
      this.leg.add(l);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12), dark);
      w.rotation.x = Math.PI / 2;
      w.position.set(0, 0.45, dz * 1.2);
      this.leg.add(w);
    }
    this.group.add(this.t1, this.t2, this.cab, this.leg);
    this.group.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
    this.setExt(1);
  }
  setExt(e) {
    const start = new THREE.Vector3(this.rot.x, 4.6, this.rot.z);
    const dir = new THREE.Vector3().subVectors(this.door, start);
    const full = dir.length();
    dir.normalize();
    const len = Math.max(8, full * (0.62 + 0.38 * e) - 1.8);
    const end = start.clone().addScaledVector(dir, len);
    const ang = Math.atan2(-dir.z, dir.x);
    const mid1 = start.clone().addScaledVector(dir, len * 0.3);
    this.t1.scale.x = len * 0.6;
    this.t1.position.copy(mid1);
    this.t1.rotation.set(0, ang, Math.asin(dir.y));
    const mid2 = start.clone().addScaledVector(dir, len * 0.72);
    this.t2.scale.x = len * 0.56;
    this.t2.position.copy(mid2);
    this.t2.rotation.copy(this.t1.rotation);
    this.cab.position.copy(end).addScaledVector(dir, 1.6);
    this.cab.rotation.y = ang;
    this.leg.position.set(mid2.x + dir.x * len * 0.12, 0, mid2.z + dir.z * len * 0.12);
    this.leg.rotation.y = ang;
  }
}

function vehicle(kind, r) {
  const g = new THREE.Group();
  const body = (w, h, d, col, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.2 }));
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return m;
  };
  const wheels = (len, wid) => {
    for (const x of [-len / 2 + 0.6, len / 2 - 0.6])
      for (const z of [-wid / 2, wid / 2]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.42, z);
        g.add(w);
      }
  };
  const glass = '#1d2a33';
  if (kind === 'tug') {
    body(6, 1.1, 2.7, '#e2b21c', 0, 0.35);
    body(1.4, 1.0, 1.4, glass, 1.6, 1.45, -0.6);
    wheels(5.6, 2.8);
  } else if (kind === 'fuel') {
    body(2.2, 2.0, 2.5, '#f0f0ee', 3.2, 0.5);
    body(1.4, 0.9, 2.3, glass, 3.6, 1.6);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 20), new THREE.MeshStandardMaterial({ color: '#dfe3e6', metalness: 0.6, roughness: 0.3 }));
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-1.2, 2.0, 0);
    g.add(tank);
    wheels(8, 2.4);
  } else if (kind === 'belt') {
    body(4, 1.0, 2.0, '#f2f2f0', 0, 0.4);
    const belt = body(7, 0.25, 1.0, '#2a2a2a', 0, 0, 0);
    belt.position.set(0.5, 2.3, 0);
    belt.rotation.z = 0.32;
    wheels(3.8, 2.1);
  } else if (kind === 'cart') {
    for (let i = 0; i < 3; i++) {
      body(2.6, 0.5, 1.6, '#3a4048', -i * 3.1, 0.4);
      body(2.4, 1.3, 1.5, i % 2 ? '#c4c8cd' : '#d8d1bd', -i * 3.1, 0.9);
    }
    body(2.4, 1.3, 1.6, '#e8e8e6', 2.8, 0.35);
    wheels(2.4, 1.8);
  } else if (kind === 'gpu') {
    body(2.8, 1.6, 1.7, '#e6e6e3', 0, 0.35);
    wheels(2.6, 1.8);
  } else {
    body(4.6, 1.4, 2.0, r() > 0.5 ? '#f4f4f2' : '#f0a51c', 0, 0.4);
    body(1.8, 0.9, 1.9, glass, 1.1, 1.8);
    wheels(4.2, 2.0);
  }
  g.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
  return g;
}

// ───────── ciudad ─────────

function makeCity() {
  const r = rng(123);
  const cx = 3800, cz = -2600, R = 2300, block = 94, street = 16;
  const items = [];
  for (let gx = -R; gx < R; gx += block)
    for (let gz = -R; gz < R; gz += block) {
      const bx = cx + gx, bz = cz + gz;
      const dist = Math.hypot(gx, gz) / R;
      if (dist > 1 || r() < 0.08) continue;
      const n = 1 + Math.floor(r() * 3);
      const inner = block - street;
      for (let k = 0; k < n; k++) {
        const w = inner / n - 4;
        const d = inner * (0.55 + r() * 0.4);
        const tall = Math.exp(-dist * dist * 3.2);
        const h = 9 + r() * 22 + (r() < tall * 0.6 ? r() * 170 * tall : 0);
        items.push({ x: bx - inner / 2 + (k + 0.5) * (inner / n), z: bz + (r() - 0.5) * (inner - d), w, d, h, glassy: h > 70 && r() > 0.3 });
      }
    }
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.15 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCityNight = shared.cityNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying float vSeed;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wpp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wpp.xyz;
        vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
        vSeed = fract(instanceMatrix[3].x * 0.0131 + instanceMatrix[3].z * 0.0173);`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying float vSeed; uniform float uCityNight;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float wall = 1.0 - step(0.6, abs(vWN.y));
        vec2 fp = vec2(dot(vWP.xz, vec2(-vWN.z, vWN.x)), vWP.y);
        vec2 cell = fp / vec2(3.3, 3.5);
        vec2 fr = fract(cell); vec2 id = floor(cell);
        float win = step(0.16, fr.x) * step(fr.x, 0.84) * step(0.22, fr.y) * step(fr.y, 0.82) * wall * step(1.0, id.y);
        float hh = h21(id + vSeed * 91.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.065, 0.08), win * 0.8);
        float roofDark = step(0.6, vWN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.16, 0.17), roofDark * 0.6);`
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, win);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += win * step(0.5, hh) * uCityNight * vec3(1.0, 0.72, 0.42) * (0.5 + hh * 1.6);');
  };
  const im = new THREE.InstancedMesh(g, mat, items.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const pal = ['#b9b2a6', '#a7a39b', '#cfc8ba', '#8f9499', '#c2b49c', '#9a8f84'];
  items.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z);
    im.setMatrixAt(i, m);
    col.set(b.glassy ? (r() > 0.5 ? '#5d7584' : '#6e7f88') : pal[Math.floor(r() * pal.length)]);
    im.setColorAt(i, col);
  });
  im.castShadow = false;
  im.receiveShadow = true;
  // calles
  const [c, gg] = canvas(1024, 1024);
  gg.fillStyle = '#6a6a66';
  gg.fillRect(0, 0, 1024, 1024);
  const px = 1024 / (R * 2);
  gg.fillStyle = '#34363a';
  for (let gx = -R; gx <= R; gx += block) {
    gg.fillRect((gx + R) * px - (street / 2) * px, 0, street * px, 1024);
    gg.fillRect(0, (gx + R) * px - (street / 2) * px, 1024, street * px);
  }
  const roads = texFromCanvas(c, { aniso: 16 });
  const ground = flat(R * 2, R * 2, withDetail(new THREE.MeshStandardMaterial({ map: roads, roughness: 0.95 }), 40, 3.5, 0.3), cx, 0.2, cz);
  const grp = new THREE.Group();
  grp.add(im, ground);
  // farolas de la ciudad
  const lp = [], lc = [];
  for (let gx = -R; gx <= R; gx += block)
    for (let gz = -R; gz <= R; gz += 30) {
      if (Math.hypot(gx, gz) > R) continue;
      lp.push(cx + gx - 6, 7, cz + gz, cx + gz, 7, cz + gx - 6);
      lc.push(3.4, 1.8, 0.6, 3.4, 1.9, 0.7);
    }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  const lmat = new THREE.PointsMaterial({ size: 3.2, vertexColors: true, map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: true });
  const lights = new THREE.Points(lg, lmat);
  grp.add(lights);
  return { group: grp, streetLights: lmat };
}

// ───────── montañas lejanas (anillo que acompaña a la cámara) ─────────

function makeMountains() {
  const segA = 360, segR = 10, R0 = 24000, R1 = 46000;
  const pos = [], col = [], idx = [];
  const n = tileNoise(256, [8, 16, 32, 64], 3);
  const sample = (u, v) => n[Math.floor(v * 255) * 256 + Math.floor(u * 255)];
  for (let i = 0; i <= segR; i++) {
    const v = i / segR, rad = R0 + (R1 - R0) * v;
    for (let j = 0; j <= segA; j++) {
      const u = j / segA, a = u * Math.PI * 2;
      const env = Math.sin(v * Math.PI);
      const ridge = 1 - Math.abs(sample(u % 1, (v * 0.6 + 0.2) % 1) * 2 - 1);
      const h = Math.max(0, (ridge * ridge * 2600 + sample((u * 3) % 1, v) * 900 - 500) * env);
      pos.push(Math.cos(a) * rad, h, Math.sin(a) * rad);
      const snow = h > 1900 ? 1 : 0;
      col.push(snow ? 0.8 : 0.16, snow ? 0.82 : 0.2, snow ? 0.86 : 0.17);
    }
  }
  for (let i = 0; i < segR; i++)
    for (let j = 0; j < segA; j++) {
      const a = i * (segA + 1) + j, b = a + segA + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}

function makeStars() {
  const r = rng(99), pos = [], col = [];
  for (let i = 0; i < 5000; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, y = Math.abs(u);
    const s = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * s * 90000, y * 90000 - 4000, Math.sin(a) * s * 90000);
    const b = Math.pow(r(), 9) * 4 + 0.12, tint = r();
    col.push(b * (0.85 + tint * 0.15), b * 0.92, b * (1.05 - tint * 0.2));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

function nightDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAmt: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vD; uniform float uAmt;
      void main(){ float y = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(vec3(0.020, 0.032, 0.060), vec3(0.003, 0.006, 0.018), pow(max(y, 0.0), 0.5));
        gl_FragColor = vec4(c * uAmt, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(95000, 32, 16), mat);
  m.frustumCulled = false;
  return m;
}

// ───────── mundo completo ─────────

export function createWorld(scene, renderer, plane) {
  shared.detail.value = detailTexture();
  const W = { shared };

  // cielo
  const sky = new Sky();
  sky.scale.setScalar(180000);
  sky.material.depthWrite = false;
  sky.frustumCulled = false;
  scene.add(sky);
  W.sky = sky;
  const dome = nightDome();
  scene.add(dome);
  W.dome = dome;
  const stars = makeStars();
  scene.add(stars);
  W.stars = stars;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(3, 3.2, 3.6), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  moon.scale.setScalar(2600);
  scene.add(moon);
  W.moon = moon;

  // escena reducida para muestrear el cielo (niebla, ambiente y reflejos)
  const skyScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.material = sky.material;
  sky2.scale.setScalar(10000);
  skyScene.add(sky2);
  const dome2 = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), dome.material);
  skyScene.add(dome2);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(20000, 32), new THREE.MeshBasicMaterial({ color: '#334' }));
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -20;
  skyScene.add(envGround);
  W.skyScene = skyScene;
  W.envGround = envGround;

  const fields = fieldsTextures();
  const ground = makeGround(fields);
  scene.add(ground);
  W.ground = ground;

  const mountains = makeMountains();
  scene.add(mountains);
  W.mountains = mountains;

  // ── aeropuerto ──
  const airport = new THREE.Group();
  scene.add(airport);
  W.airport = airport;
  const grass = withDetail(new THREE.MeshStandardMaterial({ color: '#6f7547', roughness: 1 }), 29, 1.3, 0.6);
  airport.add(flat(6200, 1900, grass, 0, 0.05, 160));
  const asph = withDetail(new THREE.MeshStandardMaterial({ color: '#56595e', roughness: 0.93 }), 23, 2.1, 0.3);
  const rwyMat = withDetail(new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.9 }), 19, 1.7, 0.28);
  airport.add(flat(3060, 60, new THREE.MeshStandardMaterial({ color: '#4f5156', roughness: 0.95 }), 0, 0.09, 0));
  airport.add(flat(3000, 45, rwyMat, 0, 0.12, 0));
  airport.add(flat(2400, 23, asph, -290, 0.1, 95));
  for (const cx of [-1450, -400, 600]) airport.add(flat(23, 75, asph, cx, 0.1, 58));
  // filetes de unión redondeados
  const fil = new THREE.CircleGeometry(30, 16, 0, Math.PI / 2);
  fil.rotateX(-Math.PI / 2);
  for (const cx of [-1450, -400, 600])
    for (const [sx, sz, zc] of [[1, 1, 22], [-1, 1, 22], [1, -1, 84], [-1, -1, 84]]) {
      const f = new THREE.Mesh(fil, asph);
      f.scale.set(sx * 0.6, 1, -sz * 0.6);
      f.position.set(cx + sx * 11.5, 0.1, zc);
      airport.add(f);
    }
  const conc = concreteTexture();
  conc.repeat.set(1300 / 20, 230 / 20);
  const apronMat = withDetail(new THREE.MeshStandardMaterial({ map: conc, roughness: 0.85 }), 31, 2.6, 0.2);
  airport.add(flat(1300, 230, apronMat, -250, 0.11, 222));
  const conc2 = conc.clone();
  conc2.repeat.set(70 / 20, 40 / 20);
  conc2.needsUpdate = true;
  for (const x of [-560, 60]) airport.add(flat(70, 40, new THREE.MeshStandardMaterial({ map: conc2, roughness: 0.85 }), x, 0.105, 103));

  // pintura blanca de pista
  const white = [];
  for (const end of [-1, 1]) {
    const xt = end * 1470;
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) white.push([xt, s * (3.0 + k * 3.2), 30, 1.8]);
    const xa = end * (1500 - 400);
    for (const s of [-1, 1]) white.push([xa, s * 9.5, 45, 7]);
    for (const [d, n] of [[150, 3], [300, 2], [450, 2], [600, 1], [750, 1], [900, 1]])
      if (d !== 400) for (const s of [-1, 1]) for (let k = 0; k < n; k++) white.push([end * (1500 - d), s * (6 + k * 2.6), 22.5, 1.0]);
  }
  for (let x = -1380; x <= 1380; x += 50) white.push([x, 0, 30, 0.9]);
  for (const s of [-1, 1]) white.push([0, s * 21.8, 3000, 0.9]);
  airport.add(paint(white, '#ecebe6', 0.16));
  // números de pista
  const numMat = (txt) => new THREE.MeshStandardMaterial({ map: textTexture(txt, { w: 256, h: 512, font: '700 300px Arial Narrow, Arial', color: '#ecebe6' }), transparent: true, roughness: 0.75 });
  const n09 = new THREE.Mesh(new THREE.PlaneGeometry(12, 22).rotateX(-Math.PI / 2), numMat('09'));
  n09.rotation.y = -Math.PI / 2;
  n09.position.set(-1415, 0.17, 0);
  const n27 = new THREE.Mesh(new THREE.PlaneGeometry(12, 22).rotateX(-Math.PI / 2), numMat('27'));
  n27.rotation.y = Math.PI / 2;
  n27.position.set(1415, 0.17, 0);
  airport.add(n09, n27);

  // pintura amarilla de rodaje y plataforma
  const yellow = [[-290, 95, 2400, 0.3]];
  for (const cx of [-1450, -400, 600]) yellow.push([cx, 58, 0.3, 75]);
  for (const cx of [-1450, -400, 600])
    for (const dz of [0, 0.9]) yellow.push([cx, 60 + dz, 22, 0.25]);
  for (const cx of [-1450, -400, 600]) for (let x = -10; x <= 10; x += 2) yellow.push([cx + x, 62.4, 1.0, 0.25]);
  for (let sx = -625; sx <= 200; sx += 75) {
    yellow.push([sx, 270, 0.25, 100]);
    yellow.push([sx, 318, 4, 0.35]);
  }
  yellow.push([-250, 165, 1300, 0.3]);
  airport.add(paint(yellow, '#e3ad1d', 0.17));
  // líneas curvas de entrada a los conectores
  const ring = new THREE.RingGeometry(39.85, 40.15, 40, 1, 0, Math.PI / 2);
  ring.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#e3ad1d', roughness: 0.75 });
  for (const cx of [-1450, -400, 600]) {
    const rr = new THREE.Mesh(ring, ringMat);
    rr.position.set(cx + 40, 0.17, 55);
    rr.rotation.y = Math.PI / 2;
    airport.add(rr);
  }

  // terminal
  const gt = glassTextures();
  gt.map.repeat.set(1100 / 32, 1);
  gt.emis.repeat.set(1100 / 32, 1);
  const glassMat = new THREE.MeshPhysicalMaterial({ map: gt.map, emissiveMap: gt.emis, emissive: '#ffd39a', emissiveIntensity: 0.6, roughness: 0.08, metalness: 0.35, clearcoat: 1, envMapIntensity: 1.3 });
  W.terminalGlass = glassMat;
  const wallMat = withDetail(new THREE.MeshStandardMaterial({ color: '#d6d2c8', roughness: 0.7 }), 15, 2, 0.15);
  const term = new THREE.Mesh(new THREE.BoxGeometry(1100, 19, 80), [wallMat, wallMat, wallMat, wallMat, glassMat, glassMat]);
  term.position.set(-210, 9.5, 380);
  term.castShadow = term.receiveShadow = true;
  airport.add(term);
  const roofG = new THREE.PlaneGeometry(1150, 104, 230, 6);
  roofG.rotateX(-Math.PI / 2);
  const rp = roofG.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i);
    rp.setY(i, 2.6 * Math.sin((x / 95) * Math.PI) - Math.pow(Math.abs(z) / 52, 2) * 2.2);
  }
  roofG.computeVertexNormals();
  const roof = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: '#e8e9ea', roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide }));
  roof.position.set(-210, 21.8, 380);
  roof.castShadow = roof.receiveShadow = true;
  airport.add(roof);
  for (let x = -740; x <= 320; x += 40) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 22, 10), new THREE.MeshStandardMaterial({ color: '#e5e5e2', roughness: 0.4, metalness: 0.4 }));
    col.position.set(x, 11, 334);
    airport.add(col);
  }

  // pasarelas de embarque
  const bmats = {
    metal: new THREE.MeshStandardMaterial({ map: (() => { const t = corrugated(); t.repeat.set(1, 1); return t; })(), color: '#c9ccd0', roughness: 0.5, metalness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#2a3a44', roughness: 0.1, metalness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.6, metalness: 0.4 }),
  };
  W.bridges = {};
  for (let sx = -625; sx <= 200; sx += 75) {
    const b = new JetBridge(sx, bmats);
    airport.add(b.group);
    W.bridges[sx] = b;
  }
  W.ourBridge = W.bridges[STAND.x];
  // aviones estacionados
  for (const sx of [-475, -100, 125, -550]) {
    const pc = parkedClone(plane);
    pc.position.set(sx, 0, STAND.z);
    pc.rotation.y = -Math.PI / 2;
    airport.add(pc);
  }
  for (const sx of [-625, -400, -325, -175, -25, 50, 200]) W.bridges[sx].setExt(0.15);

  // vehículos de servicio
  const r = rng(8);
  const tug = vehicle('tug', r);
  W.tug = tug;
  airport.add(tug);
  const svc = [
    ['fuel', -250 - 14, 292, 0.0], ['belt', -250 + 3.2, 293, Math.PI / 2], ['cart', -250 + 9, 286, Math.PI / 2],
    ['gpu', -250 + 7, 326, 0.3], ['van', -250 - 22, 322, 0.6], ['cart', -480 + 9, 288, Math.PI / 2],
    ['fuel', -100 - 14, 290, 0.1], ['van', -330, 250, 1.2], ['van', 40, 240, 2.6], ['belt', 125 + 3.2, 293, Math.PI / 2],
    ['cart', -600, 205, 0], ['van', -760, 180, 0.2], ['gpu', -105 + 7, 326, 0.3], ['van', 220, 300, 1.9],
  ];
  for (const [k, x, z, ry] of svc) {
    const v = vehicle(k, r);
    v.position.set(x, 0.11, z);
    v.rotation.y = ry;
    airport.add(v);
  }

  // torre de control
  const towerMat = withDetail(new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.6 }), 9, 1.5, 0.12);
  const tw = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.8, 64, 28), towerMat);
  shaft.position.y = 32;
  const sub = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 4.2, 4, 8), towerMat);
  sub.position.y = 65.5;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 7.4, 6.5, 8, 1, true), new THREE.MeshPhysicalMaterial({ color: '#1d3640', roughness: 0.05, metalness: 0.7, emissive: '#ffcf90', emissiveIntensity: 0.04, side: THREE.DoubleSide }));
  cab.position.y = 70.8;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 8.6, 1.6, 8), towerMat);
  top.position.y = 74.8;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 8, 6), new THREE.MeshStandardMaterial({ color: '#aaa', metalness: 0.8 }));
  mast.position.y = 79.5;
  const radar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.4), new THREE.MeshStandardMaterial({ color: '#e8e8e8' }));
  radar.position.y = 76.5;
  W.radar = radar;
  tw.add(shaft, sub, cab, top, mast, radar);
  tw.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
  tw.position.set(TOWER.x, 0, TOWER.z);
  airport.add(tw);

  // hangares
  const hangMat = new THREE.MeshStandardMaterial({ map: (() => { const t = corrugated('#dfe2e5'); t.repeat.set(30, 1); return t; })(), roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide });
  for (const [x, z] of [[560, 250], [700, 250]]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 80, 40, 1, true, -Math.PI / 2, Math.PI), hangMat);
    h.rotation.x = Math.PI / 2;
    h.rotation.z = Math.PI / 2;
    h.scale.set(1, 1, 0.55);
    h.position.set(x, 0, z);
    h.castShadow = h.receiveShadow = true;
    airport.add(h);
    const door = new THREE.Mesh(new THREE.CircleGeometry(32, 40, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#2f4a6a', roughness: 0.6 }));
    door.scale.y = 0.55;
    door.position.set(x, 0, z - 40);
    door.rotation.y = Math.PI;
    airport.add(door);
  }

  // postes de iluminación de plataforma
  for (let x = -700; x <= 300; x += 150)
    for (const z of [175, 255]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 30, 8), new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.7, roughness: 0.4 }));
      p.position.set(x, 15, z);
      p.castShadow = true;
      airport.add(p);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 1.6), new THREE.MeshStandardMaterial({ color: '#4a4f55' }));
      hd.position.set(x, 30.2, z);
      airport.add(hd);
    }

  // manga de viento
  const sock = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 8), new THREE.MeshStandardMaterial({ color: '#ddd' }));
  pole.position.y = 3.5;
  const [sc, sg] = canvas(256, 32);
  for (let i = 0; i < 5; i++) {
    sg.fillStyle = i % 2 ? '#f5f5f2' : '#ff5a1f';
    sg.fillRect((i * 256) / 5, 0, 256 / 5, 32);
  }
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 3.6, 16, 1, true).rotateZ(Math.PI / 2).translate(-1.8, 0, 0), new THREE.MeshStandardMaterial({ map: texFromCanvas(sc), side: THREE.DoubleSide, roughness: 0.8 }));
  cone.position.y = 6.8;
  sock.add(pole, cone);
  sock.position.set(-1380, 0, -70);
  airport.add(sock);
  W.sock = cone;

  // letreros de calle de rodaje en el punto de espera A1
  const s1 = signPanel([
    { text: 'A1', fg: '#f4c21f', bg: '#16171a', w: 1.2, border: '#f4c21f' },
    { text: '09-27', fg: '#ffffff', bg: '#c4161c', w: 2.4 },
  ]);
  s1.position.set(-1468, 1.15, 56);
  s1.rotation.y = -1.97;
  const s2 = signPanel([
    { text: 'ITINERARIO →', fg: '#16171a', bg: '#f4c21f', w: 3.6 },
    { text: 'A', fg: '#f4c21f', bg: '#16171a', w: 0.9, border: '#f4c21f' },
  ]);
  s2.position.set(-1471, 1.15, 70);
  s2.rotation.y = -2.5;
  airport.add(s1, s2);

  // árboles alrededor del aeropuerto
  const treeG = new THREE.IcosahedronGeometry(1, 0);
  treeG.translate(0, 1, 0);
  const treeM = withDetail(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), 6, 1, 0.4);
  const trees = [];
  for (let i = 0; i < 4200; i++) {
    const a = r() * Math.PI * 2, d = 700 + Math.pow(r(), 0.7) * 4500;
    const x = Math.cos(a) * d * 1.4, z = 150 + Math.sin(a) * d;
    if (Math.abs(z) < 1050 && Math.abs(x) < 3200) continue;
    if (Math.hypot(x - 3800, z + 2600) < 2400) continue;
    if (x < -1500 && Math.abs(z) < 120) continue;
    const cl = r() < 0.6 ? 1 : 0;
    const n = cl ? 6 + Math.floor(r() * 10) : 1;
    for (let k = 0; k < n; k++) trees.push([x + (r() - 0.5) * 40, z + (r() - 0.5) * 40, 3 + r() * 5]);
  }
  const tim = new THREE.InstancedMesh(treeG, treeM, trees.length);
  const tm = new THREE.Matrix4(), tc = new THREE.Color();
  trees.forEach(([x, z, s], i) => {
    tm.makeScale(s * 0.8, s * (1.1 + r() * 0.5), s * 0.8).setPosition(x, 0, z);
    tim.setMatrixAt(i, tm);
    tc.setHSL(0.22 + r() * 0.08, 0.35 + r() * 0.2, 0.13 + r() * 0.08);
    tim.setColorAt(i, tc);
  });
  tim.castShadow = false;
  tim.receiveShadow = true;
  airport.add(tim);

  // luces
  const lights = airportLights();
  airport.add(lights);
  W.lights = lights;

  // ciudad
  const city = makeCity();
  scene.add(city.group);
  W.city = city;

  // ── actualización por cuadro ──
  W.update = (t, dt, derived, camera, envState) => {
    const camPos = camera.position;
    sky.position.copy(camPos);
    dome.position.copy(camPos);
    stars.position.copy(camPos);
    mountains.position.set(camPos.x, 0, camPos.z);
    ground.position.set(camPos.x, 0, camPos.z);
    stars.material.opacity = derived.stars;
    stars.visible = derived.stars > 0.01;
    dome.material.uniforms.uAmt.value = derived.night;
    moon.visible = derived.night > 0.05;
    moon.position.copy(camPos).addScaledVector(derived.moonDir, 80000);
    moon.material.opacity = derived.night;
    shared.night.value = derived.night;
    shared.cityNight.value = derived.cityLights * 3.2;
    city.streetLights.opacity = derived.cityLights;
    city.group.visible = true;
    glassMat.emissiveIntensity = 0.15 + derived.cityLights * 2.2 + derived.dusk * 0.6;
    lights.material.uniforms.uTime.value = t;
    lights.material.uniforms.uI.value = envState.lights * (0.35 + derived.night * 1.6 + derived.dusk * 0.8);
    lights.material.uniforms.uScale.value = renderer.domElement.height * 0.9;
    radar.rotation.y = t * 1.6;
    cone.rotation.y = 0.35 + Math.sin(t * 0.7) * 0.12;
    cone.rotation.z = -0.08 + Math.sin(t * 1.9) * 0.05;
    // aeropuerto oculto cuando la cámara está muy lejos
    airport.visible = Math.hypot(camPos.x, camPos.z) < 14000;
    city.group.visible = Math.hypot(camPos.x - 3800, camPos.z + 2600) < 16000;
  };
  return W;
}
