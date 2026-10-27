import * as THREE from 'three';
import { GroundPath, planeQuat, clamp, lerp, smoothstep, easeInOut, easeOut, easeIn, D2R } from './util.js';
import { ENVS, lerpEnv, cloneEnv } from './env.js';
import { STAND } from './world.js';
import { TANKER, BAT } from './act3.js';
import { SPACE, CHUTE, SEA } from './act4.js';

// Una "pose" describe todo lo que se ve en un instante: avión, cámara y extras.
export function makePose() {
  return {
    pPos: new THREE.Vector3(), pQuat: new THREE.Quaternion(), gear: 1, fan: 0.5,
    cPos: new THREE.Vector3(), cLook: new THREE.Vector3(), fov: 40, roll: 0,
    tug: 0, bridge: 1, hud: 0, veil: 0, veilColor: [1, 1, 1], blur: 0, scroll: 0,
    water: 0, smoke: -1, landing: 0, angels: -1,
    lock: 0, escort: 0, ePos: new THREE.Vector3(), eQuat: new THREE.Quaternion(), vapor: 0, shock: -1, shake: 0,
    tanker: 0, tkPos: new THREE.Vector3(), tkQuat: new THREE.Quaternion(), boom: 0, charge: 0, recv: new THREE.Vector3(),
    bat: -1, batFade: 1, flash: 0, flashPos: new THREE.Vector3(), flashIdx: -1, rain: 0, tint: 0, auroraPulse: 0,
    space: 0, chute: -1, j0Pos: new THREE.Vector3(), j0Open: 1, j0Mode: 1, sky: -99, skyFade: 1, sea: 0, rays: 0,
  };
}
function copyPose(a, b) {
  a.pPos.copy(b.pPos); a.pQuat.copy(b.pQuat); a.gear = b.gear; a.fan = b.fan;
  a.cPos.copy(b.cPos); a.cLook.copy(b.cLook); a.fov = b.fov; a.roll = b.roll;
  a.tug = b.tug; a.bridge = b.bridge; a.hud = b.hud; a.veil = b.veil; a.blur = b.blur;
  a.water = b.water; a.smoke = b.smoke; a.landing = b.landing; a.angels = b.angels;
  a.lock = b.lock; a.escort = b.escort; a.ePos.copy(b.ePos); a.eQuat.copy(b.eQuat); a.vapor = b.vapor;
  a.tanker = b.tanker; a.tkPos.copy(b.tkPos); a.tkQuat.copy(b.tkQuat); a.boom = b.boom; a.charge = b.charge; a.recv.copy(b.recv);
  a.bat = b.bat; a.batFade = b.batFade; a.tint = b.tint;
  a.space = b.space; a.chute = b.chute; a.sky = b.sky; a.sea = b.sea; a.rays = b.rays;
  return a;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// convierte un punto local del avión (o de un marco con solo rumbo) a mundo
function local(out, pose, x, y, z, headingOnly = false) {
  if (headingOnly) {
    const e = new THREE.Euler().setFromQuaternion(pose.pQuat, 'YZX');
    _q.setFromAxisAngle(_v2.set(0, 1, 0), e.y);
    return out.set(x, y, z).applyQuaternion(_q).add(pose.pPos);
  }
  return out.set(x, y, z).applyQuaternion(pose.pQuat).add(pose.pPos);
}

// ───────── recorridos en tierra ─────────

// Salida del puesto: el remolcador empuja el avión hacia atrás y lo gira.
const G = V(STAND.x, 0, STAND.z);
const pushPath = (() => {
  const pts = [];
  let x = G.x, z = G.z, yaw = -Math.PI / 2;
  const L = 58, n = 240;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    pts.push({ x, z, yaw });
    yaw = -Math.PI / 2 - (Math.PI / 2) * smoothstep(0.15, 1, s + 1 / n);
    x -= Math.cos(yaw) * (L / n);
    z += Math.sin(yaw) * (L / n);
  }
  return pts;
})();
function pushAt(s) {
  const f = clamp(s, 0, 1) * (pushPath.length - 1);
  const i = Math.min(Math.floor(f), pushPath.length - 2), t = f - i;
  const a = pushPath[i], b = pushPath[i + 1];
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), yaw: lerp(a.yaw, b.yaw, t) };
}

// Rodaje desde la calle paralela hasta la pista y carrera de despegue
const taxi = new GroundPath(-1330, 95, Math.PI).line(80).arc(40, -Math.PI / 2).line(35).arc(20, -Math.PI / 2).line(3000);
const S_HOLD = 80 + 40 * (Math.PI / 2) + 4;
const S_LINEUP = 80 + 40 * (Math.PI / 2) + 35 + 20 * (Math.PI / 2);
const taxiS = (t) => S_HOLD * (1 - Math.exp(-t / 7));

// Toma final de la slide 20 (también la usa el paso de los Blue Angels)
export const FINAL_CAM = { pos: V(STAND.x - 45, 3.2, STAND.z + 22), look: V(STAND.x + 5, 8, STAND.z - 15) };

// Llegada: rodaje por la plataforma bajo el arco de agua hasta el puesto
const arrival = new GroundPath(10, 225, Math.PI).line(225).arc(35, Math.PI / 2).line(47.5);
const ARR_T = 70;
const arrivalS = (t) => arrival.length * (1 - Math.pow(1 - clamp(t / ARR_T, 0, 1), 2.2));

// Aterrizaje en la pista 09: toma de contacto en el punto de visada
const X_TD = -1100, T_CUT_IN = 2.4, T_TD = 9.0, TAN3 = Math.tan(3 * D2R);
function landingPlane(T, p) {
  let x, y = 0, pitch = 0;
  if (T <= T_TD) {
    const Tb = T_TD - T_CUT_IN, u = clamp((T - T_CUT_IN) / Tb, 0, 1), D = 2600;
    x = X_TD - 70 * Tb * (1 - u) - (D - 70 * Tb) * Math.pow(1 - u, 3);
    const lin = (X_TD - x) * TAN3;
    // enderezamiento final (flare): la trayectoria se curva antes de tocar
    const s = smoothstep(0.86, 1, u);
    const h = Math.max(0, lin);
    y = h * (1 - s) + Math.min(h, 6 * Math.pow(1 - u, 1.6) / Math.pow(0.14, 1.6)) * s;
    pitch = 2.5 + smoothstep(0.84, 1, u) * 3.5;
  } else {
    const tr = Math.min(T - T_TD, 4.5);
    x = X_TD + 70 * tr - 6 * tr * tr + Math.max(0, T - T_TD - 4.5) * 16;
    pitch = 6 * (1 - smoothstep(0, 1.3, T - T_TD));
  }
  p.pPos.set(x, y, 0);
  planeQuat(p.pQuat, 0, pitch * D2R, 0);
  p.gear = 1; p.tug = 0; p.bridge = 0; p.hud = 0; p.scroll = 0;
  p.fan = T > T_TD && T < T_TD + 4 ? 1 : 0.55;
  p.landing = 1 - smoothstep(T_TD + 2.5, T_TD + 4, T);
  p.smoke = T >= T_TD ? T - T_TD : -1;
}

