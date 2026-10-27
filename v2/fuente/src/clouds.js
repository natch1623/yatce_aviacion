import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { rng } from './util.js';

// ───────── volúmenes de ruido periódico (Perlin-Worley + Worley) ─────────

function worley(size, cells, seed) {
  const r = rng(seed);
  const fp = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < fp.length; i++) fp[i] = r();
  const out = new Float32Array(size * size * size);
  const s = cells / size;
  let o = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const px = (x + 0.5) * s, py = (y + 0.5) * s, pz = (z + 0.5) * s;
        const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
        let md = 9;
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const ix = cx + dx, iy = cy + dy, iz = cz + dz;
              const w = (((iz % cells) + cells) % cells) * cells * cells + (((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells);
              const fx = ix + fp[w * 3] - px, fy = iy + fp[w * 3 + 1] - py, fz = iz + fp[w * 3 + 2] - pz;
              const d = fx * fx + fy * fy + fz * fz;
              if (d < md) md = d;
            }
        out[o++] = 1 - Math.min(Math.sqrt(md), 1);
      }
  return out;
}

function perlin(size, period, seed) {
  const r = rng(seed);
  const n = period;
  const grads = new Float32Array(n * n * n * 3);
  for (let i = 0; i < n * n * n; i++) {
    const t = r() * Math.PI * 2, u = r() * 2 - 1, s = Math.sqrt(1 - u * u);
    grads[i * 3] = s * Math.cos(t);
    grads[i * 3 + 1] = s * Math.sin(t);
    grads[i * 3 + 2] = u;
  }
  const out = new Float32Array(size * size * size);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  let o = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const px = (x / size) * n, py = (y / size) * n, pz = (z / size) * n;
        const x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
        const tx = px - x0, ty = py - y0, tz = pz - z0;
        let v = 0;
        for (let c = 0; c < 8; c++) {
          const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
          const gi = (((z0 + dz) % n) * n * n + ((y0 + dy) % n) * n + ((x0 + dx) % n)) * 3;
          const dot = grads[gi] * (tx - dx) + grads[gi + 1] * (ty - dy) + grads[gi + 2] * (tz - dz);
          const w = (dx ? fade(tx) : 1 - fade(tx)) * (dy ? fade(ty) : 1 - fade(ty)) * (dz ? fade(tz) : 1 - fade(tz));
          v += dot * w;
        }
        out[o++] = v;
      }
  return out;
}

export function buildNoiseTextures() {
  const N = 64;
  const w4 = worley(N, 4, 11), w8 = worley(N, 8, 12), w16 = worley(N, 16, 13), w32 = worley(N, 32, 14);
  const p4 = perlin(N, 4, 21), p8 = perlin(N, 8, 22), p16 = perlin(N, 16, 23);
  const data = new Uint8Array(N * N * N * 4);
  for (let i = 0; i < N * N * N; i++) {
    const pf = Math.min(Math.max((p4[i] + p8[i] * 0.5 + p16[i] * 0.25) * 0.85 + 0.5, 0), 1);
    const wf = w4[i] * 0.625 + w8[i] * 0.25 + w16[i] * 0.125;
    // Perlin-Worley: remap(perlin, worleyFbm - 1, 1, 0, 1)
    const r = Math.min(Math.max((pf - (wf - 1)) / (2 - wf), 0), 1);
    data[i * 4] = r * 255;
    data[i * 4 + 1] = wf * 255;
    data[i * 4 + 2] = (w8[i] * 0.625 + w16[i] * 0.25 + w32[i] * 0.125) * 255;
    data[i * 4 + 3] = (w16[i] * 0.75 + w32[i] * 0.25) * 255;
  }
  const shape = new THREE.Data3DTexture(data, N, N, N);
  shape.format = THREE.RGBAFormat;
  shape.wrapS = shape.wrapT = shape.wrapR = THREE.RepeatWrapping;
  shape.minFilter = shape.magFilter = THREE.LinearFilter;
  shape.unpackAlignment = 1;
  shape.needsUpdate = true;

  const D = 32;
  const d4 = worley(D, 4, 31), d8 = worley(D, 8, 32), d16 = worley(D, 16, 33);
  const dd = new Uint8Array(D * D * D);
  for (let i = 0; i < dd.length; i++) dd[i] = (d4[i] * 0.625 + d8[i] * 0.25 + d16[i] * 0.125) * 255;
  const detail = new THREE.Data3DTexture(dd, D, D, D);
  detail.format = THREE.RedFormat;
  detail.wrapS = detail.wrapT = detail.wrapR = THREE.RepeatWrapping;
  detail.minFilter = detail.magFilter = THREE.LinearFilter;
  detail.unpackAlignment = 1;
  detail.needsUpdate = true;
  return { shape, detail };
}

