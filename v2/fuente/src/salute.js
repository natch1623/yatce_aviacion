import * as THREE from 'three';
import { rng } from './util.js';

// Saludo de agua: dos camiones de bomberos lanzan chorros que forman un arco
// sobre la calle de la plataforma. Incluye neblina, arcoíris y el humo de las
// ruedas en la toma de contacto.
export const ARCH = { x: -50, zL: 192, zR: 258, y: 4.4, v: 27.5, angle: 56 };

const LOGDEPTH_V = '#include <common>\n#include <logdepthbuf_pars_vertex>';
const LOGDEPTH_F = '#include <logdepthbuf_pars_fragment>';

function fireTruck() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c8231b', roughness: 0.35, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: '#efefec', roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.1, metalness: 0.5 });
  const box = (w, h, d, m, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y + h / 2, z);
    g.add(b);
    return b;
  };
  box(11, 2.4, 3.0, red, 0, 0.9, 0);
  box(2.6, 1.5, 2.9, red, 4.2, 3.3, 0);
  box(2.4, 0.9, 2.95, glass, 4.4, 3.4, 0);
  box(11.05, 0.25, 3.05, white, 0, 2.3, 0);
  for (const x of [-3.8, -1.2, 3.6])
    for (const z of [-1.45, 1.45]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 16), dark);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.62, z);
      g.add(w);
    }
  // cañón del techo
  const turret = new THREE.Group();
  turret.position.set(1.5, 3.4, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.5, 12), white);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.8, 10), white);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.4, 0.7);
  turret.add(base, barrel);
  g.add(turret);
  g.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
  return g;
}

function sprayPoints(count, seed) {
  const r = rng(seed);
  const seeds = new Float32Array(count * 4), side = new Float32Array(count), pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = r();
    side[i] = i % 2 ? 1 : -1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  return g;
}

