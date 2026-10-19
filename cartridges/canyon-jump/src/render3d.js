/* Canyon Jump 3D renderer (three.js / WebGL). A pure view of sim state: main.js keeps the sim, input,
   HUD, audio and arcade bridge, and calls CJRender3D.render() once per frame with the same state the
   2D renderer used. Loaded as an ES module; publishes window.CJRender3D = { ready | failed }.
   Quality: a ladder of levels (LEVELS below) picked by an adaptive governor that watches real frame times and steps
   down (render scale -> bloom -> shadows -> MSAA/post -> clouds/particles -> draw distance) under ~50 fps, and back
   up when there is sustained headroom. The drawing buffer is always capped (pixel ratio <= 1.5 and ~2.1 MP), so a
   Retina / 4K window never renders 6+ MP. Render-only: the sim never sees any of this.
   ?q=1 pins the top level, ?q=0 the old mid-phone look (no shadows / post, 1x); ?ql=N pins level N; ?debug=1 shows
   an FPS / level overlay (drawn by main.js from CJRender3D.stats). If WebGL2, a shader or the context fails, or the
   lowest level still can't hold ~20 fps, CJRender3D flips to { failed } and main.js falls back to the 2D renderer. */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { buildWorld, terrainHeight } from './3d/world.js';
import { buildCar } from './3d/car.js';
import * as P from './3d/props.js';
import { createParticles, createClouds, createStreaks } from './3d/fx.js';
import { clamp, damp, lerp, smooth, rng } from './3d/util.js';

const S = window.CJSim, C = S.C, LV = window.CJLevels;
const params = new URLSearchParams(location.search);

function fail(why) {
  window.CJRender3D = { failed: true, why }; console.warn('[canyon-jump] 3D renderer unavailable, using 2D:', why);
  const c = document.getElementById('gl'); if (c && c.style) c.style.display = 'none';
}

/* Quality ladder, cheapest first. px = drawing-buffer pixel budget, pr = max pixel ratio, msaa = samples (post only),
   post = composer (grade/vignette + MSAA), shadow = sun shadow map size (0 = blob only), clouds/fx = fraction of cloud
   puffs / particle emission, dist = roadside scenery draw distance (m). */
export const LEVELS = [
  { name: 'L0 min', px: 0.5e6, pr: 1, msaa: 0, bloom: 0, post: 0, shadow: 0, clouds: 0.3, fx: 0.4, dist: 800 },
  { name: 'L1 low', px: 0.9e6, pr: 1, msaa: 0, bloom: 0, post: 0, shadow: 0, clouds: 0.45, fx: 0.5, dist: 1100 },
  { name: 'L2 mid', px: 1.0e6, pr: 1.5, msaa: 4, bloom: 0, post: 1, shadow: 1024, clouds: 0.6, fx: 0.8, dist: 1400 },
  { name: 'L3 high-', px: 1.0e6, pr: 1.5, msaa: 4, bloom: 1, post: 1, shadow: 2048, clouds: 0.75, fx: 1, dist: 1700 },
  { name: 'L4 high', px: 1.45e6, pr: 1.5, msaa: 4, bloom: 1, post: 1, shadow: 2048, clouds: 0.85, fx: 1, dist: 1700 },
  { name: 'L5 full', px: 2.1e6, pr: 1.5, msaa: 4, bloom: 1, post: 1, shadow: 2048, clouds: 1, fx: 1, dist: 1700 },
];
const TOP = LEVELS.length - 1;
/* Starting level from GPU / device hints (the governor corrects it within a few seconds either way). */
function startLevel(renderer) {
  let gpu = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { /* hidden */ }
  const g = gpu.toLowerCase(), touch = (navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width, screen.height) < 900;
  let lv = 3, why = 'default';
  if (/swiftshader|llvmpipe|software|softpipe|microsoft basic/.test(g)) { lv = 0; why = 'software GL'; }
  else if (touch) { lv = 3; why = 'phone/tablet'; }
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon\(tm\) rx|arc a/.test(g)) { lv = TOP; why = 'discrete GPU'; }
  else if (/apple m\d|apple gpu|apple/.test(g)) { lv = 4; why = 'Apple GPU'; }
  else if (/intel|iris|uhd|hd graphics|mali|adreno|powervr|radeon/.test(g)) { lv = 2; why = 'integrated GPU'; }
  return { lv, why, gpu };
}

