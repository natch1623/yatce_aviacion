import * as THREE from 'three';
import { glowTexture } from './airliner.js';
import { jetModel } from './blueangels.js';
import { rng } from './util.js';

// Efectos del Acto 3: avión cisterna, Blue Angels del medio con humo azul,
// relámpagos de la tormenta y aurora boreal.

const LOGV = '#include <common>\n#include <logdepthbuf_pars_vertex>';
const LOGF = '#include <logdepthbuf_pars_fragment>';

// ───────── avión cisterna con pértiga ─────────

export const TANKER = { rel: [52, 13.5, 0], pivot: new THREE.Vector3(-17.5, 3.0, 0), receptacle: [11.5, 6.0, 0] };

export function createTanker(plane, scene) {
  const tk = plane.body.clone(true);
  tk.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      if (o.material.color) o.material.color.multiply(new THREE.Color('#9aa4ae'));
    }
  });
  scene.add(tk);
  const mat = new THREE.MeshStandardMaterial({ color: '#a7b0b9', roughness: 0.4, metalness: 0.6 });
  const boom = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 1, 12).rotateX(Math.PI / 2).translate(0, 0, 0.5), mat);
  const tip = new THREE.Group();
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.9), mat);
    fin.position.set(s * 1.1, 0, -1.2);
    fin.rotation.z = s * 0.5;
    tip.add(fin);
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 8).rotateX(Math.PI / 2).translate(0, 0, 0.4), new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.8, roughness: 0.3 }));
  tip.add(nozzle);
  boom.add(tube, tip);
  scene.add(boom);
  const glow = glowTexture();
  const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.5, 5, 9), blending: THREE.AdditiveBlending, depthWrite: false }));
  pulse.scale.setScalar(2.4);
  const recv = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2, 6, 10), blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(pulse, recv);

  const pivotW = new THREE.Vector3(), stowW = new THREE.Vector3(), dir = new THREE.Vector3(), tgt = new THREE.Vector3();
  return {
    update(p, t) {
      const on = p.tanker > 0.5;
      tk.visible = boom.visible = on;
      pulse.visible = recv.visible = on && p.charge > 0.01;
      if (!on) return;
      tk.position.copy(p.tkPos);
      tk.quaternion.copy(p.tkQuat);
      tk.updateMatrixWorld();
      pivotW.copy(TANKER.pivot).applyMatrix4(tk.matrixWorld);
      stowW.set(-0.92, -0.32, 0).applyQuaternion(p.tkQuat).normalize();
      tgt.copy(p.recv);
      dir.subVectors(tgt, pivotW);
      const full = dir.length();
      dir.normalize();
      const aim = stowW.lerp(dir, p.boom).normalize();
      const len = 10 + (full - 10) * p.boom;
      boom.position.copy(pivotW);
      boom.lookAt(pivotW.clone().add(aim));
      tube.scale.z = len;
      tip.position.z = len;
      // pulsos de luz que viajan por la pértiga hacia el avión
      const f = (t * 0.9) % 1;
      pulse.position.copy(pivotW).addScaledVector(aim, len * f);
      pulse.material.opacity = p.charge;
      recv.position.copy(tgt);
      recv.scale.setScalar(2 + p.charge * 3 + Math.sin(t * 9) * 0.6 * p.charge);
      recv.material.opacity = p.charge;
    },
  };
}

// ───────── Blue Angels del medio: entrada en formación y "bomb burst" ─────────

export const BAT = { burst: 3.2, speed: 190, radius: 140, dur: 7.5 };
const BURST_DIRS = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.75, -0.66).normalize(), new THREE.Vector3(0, 0.75, 0.66).normalize()];
const FORM = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-18, -4, -14), new THREE.Vector3(-18, -4, 14)];
const X = new THREE.Vector3(1, 0, 0);