// ───────── nubes volumétricas por raymarching ─────────

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const CLOUD_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform sampler3D tShape;
uniform sampler3D tDetail;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec3 uCamPos;
uniform float uFar;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uFogColor;
uniform float uFogK;
uniform float uBase;
uniform float uTop;
uniform float uCoverage;
uniform float uDensity;
uniform vec3 uWind;
uniform float uTime;
uniform float uFrame;
uniform float uSteps;
uniform vec4 uFlash;

float remap(float v, float a, float b, float c, float d){ return c + (v - a) / (b - a) * (d - c); }
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float hg(float c, float g){ float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }

float density(vec3 p, bool fine){
  float h = (p.y - uBase) / (uTop - uBase);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p + uWind;
  float weather = texture(tShape, vec3(q.x, 1700.0, q.z) / 26000.0).r;
  float weather2 = texture(tShape, vec3(q.z, 900.0, q.x) / 61000.0).g;
  float cov = clamp(uCoverage + (weather - 0.62) * 0.9 + (weather2 - 0.5) * 0.35, 0.0, 1.0);
  vec4 n = texture(tShape, q / 5200.0);
  float fbmW = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
  float base = remap(n.r, fbmW - 1.0, 1.0, 0.0, 1.0);
  float shape = clamp(remap(h, 0.0, 0.1, 0.0, 1.0), 0.0, 1.0) * clamp(remap(h, 0.22 + cov * 0.25, 1.0, 1.0, 0.0), 0.0, 1.0);
  base = base * shape;
  float c = remap(base, 1.0 - cov, 1.0, 0.0, 1.0) * cov;
  if (c <= 0.0) return 0.0;
  if (fine) {
    float d = texture(tDetail, q / 900.0 + vec3(0.0, uTime * 0.004, 0.0)).r;
    float dm = mix(d, 1.0 - d, clamp(h * 4.0, 0.0, 1.0));
    c = remap(c, dm * 0.38, 1.0, 0.0, 1.0);
  }
  return clamp(c, 0.0, 1.0) * uDensity;
}

float lightMarch(vec3 p, float far){
  float od = 0.0, st = 45.0 * (1.0 + far);
  int n = far > 0.5 ? 2 : 4;
  for (int i = 0; i < 4; i++) {
    if (i >= n) break;
    p += uSunDir * st;
    od += density(p, i < 2 && far < 0.5) * st;
    st *= 2.0;
  }
  return od;
}

