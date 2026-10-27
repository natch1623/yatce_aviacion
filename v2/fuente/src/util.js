import * as THREE from 'three';

export const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;

// mulberry32: generador determinista para que la escena sea igual en cada carga
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function texFromCanvas(c, { srgb = true, repeat = false, aniso = 8, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.flipY = flipY;
  return t;
}

// Ruido de valor periódico (se repite sin costuras) para texturas de detalle
export function tileNoise(size, periods, seed = 1) {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1, total = 0;
  for (const p of periods) {
    const g = new Float32Array(p * p).map(() => r());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p, fy = (y / size) * p;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = g[(y0 % p) * p + (x0 % p)], b = g[(y0 % p) * p + ((x0 + 1) % p)];
        const c = g[((y0 + 1) % p) * p + (x0 % p)], d = g[((y0 + 1) % p) * p + ((x0 + 1) % p)];
        out[y * size + x] += amp * lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Trayectoria sobre el suelo: rectas y curvas muestreadas cada 0.25 m.
// El rumbo (yaw) usa la convención del avión: nariz hacia (cos yaw, 0, -sin yaw).
export class GroundPath {
  constructor(x, z, yaw) {
    this.step = 0.25;
    this.pts = [{ x, z, yaw }];
  }
  get last() {
    return this.pts[this.pts.length - 1];
  }
  line(len) {
    const n = Math.round(len / this.step);
    for (let i = 0; i < n; i++) {
      const p = this.last;
      this.pts.push({ x: p.x + Math.cos(p.yaw) * this.step, z: p.z - Math.sin(p.yaw) * this.step, yaw: p.yaw });
    }
    return this;
  }
  arc(radius, dyaw) {
    const n = Math.round((radius * Math.abs(dyaw)) / this.step);
    const dy = dyaw / n;
    for (let i = 0; i < n; i++) {
      const p = this.last;
      const yaw = p.yaw + dy * 0.5;
      this.pts.push({ x: p.x + Math.cos(yaw) * this.step, z: p.z - Math.sin(yaw) * this.step, yaw: p.yaw + dy });
    }
    return this;
  }
  get length() {
    return (this.pts.length - 1) * this.step;
  }
  at(s, out = {}) {
    const f = clamp(s / this.step, 0, this.pts.length - 1.001);
    const i = Math.floor(f), t = f - i;
    const a = this.pts[i], b = this.pts[i + 1];
    out.x = lerp(a.x, b.x, t);
    out.z = lerp(a.z, b.z, t);
    out.yaw = lerp(a.yaw, b.yaw, t);
    return out;
  }
}

const _e = new THREE.Euler();
// Orientación del avión: rumbo, cabeceo (nariz arriba +) y alabeo
export function planeQuat(q, yaw, pitch = 0, roll = 0) {
  _e.set(roll, yaw, pitch, 'YZX');
  return q.setFromEuler(_e);
}
