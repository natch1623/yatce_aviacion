import * as THREE from 'three';
import { glowTexture } from './airliner.js';
import { jetModel } from './blueangels.js';
import { canvas, texFromCanvas, tileNoise, rng, clamp } from './util.js';

// Efectos del Acto 4: el borde del espacio, los paracaidistas, el skywriting
// del título y el mar para el vuelo rasante.

const LOGV = '#include <common>\n#include <logdepthbuf_pars_vertex>';
const LOGF = '#include <logdepthbuf_pars_fragment>';

// ───────── el borde del espacio (escena aparte, unidades en km) ─────────

export const SPACE = { R: 6371, h: 120 };

export function createSpace() {
  const scene = new THREE.Scene();
  const R = SPACE.R;
  const uniforms = { uSun: { value: new THREE.Vector3(0, 0, -1) }, uT: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const vert = `${LOGV}
    varying vec3 vN; varying vec3 vW;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
    }`;
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R, 256, 128),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: `${LOGF}
        uniform vec3 uSun, uCam; uniform float uT;
        varying vec3 vN; varying vec3 vW;
        float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float n3(vec3 x){
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 7; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vN);
          float land = smoothstep(0.5, 0.54, fbm(n * 3.2 + 7.0));
          float cl = smoothstep(0.48, 0.74, fbm(n * 9.0 + vec3(uT * 0.002, 0.0, 0.0)));
          vec3 ocean = vec3(0.01, 0.045, 0.14);
          vec3 ground = mix(vec3(0.08, 0.12, 0.05), vec3(0.24, 0.19, 0.11), fbm(n * 14.0));
          vec3 alb = mix(ocean, ground, land);
          alb = mix(alb, vec3(0.9), cl * 0.92);
          float l = dot(n, uSun);
          float day = smoothstep(-0.06, 0.2, l);
          vec3 lit = alb * (max(l, 0.0) * 2.4 + 0.015);
          lit *= mix(vec3(1.0, 0.5, 0.25), vec3(1.0), smoothstep(0.0, 0.22, l));
          vec3 v = normalize(uCam - vW);
          float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 80.0) * (1.0 - land) * (1.0 - cl) * day;
          lit += vec3(1.0, 0.82, 0.55) * spec * 4.0;
          float city = step(0.9, n3(n * 1400.0)) * land * (1.0 - cl) * (1.0 - day);
          lit += vec3(1.0, 0.68, 0.32) * city * 0.5;
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          lit = mix(lit, vec3(0.25, 0.5, 1.0) * max(l + 0.25, 0.0) * 1.3, fres * 0.65);
          gl_FragColor = vec4(lit, 1.0);
        }`,
    })
  );
  earth.position.y = -R;
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R + 55, 192, 96),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: `${LOGF}
        uniform vec3 uSun, uCam; varying vec3 vN; varying vec3 vW;
        void main(){
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vN); vec3 v = normalize(uCam - vW);
          float f = pow(1.0 - abs(dot(n, v)), 7.0);
          float l = dot(n, uSun);
          vec3 c = vec3(0.22, 0.5, 1.0) * smoothstep(-0.25, 0.35, l) * 1.4 + vec3(1.0, 0.42, 0.12) * exp(-pow(l / 0.1, 2.0)) * 1.2;
          gl_FragColor = vec4(c * f * 1.7, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  atmo.position.y = -R;
  // estrellas
  const r = rng(5), sp = [], sc = [];
  for (let i = 0; i < 9000; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    sp.push(Math.cos(a) * s * 150000, u * 150000, Math.sin(a) * s * 150000);
    const b = Math.pow(r(), 7) * 5 + 0.2;
    sc.push(b, b * 0.95, b * 1.05);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  stars.frustumCulled = false;
  // sol
  const glow = glowTexture();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(60, 54, 44), blending: THREE.AdditiveBlending, depthWrite: false }));
  sun.scale.setScalar(2600);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.2, 0.9, 0.6), blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(22000);
  scene.add(earth, atmo, stars, sun, halo);
  // sol justo encima del limbo terrestre, un poco a la derecha de la mirada
  const sunDir = new THREE.Vector3();
  return {
    scene,
    sunDir,
    update(camera, t, sunAz) {
      const dip = Math.acos(SPACE.R / (SPACE.R + Math.max(camera.position.y, 1)));
      const el = -dip + 0.012;
      sunDir.set(Math.cos(sunAz) * Math.cos(el), Math.sin(el), Math.sin(sunAz) * Math.cos(el));
      uniforms.uSun.value.copy(sunDir);
      uniforms.uT.value = t;
      uniforms.uCam.value.copy(camera.position);
      stars.position.copy(camera.position);
      sun.position.copy(camera.position).addScaledVector(sunDir, 60000);
      halo.position.copy(sun.position);
    },
  };
}

// ───────── paracaidistas ─────────

export const CHUTE = { y0: 1250, descent: 4.5 };
const CHUTERS = [
  { off: [16, -20, 24], cols: ['#ff3b30', '#ffffff', '#1e4fd8'] },
  { off: [-70, -45, 90], cols: ['#ffd400', '#111111', '#ffd400'] },
  { off: [110, -80, -30], cols: ['#2ecc40', '#ffffff', '#2ecc40'] },
  { off: [-140, 6, -100], cols: ['#ff8a00', '#5b4bff', '#ff8a00'] },
  { off: [55, -130, 160], cols: ['#c03bff', '#ffffff', '#00b7ff'] },
];

function canopyTex(cols) {
  const [c, g] = canvas(256, 64);
  const w = 256 / 9;
  for (let i = 0; i < 9; i++) {
    g.fillStyle = cols[i % 3];
    g.fillRect(i * w, 0, w + 1, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 1; i < 9; i++) g.fillRect(i * w - 1, 0, 2, 64);
  return texFromCanvas(c);
}

function jumper(cols) {
  const root = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: cols[0] === '#111111' ? '#222' : cols[0], roughness: 0.7 });
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 6, 10), suit);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.3 }));
  head.position.y = 0.68;
  const limb = new THREE.CapsuleGeometry(0.08, 0.6, 4, 6);
  const parts = [];
  for (const [x, y, rz] of [[-0.16, -0.75, 0.15], [0.16, -0.75, -0.15], [-0.36, 0.25, 0.9], [0.36, 0.25, -0.9]]) {
    const m = new THREE.Mesh(limb, suit);
    m.position.set(x, y, 0);
    m.rotation.z = rz;
    parts.push(m);
  }
  body.add(torso, head, ...parts);
  const canopy = new THREE.Group();
  const cg = new THREE.BoxGeometry(8.5, 0.55, 3.0, 24, 1, 1);
  const pos = cg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setY(i, pos.getY(i) - 0.04 * x * x + 0.06 * Math.cos(x * 3.3));
  }
  cg.computeVertexNormals();
  const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: canopyTex(cols), roughness: 0.6, side: THREE.DoubleSide }));
  cm.position.y = 6.4;
  const lp = [];
  for (const x of [-4, -2, 0, 2, 4])
    for (const z of [-1.3, 1.3]) lp.push(x, 6.4 - 0.04 * x * x - 0.25, z, x > 0 ? 0.25 : -0.25, 0.35, 0);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)), new THREE.LineBasicMaterial({ color: '#d9d9d9', transparent: true, opacity: 0.6 }));
  canopy.add(cm, lines);
  root.add(body, canopy);
  root.traverse((o) => o.isMesh && (o.castShadow = true));
  return { root, body, canopy };
}

export function createChutes(scene, anchor) {
  const js = CHUTERS.map((c) => {
    const j = jumper(c.cols);
    scene.add(j.root);
    return j;
  });
  const center = new THREE.Vector3(anchor.x, CHUTE.y0, anchor.z);
  return {
    center,
    // posición de cada paracaidista abierto en el tiempo t de la slide
    chuterPos(i, t, out) {
      const o = CHUTERS[i].off;
      const a = t * 0.05 + i;
      const rad = Math.hypot(o[0], o[2]), ang = Math.atan2(o[2], o[0]) + t * 0.012;
      out.set(center.x + Math.cos(ang) * rad + Math.sin(a) * 3, center.y + o[1] - CHUTE.descent * Math.min(t, 190), center.z + Math.sin(ang) * rad);
      return out;
    },
    update(p, t) {
      const on = p.chute >= 0;
      js.forEach((j, i) => {
        j.root.visible = on;
        if (!on) return;
        if (i === 0 && p.j0Mode < 1) {
          // el compañero en caída libre: horizontal, con el paracaídas abriéndose
          j.root.position.copy(p.j0Pos);
          const ff = 1 - p.j0Mode;
          j.body.rotation.x = -ff * Math.PI / 2;
          j.canopy.visible = p.j0Open > 0.01;
          j.canopy.scale.set(0.15 + 0.85 * p.j0Open, 0.2 + 0.8 * p.j0Open * p.j0Open, 0.3 + 0.7 * p.j0Open);
          j.root.rotation.set(0, t * 0.1, 0);
          return;
        }
        this.chuterPos(i, p.chute, j.root.position);
        j.body.rotation.x = 0;
        j.canopy.visible = true;
        j.canopy.scale.set(1, 1, 1);
        j.root.rotation.set(Math.sin(t * 0.7 + i) * 0.06, p.chute * 0.04 + i * 1.3, Math.sin(t * 0.5 + i * 2) * 0.08);
      });
    },
  };
}

// ───────── skywriting: una avioneta escribe el título con humo ─────────

export function createSkyText(lateScene, scene, text, camPos, lookAt, { dist = 1300, elev = 15, height = 95, writeDur = 6.2 } = {}) {
  const W = 1800, H = 220;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 170;
  g.font = `italic 600 ${size}px "Segoe Script", "Brush Script MT", "Segoe UI", cursive`;
  while (g.measureText(text).width > W * 0.94 && size > 40) {
    size -= 6;
    g.font = `italic 600 ${size}px "Segoe Script", "Brush Script MT", "Segoe UI", cursive`;
  }
  g.fillText(text, W / 2, H / 2);
  const img = g.getImageData(0, 0, W, H).data;
  const fwd = new THREE.Vector3().subVectors(lookAt, camPos).setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  const center = camPos.clone().addScaledVector(fwd, dist);
  center.y = camPos.y + dist * Math.tan((elev * Math.PI) / 180);
  const mPerPx = height / H;
  const r = rng(31);
  const pos = [], birth = [], seed = [];
  const colY = new Float32Array(W).fill(-1);
  let minX = W, maxX = 0;
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3)
      if (img[(y * W + x) * 4 + 3] > 120) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3) {
      if (img[(y * W + x) * 4 + 3] <= 120) continue;
      const p = center.clone().addScaledVector(right, (x - W / 2) * mPerPx + (r() - 0.5) * 2).addScaledVector(up, (H / 2 - y) * mPerPx + (r() - 0.5) * 2);
      pos.push(p.x, p.y, p.z);
      birth.push(((x - minX) / Math.max(1, maxX - minX)) * writeDur);
      seed.push(r());
      colY[x] = colY[x] < 0 ? y : (colY[x] + y) / 2;
    }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gg.setAttribute('aBirth', new THREE.Float32BufferAttribute(birth, 1));
  gg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uScale: { value: 800 }, uLight: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 1 }, uWind: { value: right.clone().multiplyScalar(0.6) } },
    vertexShader: `${LOGV}
      uniform float uT, uScale; uniform vec3 uWind;
      attribute float aBirth, aSeed; varying float vA;
      void main(){
        float age = uT - aBirth;
        vec3 p = position + uWind * max(age, 0.0) + vec3(0.0, -0.05, 0.0) * max(age, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        float rad = mix(2.0, 5.6, smoothstep(0.0, 2.0, age)) + age * 0.04;
        gl_PointSize = clamp(2.0 * rad * uScale / -mv.z, 1.0, 300.0);
        vA = step(0.0, age) * (1.0 - smoothstep(120.0, 180.0, age)) * (0.55 + aSeed * 0.25);
      }`,
    fragmentShader: `${LOGF}
      uniform vec3 uLight; uniform float uFade; varying float vA;
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(uLight, smoothstep(1.0, 0.1, d) * vA * uFade);
      }`,
    transparent: true, depthWrite: false,
  });
  const puffs = new THREE.Points(gg, mat);
  puffs.frustumCulled = false;
  lateScene.add(puffs);
  // la avioneta (roja y blanca) que va trazando
  const plane = jetModel();
  plane.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      if (o.material.color && o.material.color.getHex() === 0x0d2a6e) o.material.color.set('#c8231b');
    }
  });
  plane.scale.setScalar(2.4);
  plane.rotation.y = Math.atan2(-right.z, right.x);
  scene.add(plane);
  // altura suavizada de la "pluma" para cada columna
  const smoothY = new Float32Array(W);
  let last = H / 2;
  for (let x = 0; x < W; x++) {
    if (colY[x] >= 0) last = colY[x];
    smoothY[x] = last;
  }
  return {
    update(tSky, derived, height, ambient, fade = 1) {
      const on = tSky > -5;
      puffs.visible = on && fade > 0.01;
      mat.uniforms.uT.value = tSky;
      mat.uniforms.uFade.value = fade;
      mat.uniforms.uScale.value = height * 0.9;
      mat.uniforms.uLight.value.copy(derived.sunColor).multiplyScalar(1.2).add(ambient).multiplyScalar(1.05);
      const u = tSky / writeDur;
      plane.visible = on && u > -0.15 && u < 1.25 && fade > 0.5;
      if (plane.visible) {
        const px = clamp(minX + u * (maxX - minX), 0, W - 1);
        const py = smoothY[Math.floor(clamp(px, 0, W - 1))];
        plane.position.copy(center).addScaledVector(right, (minX + u * (maxX - minX) - W / 2) * mPerPx + 6).addScaledVector(up, (H / 2 - py) * mPerPx);
      }
    },
  };
}

// ───────── el mar ─────────

export const SEA = new THREE.Vector3(42000, 45, -36000);

export function createOcean(scene) {
  // olas como suma de ondas con frecuencias enteras: se repiten sin costura
  // y dan normales suaves (sin el cuadriculado del ruido de valor)
  const N = 256, r = rng(21);
  const waves = [];
  for (let k = 0; k < 28; k++) {
    let kx, ky;
    do {
      kx = Math.round((r() - 0.5) * 40);
      ky = Math.round((r() - 0.5) * 24);
    } while (Math.hypot(kx, ky) < 2);
    waves.push({ kx, ky, a: 1 / Math.pow(Math.hypot(kx, ky), 1.25), ph: r() * Math.PI * 2 });
  }
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const arg = (2 * Math.PI * (w.kx * x + w.ky * y)) / N + w.ph;
        const cs = Math.cos(arg) * w.a * 2 * Math.PI;
        dx += cs * w.kx;
        dy += cs * w.ky;
      }
      const nx = -dx * 0.012, ny = -dy * 0.012, l = Math.hypot(nx, ny, 1);
      const i = y * N + x;
      img.data[i * 4] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const n1 = texFromCanvas(c, { srgb: false, repeat: true });
  const n2 = n1.clone();
  n1.repeat.set(2600, 2600);
  n2.repeat.set(900, 900);
  n2.needsUpdate = true;
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#0a3b56', roughness: 0.18, metalness: 0, normalMap: n1, normalScale: new THREE.Vector2(0.45, 0.45),
    clearcoat: 1, clearcoatRoughness: 0.05, clearcoatNormalMap: n2, clearcoatNormalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 1.1,
  });
  const size = 120000, tile = size / 2600;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  m.frustumCulled = false;
  scene.add(m);
  return {
    update(p, camera, t) {
      m.visible = p.sea > 0.5;
      if (!m.visible) return;
      // el plano sigue a la cámara en pasos de un mosaico para que las olas no "patinen"
      m.position.set(Math.round(camera.position.x / tile) * tile, 0.4, Math.round(camera.position.z / tile) * tile);
      // el avión avanza: las olas se desplazan bajo él
      n1.offset.set(t * 0.9, t * 0.05);
      n2.offset.set(t * 0.55, -t * 0.08);
    },
  };
}
