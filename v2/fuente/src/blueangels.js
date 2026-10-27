import * as THREE from 'three';
import { rng } from './util.js';

// Paso final: siete jets en columna escriben GRACIAS con puntos de humo de
// colores (técnica de "skytyping": cada jet es una fila de una letra de 5×7).
const FONT = {
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
};
const WORD = 'GRACIAS';
// un color por letra, como un arcoíris
const COLORS = ['#ff3b30', '#ff8a00', '#ffd400', '#2ecc40', '#1e90ff', '#5b4bff', '#c03bff'];

export const ANGELS = { start: 31, speed: 150, spacing: 26, distance: 1500, elevation: 14.5 };

export function jetModel() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#0d2a6e', roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: '#f5c518', roughness: 0.4, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 13, 12), blue);
  body.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.5, 12), blue);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 8.2;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.1, metalness: 0.8 }));
  canopy.scale.set(2.2, 0.8, 0.8);
  canopy.position.set(4.2, 0.6, 0);
  const wingShape = new THREE.Shape([new THREE.Vector2(2.5, 0), new THREE.Vector2(-2.5, 0), new THREE.Vector2(-3.6, 6.2), new THREE.Vector2(-2.2, 6.2)]);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.18, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  const wR = new THREE.Mesh(wingGeo, blue);
  const wL = new THREE.Mesh(wingGeo, blue);
  wL.scale.z = -1;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 12.4), gold);
  edge.position.set(1.0, 0.05, 0);
  const finShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-2.6, 0), new THREE.Vector2(-3.4, 3.2), new THREE.Vector2(-2.4, 3.2)]);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
  for (const z of [-1.1, 1.1]) {
    const f = new THREE.Mesh(finGeo, blue);
    f.position.set(-3.4, 0.3, z);
    f.rotation.x = z > 0 ? -0.35 : 0.35;
    g.add(f);
  }
  g.add(body, nose, canopy, wR, wL, edge);
  return g;
}