// ───────── tomas por slide ─────────

export const CRUISE_ANCHOR = V(-30000, 3400, 20000);
const CRUISE = {
  wide: { off: [-170, 38, -250], look: [10, 2, 0], fov: 27 },
  side: { off: [4, 3.5, -82], look: [-1, 5, 0], fov: 33 },
  wing: { off: [-2.5, 7.0, -4.2], look: [-9, 3.6, -26], fov: 52 },
  front34: { off: [62, 9, -48], look: [-2, 4.5, 0], fov: 32 },
  chase: { off: [-92, 24, -34], look: [4, 4, 0], fov: 30 },
  below: { off: [26, -20, -36], look: [-2, 4, 0], fov: 40 },
  tail: { off: [-31, 10.4, 2.2], look: [16, 5.2, 0], fov: 46 },
  cockpit: { off: [15.6, 4.72, 0], look: [400, -12, 0], fov: 64, hud: 1 },
  // vista lateral con el caza escolta volando por encima, al otro lado
  sideEscort: { off: [4, 3.5, -82], look: [-1, 6, 4], fov: 34, escort: [3, 15, 34] },
  // en tándem con el avión cisterna, conectados por la pértiga
  tanker: { off: [-16, 16, -80], look: [20, 10, 0], fov: 36, tanker: 1 },
  // mirando hacia arriba y adelante, donde quedó el humo azul de los Blue Angels
  belowBlue: { off: [-30, -22, -40], look: [60, 40, 15], fov: 46, bat: 1 },
  // gran angular con la aurora sobre el horizonte
  wideAurora: { off: [-170, 30, -250], look: [10, 34, 0], fov: 30 },
  // lateral mirando un poco hacia arriba: el cielo donde la avioneta escribe
  sideSky: { off: [4, 3.5, -82], look: [-1, 16, 0], fov: 34, sky: 1 },
};

// pone el avión cisterna en su sitio (rel: desplazamiento en el marco del rumbo)
function setTanker(p, rel, boom, charge) {
  p.tanker = 1;
  local(p.tkPos, p, rel[0], rel[1] + Math.sin(p.pPos.y * 0.7) * 0.3, rel[2], true);
  headingQuat(p.tkQuat, p);
  local(p.recv, p, ...TANKER.receptacle);
  p.boom = boom;
  p.charge = charge;
}

const X_AXIS = V(1, 0, 0);
// orientación con solo el rumbo del avión (sin alabeo ni cabeceo)
function headingQuat(out, pose) {
  const e = new THREE.Euler().setFromQuaternion(pose.pQuat, 'YZX');
  return out.setFromAxisAngle(V(0, 1, 0), e.y);
}

function cruisePlane(t, p) {
  p.pPos.copy(CRUISE_ANCHOR);
  p.pPos.y += Math.sin(t * 0.37) * 1.6 + Math.sin(t * 0.13) * 2.4;
  planeQuat(p.pQuat, 0, 2.2 * D2R + Math.sin(t * 0.29) * 0.4 * D2R, Math.sin(t * 0.21) * 2.2 * D2R);
  p.gear = 0; p.fan = 1; p.tug = 0; p.bridge = 1; p.scroll = 1;
}
function cruiseShot(name) {
  const c = CRUISE[name];
  return (t, p) => {
    cruisePlane(t, p);
    const sway = name === 'cockpit' || name === 'wing' ? 0.15 : 1;
    const a = Math.sin(t * 0.045) * 0.07 * sway, k = 1 + Math.sin(t * 0.06) * 0.03 * sway;
    const ox = c.off[0] * Math.cos(a) - c.off[2] * Math.sin(a), oz = c.off[0] * Math.sin(a) + c.off[2] * Math.cos(a);
    const mount = name === 'cockpit' || name === 'wing' || name === 'tail';
    local(p.cPos, p, ox * k, c.off[1] * k, oz * k, !mount);
    local(p.cLook, p, ...c.look, !mount);
    p.fov = c.fov;
    p.hud = c.hud || 0;
    p.lock = c.hud ? 1 : 0;
    p.roll = 0;
    if (c.tanker) setTanker(p, TANKER.rel, 1, 1);
    if (c.sky) p.sky = t - 0.8;
    if (c.bat) {
      // el tiempo de la slide es el mismo reloj del espectáculo aéreo
      p.bat = t;
      p.tint = 0.18 * smoothstep(3.4, 5.6, t) * (0.35 + 0.65 * Math.exp(-Math.max(0, t - BAT.dur) / 30));
    }
    if (c.escort) {
      p.escort = 1;
      local(p.ePos, p, c.escort[0] + Math.sin(t * 0.31) * 1.5, c.escort[1] + Math.sin(t * 0.43) * 1.2, c.escort[2] + Math.sin(t * 0.27) * 1.0, true);
      headingQuat(p.eQuat, p).multiply(_q.setFromAxisAngle(X_AXIS, Math.sin(t * 0.37) * 0.06));
    }
  };
}