// posición (relativa al ancla de crucero) y orientación de cada jet en el tiempo τ
export function batJet(j, tau, outPos, outQuat) {
  const { burst: tb, speed: v, radius: R } = BAT;
  const climb = new THREE.Vector3(v, 28, 0).normalize();
  if (tau < tb) {
    outPos.set(-460 + v * tau, -60 + 28 * tau, 30).add(FORM[j]);
    if (outQuat) outQuat.setFromUnitVectors(X, climb);
    return outPos;
  }
  const pb = new THREE.Vector3(-460 + v * tb, -60 + 28 * tb, 30).add(FORM[j]);
  const d = BURST_DIRS[j];
  const s = v * (tau - tb), thMax = 1.5;
  const th = Math.min(s / R, thMax);
  outPos.copy(pb).addScaledVector(X, R * Math.sin(th)).addScaledVector(d, R * (1 - Math.cos(th)));
  if (s > R * thMax) {
    const tan = X.clone().multiplyScalar(Math.cos(thMax)).addScaledVector(d, Math.sin(thMax));
    outPos.addScaledVector(tan, s - R * thMax);
  }
  if (outQuat) {
    const tx = X.clone().multiplyScalar(Math.cos(th)).addScaledVector(d, Math.sin(th)).normalize();
    const ty = X.clone().multiplyScalar(-Math.sin(th)).addScaledVector(d, Math.cos(th)).normalize();
    const tz = new THREE.Vector3().crossVectors(tx, ty);
    outQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tx, ty, tz));
  }
  return outPos;
}

