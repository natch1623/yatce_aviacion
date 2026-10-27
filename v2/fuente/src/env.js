import * as THREE from 'three';
import { D2R, clamp, lerp, smoothstep } from './util.js';

// Ambientes de luz. elev/az: posición del sol en grados. cover/base/top: capa
// de nubes. scroll: 1 cuando el avión está en crucero (el paisaje se desplaza).
const BASE = {
  elev: 30, az: 150, turb: 2.2, ray: 2.4, mie: 0.005, mieG: 0.86,
  cover: 0.48, base: 1600, top: 2950, dens: 1,
  lights: 0.15, scroll: 1, exp: 1, moonEl: 38, moonAz: 120, aurora: 0, dark: 0,
};

const RAW = {
  predawn: { elev: -3.2, az: 150, turb: 3.4, ray: 2.2, cover: 0.4, base: 1800, top: 3200, lights: 1.2, scroll: 0 },
  golden1: { elev: 3.2, az: 150, turb: 3.6, ray: 2.0, mie: 0.006, mieG: 0.9, cover: 0.4, base: 1800, top: 3200, lights: 0.8, scroll: 0 },
  golden2: { elev: 5.5, az: 150, turb: 3.4, cover: 0.42, base: 1800, top: 3200, lights: 0.6, scroll: 0 },
  golden3: { elev: 8, az: 150, turb: 3.2, cover: 0.44, base: 1800, top: 3200, lights: 0.3, scroll: 0 },
  morning: { elev: 14, az: 130, turb: 1.8, ray: 2.6, cover: 0.56 },
  morning2: { elev: 21, az: 125, turb: 1.7, ray: 2.6, cover: 0.5 },
  day1: { elev: 31, az: 115, turb: 1.6, ray: 2.8, cover: 0.58 },
  day2: { elev: 42, az: 100, turb: 1.6, ray: 2.8, cover: 0.5 },
  day3: { elev: 52, az: 75, turb: 1.5, ray: 3.0, cover: 0.44 },
  among: { elev: 44, az: 230, turb: 1.7, ray: 2.8, cover: 0.5, base: 1900, top: 4700 },
  afternoon: { elev: 30, az: 240, turb: 2.0, ray: 2.6, cover: 0.5 },
  goldenPM: { elev: 6.5, az: 250, turb: 4.2, ray: 2.2, mie: 0.007, cover: 0.55 },
  night: { elev: -14, az: 262, turb: 2.5, cover: 0.45, moonEl: 34, moonAz: 110 },
  night2: { elev: -22, az: 300, turb: 2.5, cover: 0.36, moonEl: 46, moonAz: 160, aurora: 1 },
  storm: { elev: 26, az: 245, turb: 3, ray: 2, cover: 0.97, base: 1250, top: 7800, dens: 1.5, dark: 0.82 },
  firstlight: { elev: -1.8, az: 95, turb: 3.0, ray: 2.4, cover: 0.5 },
  dawn: { elev: 2, az: 95, turb: 3.4, ray: 2.4, cover: 0.55, scroll: 0 },
  sunrise: { elev: 5, az: 128, turb: 3.6, cover: 0.58, base: 1700, top: 3350 },
  pink: { elev: 8, az: 235, turb: 5, ray: 3.0, mie: 0.006, cover: 0.5 },
  morningLow: { elev: 11, az: 110, turb: 3, cover: 0.48 },
  approach: { elev: 13, az: 115, turb: 3, cover: 0.42 },
  arrival: { elev: 15, az: 141, turb: 2.6, ray: 2.4, cover: 0.38, base: 1800, top: 3100, lights: 0.5, scroll: 0 },
};

export const ENVS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, { ...BASE, ...v }]));
const KEYS = Object.keys(BASE);

export function cloneEnv(e) {
  return { ...e };
}

export function lerpEnv(a, b, t, out) {
  for (const k of KEYS) {
    if (k === 'az' || k === 'moonAz') {
      let d = ((b[k] - a[k] + 540) % 360) - 180;
      out[k] = a[k] + d * t;
    } else out[k] = lerp(a[k], b[k], t);
  }
  return out;
}

// Valores derivados de la posición del sol: color de la luz directa,
// exposición, estrellas, intensidad nocturna.
export function derive(env, d) {
  const el = env.elev * D2R, az = env.az * D2R;
  d.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  const e = Math.max(env.elev, -1.5);
  // masa de aire de Kasten-Young
  const am = 1 / (Math.max(Math.sin(e * D2R), 0) + 0.50572 * Math.pow(e + 6.07995, -1.6364));
  const vis = smoothstep(-3, 1.2, env.elev);
  d.sunColor.setRGB(Math.exp(-am * 0.034), Math.exp(-am * 0.083), Math.exp(-am * 0.2)).multiplyScalar(vis);
  d.sunVis = vis;
  d.night = smoothstep(1, -10, env.elev);
  d.dusk = smoothstep(14, 0, env.elev) * (1 - smoothstep(-2, -10, env.elev));
  d.stars = smoothstep(-3, -12, env.elev);
  d.cityLights = smoothstep(9, -3, env.elev);
  const mEl = env.moonEl * D2R, mAz = env.moonAz * D2R;
  d.moonDir.set(Math.cos(mEl) * Math.cos(mAz), Math.sin(mEl), Math.cos(mEl) * Math.sin(mAz));
  d.moonColor.setRGB(0.55, 0.68, 1.0).multiplyScalar(0.06 * d.night);
  const dayExp = lerp(0.95, 0.42, smoothstep(1, 38, env.elev));
  d.exposure = lerp(dayExp, 1.15, smoothstep(-1, -12, env.elev)) * env.exp;
  return d;
}

export function makeDerived() {
  return {
    sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), moonDir: new THREE.Vector3(),
    moonColor: new THREE.Color(), sunVis: 1, night: 0, dusk: 0, stars: 0, cityLights: 0, exposure: 0.5,
  };
}

export { clamp };