void main(){
  vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rdv = normalize(vp.xyz / vp.w);
  vec3 rd = normalize((uViewInv * vec4(rdv, 0.0)).xyz);
  vec3 ro = uCamPos;
  float depth = texture(tDepth, vUv).x;
  float sceneDist = 1e9;
  if (depth < 0.99999) {
    float w = pow(uFar + 1.0, depth) - 1.0;
    sceneDist = w / max(-rdv.z, 1e-4);
  }
  float t0, t1;
  if (abs(rd.y) < 1e-5) {
    if (ro.y < uBase || ro.y > uTop) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    t0 = 0.0; t1 = 60000.0;
  } else {
    float a = (uBase - ro.y) / rd.y, b = (uTop - ro.y) / rd.y;
    t0 = max(min(a, b), 0.0); t1 = max(a, b);
  }
  t1 = min(t1, min(sceneDist, 60000.0));
  if (t1 <= t0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float cosT = dot(rd, uSunDir);
  float T = 1.0;
  vec3 col = vec3(0.0);
  float jitter = hash(gl_FragCoord.xy + fract(uFrame * 0.618) * 97.0);
  float span = t1 - t0;
  float dt = clamp(span / uSteps, 14.0, 420.0);
  float t = t0 + dt * jitter;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps * 1.6 || t > t1 || T < 0.03) break;
    vec3 p = ro + rd * t;
    float stepLen = max(dt, t * 0.006);
    float far = step(7000.0, t);
    float d = density(p, far < 0.5);
    if (d > 0.002) {
      float od = lightMarch(p, far);
      float h = (p.y - uBase) / (uTop - uBase);
      float sigma = 0.045;
      vec3 L = vec3(0.0);
      float a = 1.0, b = 1.0, c = 1.0;
      for (int k = 0; k < 3; k++) {
        float ph = mix(hg(cosT, 0.72 * c), hg(cosT, -0.22 * c), 0.28);
        L += a * exp(-od * sigma * b) * ph;
        a *= 0.5; b *= 0.4; c *= 0.6;
      }
      float powder = 1.0 - exp(-d * sigma * 140.0);
      vec3 sunL = uSunColor * L * mix(0.55, 1.0, powder);
      vec3 amb = mix(uAmbBottom, uAmbTop, clamp(h * 1.3, 0.0, 1.0));
      vec3 S = sunL + amb;
      // relámpago: ilumina la nube desde dentro
      S += vec3(0.75, 0.82, 1.0) * uFlash.w * 34.0 * exp(-length(p - uFlash.xyz) / 520.0);
      float fogF = 1.0 - exp(-t * uFogK);
      S = mix(S, uFogColor, fogF);
      float Ts = exp(-d * sigma * stepLen);
      col += T * S * (1.0 - Ts);
      T *= Ts;
      t += stepLen;
    } else {
      t += stepLen * 1.7;
    }
  }
  gl_FragColor = vec4(col, T);
}`;

const COMP_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tCloud;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec2 uCloudTexel;
uniform float uFar;
void main(){
  vec3 s = texture2D(tDiffuse, vUv).rgb;
  vec4 c = texture2D(tCloud, vUv);
  // las nubes se calculan a baja resolución: en el borde de objetos cercanos
  // (el avión) se toma el vecino más transparente para evitar halos escalonados
  float dep = texture2D(tDepth, vUv).x;
  float w = pow(uFar + 1.0, dep) - 1.0;
  if (dep < 0.99999 && w < 1500.0) {
    vec4 a = texture2D(tCloud, vUv + vec2(-0.5, -0.5) * uCloudTexel);
    vec4 b = texture2D(tCloud, vUv + vec2(0.5, -0.5) * uCloudTexel);
    vec4 d = texture2D(tCloud, vUv + vec2(-0.5, 0.5) * uCloudTexel);
    vec4 e = texture2D(tCloud, vUv + vec2(0.5, 0.5) * uCloudTexel);
    if (a.a > c.a) c = a;
    if (b.a > c.a) c = b;
    if (d.a > c.a) c = d;
    if (e.a > c.a) c = e;
  }
  gl_FragColor = vec4(s * c.a + c.rgb, 1.0);
  // copia la profundidad para que los efectos posteriores (agua, humo) se oculten bien
  gl_FragDepth = texture2D(tDepth, vUv).x;
}`;

export class CloudPass extends Pass {
  constructor(noise, camera) {
    super();
    this.camera = camera;
    this.scale = 0.5;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.uniforms = {
      tDepth: { value: null }, tShape: { value: noise.shape }, tDetail: { value: noise.detail },
      uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uFar: { value: camera.far },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uAmbTop: { value: new THREE.Color(0.3, 0.4, 0.6) }, uAmbBottom: { value: new THREE.Color(0.2, 0.2, 0.25) },
      uFogColor: { value: new THREE.Color(0.6, 0.7, 0.8) }, uFogK: { value: 0.00003 },
      uBase: { value: 1600 }, uTop: { value: 3000 }, uCoverage: { value: 0.5 }, uDensity: { value: 1 },
      uWind: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFrame: { value: 0 }, uSteps: { value: 64 }, uFlash: { value: new THREE.Vector4() },
    };
    this.cloudQuad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: CLOUD_FRAG, depthTest: false, depthWrite: false }));
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tCloud: { value: this.rt.texture }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uCloudTexel: { value: new THREE.Vector2() }, uFar: { value: camera.far } },
      vertexShader: VERT, fragmentShader: COMP_FRAG, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
    });
    this.compQuad = new FullScreenQuad(this.compMat);
  }
  setSize(w, h) {
    this.rt.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale)));
    this.compMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.compMat.uniforms.uCloudTexel.value.set(1 / this.rt.width, 1 / this.rt.height);
    this.fullW = w;
    this.fullH = h;
  }
  setScale(s) {
    this.scale = s;
    if (this.fullW) this.setSize(this.fullW, this.fullH);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms, cam = this.camera;
    u.tDepth.value = readBuffer.depthTexture;
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uViewInv.value.copy(cam.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.uFar.value = cam.far;
    u.uFrame.value++;
    renderer.setRenderTarget(this.rt);
    this.cloudQuad.render(renderer);
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.compMat.uniforms.tDepth.value = readBuffer.depthTexture;
    this.compMat.uniforms.uFar.value = cam.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compQuad.render(renderer);
  }
}