const SHOTS = {
  gate(t, p) {
    p.pPos.copy(G);
    planeQuat(p.pQuat, -Math.PI / 2);
    p.gear = 1; p.fan = 0.05; p.tug = 1; p.bridge = 1; p.hud = 0; p.scroll = 0;
    const a = Math.sin(t * 0.05) * 0.06;
    p.cPos.set(G.x + 34 * Math.cos(a) + 6, 1.7 + Math.sin(t * 0.07) * 0.3, G.z - 16 + 30 * Math.sin(a));
    p.cLook.set(G.x - 6, 6.2, G.z + 6);
    p.fov = 50; p.roll = 0;
  },
  arrival(t, p) {
    const s = arrivalS(t), q = arrival.at(s);
    p.pPos.set(q.x, 0, q.z);
    planeQuat(p.pQuat, q.yaw);
    p.gear = 1; p.tug = 0; p.hud = 0; p.scroll = 0;
    p.fan = 0.35 * (1 - smoothstep(ARR_T - 6, ARR_T + 2, t));
    p.bridge = smoothstep(ARR_T + 2, ARR_T + 10, t);
    p.water = 1 - smoothstep(30, 42, t);
    p.angels = t;
    // 1) frente al arco con el sol a la espalda (así aparece el arcoíris)
    const camA = V(-95 + Math.sin(t * 0.07) * 1.5, 2.2, 262);
    const nose = local(V(0, 0, 0), p, 10, 5, 0);
    const lookA = V(-50, 13, 226).lerp(nose, 0.35 + smoothstep(4, 12, t) * 0.4);
    // 2) la cámara se coloca junto a la terminal, con el sol a la espalda,
    //    para ver el avión en su puesto y el cielo donde pasan los Blue Angels
    const k = easeInOut(smoothstep(14, 30, t)), a = Math.sin(t * 0.04) * 0.6;
    const camB = FINAL_CAM.pos.clone().add(_v.set(a, 0, a * 0.7));
    const lookB = FINAL_CAM.look;
    p.cPos.lerpVectors(camA, camB, k);
    p.cLook.lerpVectors(lookA, lookB, k);
    p.fov = lerp(58, 46, k); p.roll = 0;
  },
  taxi(t, p) {
    const s = taxiS(t), q = taxi.at(s);
    p.pPos.set(q.x, 0, q.z);
    planeQuat(p.pQuat, q.yaw);
    p.gear = 1; p.fan = 0.45; p.tug = 0; p.bridge = 0; p.hud = 0; p.scroll = 0;
    p.cPos.set(-1482 + Math.sin(t * 0.06) * 1.2, 1.35, 50 + Math.sin(t * 0.04) * 1.5);
    _v.set(q.x, 5.5, q.z);
    p.cLook.lerpVectors(V(-1440, 4.5, 84), _v, 0.6);
    p.fov = 46; p.roll = 0;
  },
  climb(t, p) {
    p.pPos.copy(CLIMB0).add(_v.set(26 * t, 1.6 * t, -2.2 * t));
    planeQuat(p.pQuat, 0.08, 7 * D2R, (-6 + Math.sin(t * 0.25) * 2) * D2R);
    p.gear = 0; p.fan = 1; p.tug = 0; p.bridge = 0; p.hud = 0; p.scroll = 0;
    local(p.cPos, p, -1.2, 6.9, -3.6);
    local(p.cLook, p, -12, 1.5, -30);
    p.fov = 54; p.roll = 0;
  },
};
for (const k of Object.keys(CRUISE)) SHOTS['cruise:' + k] = cruiseShot(k);

// cámara fija de la slide del skywriting (para colocar el texto en el cielo)
export const SKY_CAM = {
  pos: V(...CRUISE.sideSky.off).add(CRUISE_ANCHOR),
  look: V(...CRUISE.sideSky.look).add(CRUISE_ANCHOR),
};

// el borde del espacio: la Tierra curva y el sol asomando por el limbo
SHOTS.space = (t, p) => {
  cruisePlane(t, p);
  p.space = 1;
  const h = SPACE.h + Math.sin(t * 0.05) * 3;
  const az = -Math.PI / 2 + t * 0.004;
  p.cPos.set(0, h, 0);
  p.cLook.set(Math.cos(az) * 1000, h - Math.tan(7 * D2R) * 1000, Math.sin(az) * 1000);
  p.fov = 58;
  p.roll = Math.sin(t * 0.07) * 0.015;
};

// bajo el paracaídas: mirando el paisaje y a los demás paracaidistas
const CHUTE_C = V(CRUISE_ANCHOR.x, CHUTE.y0, CRUISE_ANCHOR.z);
function parachuteCam(t, p) {
  const tt = Math.min(t, 190);
  p.cPos.set(CHUTE_C.x + Math.sin(t * 0.21) * 0.6, CHUTE_C.y - CHUTE.descent * tt + Math.sin(t * 0.33) * 0.3, CHUTE_C.z);
  const yaw = 1.05 + t * 0.03, pitch = -0.56 + Math.sin(t * 0.17) * 0.03;
  p.cLook.set(p.cPos.x + Math.cos(yaw) * Math.cos(pitch) * 100, p.cPos.y + Math.sin(pitch) * 100, p.cPos.z + Math.sin(yaw) * Math.cos(pitch) * 100);
  p.roll = Math.sin(t * 0.5) * 0.035;
}
SHOTS.parachute = (t, p) => {
  cruisePlane(t, p);
  p.pPos.y = -5000; // el avión queda fuera de la toma
  p.chute = t;
  parachuteCam(t, p);
  p.fov = 66;
};

// vuelo rasante sobre el mar
function seaPlane(t, p) {
  p.pPos.copy(SEA);
  p.pPos.y += Math.sin(t * 0.4) * 1.2;
  planeQuat(p.pQuat, 0, 1.5 * D2R + Math.sin(t * 0.3) * 0.3 * D2R, Math.sin(t * 0.23) * 3 * D2R);
  p.gear = 0; p.fan = 1; p.tug = 0; p.bridge = 1; p.scroll = 1;
  p.sea = 1;
}
SHOTS.sea = (t, p) => {
  seaPlane(t, p);
  const a = Math.sin(t * 0.05) * 0.25;
  local(p.cPos, p, -105 + Math.sin(a) * 20, -29, -72 + Math.cos(a) * 6, true);
  local(p.cLook, p, 25, -14, 0, true);
  p.fov = 40;
  p.roll = 0;
};
const CLIMB0 = V(0, 0, 0); // se calcula al final del despegue

// ───────── transiciones ─────────

const tmpA = makePose(), tmpB = makePose();

// Despegue: rodaje a la pista, carrera, rotación, tren arriba y ascenso
function takeoffPlane(T, s0, p) {
  // T en segundos desde el inicio (duración total 11 s)
  const tA = 2.8, tB = 7.0;
  let s, y = 0, pitch = 0, gear = 1, fan = 0.5;
  if (T < tA) {
    const u = T / tA;
    s = lerp(s0, S_LINEUP + 12, u * u * (3 - 2 * u) * 0.6 + u * 0.4);
  } else {
    const tb = Math.min(T, tB) - tA;
    s = S_LINEUP + 12 + 14 * tb + 0.5 * 14.5 * tb * tb;
    fan = 1;
    if (T > 6.1) pitch = smoothstep(6.1, 7.2, T) * 11;
    if (T > tB) {
      // ascenso con "rampa de velocidad" cinematográfica: termina a la
      // velocidad lenta de la toma de ascenso para empalmar sin salto
      const tc = T - tB, v0 = 14 + 14.5 * (tB - tA);
      s += v0 * tc - ((v0 - 26) / 8) * tc * tc + 1800 * smoothstep(0, 4, tc);
      y = 600 * smoothstep(0, 4, tc) + 1.6 * tc;
      pitch = 11 + smoothstep(0, 1.5, tc) * 4 - smoothstep(2.2, 4, tc) * 8;
      gear = 1 - smoothstep(0.8, 2.2, tc);
    }
  }
  const q = taxi.at(s);
  p.pPos.set(q.x, y, q.z);
  const roll = T > tB ? -smoothstep(tB + 1.5, 11, T) * 6 : 0;
  planeQuat(p.pQuat, q.yaw + (T > tB ? smoothstep(tB + 1, 11, T) * 0.08 : 0), pitch * D2R, roll * D2R);
  p.gear = gear; p.fan = fan; p.tug = 0; p.bridge = 0; p.hud = 0; p.scroll = 0;
}