export function createSalute(scene, solidScene = scene) {
  const S = {};
  const left = fireTruck();
  left.position.set(ARCH.x - 1.5, 0.11, ARCH.zL - 3.5);
  left.rotation.y = 0;
  const right = fireTruck();
  right.position.set(ARCH.x - 1.5, 0.11, ARCH.zR + 3.5);
  right.rotation.y = Math.PI;
  solidScene.add(left, right);
  // balizas de los camiones
  const beacons = [];
  for (const t of [left, right]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3, 0.4) }));
    b.position.set(5, 5.0, 0);
    t.add(b);
    beacons.push(b);
  }

  const common = {
    uTime: { value: 0 }, uAmt: { value: 0 }, uScale: { value: 800 },
    uSun: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.4, 0.45, 0.5) },
  };
  const ballistic = /* glsl */ `
    uniform float uTime, uAmt, uScale;
    attribute vec4 aSeed; attribute float aSide;
    varying float vA; varying float vAge;
    const vec3 G = vec3(0.0, -9.81, 0.0);
    vec3 nozzle(float side){ return vec3(${ARCH.x.toFixed(1)}, ${ARCH.y.toFixed(2)}, side < 0.0 ? ${ARCH.zL.toFixed(1)} : ${ARCH.zR.toFixed(1)}); }
    vec3 launch(float side, vec4 s){
      float th = radians(${ARCH.angle.toFixed(1)}) + (s.w - 0.5) * 0.05;
      float v = ${ARCH.v.toFixed(2)} * (1.0 + (s.x - 0.5) * 0.07);
      float dz = side < 0.0 ? 1.0 : -1.0;
      return vec3((s.z - 0.5) * 1.1, v * sin(th), dz * v * cos(th));
    }`;

  // chorros
  const jetMat = new THREE.ShaderMaterial({
    uniforms: common,
    vertexShader: `${LOGDEPTH_V}
      ${ballistic}
      void main(){
        float life = 3.4 + aSeed.x * 0.5;
        float age = fract(uTime / life + aSeed.y) * life;
        vec3 p = nozzle(aSide) + launch(aSide, aSeed) * age + 0.5 * G * age * age;
        vec3 j = vec3(fract(aSeed.y * 91.7), fract(aSeed.z * 53.3), fract(aSeed.w * 37.1)) - 0.5;
        p += j * (0.15 + age * age * 1.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        float size = 0.45 + age * 1.7;
        gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 48.0);
        vAge = age / life;
        vA = uAmt * step(0.15, p.y) * (1.0 - smoothstep(0.55, 1.0, vAge)) * (0.65 - vAge * 0.35);
      }`,
    fragmentShader: `${LOGDEPTH_F}
      uniform vec3 uSun, uAmb;
      varying float vA; varying float vAge;
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        vec3 c = uSun * 0.55 + uAmb * 1.1;
        gl_FragColor = vec4(c * (0.9 + 0.2 * (1.0 - vAge)), a * a * vA);
      }`,
    transparent: true, depthWrite: false,
  });
  const jets = new THREE.Points(sprayPoints(5000, 3), jetMat);
  jets.frustumCulled = false;
  scene.add(jets);

  // neblina que cae bajo el arco
  const mistMat = new THREE.ShaderMaterial({
    uniforms: common,
    vertexShader: `${LOGDEPTH_V}
      ${ballistic}
      void main(){
        float life = 6.0 + aSeed.x * 3.0;
        float age = fract(uTime / life + aSeed.y) * life;
        float tz = mix(${ARCH.zL.toFixed(1)} + 10.0, ${ARCH.zR.toFixed(1)} - 10.0, aSeed.z);
        float h = 22.0 + aSeed.w * 6.0 - age * (2.2 + aSeed.x * 1.6);
        vec3 p = vec3(${ARCH.x.toFixed(1)} + (aSeed.w - 0.5) * 9.0 + age * 0.8, h, tz + (fract(aSeed.x * 17.0) - 0.5) * 6.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        gl_PointSize = clamp((3.0 + age * 0.9) * uScale / -mv.z, 1.0, 80.0);
        vAge = age / life;
        vA = uAmt * step(0.3, p.y) * smoothstep(0.0, 0.15, vAge) * (1.0 - smoothstep(0.6, 1.0, vAge)) * 0.11;
      }`,
    fragmentShader: jetMat.fragmentShader,
    transparent: true, depthWrite: false,
  });
  const mist = new THREE.Points(sprayPoints(500, 5), mistMat);
  mist.frustumCulled = false;
  scene.add(mist);

  // arcoíris: plano vertical que atraviesa el arco; solo se colorea donde
  // hay agua y a 40–42° del punto opuesto al sol, como en la realidad
  const archY = /* glsl */ `
    float archY(float z){
      float th = radians(${ARCH.angle.toFixed(1)});
      float v = ${ARCH.v.toFixed(2)};
      float dl = z - ${ARCH.zL.toFixed(1)}, dr = ${ARCH.zR.toFixed(1)} - z;
      float yl = dl < 0.0 ? -99.0 : ${ARCH.y.toFixed(2)} + tan(th) * dl - 9.81 * dl * dl / (2.0 * v * v * cos(th) * cos(th));
      float yr = dr < 0.0 ? -99.0 : ${ARCH.y.toFixed(2)} + tan(th) * dr - 9.81 * dr * dr / (2.0 * v * v * cos(th) * cos(th));
      return max(yl, yr);
    }`;
  const bowMat = new THREE.ShaderMaterial({
    uniforms: { ...common, uAnti: { value: new THREE.Vector3(1, -0.3, 0) }, uCam: { value: new THREE.Vector3() }, uVis: { value: 1 } },
    vertexShader: `${LOGDEPTH_V}
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `${LOGDEPTH_F}
      uniform vec3 uAnti, uCam; uniform float uAmt, uVis;
      varying vec3 vW;
      ${archY}
      vec3 spectrum(float t){
        // t: 0 violeta (interior) → 1 rojo (exterior)
        vec3 c = vec3(0.0);
        c += vec3(0.45, 0.1, 0.9) * exp(-pow((t - 0.05) / 0.12, 2.0));
        c += vec3(0.1, 0.3, 1.0) * exp(-pow((t - 0.25) / 0.12, 2.0));
        c += vec3(0.1, 0.9, 0.3) * exp(-pow((t - 0.48) / 0.13, 2.0));
        c += vec3(1.0, 0.95, 0.1) * exp(-pow((t - 0.68) / 0.11, 2.0));
        c += vec3(1.0, 0.45, 0.05) * exp(-pow((t - 0.82) / 0.1, 2.0));
        c += vec3(0.95, 0.06, 0.04) * exp(-pow((t - 0.97) / 0.1, 2.0));
        return c;
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 rd = normalize(vW - uCam);
        float ang = degrees(acos(clamp(dot(rd, normalize(uAnti)), -1.0, 1.0)));
        float t = (ang - 40.3) / 2.2;
        float band = smoothstep(-0.12, 0.05, t) * smoothstep(1.12, 0.95, t);
        float ay = archY(vW.z);
        float water = exp(-pow((vW.y - ay) / 4.5, 2.0)) + 0.55 * step(vW.y, ay) * smoothstep(${ARCH.zL.toFixed(1)} + 4.0, ${ARCH.zL.toFixed(1)} + 16.0, vW.z) * smoothstep(${ARCH.zR.toFixed(1)} - 4.0, ${ARCH.zR.toFixed(1)} - 16.0, vW.z);
        float a = band * water * uAmt * uVis;
        gl_FragColor = vec4(spectrum(clamp(t, 0.0, 1.0)) * a * 1.0, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const bow = new THREE.Mesh(new THREE.PlaneGeometry(ARCH.zR - ARCH.zL + 20, 40), bowMat);
  bow.rotation.y = Math.PI / 2;
  bow.position.set(ARCH.x, 20, (ARCH.zL + ARCH.zR) / 2);
  bow.frustumCulled = false;
  scene.add(bow);

  // humo de las ruedas en la toma de contacto (se coloca en el mundo)
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uAge: { value: -1 }, uScale: common.uScale, uSun: common.uSun, uAmb: common.uAmb },
    vertexShader: `${LOGDEPTH_V}
      uniform float uAge, uScale;
      attribute vec4 aSeed; attribute float aSide;
      varying float vA;
      void main(){
        // las nubes de humo nacen a lo largo de los primeros metros de rodadura
        float birth = aSeed.x * aSeed.x * 0.8;
        float age = uAge - birth;
        vec3 p = vec3(70.0 * birth - 6.0 * birth * birth, 0.5, aSide * 3.8 + (aSeed.z - 0.5) * 1.2);
        p += vec3(-age * (3.0 + aSeed.y * 5.0), age * (0.6 + aSeed.w * 1.2), (aSeed.w - 0.5) * age * 2.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        gl_PointSize = clamp((1.8 + age * 5.0) * uScale / -mv.z, 1.0, 220.0);
        vA = step(0.0, age) * (1.0 - smoothstep(0.6, 3.6, age)) * 0.7;
      }`,
    fragmentShader: `${LOGDEPTH_F}
      uniform vec3 uSun, uAmb; varying float vA;
      void main(){
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(uSun * 0.6 + uAmb * 1.2, a * vA);
      }`,
    transparent: true, depthWrite: false,
  });
  const smoke = new THREE.Points(sprayPoints(420, 9), smokeMat);
  smoke.frustumCulled = false;
  scene.add(smoke);

  S.smoke = smoke;
  S.update = (t, pose, derived, camera, height, ambient) => {
    common.uTime.value = t;
    common.uAmt.value = pose.water;
    common.uScale.value = height * 0.9;
    common.uSun.value.copy(derived.sunColor).multiplyScalar(2.2);
    common.uAmb.value.copy(ambient);
    jets.visible = mist.visible = bow.visible = pose.water > 0.002;
    bowMat.uniforms.uAnti.value.copy(derived.sunDir).negate();
    bowMat.uniforms.uCam.value.copy(camera.position);
    bowMat.uniforms.uVis.value = derived.sunVis;
    smokeMat.uniforms.uAge.value = pose.smoke;
    smoke.visible = pose.smoke >= 0 && pose.smoke < 4;
    const on = pose.water > 0.01 && Math.sin(t * 9) > 0;
    for (const b of beacons) b.visible = on;
  };
  return S;
}