export function createBlueAngels(scene, lateScene, camPos, lookAt) {
  // marco del "lienzo" en el cielo, perpendicular a la mirada de la toma final
  const fwd = new THREE.Vector3().subVectors(lookAt, camPos).setY(0).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  const { spacing: S, distance: D, speed: v, start } = ANGELS;
  const center = camPos.clone().addScaledVector(fwd, D);
  center.y = camPos.y + D * Math.tan((ANGELS.elevation * Math.PI) / 180);
  const cols = WORD.length * 6 - 1;
  const W = cols * S;
  const runIn = 900;
  const stagger = (r) => Math.abs(r - 3) * 14; // formación en flecha

  // jets
  const jets = [];
  const yaw = Math.atan2(-right.z, right.x);
  for (let r = 0; r < 7; r++) {
    const j = jetModel();
    j.rotation.set(0, yaw, 0, 'YZX');
    j.scale.setScalar(1.8);
    scene.add(j);
    jets.push(j);
  }
  const jetPos = (r, t, out) => {
    const x = -W / 2 - runIn + v * (t - start) - stagger(r);
    return out.copy(center).addScaledVector(right, x).addScaledVector(up, (3 - r) * S);
  };

  // puntos de humo de las letras
  const rnd = rng(17);
  const pos = [], col = [], birth = [], seed = [];
  const c = new THREE.Color();
  for (let li = 0; li < WORD.length; li++) {
    const glyph = FONT[WORD[li]];
    c.set(COLORS[li]).convertSRGBToLinear();
    for (let r = 0; r < 7; r++)
      for (let k = 0; k < 5; k++) {
        if (glyph[r][k] !== '#') continue;
        const cc = li * 6 + k;
        const x = (cc - (cols - 1) / 2) * S;
        const tb = start + (x + W / 2 + runIn + stagger(r)) / v;
        for (let n = 0; n < 6; n++) {
          const p = center.clone().addScaledVector(right, x + (rnd() - 0.5) * 7).addScaledVector(up, (3 - r) * S + (rnd() - 0.5) * 7).addScaledVector(fwd, (rnd() - 0.5) * 10);
          pos.push(p.x, p.y, p.z);
          col.push(c.r, c.g, c.b);
          birth.push(tb + n * 0.02);
          seed.push(rnd());
        }
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBirth', new THREE.Float32BufferAttribute(birth, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uScale: { value: 800 }, uLight: { value: new THREE.Color(1, 1, 1) }, uWind: { value: right.clone().multiplyScalar(1.6) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uT, uScale; uniform vec3 uWind;
      attribute vec3 aColor; attribute float aBirth, aSeed;
      varying vec3 vC; varying float vA;
      void main(){
        float age = uT - aBirth;
        vec3 p = position + uWind * max(age, 0.0) + vec3(0.0, -0.15, 0.0) * max(age, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        float r = mix(3.0, 15.5, smoothstep(0.0, 1.8, age)) + age * 0.05;
        gl_PointSize = clamp(2.0 * r * uScale / -mv.z, 1.0, 400.0);
        vC = aColor;
        vA = step(0.0, age) * smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(150.0, 200.0, age)) * (0.62 + aSeed * 0.25);
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uLight; varying vec3 vC; varying float vA;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q) * 2.0;
        float a = smoothstep(1.0, 0.25, d);
        float shade = 0.75 + 0.35 * (0.5 - q.y);
        gl_FragColor = vec4(vC * uLight * shade + uLight * 0.08, a * vA);
      }`,
    transparent: true, depthWrite: false,
  });
  const puffs = new THREE.Points(g, mat);
  puffs.frustumCulled = false;
  lateScene.add(puffs);

  // estelas blancas finas detrás de cada jet
  const TR = 40;
  const tg = new THREE.BufferGeometry();
  const tIdx = new Float32Array(7 * TR * 2);
  for (let r = 0; r < 7; r++) for (let k = 0; k < TR; k++) { tIdx[(r * TR + k) * 2] = r; tIdx[(r * TR + k) * 2 + 1] = k; }
  tg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(7 * TR * 3), 3));
  tg.setAttribute('aRK', new THREE.Float32BufferAttribute(tIdx, 2));
  const trailMat = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uScale: mat.uniforms.uScale, uLight: mat.uniforms.uLight,
      uC: { value: center }, uR: { value: right }, uS: { value: S }, uV: { value: v }, uX0: { value: -W / 2 - runIn }, uStart: { value: start },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uT, uScale, uS, uV, uX0, uStart; uniform vec3 uC, uR;
      attribute vec2 aRK; varying float vA;
      void main(){
        float r = aRK.x, k = aRK.y;
        float te = uT - k * 0.06;
        float x = uX0 + uV * (te - uStart) - abs(r - 3.0) * 14.0;
        vec3 p = uC + uR * x + vec3(0.0, (3.0 - r) * uS, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        gl_PointSize = clamp((1.2 + k * 0.08) * 2.0 * uScale / -mv.z, 1.0, 60.0);
        vA = (1.0 - k / 40.0) * 0.75 * step(uStart, te);
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uLight; varying float vA;
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(uLight * 0.95, smoothstep(1.0, 0.0, d) * vA);
      }`,
    transparent: true, depthWrite: false,
  });
  const trails = new THREE.Points(tg, trailMat);
  trails.frustumCulled = false;
  lateScene.add(trails);

  const endT = start + (W + 2 * runIn + 6 * 14 + 400) / v;
  return {
    update(t, derived, height, ambient) {
      const on = t >= 0;
      puffs.visible = on && t > start;
      trails.visible = on && t > start && t < endT;
      mat.uniforms.uT.value = t;
      trailMat.uniforms.uT.value = t;
      mat.uniforms.uScale.value = height * 0.9;
      mat.uniforms.uLight.value.copy(derived.sunColor).multiplyScalar(1.6).add(ambient);
      for (let r = 0; r < 7; r++) {
        const j = jets[r];
        j.visible = on && t > start - 0.5 && t < endT;
        if (j.visible) jetPos(r, t, j.position);
      }
    },
  };
}
