import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SLIDES } from './slides.js';
import { derive, makeDerived, ENVS } from './env.js';
import { createAirliner } from './airliner.js';
import { createWorld } from './world.js';
import { CloudPass, buildNoiseTextures } from './clouds.js';
import { Director, X_TD, FINAL_CAM, CRUISE_ANCHOR, SKY_CAM } from './director.js';
import { createSpace, createChutes, createSkyText, createOcean } from './act4.js';
import { createTanker, createMidShow, createLightning, createAurora } from './act3.js';
import { createBlueAngels, jetModel } from './blueangels.js';
import { canvas, texFromCanvas } from './util.js';
import { createSalute } from './salute.js';
import { UI } from './ui.js';
import { D2R, smoothstep } from './util.js';

const params = new URLSearchParams(location.search);
const LOW = params.get('calidad') === 'baja';
const HIGH = params.get('calidad') === 'alta';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const status = document.querySelector('#start-status');
const startBtn = document.querySelector('#start-btn');

function fail(msg) {
  status.textContent = msg;
}

async function boot() {
  const canvasEl = document.querySelector('#gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  } catch (e) {
    fail('Este equipo no tiene WebGL disponible. Prueba con Chrome o Edge actualizados.');
    return;
  }
  // en pantallas grandes se dibuja un poco por debajo de la resolución nativa;
  // la interfaz (HTML) sigue nítida y la diferencia en la escena casi no se nota
  const baseRatio = HIGH ? Math.min(devicePixelRatio, 1.5) : Math.min(1, 1600 / Math.max(innerWidth, 1));
  renderer.setPixelRatio(baseRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9fb0c0, 0.00004);
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.4, 200000);

  status.textContent = 'Generando nubes…';
  await new Promise((r) => setTimeout(r, 30));
  const noise = buildNoiseTextures();
  status.textContent = 'Preparando el avión…';
  await new Promise((r) => setTimeout(r, 10));
  const plane = createAirliner();
  scene.add(plane.root);
  status.textContent = 'Construyendo el aeropuerto…';
  await new Promise((r) => setTimeout(r, 10));
  const world = createWorld(scene, renderer, plane);
  // efectos transparentes cercanos: se dibujan después de las nubes
  const lateScene = new THREE.Scene();
  const salute = createSalute(lateScene, scene);
  salute.smoke.position.set(X_TD, 0.12, 0);
  const angels = createBlueAngels(scene, lateScene, FINAL_CAM.pos, FINAL_CAM.look);
  const tanker = createTanker(plane, scene);
  const midShow = createMidShow(scene, lateScene, CRUISE_ANCHOR);
  const lightning = createLightning(lateScene);
  const aurora = createAurora(scene);
  const space = createSpace();
  const chutes = createChutes(scene, CRUISE_ANCHOR);
  const skyText = createSkyText(lateScene, scene, 'Recomendaciones', SKY_CAM.pos, SKY_CAM.look);
  const ocean = createOcean(scene);
  const SPACE_SUN_AZ = -Math.PI / 2 + 0.28;
  const sunNdc = new THREE.Vector3();
  // caza escolta (también el que rompe la barrera del sonido) con su cono de vapor
  const escort = jetModel();
  escort.traverse((o) => o.isMesh && (o.castShadow = true));
  scene.add(escort);
  const [vc, vg] = canvas(16, 128);
  const vgr = vg.createLinearGradient(0, 0, 0, 128);
  vgr.addColorStop(0, 'rgba(255,255,255,0.95)');
  vgr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  vgr.addColorStop(1, 'rgba(255,255,255,0)');
  vg.fillStyle = vgr;
  vg.fillRect(0, 0, 16, 128);
  const vaporMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(vc, { srgb: false }), color: new THREE.Color(1.6, 1.6, 1.7), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const vapor = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6.5, 32, 1, true).rotateZ(-Math.PI / 2), vaporMat);
  vapor.position.x = -0.5;
  escort.add(vapor);
  const ambTmp = new THREE.Color();

  // luces
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const sm = LOW ? 1024 : HIGH ? 2048 : 1536;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 1200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8aa4c8, 0x3a3428, 0.4);
  scene.add(hemi);

  // posprocesado: escena → nubes → bloom → tono → grano y viñeta
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: LOW ? 0 : HIGH ? 4 : 2 });
  rt.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
  rt.depthTexture.type = THREE.FloatType;
  const composer = new EffectComposer(renderer, rt);
  const mainPass = new RenderPass(scene, camera);
  composer.addPass(mainPass);
  const clouds = new CloudPass(noise, camera);
  clouds.scale = LOW ? 0.3 : HIGH ? 0.5 : 0.38;
  clouds.uniforms.uSteps.value = LOW ? 32 : HIGH ? 64 : 44;
  composer.addPass(clouds);
  const late = new RenderPass(lateScene, camera);
  late.clear = false;
  composer.addPass(late);
  // bloom a un cuarto de resolución: casi igual de bonito y mucho más barato
  class LightBloom extends UnrealBloomPass {
    setSize(w, h) {
      super.setSize(Math.max(2, Math.round(w * 0.5)), Math.max(2, Math.round(h * 0.5)));
    }
  }
  const bloom = new LightBloom(new THREE.Vector2(innerWidth, innerHeight), 0.15, 0.22, 2.6);
  composer.addPass(bloom);
  // Pase final único (en una gráfica integrada cada pase de pantalla completa
  // cuesta varios milisegundos): rayos de sol, tono ACES, sRGB, color,
  // onda expansiva, velo azul, viñeta y grano.
  const cinema = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uSat: { value: 1.22 }, uCon: { value: 1.07 },
      uShock: { value: -1 }, uShockC: { value: new THREE.Vector2(0.62, 0.66) }, uAspect: { value: 1.78 }, uTint: { value: 0 },
      uExposure: { value: 1 }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uRays: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse;
      uniform float uTime, uVig, uSat, uCon, uShock, uAspect, uTint, uExposure, uRays; uniform vec2 uShockC, uSun;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c){
        const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        c *= uExposure / 0.6;
        return clamp(outM * rrt(inM * c), 0.0, 1.0);
      }
      vec3 srgb(vec3 c){ return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c)); }
      void main(){
        // onda expansiva de la barrera del sonido: anillo que deforma la imagen
        vec2 uv = vUv;
        float ring = 0.0;
        if (uShock >= 0.0) {
          vec2 sd = (vUv - uShockC) * vec2(uAspect, 1.0);
          float dist = length(sd);
          float R = uShock * 1.5;
          float w = 0.05 + uShock * 0.06;
          ring = exp(-pow((dist - R) / w, 2.0)) * exp(-uShock * 1.6);
          uv -= normalize(sd + 1e-5) / vec2(uAspect, 1.0) * ring * 0.045;
        }
        vec2 d = uv - 0.5;
        float r = dot(d, d);
        float ca = 0.006 + ring * 0.02;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        if (ring > 0.002) {
          c.r = texture2D(tDiffuse, uv - d * r * ca - vec2(ring * 0.004, 0.0)).r;
          c.b = texture2D(tDiffuse, uv + d * r * ca + vec2(ring * 0.004, 0.0)).b;
        }
        // rayos crepusculares: la luz del sol se filtra entre las nubes
        if (uRays > 0.001) {
          vec2 dlt = (vUv - uSun) / 40.0 * 0.9;
          vec2 su = vUv; float decay = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < 40; i++) {
            su -= dlt;
            vec3 s = texture2D(tDiffuse, clamp(su, 0.0, 1.0)).rgb;
            acc += s * smoothstep(3.0, 9.0, dot(s, vec3(0.2126, 0.7152, 0.0722))) * decay;
            decay *= 0.948;
          }
          c += acc * uRays * 0.024 * vec3(1.0, 0.86, 0.66);
        }
        c = srgb(aces(c));
        c += ring * 0.12;
        // velo azul del humo de los Blue Angels
        c = mix(c, c * vec3(0.62, 0.82, 1.25) + vec3(0.0, 0.015, 0.06), uTint * 1.6);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        c = (c - 0.5) * uCon + 0.5;
        c += vec3(0.012, 0.004, -0.012) * smoothstep(0.35, 0.9, l) + vec3(-0.008, 0.0, 0.014) * (1.0 - smoothstep(0.0, 0.35, l));
        c = max(c, 0.0);
        c *= 1.0 - uVig * smoothstep(0.12, 0.62, r * 1.6);
        c += (h(vUv * 1000.0 + fract(uTime)) - 0.5) * 0.022;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(cinema);
  const godrays = { uniforms: { uSun: cinema.uniforms.uSun, uI: cinema.uniforms.uRays } };

  // muestreo del cielo para niebla, ambiente de nubes y reflejos
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const sampleRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType });
  const sampleCam = new THREE.PerspectiveCamera(20, 1, 1, 100000);
  const buf = new Float32Array(64);
  let canSample = true;
  const sampleSky = (dir, out) => {
    if (!canSample) return out;
    try {
      sampleCam.position.set(0, 0, 0);
      sampleCam.lookAt(dir);
      renderer.setRenderTarget(sampleRT);
      renderer.render(world.skyScene, sampleCam);
      renderer.readRenderTargetPixels(sampleRT, 0, 0, 4, 4, buf);
      renderer.setRenderTarget(null);
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 16; i++) { r += buf[i * 4]; g += buf[i * 4 + 1]; b += buf[i * 4 + 2]; }
      out.setRGB(r / 16, g / 16, b / 16);
    } catch (e) {
      canSample = false;
    }
    return out;
  };

  const ui = new UI(SLIDES);
  const director = new Director(SLIDES, { reduced });
  director.onArrive = (i) => {
    ui.show(i);
    if (location.hash !== `#${i + 1}`) history.replaceState(null, '', `#${i + 1}`);
  };
  director.onLeave = () => ui.hide();

  const D = makeDerived();
  const fogCol = new THREE.Color(), zen = new THREE.Color(), horizonSun = new THREE.Color();
  const tmpDir = new THREE.Vector3();
  let envTimer = 0, lastEnvKey = '';
  const wind = new THREE.Vector3();
  const ambTopBase = new THREE.Color(0.3, 0.4, 0.6), ambBotBase = new THREE.Color(0.2, 0.2, 0.25);
  const tune = { cloudSun: 10 };
  window.__tune = tune;
  const groundOff = world.shared.groundOffset.value;

  function applyEnv(env, dt, force) {
    derive(env, D);
    const u = world.sky.material.uniforms;
    u.turbidity.value = env.turb;
    u.rayleigh.value = env.ray;
    u.mieCoefficient.value = env.mie;
    u.mieDirectionalG.value = env.mieG;
    u.sunPosition.value.copy(D.sunDir);
    const night = D.night;
    const lightDir = night > 0.5 ? D.moonDir : D.sunDir;
    // luz directa: sol de día, luna de noche
    sun.color.copy(D.sunColor).multiplyScalar(1).lerp(D.moonColor.clone().multiplyScalar(1 / Math.max(0.001, 0.085)), night > 0.5 ? 1 : 0);
    sun.intensity = (night > 0.5 ? 0.085 * 3.0 * night : 3.2 * D.sunVis) * (1 - env.dark);
    renderer.toneMappingExposure = D.exposure * (1 - env.dark * 0.3);
    // muestreo del cielo cada pocos cuadros
    envTimer -= dt;
    const key = `${env.elev.toFixed(1)}|${env.az.toFixed(0)}|${env.turb.toFixed(1)}`;
    if (envTimer <= 0 && (key !== lastEnvKey || force)) {
      envTimer = 0.25;
      lastEnvKey = key;
      camera.getWorldDirection(tmpDir);
      tmpDir.y = 0.035;
      tmpDir.normalize();
      sampleSky(tmpDir, fogCol);
      sampleSky(new THREE.Vector3(0.001, 1, 0), zen);
      sampleSky(tmpDir.set(D.sunDir.x, 0.05, D.sunDir.z).normalize(), horizonSun);
      // suelo del mapa de entorno
      world.envGround.material.color.setRGB(0.16, 0.17, 0.12).multiplyScalar(D.sunVis * Math.max(0.05, D.sunDir.y) * 2.5 + 0.08 + night * 0.02);
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(world.skyScene, 0, 1, 50000);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.9;
      scene.fog.color.copy(fogCol);
      hemi.color.copy(zen).multiplyScalar(0.6);
      hemi.groundColor.copy(fogCol).multiplyScalar(0.25);
      const cu = clouds.uniforms;
      ambTopBase.copy(zen).multiplyScalar(1.1 - night * 0.6).lerp(fogCol, 0.25);
      ambBotBase.copy(fogCol).multiplyScalar(0.55 - night * 0.35);
      cu.uFogColor.value.copy(fogCol);
      const lit = new THREE.Color().copy(horizonSun).lerp(new THREE.Color(1, 1, 1), 0.35);
      const m = Math.max(lit.r, lit.g, lit.b, 1e-4);
      director.cloudColor = [lit.r / m, lit.g / m, lit.b / m].map((x) => 0.62 + x * 0.36 * (1 - night * 0.9));
    }
    hemi.intensity = (0.35 + night * 0.2) * (1 - env.dark * 0.6);
    scene.fog.density = 0.000026 + D.dusk * 0.000006;
    const cu = clouds.uniforms;
    cu.uSunDir.value.copy(night > 0.5 ? D.moonDir : D.sunDir);
    if (night > 0.5) cu.uSunColor.value.copy(D.moonColor).multiplyScalar(1.6);
    else cu.uSunColor.value.copy(D.sunColor).multiplyScalar(tune.cloudSun * (1 - env.dark * 0.85));
    cu.uBase.value = env.base;
    cu.uTop.value = env.top;
    cu.uCoverage.value = env.cover;
    cu.uDensity.value = env.dens;
    // en la tormenta el ambiente de las nubes se oscurece
    cu.uAmbTop.value.copy(ambTopBase).multiplyScalar(1 - env.dark * 0.75);
    cu.uAmbBottom.value.copy(ambBotBase).multiplyScalar(1 - env.dark * 0.8);
    cu.uFogK.value = 0.000032;
    const speed = 8 + env.scroll * 150;
    wind.x += speed * dt;
    wind.z += 3 * dt;
    cu.uWind.value.copy(wind);
    if (env.scroll > 0.5) groundOff.x += 210 * dt * env.scroll;
    else if (env.scroll < 0.01) groundOff.set(0, 0);
  }

  // tamaño
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    // la textura de profundidad no siempre cambia de tamaño con su render target
    for (const t of [composer.renderTarget1, composer.renderTarget2]) {
      t.dispose();
      t.depthTexture = new THREE.DepthTexture(t.width, t.height);
      t.depthTexture.type = THREE.FloatType;
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // calidad automática
  let frames = 0, acc = 0, quality = LOW ? 0 : 2, lastFps = 0;
  function adapt(dt) {
    if (document.visibilityState !== 'visible' || paused || dt <= 0) return;
    acc += dt;
    frames++;
    if (acc > 2.5) {
      const fps = frames / acc;
      lastFps = fps;
      if (fps < 34 && quality > 0) {
        quality--;
        if (quality === 1) { clouds.setScale(0.34); clouds.uniforms.uSteps.value = 40; renderer.setPixelRatio(baseRatio * 0.85); resize(); }
        if (quality === 0) { clouds.setScale(0.28); clouds.uniforms.uSteps.value = 32; renderer.setPixelRatio(baseRatio * 0.7); resize(); }
      }
      acc = 0;
      frames = 0;
    }
  }

  // bucle
  const clock = new THREE.Clock();
  let paused = false, running = false, elapsed = 0;
  const camUp = new THREE.Vector3(0, 1, 0);
  const flight = { pitch: 0, roll: 0, speed: 452, alt: 11000, heading: 90 };
  const eul = new THREE.Euler();
  function frame() {
    requestAnimationFrame(frame);
    let dt = Math.min(clock.getDelta(), 0.05);
    if (paused) dt = 0;
    step(dt);
  }
  function step(dt) {
    elapsed += dt;
    if (!running) return;
    const p = director.update(dt);
    plane.root.position.copy(p.pPos);
    plane.root.quaternion.copy(p.pQuat);
    plane.setGear(p.gear);
    plane.fanSpeed = p.fan;
    plane.setLanding(p.landing);
    escort.visible = p.escort > 0.5;
    if (escort.visible) {
      escort.position.copy(p.ePos);
      escort.quaternion.copy(p.eQuat);
      vapor.visible = p.vapor > 0.01;
      vaporMat.opacity = p.vapor * (0.7 + Math.sin(elapsed * 60) * 0.15);
      vapor.scale.set(1 + p.vapor * 0.3, 1, 1);
    }
    plane.update(elapsed, dt, D.night + D.dusk * 0.5);
    camera.position.copy(p.cPos);
    camera.up.copy(camUp);
    camera.lookAt(p.cLook);
    if (p.roll) camera.rotateZ(p.roll);
    if (p.shake > 0.001) {
      const k = p.shake;
      camera.position.add(new THREE.Vector3(Math.sin(elapsed * 71), Math.sin(elapsed * 83 + 1), Math.sin(elapsed * 67 + 2)).multiplyScalar(k * 0.9));
      camera.rotateZ(Math.sin(elapsed * 57) * 0.03 * k);
      camera.rotateX(Math.sin(elapsed * 49 + 3) * 0.02 * k);
    }
    if (camera.fov !== p.fov) {
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
    }
    camera.near = p.cPos.y < 40 ? 0.3 : 1;
    // remolcador y pasarela
    world.tug.visible = p.tug > 0.5;
    if (world.tug.visible) {
      world.tug.position.set(13.4 + 4.5, 0, 0).applyQuaternion(p.pQuat).add(p.pPos);
      world.tug.quaternion.copy(p.pQuat);
      world.tug.position.y = 0.11;
    }
    world.ourBridge.setExt(p.bridge);
    applyEnv(director.env, dt, false);
    world.lights.material.uniforms.uOn.value = director.lightsOn;
    world.update(elapsed, dt, D, camera, director.env);
    salute.update(elapsed, p, D, camera, renderer.domElement.height, ambTmp.copy(clouds.uniforms.uAmbTop.value).multiplyScalar(0.7));
    angels.update(p.angels, D, renderer.domElement.height, ambTmp);
    tanker.update(p, elapsed);
    midShow.update(p, D, renderer.domElement.height, ambTmp);
    lightning.update(p);
    aurora.update(camera, elapsed, director.env.aurora * (1 + p.auroraPulse * 0.8));
    clouds.uniforms.uFlash.value.set(p.flashPos.x, p.flashPos.y, p.flashPos.z, p.flash);
    hemi.intensity += p.flash * 2.5;
    cinema.uniforms.uTint.value = p.tint;
    cinema.uniforms.uExposure.value = renderer.toneMappingExposure;
    // el segundo pase de escena solo se dibuja si hay efectos visibles
    late.enabled = lateScene.children.some((o) => o.visible);
    // escenas especiales del Acto 4
    mainPass.scene = p.space ? space.scene : scene;
    clouds.enabled = !p.space;
    if (p.space) space.update(camera, elapsed, SPACE_SUN_AZ);
    chutes.update(p, elapsed);
    skyText.update(p.sky, D, renderer.domElement.height, ambTmp, p.skyFade);
    ocean.update(p, camera, elapsed);
    world.ground.visible = !p.sea;
    // rayos de sol: dónde cae el sol en pantalla y cuánta fuerza tienen
    const sd = p.space ? space.sunDir : D.sunDir;
    sunNdc.copy(camera.position).addScaledVector(sd, 10000).project(camera);
    const inFront = camera.getWorldDirection(tmpDir).dot(sd) > 0;
    const edge = inFront ? Math.max(0, 1 - Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)) / 1.6) : 0;
    const baseRays = p.space ? 0.5 : 0.25 * smoothstep(14, 1, director.env.elev) * D.sunVis * (1 - director.env.dark);
    godrays.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
    godrays.uniforms.uI.value = (p.rays + baseRays) * edge;
    // sombras alrededor del avión
    const ld = D.night > 0.5 ? D.moonDir : D.sunDir;
    sun.target.position.copy(p.pPos);
    sun.position.copy(p.pPos).addScaledVector(ld, 600);
    cinema.uniforms.uTime.value = elapsed;
    cinema.uniforms.uShock.value = p.shock;
    cinema.uniforms.uAspect.value = camera.aspect;
    flight.time = elapsed;
    eul.setFromQuaternion(p.pQuat, 'YZX');
    flight.pitch = eul.z / D2R;
    flight.roll = eul.x / D2R;
    flight.heading = 90 + Math.sin(elapsed * 0.05) * 2;
    flight.alt = 11000 + Math.sin(elapsed * 0.3) * 12;
    flight.speed = 452 + Math.sin(elapsed * 0.2) * 2;
    ui.frame(p, flight);
    composer.render(dt);
    adapt(dt);
  }

  // entrada
  const next = () => director.go(director.transitioning && director.queue !== null ? director.queue + 1 : (director.queue ?? director.index) + 1);
  const prev = () => director.go((director.queue ?? director.index) - 1);
  addEventListener('keydown', (e) => {
    if (!running) return;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === 'Home') director.go(0);
    else if (e.key === 'End') director.go(SLIDES.length - 1);
    else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    } else if (e.key === 'p' || e.key === 'P') paused = !paused;
  });
  addEventListener('click', (e) => {
    if (!running || e.target.closest('#start')) return;
    if (e.clientX > innerWidth * 0.3) next();
    else prev();
  });
  let touchX = null;
  addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  addEventListener('touchend', (e) => {
    if (touchX === null || !running) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchX = null;
  });
  let wheelLock = 0;
  addEventListener('wheel', (e) => {
    if (!running || performance.now() < wheelLock) return;
    wheelLock = performance.now() + 900;
    (e.deltaY > 0 ? next : prev)();
  }, { passive: true });

  // acceso para pruebas desde la consola del navegador
  window.__pres = {
    ENVS, director, ui, renderer, salute, composer, clouds, bloom, scene, camera, world, cinema,
    pause: (v = true) => (paused = v),
    fps: () => lastFps,
    // salta a un instante de la transición actual (segundos)
    seekTransition: (T) => director.trans && (director.trans.T = T),
    seekSlide: (t) => (director.t = t),
    // dibuja un cuadro a mano (útil si la pestaña está oculta)
    step: (dt = 0) => step(dt),
  };

  // primer cuadro de calentamiento para compilar los shaders
  const hashN = parseInt(location.hash.slice(1), 10);
  const startIdx = Number.isFinite(hashN) ? Math.min(Math.max(hashN - 1, 0), SLIDES.length - 1) : 0;
  director.start(startIdx, false);
  director.update(0);
  applyEnv(director.env, 0, true);
  status.textContent = 'Compilando la escena…';
  await new Promise((r) => setTimeout(r, 10));
  const p0 = director.pose;
  camera.position.copy(p0.cPos);
  camera.lookAt(p0.cLook);
  try {
    renderer.compile(scene, camera);
  } catch (e) { /* algunos navegadores no lo permiten; se compila al dibujar */ }
  requestAnimationFrame(frame);

  const begin = () => {
    document.querySelector('#start').classList.add('gone');
    running = true;
    clock.getDelta();
    if (startIdx === 0 && !reduced) director.start(0, true);
    else director.start(startIdx, false);
  };
  status.textContent = 'Listo para despegar.';
  startBtn.hidden = false;
  startBtn.focus();
  startBtn.addEventListener('click', (e) => { e.stopPropagation(); begin(); });
  if (Number.isFinite(hashN) || params.has('auto')) begin();
}

boot().catch((e) => {
  console.error(e);
  fail('No se pudo iniciar la escena 3D: ' + e.message);
});