export function createMidShow(scene, lateScene, anchor) {
  const jets = [0, 1, 2].map(() => {
    const j = jetModel();
    j.scale.setScalar(1.3);
    scene.add(j);
    return j;
  });
  // humo: posiciones fijas en el mundo, precalculadas a lo largo de la trayectoria
  const r = rng(77);
  const pos = [], birth = [], seed = [];
  const tmp = new THREE.Vector3();
  for (let j = 0; j < 3; j++)
    for (let tau = 0.4; tau < BAT.dur + 3; tau += 0.018) {
      batJet(j, tau, tmp).add(anchor);
      tmp.x -= 6;
      pos.push(tmp.x, tmp.y, tmp.z);
      birth.push(tau);
      seed.push(r());
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBirth', new THREE.Float32BufferAttribute(birth, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uScale: { value: 800 }, uFade: { value: 1 }, uLight: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `${LOGV}
      uniform float uT, uScale;
      attribute float aBirth, aSeed;
      varying float vA; varying float vS;
      void main(){
        float age = uT - aBirth;
        vec3 p = position + vec3(-age * 3.0, -age * 0.4, (aSeed - 0.5) * age * 1.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        float rad = 2.5 + min(age, 8.0) * 2.4 + max(age - 8.0, 0.0) * 0.25;
        gl_PointSize = clamp(2.0 * rad * uScale / -mv.z, 1.0, 500.0);
        vA = step(0.0, age) * smoothstep(0.0, 0.2, age) * (1.0 - smoothstep(90.0, 160.0, age)) * (0.32 + aSeed * 0.16) / (1.0 + age * 0.04);
        vS = aSeed;
      }`,
    fragmentShader: `${LOGF}
      uniform vec3 uLight; uniform float uFade; varying float vA; varying float vS;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q) * 2.0;
        float a = smoothstep(1.0, 0.1, d);
        vec3 blue = mix(vec3(0.05, 0.28, 1.0), vec3(0.25, 0.55, 1.0), vS);
        gl_FragColor = vec4(blue * uLight * (0.85 + 0.3 * (0.5 - q.y)), a * vA * uFade);
      }`,
    transparent: true, depthWrite: false,
  });
  const smoke = new THREE.Points(g, mat);
  smoke.frustumCulled = false;
  lateScene.add(smoke);
  const q = new THREE.Quaternion();
  return {
    update(p, derived, height, ambient) {
      const on = p.bat >= 0;
      smoke.visible = on && p.batFade > 0.01;
      mat.uniforms.uT.value = p.bat;
      mat.uniforms.uFade.value = p.batFade;
      mat.uniforms.uScale.value = height * 0.9;
      mat.uniforms.uLight.value.copy(derived.sunColor).multiplyScalar(1.5).add(ambient);
      for (let j = 0; j < 3; j++) {
        const jet = jets[j];
        jet.visible = on && p.bat < BAT.dur + 4 && p.batFade > 0.5;
        if (!jet.visible) continue;
        batJet(j, p.bat, jet.position, q).add(anchor);
        jet.quaternion.copy(q);
      }
    },
  };
}

// ───────── relámpagos ─────────

export function createLightning(lateScene) {
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(9, 9, 12), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const bolt = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
  bolt.frustumCulled = false;
  lateScene.add(bolt);
  let lastIdx = -1;
  const build = (seed) => {
    const r = rng(seed * 97 + 3);
    const pts = [];
    const branch = (x, y, z, len, depth) => {
      let px = x, py = y, pz = z;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const nx = px + (r() - 0.5) * len * 0.22, ny = py - len / n, nz = pz + (r() - 0.5) * len * 0.22;
        pts.push(px, py, pz, nx, ny, nz);
        if (depth < 2 && r() < 0.18) branch(nx, ny, nz, len * 0.45, depth + 1);
        px = nx; py = ny; pz = nz;
      }
    };
    branch(0, 0, 0, 900, 0);
    bolt.geometry.dispose();
    bolt.geometry = new THREE.BufferGeometry();
    bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  };
  return {
    update(p) {
      bolt.visible = p.flash > 0.25;
      if (!bolt.visible) return;
      if (p.flashIdx !== lastIdx) {
        lastIdx = p.flashIdx;
        build(p.flashIdx + 1);
      }
      bolt.position.copy(p.flashPos).setY(p.flashPos.y + 450);
      mat.opacity = Math.min(1, p.flash);
    },
  };
}

// ───────── aurora boreal ─────────

export function createAurora(scene) {
  const meshes = [];
  const geo = new THREE.PlaneGeometry(1, 1, 220, 1);
  const common = { uT: { value: 0 }, uAmt: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const curtains = [
    { phi: 52, D: 42000, w: 52000, base: 4300, h: 14000, seed: 1.3 },
    { phi: 70, D: 52000, w: 44000, base: 5200, h: 16000, seed: 4.7 },
    { phi: 38, D: 58000, w: 40000, base: 5600, h: 12000, seed: 8.1 },
    { phi: 62, D: 34000, w: 30000, base: 4000, h: 9000, seed: 2.2 },
  ];
  for (const c of curtains) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...common, uPhi: { value: (c.phi * Math.PI) / 180 }, uD: { value: c.D }, uW: { value: c.w }, uBase: { value: c.base }, uH: { value: c.h }, uSeed: { value: c.seed } },
      vertexShader: `${LOGV}
        uniform float uT, uPhi, uD, uW, uBase, uH, uSeed; uniform vec3 uCam;
        varying vec2 vUv; varying float vX;
        void main(){
          vUv = uv;
          float x = (uv.x - 0.5) * uW;
          vX = x;
          float D = uD + sin(x * 0.00021 + uT * 0.25 + uSeed) * 2600.0 + sin(x * 0.00063 - uT * 0.4) * 900.0;
          float a = uPhi + x / uD;
          float base = uBase + sin(x * 0.00031 + uSeed * 3.0 + uT * 0.05) * 900.0 + sin(x * 0.0011 - uT * 0.2) * 250.0;
          vec3 w = vec3(uCam.x + cos(a) * D, base + uv.y * uH * (0.8 + 0.2 * sin(x * 0.0005 + uSeed)), uCam.z + sin(a) * D);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `${LOGF}
        uniform float uT, uAmt, uSeed; varying vec2 vUv; varying float vX;
        float h1(float n){ return fract(sin(n) * 43758.5453); }
        float n1(float x){ float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
        void main(){
          #include <logdepthbuf_fragment>
          float v = vUv.y;
          float rays = pow(n1(vX * 0.0016 + uT * 0.06 + uSeed * 10.0), 2.5) * 1.3 + 0.45 * n1(vX * 0.009 - uT * 0.35 + uSeed);
          rays *= 0.25 + 1.1 * smoothstep(0.3, 0.85, n1(vX * 0.00028 + uT * 0.03 + uSeed * 5.0));
          float edge = smoothstep(0.0, 0.035, v) * exp(-v * 2.4);
          float ends = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 col = mix(vec3(0.12, 1.0, 0.42), vec3(0.62, 0.18, 0.85), smoothstep(0.22, 0.85, v));
          col += vec3(0.6, 1.0, 0.7) * smoothstep(0.06, 0.0, v) * 0.6;
          float I = rays * edge * ends * uAmt * 0.38;
          gl_FragColor = vec4(col * I, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    scene.add(m);
    meshes.push(m);
  }
  return {
    update(camera, t, amt) {
      common.uT.value = t;
      common.uAmt.value = amt;
      common.uCam.value.copy(camera.position);
      for (const m of meshes) m.visible = amt > 0.01;
    },
  };
}