function init() {
  const canvas = document.getElementById('gl');
  if (!canvas) return fail('no #gl canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false, failIfMajorPerformanceCaveat: params.get('ql') == null && params.get('q') == null });
  } catch (e) { return fail(String(e && e.message || e)); }
  if (!renderer.capabilities.isWebGL2) return fail('WebGL2 required');
  // Half-float render targets (bloom / MSAA composer) need a renderable float format; without one, post is skipped.
  const floatRT = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  let dead = null; // set when the context is lost or a shader fails: main.js then draws the 2D world
  renderer.debug.onShaderError = (gl, program, vs, fs) => { dead = 'shader compile/link failed'; try { console.error('[canyon-jump] shader error', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)); } catch (e) { /* ignore */ } };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); dead = 'WebGL context lost'; }, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.info.autoReset = false;

  const level = LV.get(params.get('level') || LV.DEFAULT);
  renderer.toneMappingExposure = level.time.exposure;
  const world = buildWorld(level, S, renderer);
  const { scene, sun, sky } = world;
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.25, 6000);
  const car = buildCar(level, { renderer }); scene.add(car.group);
  const fx = createParticles(1100); scene.add(fx.points);

  /* ---------- dynamic objects: obstacles, pickups, sky traffic (instanced pools) ---------- */
  // Road obstacles read at distance: they take ~45% less haze than the scenery and get a soft warm rim on the silhouette.
  const readable = (m, extra) => { m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.86, 0.7) * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5) * 0.32;' + (extra || ''))
      .replace('#include <fog_fragment>', '#ifdef USE_FOG\n float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * 0.55;\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);\n#endif'); }; m.customProgramCacheKey = () => 'cj-readable-' + (extra ? 'x' : ''); return m; };
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const vcFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const vcFlatT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const glowMat = (hex, k) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.6, emissive: hex, emissiveIntensity: k, envMapIntensity: 1.3 });
  const coneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  readable(coneMat, '\n totalEmissiveRadiance += vec3(step(0.8, vColor.b)) * 0.6;');
  const pool = (geo, mat, max, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const skin = level.obstacles, pal = level.palette;
  const OB = {
    cactus: pool(P.SKINS[skin.cactus](pal.cactus, 3, 0.95), readable(vc), 96),
    rock: pool(P.SKINS[skin.rock](pal.rock, 5, 1.25), readable(vcFlat), 96),
    tumbleweed: pool(P.SKINS[skin.tumbleweed](9), readable(vcFlatT), 96),
    cone: pool(P.SKINS[skin.cone](), coneMat, 96),
  };
  const PK = {
    orb: pool(P.coin(), glowMat(level.pickups.orb, 1.6), 256),
    air: pool(P.airCan(), glowMat(level.pickups.air, 1.8), 64),
  };
  const padTex = P.padTexture();
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, color: new THREE.Color(level.pickups.pad).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: true });
  const padGeo = new THREE.PlaneGeometry(2.9, 7.5); padGeo.rotateX(-Math.PI / 2);
  PK.pad = pool(padGeo, padMat, 48, false); PK.pad.receiveShadow = false; PK.pad.renderOrder = 2;
  // Sky traffic: bird bodies + separately flapping wings; jets with emissive nav lights; gold-foil satellites; rings.
  const birdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  const navMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25, envMapIntensity: 1.2 });
  navMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float nav = step(0.95, max(vColor.r, vColor.g)) * step(vColor.b, 0.05) + step(0.99, min(min(vColor.r, vColor.g), vColor.b));\n totalEmissiveRadiance += vColor.rgb * nav * 6.0;'); };
  const satMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.7, envMapIntensity: 1.6, flatShading: true });
  const ringGeo = P.ring(C.RING_R);
  const ringMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5, emissive: '#ffb22e', emissiveIntensity: 1.6 });
  const riskyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5, color: '#ff9ef0', emissive: '#ff4fd8', emissiveIntensity: 2.0 });
  const SK = { bird: pool(P.SKINS[level.skyObjects.bird](), birdMat, 64), wingR: pool(P.wing(1), birdMat, 64), wingL: pool(P.wing(-1), birdMat, 64),
    plane: pool(P.SKINS[level.skyObjects.plane](), navMat, 32), satellite: pool(P.SKINS[level.skyObjects.satellite](), satMat, 32),
    ring: pool(ringGeo, ringMat, 64, false), ringRisky: pool(ringGeo, riskyMat, 64, false) };
  const rr = rng(77);
  const FAR = C.ROAD_LEN + C.CANYON_W;
  const clouds = createClouds({ count: 80, z0: C.ROAD_LEN - 300, z1: FAR + 7000, yMin: 40, yMax: 240, xSpan: 650, top: level.time.clouds?.top || '#ffd9cf', bottom: level.time.clouds?.bottom || '#a0709f', rand: rr });
  scene.add(clouds.mesh);
  const streaks = createStreaks(170, rr); scene.add(streaks.mesh);
  // glow halos for pickups (additive sprites): keep the "glow" readable in the no-bloom tier too
  const haloTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const haloMat = c => new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(c).multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const haloGeo = new THREE.PlaneGeometry(1.9, 1.9);
  const HALO = { orb: pool(haloGeo, haloMat(level.pickups.orb), 256, false), air: pool(haloGeo, haloMat(level.pickups.air), 64, false) };
  HALO.orb.renderOrder = HALO.air.renderOrder = 3;

  const o3 = new THREE.Object3D();
  function put(mesh, x, y, z, ry = 0, rx = 0, rz = 0, s = 1) { o3.position.set(x, y, -z); o3.rotation.set(rx, ry, rz); o3.scale.setScalar(s); o3.updateMatrix(); mesh.setMatrixAt(mesh.count++, o3.matrix); }
  function putBill(mesh, x, y, z, s = 1) { o3.position.set(x, y, -z); o3.quaternion.copy(camera.quaternion); o3.scale.setScalar(s); o3.updateMatrix(); mesh.setMatrixAt(mesh.count++, o3.matrix); o3.rotation.set(0, 0, 0); }

  function updateDynamic(s, t) {
    for (const k in OB) OB[k].count = 0; for (const k in PK) PK[k].count = 0; for (const k in SK) SK[k].count = 0; HALO.orb.count = HALO.air.count = 0;
    const z0 = s.z - 30, z1 = s.z + 700;
    for (const o of s.obstacles) {
      if (o.z < z0) continue; if (o.z > z1) break;
      const m = OB[o.type]; if (!m || m.count >= m.instanceMatrix.count) continue;
      const x = S.obstacleX(o, s.t), ph = o.phase;
      if (o.type === 'tumbleweed') put(m, x, 0.8 + Math.abs(Math.sin(s.t * 3 + ph)) * 0.35, o.z, ph, -s.t * 4 - ph, Math.sin(s.t * 1.7 + ph) * 0.4);
      else if (o.type === 'cactus') put(m, x, 0, o.z, ph, o.hit ? -0.5 : 0, 0, 1);
      else if (o.type === 'rock') put(m, x, 0, o.z, ph);
      else put(m, x, 0, o.z, ph, o.hit ? -1.2 : 0);
    }
    const bob = Math.sin(t * 3) * 0.12;
    for (const p of s.pickups) {
      if (p.z < z0) continue; if (p.z > z1) break; if (p.taken) continue;
      const x = S.laneX(p.lane);
      if (p.type === 'pad') put(PK.pad, x, 0.035, p.z);
      else if (p.type === 'air') { put(PK.air, x, 1.45 + bob, p.z, t * 2.2, 0, 0, 1.45); putBill(HALO.air, x, 1.5 + bob, p.z, 1.7); }
      else { put(PK.orb, x, 1.2 + bob, p.z, t * 3 + p.z * 0.1, 0, 0, 1.15); putBill(HALO.orb, x, 1.2 + bob, p.z, 1.1); }
    }
    for (const p of s.skyPickups) {
      if (p.taken || p.z < z0 || p.z > z1) continue;
      if (p.type === 'air') { put(PK.air, p.x, p.y, p.z, t * 2.2, 0, 0, 1.6); putBill(HALO.air, p.x, p.y, p.z, 2); }
      else { put(PK.orb, p.x, p.y, p.z, t * 3, 0, 0, 1.6); putBill(HALO.orb, p.x, p.y, p.z, 1.6); }
    }
    for (const o of s.sky) {
      if (o.z < z0 || o.z > z1 || o.hit) continue; const m = SK[o.type]; if (!m) continue;
      const p = S.skyObjPos(o, s.t);
      if (o.type === 'bird') { // body bobs with the downstroke; wings flap around the shoulders
        const ph = s.t * 7 + o.phase, flap = Math.sin(ph) * 0.75 + 0.15, bank = Math.cos(s.t * 1.3 + o.phase) * 0.25, k = 1.25;
        put(m, p.x, p.y - Math.sin(ph) * 0.08, o.z, Math.PI, 0, bank, k);
        o3.position.set(p.x, p.y - Math.sin(ph) * 0.08, -o.z); o3.rotation.set(0, Math.PI, bank); o3.scale.setScalar(k); o3.updateMatrix();
        const body = o3.matrix.clone();
        for (const [w, sgn] of [[SK.wingR, 1], [SK.wingL, -1]]) { o3.position.set(sgn * 0.22, 0.05, 0); o3.rotation.set(0, 0, sgn * flap); o3.scale.setScalar(1); o3.updateMatrix(); w.setMatrixAt(w.count++, body.clone().multiply(o3.matrix)); }
      } else if (o.type === 'plane') {
        put(m, p.x, p.y, o.z, Math.PI, 0, Math.sin(s.t * 0.35 + o.phase) * 0.18, 1);
        if (o.z - s.z < 420 && o.z - s.z > -10 && Math.random() < 0.9) for (const ex of [-1.05, 1.05]) fx.emit({ x: p.x - ex, y: p.y + 0.35, z: -(o.z + 3.4), vz: -14, jitter: 0.4, life: 1.6, s0: 0.5, s1: 2.6, color: '#fff6f0', alpha: 0.28, drag: 0.3 });
      } else put(m, p.x, p.y, o.z, s.t * 0.25 + o.phase, 0.35, Math.sin(s.t * 0.2 + o.phase) * 0.2, 1.1);
    }
    for (const g of s.rings) {
      if (g.taken || g.z < z0 || g.z > z1) continue;
      const m = g.risky ? SK.ringRisky : SK.ring, pulse = 1 + Math.sin(t * 5 + g.z) * 0.04;
      put(m, g.x, g.y, g.z, 0, 0, t * 0.8 + g.z, pulse);
    }
    for (const g of [OB, PK, SK, HALO]) for (const k in g) g[k].instanceMatrix.needsUpdate = true;
    padTex.offset.y = -t * 1.6;
  }

  /* ---------- post-processing ---------- */
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, vignette: { value: 0.42 }, boost: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, aspect: { value: 1.7 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float vignette, boost, time, aspect; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
      void main() {
        vec2 d = vUv - 0.5; float r = length(d * vec2(aspect, 1.0)) / aspect * 1.6;
        float ca = boost * 0.004 * r;                          // chromatic split on boost, edges only
        vec3 c = vec3(texture2D(tDiffuse, vUv - d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * ca).b);
        c *= mix(1.0, smoothstep(1.25, 0.25, r), vignette);    // vignette
        c += (h(vUv * 911.0) - 0.5) * 0.012;                   // fine grain (breaks banding in the sky)
        gl_FragColor = vec4(c, 1.0);
      }`,
  };
  let composer = null, bloom = null, grade = null, tier = -1, prNow = 1;
  function buildComposer(w, h, pr, L) {
    const rt = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), { type: THREE.HalfFloatType, samples: L.msaa });
    composer = new EffectComposer(renderer, rt); composer.setPixelRatio(pr); composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));
    bloom = L.bloom ? new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 1.0) : null; if (bloom) composer.addPass(bloom);
    grade = new ShaderPass(GradeShader); composer.addPass(grade);
    composer.addPass(new OutputPass());
  }
  function disposeComposer() {
    if (!composer) return;
    composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
    for (const p of composer.passes) p.dispose?.();
    composer = null; bloom = null; grade = null;
  }
  const cloudTotal = clouds.mesh.geometry.instanceCount;
  let shadowOn = null, shadowSize = 0;
  function applyLevel(lv, w, h) {
    const L = LEVELS[lv], prevTier = tier; tier = lv;
    // Drawing-buffer cap: pixel ratio <= L.pr and total pixels <= L.px, whatever the window size or devicePixelRatio.
    const pr = Math.max(0.35, Math.min(window.devicePixelRatio || 1, L.pr, Math.sqrt(L.px / Math.max(1, w * h))));
    prNow = pr; renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    const sh = L.shadow > 0;
    if (sh !== shadowOn) { // toggling shadows recompiles the lit materials: only do it when it actually changes
      shadowOn = sh; sun.castShadow = sh; renderer.shadowMap.enabled = sh;
      scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
    }
    if (sh && L.shadow !== shadowSize) { shadowSize = L.shadow; sun.shadow.mapSize.set(L.shadow, L.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    disposeComposer();
    if (L.post && floatRT) buildComposer(w, h, pr, L);
    clouds.mesh.geometry.instanceCount = Math.max(1, Math.round(cloudTotal * L.clouds));
    world.setDrawDistance(L.dist);
    stats.level = L.name; stats.pr = pr; stats.buf = `${renderer.domElement.width}x${renderer.domElement.height}`; stats.mpx = renderer.domElement.width * renderer.domElement.height / 1e6;
    if (prevTier !== lv) stats.log.push(`${(performance.now() / 1000).toFixed(1)}s ${prevTier < 0 ? 'start' : prevTier > lv ? 'down' : 'up'} -> ${L.name} (${stats.buf})`);
    if (stats.log.length > 8) stats.log.shift();
  }

  /* ---------- adaptive quality governor (render-only) ----------
     Frame times come from the render loop's own clock. After a level change it waits 1.2 s (shader compiles, resized
     targets), then judges 1.5 s windows by a trimmed mean (slowest 5% of frames dropped, so one hitch isn't a verdict).
     < 50 fps: step down (two steps under 32 fps), and that level becomes the ceiling. >= 58 fps for 8 s straight: step
     up one, never above the ceiling. Two steps in a row that buy nothing (e.g. a 30 Hz low-power cap or a CPU-bound
     machine) are undone and the governor stops. Still under 20 fps at the bottom for two windows: 2D fallback. */
  const sl = startLevel(renderer);
  const qp = params.get('q'), qlp = params.get('ql');
  const fixedLv = qlp != null && qlp !== '' && isFinite(+qlp) ? clamp(Math.round(+qlp), 0, TOP) : qp != null ? (+qp ? TOP : 1) : null;
  const qsp = params.get('qs'); // testing: governed, but start at level N
  if (qsp != null && isFinite(+qsp)) { sl.lv = clamp(Math.round(+qsp), 0, TOP); sl.why = '?qs'; }
  const gov = { lv: fixedLv ?? sl.lv, fixed: fixedLv != null, ceil: TOP, settle: 1.2, buf: [], acc: 0, good: 0, long: 0, noGain: 0, lastFps: 0, lastDir: 0, slowBottom: 0, stopped: false, fps: 0 };
  function govern(ms) {
    if (gov.fixed || ms <= 0) return;
    // A lone long frame (tab switch, shader compile) is not a sample; three in a row means the machine really is that slow.
    if (ms > 250) { if (++gov.long < 3) return; ms = Math.min(ms, 1000); } else gov.long = 0;
    if (gov.settle > 0) { gov.settle -= ms / 1000; return; }
    gov.buf.push(ms); gov.acc += ms; if (gov.acc < 1500) return;
    const sorted = gov.buf.slice().sort((x, y) => x - y), keep = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.95)));
    const fps = 1000 / (keep.reduce((x, y) => x + y, 0) / keep.length); gov.fps = fps; gov.buf.length = 0; gov.acc = 0;
    if (gov.lastDir < 0) { // did the last step down help?
      if (fps < gov.lastFps * 1.06) gov.noGain++; else gov.noGain = 0;
      if (gov.noGain >= 2 && !gov.stopped && fps >= 25) { gov.stopped = true; set(Math.min(gov.ceil, gov.lv + 2), 0); stats.log.push('no gain from lower levels: holding'); return; }
    }
    gov.lastDir = 0; gov.lastFps = fps;
    if (gov.lv === 0 && fps < 20) { if (++gov.slowBottom >= 2) dead = `under 20 fps at the lowest 3D level (${fps.toFixed(0)} fps)`; } else gov.slowBottom = 0;
    if (gov.stopped) return;
    if (fps < 50 && gov.lv > 0) { gov.ceil = Math.min(gov.ceil, gov.lv - 1); set(Math.max(0, gov.lv - (fps < 32 ? 2 : 1)), -1); gov.good = 0; }
    else if (fps >= 58) { gov.good += 1.5; if (gov.good >= 8 && gov.lv < gov.ceil) { set(gov.lv + 1, 1); gov.good = 0; } }
    else gov.good = 0;
  }
  function set(lv, dir) { gov.lv = lv; gov.lastDir = dir; gov.settle = 1.2; gov.buf.length = 0; gov.acc = 0; }

  /* ---------- camera ---------- */
  const cam = { x: 0, y: 2.4, offZ: -7, fov: 60, lookY: 1, init: false, frozenZ: null, lastPhase: '' };
  const tmpV = new THREE.Vector3();
  function updateCamera(s, view, G, dt, W, H) {
    const title = G.screen === 'title', sky = s.phase === 'sky' || (s.over && (s.reason === 'landed' || s.reason === 'air' || s.reason === 'botched') && s.phase !== 'road');
    const spd = s.phase === 'road' ? s.v : s.m;
    const spdK = clamp((spd - 36) / 74, 0, 1);
    let tx, ty, tz, lx, ly, lz, fov;
    const runUp = s.phase === 'road' ? smooth(C.ROAD_LEN - 170, C.ROAD_LEN - 30, s.z) : 0;
    if (title) {
      const a = 0.55 + Math.sin(G.t * 0.18) * 0.75, R = 7.4;
      tx = s.x + Math.sin(a) * R; ty = 1.55; tz = s.z - Math.cos(a) * R; lx = s.x; ly = 0.75; lz = s.z + 0.6; fov = 46;
    } else if (s.phase === 'fall') {
      tx = s.x; ty = s.y + 16; tz = s.z - 20; lx = s.x; ly = s.y; lz = s.z + 6; fov = 62;
    } else if (sky) {
      // Chase along the flight path: the camera swings with the climb/dive angle so the ground rushes up in a dive and
      // the sky opens up in a climb; it rides higher and looks further down the higher you are, and gets kicked back on boosts.
      const since = s.t - (s.launchT || 0), hold = 1 - smooth(0.3, 1.6, since), g = (s.gam || 0) * 0.65;
      const alt = clamp(S.agl(s) / 90, 0, 1), dive = clamp(-(s.gam || 0) / 0.8, 0, 1), skK = clamp((s.m - 60) / 110, 0, 1);
      const dist = 9.2 + skK * 2.2 + (G.camKick || 0) * 3.2 + hold * 5 + dive * 1.5, h = 2.4 + alt * 2.2 + hold * 2.5;
      tx = s.x * 0.85; ty = s.y - Math.sin(g) * dist + h * Math.cos(g); tz = s.z - Math.cos(g) * dist;
      lx = s.x; ly = s.y + Math.sin(s.gam || 0) * 22 + 0.4 - alt * 3.5 - hold * 1.5; lz = s.z + Math.cos(s.gam || 0) * 22;
      fov = 61 + skK * 9 + dive * 10 + (G.trickKick || 0) * -4 - (G.stabFx || 0) * 4;
    } else {
      // Straightaway chase: back and up far enough that rows of obstacles read well ahead (phase 3: ~+45% distance,
      // ~2x height, look point 21 m down the road, tilted down so the road ahead fills more of the screen), the car still big enough to read its lane. Blends into the run-up/ramp cam.
      tx = s.x * 0.55; ty = (s.y || 0) + 4.5 + runUp * 2.2 + spdK * 0.3; tz = s.z - 9.4 - spdK * 1.3 - runUp * 3; lx = s.x * 0.75; ly = (s.y || 0) + 0.1; lz = s.z + 21 - runUp * 3; fov = 55 + spdK * 9;
    }
    fov += (G.fovKick || 0) * 10 + (G.boostT || 0) * 4;
    ty -= (G.camDip || 0) * 1.2;
    const snap = !cam.init || Math.abs(cam.z - tz) > 60 || title !== cam.wasTitle;
    const sy0 = s.y || 0; // vertical offsets are tracked relative to the car so fast climbs / dives never outrun the camera
    if (snap) { cam.x = tx; cam.offY = ty - sy0; cam.offZ = tz - s.z; cam.fov = fov; cam.lx = lx; cam.lyo = ly - sy0; cam.lz = lz - s.z; cam.init = true; }
    cam.wasTitle = title;
    const ended = s.over && (s.reason === 'road' || s.reason === 'air' || s.reason === 'botched');
    cam.x = damp(cam.x, tx, title ? 3 : 5.5, dt); cam.offY = damp(cam.offY ?? (ty - sy0), ty - sy0, 4.5, dt); cam.y = sy0 + cam.offY;
    cam.offZ = damp(cam.offZ, tz - s.z, 6, dt);
    cam.lx = damp(cam.lx, lx, 8, dt); cam.lyo = damp(cam.lyo ?? (ly - sy0), ly - sy0, 6, dt); cam.ly = sy0 + cam.lyo; cam.lz = damp(cam.lz, lz - s.z, 6, dt);
    cam.fov = damp(cam.fov, fov, 5, dt);
    if (ended) { if (cam.frozenZ == null) { cam.frozenZ = s.z + cam.offZ; cam.frozenY = cam.y; } cam.y = cam.frozenY; } else cam.frozenZ = null;
    cam.z = cam.frozenZ ?? (s.z + cam.offZ);
    const buffet = sky && !s.over ? clamp((s.m - 70) / 100, 0, 1) * 0.05 * (1 + clamp(-(s.gam || 0), 0, 1) * 2) * (1 - (G.stabFx || 0)) : 0; // wind buffet at speed (thrusters settle it)
    const sh = (G.shake || 0) * 0.008 + buffet;
    camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, -cam.z);
    tmpV.set(cam.lx, cam.ly, -(s.z + cam.lz)); camera.lookAt(tmpV);
    if (sky) camera.rotateZ(-(s.bank || 0) * 0.07);
    // portrait: keep ~62° of horizontal view so all three lanes stay on screen
    const aspect = W / H, minH = 62 * Math.PI / 180, vFromH = 2 * Math.atan(Math.tan(minH / 2) / aspect) * 180 / Math.PI;
    camera.fov = Math.max(cam.fov, Math.min(100, vFromH)); camera.aspect = aspect; camera.updateProjectionMatrix();
  }

  /* ---------- per-frame ---------- */
  let carPrev = null; const carVel = { x: 0, y: 0, z: 0 };
  let lastT = null, cssW = 0, cssH = 0, emitAcc = 0, prevPhase = '';
  const proj = new THREE.Vector3();
  const stats = { frames: 0, cpuMs: 0, calls: 0, tris: 0, tier: 1, level: '', pr: 1, buf: '', mpx: 0, fps: 0, frameMs: 0, log: [], start: sl, fixed: gov.fixed, floatRT };
  let lastWall = 0, emaMs = 16.7;
  function render(s, view, G, W, H) {
    if (dead) { api.ready = false; fail(dead); return null; }
    const t0 = performance.now(); renderer.info.reset();
    if (lastWall) { const ms = t0 - lastWall; govern(ms); emaMs += (Math.min(ms, 1000) - emaMs) * 0.05; } lastWall = t0;
    stats.frameMs = emaMs; stats.fps = 1000 / emaMs; stats.gov = gov.fps ? Math.round(gov.fps) : null;
    const t = G.t, dt = lastT == null ? 1 / 60 : clamp(t - lastT, 0, 0.1); lastT = t;
    const cw = canvas.clientWidth || W, ch = canvas.clientHeight || H;
    if (cw !== cssW || ch !== cssH || gov.lv !== tier) { cssW = cw; cssH = ch; applyLevel(gov.lv, cw, ch); }
    const L = LEVELS[tier], q = L.post ? 1 : 0; G.q = tier >= 2 ? 1 : 0; api.post = !!composer;
    // car
    const onGround = s.phase === 'road' || (s.over && s.reason === 'road') || (s.over && s.reason === 'landed');
    car.group.position.set(s.x, (s.y || 0) + (onGround ? (view.bob || 0) : 0), -s.z);
    const pitch = s.phase === 'sky' ? clamp((s.gam || 0) + (s.pIn || 0) * 0.07, -1.1, 0.9) : s.phase === 'fall' ? -0.5 : (s.phase === 'road' && s.z > C.ROAD_LEN - C.RAMP_LEN ? 0.13 : 0);
    car.update({ spin: view.spin || 0, bank: s.bank || 0, roll: (view.roll || 0) * (s.trick > 0 || s.stabT > 0 ? 1 : 0.6), pitch, boost: Math.max(G.boostT || 0, 0), glow: G.boostT || 0 });
    // In the sky the car flies its path: nose follows the flight-path angle (plus a little angle of attack from the
    // stick), a barrel roll swings it round a helix around the line, a kickflip spins it in place.
    if (s.phase === 'sky' || (s.over && s.reason !== 'road' && s.phase === 'sky')) {
      if ((s.trick > 0 || s.stabT > 0) && s.trickKind === 'roll' && s.rot) { const a = s.rot, R = 1.3; car.group.position.x += Math.sin(a) * R * s.trickDir; car.group.position.y += (1 - Math.cos(a)) * R * 0.6; }
    }
    // Measured car velocity (world units / render second): includes slow-mo and hit-stop, so gas jets stay attached.
    { const P0 = car.group.position; if (carPrev && dt > 0) { carVel.x = clamp((P0.x - carPrev.x) / dt, -200, 200); carVel.y = clamp((P0.y - carPrev.y) / dt, -200, 200); carVel.z = clamp((P0.z - carPrev.z) / dt, -260, 260); } carPrev = { x: P0.x, y: P0.y, z: P0.z }; }
    const blob = car.group.children[1]; // contact shadow sticks to the ground under the car
    const gy = s.z > C.ROAD_LEN && s.z < C.ROAD_LEN + C.CANYON_W ? -C.CANYON_DEPTH : 0;
    blob.position.y = gy - (s.y || 0) + 0.03; blob.material.opacity = 0.75 * clamp(1 - ((s.y || 0) - gy) / 14, 0, 1);
    // sun + shadow camera follow the car
    sun.target.position.set(s.x, s.y || 0, -s.z - 10); sun.position.copy(sun.target.position).addScaledVector(world.sunDir, 140);
    sky.position.copy(camera.position);
    updateCamera(s, view, G, dt, W, H);
    if (api.debugCam) { const d = api.debugCam; camera.position.set(s.x + d.p[0], (s.y || 0) + d.p[1], -(s.z + d.p[2])); camera.lookAt(s.x + d.l[0], (s.y || 0) + d.l[1], -(s.z + d.l[2])); if (d.fov) { camera.fov = d.fov; camera.updateProjectionMatrix(); } }
    sky.position.copy(camera.position);
    updateDynamic(s, t); world.update(t, -camera.position.z);
    // dust: rear-wheel spray on the road, faster = more
    if (s.phase === 'road' && !s.over && G.screen !== 'end') {
      emitAcc += dt * (6 + s.v * 0.5) * L.fx;
      while (emitAcc > 1) { emitAcc -= 1; const sx = Math.random() < 0.5 ? -0.85 : 0.85;
        fx.emit({ x: s.x + sx, y: 0.1, z: -(s.z - 1.3), vx: sx * 1.4 + (s.bank || 0) * -4, vy: 0.5, vz: 1 + s.v * 0.08, jitter: 1.4, jitterY: 0.8, life: 0.7, s0: 0.2, s1: 1.1, color: pal.sandLight, alpha: 0.2, drag: 1.6, grav: -0.15 }); }
      if (G.boostT > 0.05) fx.emit({ x: s.x + (Math.random() - 0.5) * 1.5, y: 0.7, z: -(s.z - 2.2), vz: 6, jitter: 0.6, life: 0.35, s0: 0.25, s1: 0.05, color: level.pickups.air, hdr: 3, alpha: 0.9, drag: 0.5 }, 2);
    }
    // STABILIZE: white cold-gas jets from the car's four corners and both sides while the thrusters burn.
    if (s.phase === 'sky' && s.stabT > 0 && !s.over) thrusters(s, dt * L.fx);
    // Wind streaks stream past at airspeed (sky) or at high road speed; clouds and fog open up with altitude.
    const spdNow = s.phase === 'road' ? s.v : s.m, inSky = s.phase === 'sky' && !s.over;
    streaks.material.uniforms.travel.value += dt * spdNow * 0.9;
    streaks.material.uniforms.len.value = 1 + spdNow * 0.03;
    const amtT = inSky ? clamp((spdNow - 60) / 100, 0, 1) * 0.22 + (G.boostT || 0) * 0.3 + clamp(-(s.gam || 0), 0, 1) * 0.15 : 0;
    streaks.material.uniforms.amt.value = damp(streaks.material.uniforms.amt.value, amtT * (q ? 1 : 0.7), 6, dt);
    streaks.mesh.visible = streaks.material.uniforms.amt.value > 0.01;
    const alt = s.phase === 'sky' ? clamp(s.y / 200, 0, 1) : 0;
    scene.fog.near = level.time.fog.near * (1 + alt * 1.5); scene.fog.far = level.time.fog.far * (1 + alt * 1.2);
    fx.update(dt);
    fx.material.uniforms.scale.value = (ch * prNow) / (2 * Math.tan(camera.fov * Math.PI / 360));
    prevPhase = s.phase;
    // render
    try { if (composer) {
      grade.uniforms.time.value = t % 100; grade.uniforms.boost.value = clamp((G.boostT || 0) + (G.fovKick || 0) * 0.5, 0, 1.5); grade.uniforms.aspect.value = cw / ch;
      if (bloom) bloom.strength = 0.5 + (G.boostT || 0) * 0.35 + (G.machT || 0) * 0.6;
      composer.render(dt);
    } else renderer.render(scene, camera); } catch (e) { dead = 'render error: ' + (e && e.message || e); console.error(e); }
    if (renderer.getContext().isContextLost()) dead = 'WebGL context lost';
    // projection for the 2D HUD / particles / warnings
    const k0 = (H / 2) / Math.tan(camera.fov * Math.PI / 360);
    const p = (x, y, z) => {
      proj.set(x, y, -z).applyMatrix4(camera.matrixWorldInverse); const depth = -proj.z; if (depth < 0.5) return null;
      proj.applyMatrix4(camera.projectionMatrix); return { x: (proj.x + 1) / 2 * W, y: (1 - proj.y) / 2 * H, k: k0 / depth, dz: depth };
    };
    const cs = p(s.x, (s.y || 0) + 0.7, s.z); if (cs) view.carScreen = { x: cs.x, y: cs.y, k: cs.k * 1.6 };
    const hz = p(camera.position.x, camera.position.y, s.z + 3000);
    stats.frames++; stats.cpuMs += performance.now() - t0; stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles; stats.tier = tier; stats.particles = fx.count;
    return { p, hy: hz ? hz.y : H * 0.44, W, H };
  }
  const JETS = [[-1.0, 0.25, 1.9, -1, 0], [1.0, 0.25, 1.9, 1, 0], [-1.0, 0.25, -1.9, -1, 0], [1.0, 0.25, -1.9, 1, 0], [-1.05, 0.55, 0, -1, 0.6], [1.05, 0.55, 0, 1, 0.6], [-0.7, -0.15, 1.2, -0.4, -1], [0.7, -0.15, -1.2, 0.4, -1]];
  function thrusters(s, k) {
    const x = car.group.position.x, y = car.group.position.y, z = car.group.position.z, r = s.rot || 0, cr = Math.cos(r), sr = Math.sin(r);
    for (const [jx, jy, jz, dx, dy] of JETS) {
      if (Math.random() > 0.75 * k * 60) continue; // ~45 puffs/s per jet at 60 fps
      const ox = jx * cr - jy * sr, oy = jx * sr + jy * cr, vx = dx * cr - dy * sr, vy = dx * sr + dy * cr;
      fx.emit({ x: x + ox, y: y + 0.45 + oy, z: z - jz, vx: carVel.x + vx * 11, vy: carVel.y + vy * 11, vz: carVel.z * 0.96, jitter: 1.6, jitterY: 0.8, life: 0.26, s0: 0.14, s1: 0.75, color: '#ffffff', hdr: 1.5, alpha: 0.8, drag: 0.6 }, 2);
    }
  }
  function event(ev, s) {
    const x = s.x, y = s.y || 0, z = -s.z;
    if (ev.e === 'pad') fx.emit({ x, y: 0.2, z, jitter: 9, jitterY: 2, life: 0.5, s0: 0.5, s1: 0.1, color: level.pickups.pad, hdr: 3, drag: 3 }, 30);
    else if (ev.e === 'orb') fx.emit({ x, y: y + 1.2, z: z - 1, jitter: 6, jitterY: 3, life: 0.45, s0: 0.3, s1: 0.05, color: level.pickups.orb, hdr: 3, drag: 3 }, 14);
    else if (ev.e === 'air') fx.emit({ x, y: y + 1.2, z: z - 1, jitter: 7, jitterY: 4, life: 0.55, s0: 0.35, s1: 0.05, color: level.pickups.air, hdr: 3, drag: 3 }, 20);
    else if (ev.e === 'crash') { fx.emit({ x, y: y + 0.8, z, jitter: 14, jitterY: 8, life: 0.7, s0: 0.25, s1: 0.05, color: '#ffd23f', hdr: 4, drag: 1, grav: 12 }, 50); fx.emit({ x, y: y + 0.3, z, jitter: 6, jitterY: 3, life: 1.6, s0: 1.2, s1: 4, color: pal.sandLight, alpha: 0.5, drag: 1.2 }, 30); }
    else if (ev.e === 'launch') fx.emit({ x, y: y, z, jitter: 10, jitterY: 3, life: 1.2, s0: 0.8, s1: 3.5, color: pal.sandLight, alpha: 0.45, drag: 1.5 }, 40);
    else if (ev.e === 'land') for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; fx.emit({ x: x + Math.cos(a), y: 0.3, z: z + Math.sin(a), vx: Math.cos(a) * 12, vz: Math.sin(a) * 12, vy: 1.2, jitter: 2, life: 1.3, s0: 1, s1: 4, color: pal.sandLight, alpha: 0.5, drag: 1.6 }); }
    else if (ev.e === 'stab') { const { x: cx, y: cy, z: cz } = car.group.position;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; fx.emit({ x: cx + Math.cos(a) * 1.1, y: cy + 0.5 + Math.sin(a) * 0.5, z: cz, vx: carVel.x + Math.cos(a) * 10, vy: carVel.y + Math.sin(a) * 6, vz: carVel.z * 0.95, jitter: 2, life: 0.4, s0: 0.25, s1: 1.2, color: '#ffffff', hdr: 1.6, alpha: 0.75, drag: 0.8 }); } }
    else if (ev.e === 'boost' || ev.e === 'mach') fx.emit({ x, y: y + 0.6, z: z + 2.2, vz: 10, jitter: 5, jitterY: 3, life: 0.6, s0: 0.5, s1: 0.1, color: ev.e === 'mach' ? '#ffffff' : level.pickups.air, hdr: 3, drag: 2 }, ev.e === 'mach' ? 60 : 26);
  }
  const api = { ready: true, post: false, levels: LEVELS, gov, render, event, stats, level, renderer, scene, camera, car, debugCam: null, reset() { fx.clear(); cam.init = false; carPrev = null; } };
  window.CJRender3D = api;
}

if (params.get('r') === '2d') fail('forced by ?r=2d'); else try { init(); } catch (e) { console.error(e); fail(String(e && e.message || e)); }