function computeClimb0() {
  const p = makePose();
  takeoffPlane(11, S_HOLD, p);
  CLIMB0.copy(p.pPos);
}
computeClimb0();

const TRANSITIONS = {
  // 0 · apertura: amanecer, se encienden las luces del aeropuerto
  intro: {
    dur: 10,
    env: (u) => ({ from: 'predawn', to: 'golden1', t: smoothstep(0.1, 0.92, u) }),
    pose(T, u, p, ctx) {
      SHOTS.gate(0, p);
      const k0 = { pos: V(G.x + 260, 95, G.z - 420), look: V(G.x - 380, 20, G.z + 180) };
      const k1 = { pos: V(G.x + 120, 30, G.z - 140), look: V(G.x - 150, 18, G.z + 120) };
      SHOTS.gate(0, tmpB);
      const e = easeInOut(u);
      if (e < 0.6) {
        const w = easeInOut(e / 0.6);
        p.cPos.lerpVectors(k0.pos, k1.pos, w);
        p.cLook.lerpVectors(k0.look, k1.look, w);
      } else {
        const w = easeInOut((e - 0.6) / 0.4);
        p.cPos.lerpVectors(k1.pos, tmpB.cPos, w);
        p.cLook.lerpVectors(k1.look, tmpB.cLook, w);
      }
      p.fov = lerp(38, tmpB.fov, smoothstep(0.5, 1, u));
      p.veil = 1 - smoothstep(0, 0.16, u);
      p.veilColor = [0, 0, 0];
      ctx.lightsOn = smoothstep(0.05, 0.55, u);
    },
  },
  // 1 → 2 · retroceso con remolcador y barrido rápido hasta la calle de rodaje
  pushback: {
    dur: 8.5, cut: 5.5,
    pose(T, u, p) {
      if (T < 5.5) {
        SHOTS.gate(0, p);
        p.bridge = 1 - smoothstep(0, 1.1, T);
        const s = smoothstep(1.0, 5.6, T);
        const q = pushAt(s * 0.92);
        p.pPos.set(q.x, 0, q.z);
        planeQuat(p.pQuat, q.yaw);
        p.fan = 0.05 + smoothstep(2.5, 5, T) * 0.4;
        SHOTS.gate(0, tmpA);
        _v.set(p.pPos.x + 46, 3.2, p.pPos.z - 40);
        p.cPos.lerpVectors(tmpA.cPos, _v, easeInOut(smoothstep(0.4, 5.2, T)));
        _v2.copy(p.pPos).add(_v.set(4, 5, 4));
        p.cLook.lerpVectors(tmpA.cLook, _v2, easeInOut(smoothstep(0.4, 4.5, T)));
        p.fov = lerp(50, 44, smoothstep(0.4, 5, T));
        // barrido: la cámara gira bruscamente
        const w = smoothstep(4.7, 5.5, T);
        if (w > 0) {
          const ang = easeIn(w) * 1.3;
          _v.subVectors(p.cLook, p.cPos).applyAxisAngle(_v2.set(0, 1, 0), ang);
          p.cLook.copy(p.cPos).add(_v);
        }
        p.blur = w;
      } else {
        const t2 = T - 5.5;
        SHOTS.taxi(t2, p);
        const w = 1 - smoothstep(0, 1.3, t2);
        const ang = -easeIn(w) * 1.3;
        _v.subVectors(p.cLook, p.cPos).applyAxisAngle(_v2.set(0, 1, 0), ang);
        p.cLook.copy(p.cPos).add(_v);
        p.blur = w;
      }
    },
    nextTime: 3.0,
  },
  // 2 → 3 · despegue
  takeoff: {
    dur: 11,
    pose(T, u, p, ctx) {
      takeoffPlane(T, ctx.fromS ?? S_HOLD, p);
      // cámara 1: junto al letrero, sigue el giro hacia la pista
      SHOTS.taxi(ctx.fromT ?? 20, tmpA);
      const camA = tmpA.cPos, lookA = _v2.copy(p.pPos).add(V(0, 5, 0));
      // cámara 2: carro de seguimiento lateral a ras de pista
      const tb = Math.max(0, T - 2.8);
      const lag = lerp(20, -34, smoothstep(0, 4.6, tb));
      const camB = V(p.pPos.x + lag, 2.4 + smoothstep(4, 7, T) * 3, -36);
      // cámara 3: sobre el ala (igual a la toma de ascenso)
      local(tmpB.cPos, p, -1.2, 6.9, -3.6);
      local(tmpB.cLook, p, -12, 1.5, -30);
      const wB = smoothstep(2.0, 3.6, T), wC = smoothstep(8.8, 10.8, T);
      p.cPos.lerpVectors(camA, camB, easeInOut(wB));
      p.cLook.copy(lookA);
      // tras despegar, una cámara de persecución sube con el avión
      const chase = local(V(0, 0, 0), p, -42, 8, -26, true);
      p.cPos.lerp(chase, easeInOut(smoothstep(6.9, 8.4, T)));
      p.cPos.lerp(tmpB.cPos, easeInOut(wC));
      p.cLook.lerp(tmpB.cLook, easeInOut(wC));
      p.fov = lerp(lerp(42, 34, wB), 54, wC);
    },
  },
  // atravesar una nube: blanco total y aparición en otro lugar
  punch: {
    dur: 3.4, cut: 1.7,
    pose(T, u, p, ctx) {
      const fwd = smoothstep(0, 1.7, T);
      if (T < 1.7) {
        ctx.fromShot(ctx.fromT + T, p);
        _v.subVectors(p.cLook, p.cPos).normalize();
        p.cPos.addScaledVector(_v, easeIn(fwd) * 14);
      } else {
        ctx.toShot(T - 1.7, p);
        _v.subVectors(p.cLook, p.cPos).normalize();
        p.cPos.addScaledVector(_v, -(1 - easeOut(smoothstep(1.7, 3.4, T))) * 14);
      }
      p.veil = smoothstep(0.55, 1.6, T) * (1 - smoothstep(1.8, 3.2, T));
      p.veilColor = ctx.cloudColor;
      p.blur = p.veil * 0.6;
    },
    nextTime: 1.7,
  },
  // entre tomas de crucero: la cámara vuela alrededor del avión
  orbit: {
    dur: 3.2,
    pose(T, u, p, ctx) {
      ctx.toShot(T, tmpB);
      copyPose(p, tmpB);
      const e = easeInOut(u);
      const a = _v.subVectors(ctx.from.cPos, ctx.from.pPos);
      const b = _v2.subVectors(tmpB.cPos, tmpB.pPos);
      const ra = a.length(), rb = b.length();
      const dir = a.clone().normalize();
      const dirB = b.clone().normalize();
      _q.setFromUnitVectors(dir, dirB);
      const qi = new THREE.Quaternion().slerp(_q, e);
      dir.applyQuaternion(qi);
      const r = Math.exp(lerp(Math.log(ra), Math.log(rb), e)) * (1 + Math.sin(u * Math.PI) * 0.18);
      p.cPos.copy(tmpB.pPos).addScaledVector(dir, r);
      p.cLook.lerpVectors(_v.subVectors(ctx.from.cLook, ctx.from.pPos).add(tmpB.pPos), tmpB.cLook, e);
      p.fov = lerp(ctx.from.fov, tmpB.fov, e);
      p.hud = lerp(ctx.from.hud, tmpB.hud, smoothstep(0.6, 1, u));
      p.lock = ctx.lockIn ? smoothstep(0.42, 1, u) : tmpB.lock;
      // el caza escolta se despide: se aleja hacia la derecha y arriba
      if (ctx.from.escort) {
        p.escort = u < 0.98 ? 1 : 0;
        const w = u * u;
        p.ePos.copy(ctx.from.ePos).add(_v.set(-90 * w, 70 * w, 320 * w));
        p.eQuat.copy(ctx.from.eQuat).multiply(_q.setFromAxisAngle(V(0, 1, 0), -0.5 * u)).multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, 1.1 * smoothstep(0, 0.4, u)));
      }
    },
    nextTime: 3.2,
  },
  // 19 → 20 · descenso entre nubes, aproximación, toma de contacto y rodaje
  landing: {
    dur: 14.6, cut: 13.4,
    env: (u) => ({ from: 'approach', to: 'arrival', t: smoothstep(0.1, 0.16, u) }),
    pose(T, u, p, ctx) {
      if (T < T_CUT_IN) {
        ctx.fromShot(ctx.fromT + T, p);
        const k = easeIn(smoothstep(0, T_CUT_IN, T));
        p.pPos.y -= k * 260;
        p.cPos.y -= k * 245;
        p.cLook.y -= k * 262;
        p.pQuat.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), -k * 5 * D2R));
        p.gear = smoothstep(0.8, 2.0, T);
        p.landing = smoothstep(1, 2, T);
        p.veil = smoothstep(1.0, 2.2, T);
        p.veilColor = ctx.cloudColor;
        p.blur = p.veil * 0.5;
        return;
      }
      if (T < 13.4) {
        landingPlane(T, p);
        // aproximación: persecución por detrás con la pista al frente
        const chase = local(V(0, 0, 0), p, -62, 11, -26, true);
        const chaseLook = local(V(0, 0, 0), p, 70, -4, 0, true);
        // observador junto a la zona de toma de contacto
        const spot = V(X_TD + 28, 1.8, -62);
        const spotLook = V(p.pPos.x - 8, p.pPos.y + 3, 0);
        const w = easeInOut(smoothstep(5.6, 7.8, T));
        p.cPos.lerpVectors(chase, spot, w);
        p.cLook.lerpVectors(chaseLook, spotLook, easeInOut(smoothstep(5.4, 7.2, T)));
        p.fov = lerp(40, 30, w);
        p.veil = 1 - smoothstep(T_CUT_IN, 3.6, T);
        p.veilColor = ctx.cloudColor;
        p.blur = p.veil * 0.4;
        // barrido rápido de salida
        const wh = smoothstep(12.6, 13.4, T);
        if (wh > 0) {
          _v.subVectors(p.cLook, p.cPos).applyAxisAngle(_v2.set(0, 1, 0), -easeIn(wh) * 1.3);
          p.cLook.copy(p.cPos).add(_v);
        }
        p.blur = Math.max(p.blur, wh);
        return;
      }
      const t2 = T - 13.4;
      SHOTS.arrival(t2, p);
      const w = 1 - smoothstep(0, 1.2, t2);
      _v.subVectors(p.cLook, p.cPos).applyAxisAngle(_v2.set(0, 1, 0), easeIn(w) * 1.3);
      p.cLook.copy(p.cPos).add(_v);
      p.blur = w;
    },
    nextTime: 1.2,
  },
  // 5 → 6 · aparece un caza escolta y ambos dan un tonel: el mundo gira 360°
  roll: {
    dur: 5.4,
    pose(T, u, p, ctx) {
      ctx.toShot(T, tmpB);
      cruisePlane(ctx.fromT + T, p);
      const ang = easeInOut(smoothstep(0.3, 0.8, u)) * Math.PI * 2;
      p.pQuat.multiply(_q.setFromAxisAngle(X_AXIS, ang));
      // escolta: llega por la derecha y luego toma su puesto
      const arrive = easeOut(smoothstep(0, 0.3, u));
      const ex = lerp(-160, -4, arrive), ey = lerp(14, 3, arrive), ez = lerp(60, 31, arrive);
      const w2 = easeInOut(smoothstep(0.8, 1, u));
      const esc = CRUISE.sideEscort.escort;
      local(p.ePos, p, lerp(ex, esc[0], w2), lerp(ey, esc[1], w2), lerp(ez, esc[2], w2), true);
      headingQuat(p.eQuat, p).multiply(_q.setFromAxisAngle(X_AXIS, ang));
      p.escort = 1;
      // cámara: sale de la cabina, se coloca detrás y gira con ellos
      const w1 = easeInOut(smoothstep(0, 0.3, u));
      const c1 = local(V(0, 0, 0), p, -66, 9, -22, true);
      const l1 = local(V(0, 0, 0), p, 4, 4, 14, true);
      p.cPos.lerpVectors(ctx.from.cPos, c1, w1).lerp(tmpB.cPos, w2);
      p.cLook.lerpVectors(ctx.from.cLook, l1, w1).lerp(tmpB.cLook, w2);
      p.fov = lerp(lerp(ctx.from.fov, 36, w1), tmpB.fov, w2);
      p.roll = -ang;
      p.hud = ctx.from.hud * (1 - smoothstep(0, 0.12, u));
      p.lock = p.hud;
    },
    nextTime: 5.4,
  },
  // 7 → 8 · un caza pasa rozando, rompe la barrera del sonido y la onda sacude todo
  boom: {
    dur: 3.8, cut: 1.75,
    pose(T, u, p, ctx) {
      if (T < 1.75) ctx.fromShot(ctx.fromT + T, p);
      else ctx.toShot(T - 1.75, p);
      const tp = T - 1.6;
      const x = 170 * tp + (tp > 0 ? 340 * tp * tp : 0);
      local(p.ePos, p, x, 18 + tp * 3, -70, true);
      headingQuat(p.eQuat, p).multiply(_q.setFromAxisAngle(X_AXIS, -0.25 + tp * 0.1));
      p.escort = T > 0.2 && T < 3.2 ? 1 : 0;
      p.vapor = smoothstep(1.0, 1.55, T) * (1 - smoothstep(1.9, 2.7, T));
      p.shock = tp >= 0 ? tp : -1;
      p.shake = tp >= 0 ? Math.exp(-tp * 2.6) : 0;
      p.veil = tp >= 0 ? 0.45 * Math.max(0, 1 - tp / 0.35) : 0;
      p.veilColor = [1, 1, 1];
      p.blur = p.shake * 0.25;
    },
    nextTime: 2.05,
  },
  // 13 → 14 · la cámara sube hasta la estratosfera y aparece la curvatura de la Tierra
  space: {
    dur: 7.5, cut: 2.8,
    pose(T, u, p, ctx) {
      if (T < 2.8) {
        ctx.fromShot(ctx.fromT + T, p);
        const k = easeIn(smoothstep(0, 2.8, T));
        p.cPos.y += k * 9000;
        p.cLook.y += k * 12000;
        p.fov = lerp(ctx.from.fov, 50, k);
        p.veil = smoothstep(1.9, 2.75, T);
        p.veilColor = [0.01, 0.015, 0.04];
        return;
      }
      const t2 = T - 2.8, w = easeInOut(smoothstep(0, 4.7, t2));
      SHOTS.space(t2, p);
      const h = lerp(30, SPACE.h, w);
      p.cPos.y = h;
      const az = -Math.PI / 2 + t2 * 0.004, pitch = lerp(-38, -7, w) * D2R;
      p.cLook.set(Math.cos(az) * 1000, h + Math.tan(pitch) * 1000, Math.sin(az) * 1000);
      p.veil = 1 - smoothstep(0, 0.9, t2);
      p.veilColor = [0.01, 0.015, 0.04];
    },
    nextTime: 4.7,
  },
  // 14 → 15 · picada desde el espacio, caída libre junto a un paracaidista y apertura
  skydive: {
    dur: 8, cut: 2.4,
    env: (u) => ({ from: 'firstlight', to: 'dawn', t: smoothstep(0.15, 0.3, u) }),
    pose(T, u, p, ctx) {
      if (T < 2.4) {
        ctx.fromShot(ctx.fromT + T, p);
        const k = easeIn(smoothstep(0, 2.4, T));
        p.cPos.y = lerp(p.cPos.y, 40, k);
        const az = -Math.PI / 2, pitch = lerp(-7, -62, easeInOut(smoothstep(0, 1.6, T))) * D2R;
        p.cLook.set(Math.cos(az) * 1000, p.cPos.y + Math.tan(pitch) * 1000, Math.sin(az) * 1000);
        p.fov = lerp(58, 78, k);
        p.veil = smoothstep(1.5, 2.35, T);
        p.veilColor = [1, 0.78, 0.55];
        p.blur = k * 0.5;
        p.shake = k * 0.4;
        return;
      }
      cruisePlane(T, p);
      p.pPos.y = -5000;
      const t2 = T - 2.4;
      // reloj de la slide del paracaídas: llega a 0 justo al terminar
      p.chute = Math.max(0, t2 - 5.6);
      const fallEnd = 3.0, open = 3.3;
      const yFall = CHUTE_C.y + 520 - 170 * Math.min(t2, fallEnd) - (t2 > fallEnd ? 120 * (t2 - fallEnd) * (1 - smoothstep(fallEnd, open + 0.6, t2)) : 0);
      const settle = easeInOut(smoothstep(open, 5.6, t2));
      parachuteCam(p.chute, tmpA);
      const ff = V(CHUTE_C.x + 2, Math.max(yFall, CHUTE_C.y), CHUTE_C.z - 3);
      p.cPos.lerpVectors(ff, tmpA.cPos, settle);
      const lookFF = V(ff.x + 30, ff.y - 100, ff.z + 18);
      p.cLook.lerpVectors(lookFF, tmpA.cLook, settle);
      p.roll = lerp(Math.sin(t2 * 1.7) * 0.05, tmpA.roll, settle);
      p.fov = lerp(78, 66, settle);
      // compañero: abre su paracaídas un instante antes y "sube" respecto a la cámara
      p.j0Open = smoothstep(fallEnd - 0.3, fallEnd + 0.4, t2);
      p.j0Mode = smoothstep(fallEnd, fallEnd + 1.2, t2);
      const rise = smoothstep(fallEnd - 0.3, open + 1.2, t2) * 34;
      const j0Rest = V(16, -20, 24).add(CHUTE_C);
      const j0FF = V(ff.x + 12, ff.y - 16 + rise, ff.z + 9);
      p.j0Pos.lerpVectors(j0FF, j0Rest, settle);
      p.veil = 1 - smoothstep(0, 0.6, t2);
      p.veilColor = [1, 0.95, 0.9];
      // tirón al abrir el propio paracaídas
      p.shake = Math.max(0, 1 - Math.abs(t2 - open) / 0.5) * 0.8 + (t2 < fallEnd ? 0.15 : 0);
    },
    nextTime: 0,
  },
  // 15 → 16 · el sol asoma y sus rayos atraviesan las nubes
  sunrise: {
    dur: 6.5, cut: 3.1,
    pose(T, u, p, ctx) {
      if (T < 3.1) {
        ctx.fromShot(ctx.fromT + T, p);
        const sunAz = 128 * D2R;
        const yaw0 = Math.atan2(p.cLook.z - p.cPos.z, p.cLook.x - p.cPos.x);
        let d = sunAz - yaw0;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = easeInOut(smoothstep(0, 2.6, T));
        const yaw = yaw0 + d * k, pitch = lerp(-0.56, 0.02, k);
        p.cLook.set(p.cPos.x + Math.cos(yaw) * Math.cos(pitch) * 100, p.cPos.y + Math.sin(pitch) * 100, p.cPos.z + Math.sin(yaw) * Math.cos(pitch) * 100);
        p.rays = k * 1.6;
        p.veil = smoothstep(2.4, 3.05, T) * 0.95;
        p.veilColor = [1, 0.85, 0.6];
        return;
      }
      ctx.toShot(T - 3.1, p);
      p.rays = lerp(1.6, 0.7, smoothstep(3.1, 6.5, T));
      p.veil = 0.95 * (1 - smoothstep(3.1, 4.1, T));
      p.veilColor = [1, 0.85, 0.6];
    },
    nextTime: 3.4,
  },
  // 16 → 17 · la cámara gira mientras una avioneta escribe el título con humo
  skywrite: {
    dur: 7,
    pose(T, u, p, ctx) {
      TRANSITIONS.orbit.pose(T, Math.min(1, u / 0.45), p, ctx);
      p.sky = T - 0.8;
    },
    nextTime: 7,
  },
  // 17 → 18 · picada entre las nubes y vuelo rasante sobre el mar
  seadive: {
    dur: 6.5, cut: 2.0,
    pose(T, u, p, ctx) {
      if (T < 2.0) {
        ctx.fromShot(ctx.fromT + T, p);
        const k = easeIn(smoothstep(0, 2.0, T));
        p.pQuat.multiply(_q.setFromAxisAngle(V(0, 0, 1), -k * 10 * D2R));
        p.pPos.y -= k * 180;
        p.cPos.y -= k * 150;
        p.cLook.y -= k * 200;
        p.skyFade = 1 - k;
        p.veil = smoothstep(1.2, 1.95, T);
        p.veilColor = ctx.cloudColor;
        return;
      }
      const t2 = T - 2.0, w = easeOut(smoothstep(0, 4.5, t2));
      SHOTS.sea(t2, tmpB);
      seaPlane(t2, p);
      p.pPos.y += (1 - w) * 140;
      p.pQuat.multiply(_q.setFromAxisAngle(V(0, 0, 1), -(1 - w) * 9 * D2R));
      const c0 = local(V(0, 0, 0), p, -75, 26, -8, true);
      const wc = easeInOut(smoothstep(0, 4.5, t2));
      p.cPos.lerpVectors(c0, tmpB.cPos, wc);
      p.cLook.lerpVectors(local(V(0, 0, 0), p, 10, 0, 0, true), tmpB.cLook, wc);
      p.fov = lerp(44, tmpB.fov, wc);
      p.veil = 1 - smoothstep(0, 0.8, t2);
      p.veilColor = ctx.cloudColor;
    },
    nextTime: 4.5,
  },
  // 8 → 9 · el avión cisterna baja, extiende la pértiga y conecta
  refuel: {
    dur: 6.5,
    pose(T, u, p, ctx) {
      ctx.toShot(T, tmpB);
      cruisePlane(ctx.fromT + T, p);
      const arrive = easeInOut(smoothstep(0, 0.45, u));
      const r = TANKER.rel;
      const rel = [lerp(150, r[0], arrive), lerp(70, r[1], arrive), lerp(30, r[2], arrive)];
      setTanker(p, rel, easeInOut(smoothstep(0.42, 0.72, u)), smoothstep(0.72, 0.8, u));
      const w = easeInOut(smoothstep(0, 0.55, u));
      p.cPos.lerpVectors(ctx.from.cPos, tmpB.cPos, w);
      p.cLook.lerpVectors(ctx.from.cLook, tmpB.cLook, w);
      p.fov = lerp(ctx.from.fov, tmpB.fov, w);
      // destello al conectar
      p.veil = 0.25 * Math.max(0, 1 - Math.abs(u - 0.74) / 0.04);
      p.veilColor = [0.7, 0.9, 1];
    },
    nextTime: 6.5,
  },
  // 9 → 10 · el cisterna se retira y tres Blue Angels pintan el cielo de azul
  bat: {
    dur: BAT.dur,
    pose(T, u, p, ctx) {
      ctx.toShot(T, tmpB);
      cruisePlane(ctx.fromT + T, p);
      const dep = easeIn(smoothstep(0, 0.4, u));
      const r = TANKER.rel;
      if (u < 0.5) setTanker(p, [lerp(r[0], 140, dep), lerp(r[1], 120, dep), lerp(r[2], -30, dep)], 1 - smoothstep(0, 0.12, u), 1 - smoothstep(0, 0.06, u));
      p.bat = T;
      p.tint = smoothstep(0.45, 0.75, u) * 0.18;
      const w1 = easeInOut(smoothstep(0, 0.3, u)), w2 = easeInOut(smoothstep(0.82, 1, u));
      const c2 = local(V(0, 0, 0), p, -40, -25, -70, true), l2 = local(V(0, 0, 0), p, 150, 60, 20, true);
      p.cPos.lerpVectors(ctx.from.cPos, c2, w1).lerp(tmpB.cPos, w2);
      p.cLook.lerpVectors(ctx.from.cLook, l2, w1).lerp(tmpB.cLook, w2);
      p.fov = lerp(lerp(ctx.from.fov, 48, w1), tmpB.fov, w2);
    },
    nextTime: BAT.dur,
  },
  // 10 → 11 · tormenta: relámpagos dentro de la nube, lluvia y salida a la calma
  storm: {
    dur: 7.5,
    env: (u) => (u < 0.45 ? { from: 'afternoon', to: 'storm', t: smoothstep(0.04, 0.32, u) } : { from: 'storm', to: 'goldenPM', t: smoothstep(0.7, 0.94, u) }),
    pose(T, u, p, ctx) {
      ctx.toShot(T, tmpB);
      cruisePlane(ctx.fromT + T, p);
      const k = smoothstep(0.12, 0.32, u) * (1 - smoothstep(0.72, 0.9, u));
      // turbulencia
      p.pQuat.multiply(_q.setFromEuler(new THREE.Euler(Math.sin(T * 7.3) * 0.05 * k, 0, Math.sin(T * 5.1 + 1) * 0.03 * k)));
      p.pPos.y += Math.sin(T * 4.3) * 2.5 * k;
      p.bat = ctx.from.bat >= 0 ? ctx.from.bat + T : -1;
      p.batFade = 1 - smoothstep(0.08, 0.26, u);
      p.tint = ctx.from.tint * p.batFade;
      const w1 = easeInOut(smoothstep(0, 0.25, u)), w2 = easeInOut(smoothstep(0.8, 1, u));
      const c3 = local(V(0, 0, 0), p, -44, 9, -24, true), l3 = local(V(0, 0, 0), p, 10, 3, 0, true);
      p.cPos.lerpVectors(ctx.from.cPos, c3, w1).lerp(tmpB.cPos, w2);
      p.cLook.lerpVectors(ctx.from.cLook, l3, w1).lerp(tmpB.cLook, w2);
      p.fov = lerp(lerp(ctx.from.fov, 40, w1), tmpB.fov, w2);
      // relámpagos
      const strikes = [[2.5, 160, 40, 260], [3.2, -120, 80, 340], [3.42, -110, 70, 330], [4.4, 260, 20, -180], [5.1, 60, 90, 420]];
      let f = 0, idx = -1;
      strikes.forEach(([ts, x, y, z], i) => {
        if (T >= ts) {
          const e = Math.exp(-(T - ts) * 9);
          if (e > f) { f = e; idx = i; local(p.flashPos, p, x, y, z, true); }
        }
      });
      p.flash = f * k;
      p.flashIdx = idx;
      p.veil = 0.3 * p.flash;
      p.veilColor = [0.85, 0.9, 1];
      p.rain = k;
      p.shake = k * 0.12;
    },
    nextTime: 7.5,
  },
  // 11 → 12 · el sol se hunde en cámara rápida y llega la noche
  nightfall: {
    dur: 7,
    pose(T, u, p, ctx) {
      TRANSITIONS.orbit.pose(T, u, p, ctx);
    },
    nextTime: 7,
  },
  // 12 → 13 · aparece la aurora boreal y ondula con fuerza
  aurora: {
    dur: 6.5,
    pose(T, u, p, ctx) {
      TRANSITIONS.orbit.pose(T, u, p, ctx);
      p.auroraPulse = Math.sin(u * Math.PI);
    },
    nextTime: 6.5,
  },
  // fundido genérico (retroceder o saltar)
  fade: {
    dur: 1.6, cut: 0.8,
    pose(T, u, p, ctx) {
      if (T < 0.8) ctx.fromShot(ctx.fromT + T, p);
      else ctx.toShot(T - 0.8, p);
      p.veil = smoothstep(0, 0.75, T) * (1 - smoothstep(0.85, 1.6, T));
      p.veilColor = [0.02, 0.03, 0.05];
    },
    nextTime: 0.8,
  },
};

// ───────── director ─────────

export { X_TD };

export class Director {
  constructor(slides, opts = {}) {
    this.slides = slides;
    this.index = -1;
    this.t = 0;
    this.trans = null;
    this.pose = makePose();
    this.env = cloneEnv(ENVS[slides[0].env]);
    this.envFrom = cloneEnv(this.env);
    this.reduced = !!opts.reduced;
    this.lightsOn = 1;
    this.cloudColor = [1, 1, 1];
    this.onArrive = null;
    this.onLeave = null;
    this.queue = null;
  }
  shotOf(i) {
    return SHOTS[this.slides[i].shot];
  }
  start(i, withIntro) {
    this.trans = null;
    this.queue = null;
    if (withIntro) {
      this.index = i;
      this.beginTransition('intro', -1, i);
    } else {
      this.index = i;
      this.t = 0;
      this.env = cloneEnv(ENVS[this.slides[i].env]);
      this.onArrive?.(i);
    }
  }
  pickTransition(from, to) {
    if (this.reduced) return 'fade';
    if (to !== from + 1) return 'fade';
    const a = this.slides[from].shot, b = this.slides[to].shot;
    if (a === 'gate' && b === 'taxi') return 'pushback';
    if (a === 'taxi' && b === 'climb') return 'takeoff';
    if (a === 'cruise:cockpit' && b === 'cruise:sideEscort') return 'roll';
    if (b === 'cruise:tanker') return 'refuel';
    if (a === 'cruise:tanker' && b === 'cruise:belowBlue') return 'bat';
    if (a === 'cruise:belowBlue' && b === 'cruise:tail') return 'storm';
    if (a === 'cruise:tail' && b === 'cruise:side') return 'nightfall';
    if (b === 'cruise:wideAurora') return 'aurora';
    if (a === 'cruise:wideAurora' && b === 'space') return 'space';
    if (a === 'space' && b === 'parachute') return 'skydive';
    if (a === 'parachute' && b === 'cruise:front34') return 'sunrise';
    if (b === 'cruise:sideSky') return 'skywrite';
    if (a === 'cruise:sideSky' && b === 'sea') return 'seadive';
    if (a === 'cruise:wing' && b === 'cruise:front34') return 'boom';
    if (a.startsWith('cruise') && b.startsWith('cruise')) return 'orbit';
    if (a.startsWith('cruise') && b === 'arrival') return 'landing';
    return 'punch';
  }
  go(to) {
    to = clamp(to, 0, this.slides.length - 1);
    if (this.trans) {
      this.queue = to;
      this.trans.speed = 4;
      return;
    }
    if (to === this.index) return;
    this.beginTransition(this.pickTransition(this.index, to), this.index, to);
  }
  beginTransition(name, from, to) {
    const tr = TRANSITIONS[name];
    const fromIdx = from;
    this.trans = {
      name, def: tr, T: 0, from: fromIdx, to, speed: 1,
      ctx: {
        from: copyPose(makePose(), this.pose),
        fromT: this.t,
        fromS: fromIdx >= 0 && this.slides[fromIdx].shot === 'taxi' ? taxiS(this.t) : undefined,
        fromShot: fromIdx >= 0 ? this.shotOf(fromIdx) : SHOTS.gate,
        toShot: this.shotOf(to),
        cloudColor: this.cloudColor,
        lockIn: name === 'orbit' && this.slides[to].shot === 'cruise:cockpit' && to === fromIdx + 1,
      },
    };
    this.envFrom = cloneEnv(this.env);
    this.envTo = ENVS[this.slides[to].env];
    this.onLeave?.(fromIdx, to, tr.dur);
  }
  update(dt) {
    const p = this.pose;
    p.veil = 0; p.blur = 0; p.veilColor = [1, 1, 1];
    p.water = 0; p.smoke = -1; p.landing = 0; p.angels = -1;
    p.lock = 0; p.escort = 0; p.vapor = 0; p.shock = -1; p.shake = 0;
    p.tanker = 0; p.charge = 0; p.bat = -1; p.batFade = 1; p.flash = 0; p.rain = 0; p.tint = 0; p.auroraPulse = 0;
    p.space = 0; p.chute = -1; p.j0Open = 1; p.j0Mode = 1; p.sky = -99; p.skyFade = 1; p.sea = 0; p.rays = 0;
    if (this.trans) {
      const tr = this.trans;
      tr.T += dt * tr.speed;
      const dur = tr.def.dur;
      const u = clamp(tr.T / dur, 0, 1);
      tr.ctx.cloudColor = this.cloudColor;
      tr.def.pose(Math.min(tr.T, dur), u, p, tr.ctx);
      if (tr.ctx.lightsOn !== undefined) this.lightsOn = tr.ctx.lightsOn;
      const ev = tr.def.env ? tr.def.env(u) : null;
      if (ev) lerpEnv(ENVS[ev.from], ENVS[ev.to], ev.t, this.env);
      else lerpEnv(this.envFrom, this.envTo, easeInOut(smoothstep(0, 0.85, u)), this.env);
      if (u >= 1) {
        this.index = tr.to;
        this.t = tr.def.nextTime ?? 0;
        this.trans = null;
        this.lightsOn = 1;
        this.onArrive?.(this.index);
        if (this.queue !== null && this.queue !== this.index) {
          const q = this.queue;
          this.queue = null;
          this.go(q);
        } else this.queue = null;
      }
    } else {
      this.t += dt;
      this.shotOf(this.index)(this.t, p);
      lerpEnv(this.env, ENVS[this.slides[this.index].env], 1, this.env);
    }
    return p;
  }
  get transitioning() {
    return !!this.trans;
  }
}
