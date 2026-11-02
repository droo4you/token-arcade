/* Starbase (level 3) render-only pieces: the winding-road bend, the launch site (orbital launch mount, tower with
   chopsticks, Starship stack), the exhaust plume, the starfield fade with altitude and a far-off red Roadster.
   Everything here reads sim state (CJSim.rocketAt) and never feeds back into it. Sim coords map to three.js as
   (x, y, z) -> (x, y, -z). */
import * as THREE from '../../vendor/three/three.module.min.js';
import { clamp, smooth, canvasTex } from './util.js';

/* ---------- road bend (render-only) ----------
   The sim road is straight. Drawn, every vertex at sim z is shifted sideways by B(z): a sum of sines faded in after the
   start line and out well before the ramp, so the launch reads straight. The car, camera and HUD projection add the same
   B(z), so the car stays glued to its lane and nothing about steering or scoring changes. */
export function makeBend(level) {
  const b = level.bend; if (!b) return null;
  const n = b.amp.length, TAU = Math.PI * 2;
  const fade = z => smooth(b.fadeIn[0], b.fadeIn[1], z) * (1 - smooth(b.fadeOut[0], b.fadeOut[1], z));
  const raw = z => { let v = 0; for (let i = 0; i < n; i++) v += b.amp[i] * Math.sin(TAU * z / b.wave[i] + b.phase[i]); return v; };
  const B = z => fade(z) * raw(z);
  const slope = z => (B(z + 1) - B(z - 1)) / 2;
  const f = x => (+x).toFixed(4);
  const sm = (a, c, x) => `smoothstep(${f(a)}, ${f(c)}, ${x})`;
  let sum = '0.0'; for (let i = 0; i < n; i++) sum += ` + ${f(b.amp[i])} * sin(${f(TAU / b.wave[i])} * z + ${f(b.phase[i])})`;
  const glsl = `float cjBend(float z) { return ${sm(b.fadeIn[0], b.fadeIn[1], 'z')} * (1.0 - ${sm(b.fadeOut[0], b.fadeOut[1], 'z')}) * (${sum}); }\n`;
  return { B, slope, glsl };
}
const PROJECT = '#include <project_vertex>', WORLDPOS = '#include <worldpos_vertex>';
const projBent = `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 cjW = modelMatrix * mvPosition; cjW.x += cjBend(-cjW.z);
mvPosition = viewMatrix * cjW;
gl_Position = projectionMatrix * mvPosition;`;
/* Patch one built-in material so its vertices bend (chains any existing onBeforeCompile and keeps program keys unique). */
export function bendMaterial(m, bend) {
  if (!m || m.userData.cjBent || m.isShaderMaterial || m.isRawShaderMaterial) return;
  m.userData.cjBent = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  const baseKey = prevKey && prevKey !== THREE.Material.prototype.customProgramCacheKey ? prevKey.call(m) : (prev ? prev.toString() : '');
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.vertexShader = bend.glsl + sh.vertexShader.replace(PROJECT, projBent)
      .replace(WORLDPOS, WORLDPOS + '\n#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\n worldPosition.x += cjBend(-worldPosition.z);\n#endif');
  };
  m.customProgramCacheKey = () => baseKey + '|cjBend';
  m.needsUpdate = true;
}
/* Bend a whole scene: every built-in material, a bent depth material for every shadow caster, and the particle shader. */
export function bendScene(scene, bend, extraShaders = [], skip = null) {
  const skipSet = new Set(); if (skip) skip.traverse(o => skipSet.add(o)); // the car is placed on the bend directly
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); bendMaterial(depth, bend);
  scene.traverse(o => {
    if (skipSet.has(o)) return;
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) bendMaterial(m, bend);
    if (o.castShadow && (o.isMesh || o.isInstancedMesh)) o.customDepthMaterial = depth;
  });
  for (const m of extraShaders) { // ShaderMaterials written as modelViewMatrix * vec4(position, 1.0)
    m.vertexShader = bend.glsl + m.vertexShader.replace('vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);', 'vec4 cjW = modelMatrix * vec4(position, 1.0); cjW.x += cjBend(-cjW.z); vec4 mvPosition = viewMatrix * cjW;');
    m.needsUpdate = true;
  }
  return depth;
}

/* ---------- launch site ---------- */
const steel = () => new THREE.MeshStandardMaterial({ color: '#c9cdd4', metalness: 0.85, roughness: 0.32, envMapIntensity: 1.3 });
function stack(R) {
  const g = new THREE.Group(), st = steel(), dark = new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: 0.4, roughness: 0.6 });
  const r = R.r, hB = R.h * 0.59, hS = R.h - hB;
  // Super Heavy booster: steel barrel with a soot band low down, ring stiffeners, grid fins up top
  const boost = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hB, 32, 1), st); boost.position.y = hB / 2; g.add(boost);
  const soot = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.005, r * 1.01, hB * 0.22, 32, 1, true), dark); soot.position.y = hB * 0.11; g.add(soot);
  for (let k = 1; k < 9; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.004, 0.08, 4, 32), st); ring.rotation.x = Math.PI / 2; ring.position.y = k * hB / 9; g.add(ring); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, fin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, 0.3), dark); fin.position.set(Math.cos(a) * (r + 1.5), hB - 3, Math.sin(a) * (r + 1.5)); fin.rotation.y = -a + Math.PI / 2; g.add(fin); }
  // Starship: barrel, ogive nose, forward + aft flaps
  const ship = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hS * 0.7, 32, 1), st); ship.position.y = hB + hS * 0.35; g.add(ship);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), st); nose.scale.y = (hS * 0.3) / r; nose.position.y = hB + hS * 0.7; g.add(nose);
  for (const [y, w, h] of [[hB + hS * 0.12, 4.2, 9], [hB + hS * 0.78, 2.6, 6]]) for (const sx of [-1, 1]) { const flap = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.35), dark); flap.position.set(sx * (r + w / 2 - 0.3), y, 0); g.add(flap); }
  // engine bells (seen from below during the climb)
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 1.6, 12, 1, true), dark); for (let k = 0; k < 13; k++) { const a = k / 13 * Math.PI * 2, rr = k < 3 ? 1.1 : r * 0.7; const m = bell.clone(); m.position.set(Math.cos(a) * rr, -0.8, Math.sin(a) * rr); g.add(m); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function tower(R, mountY) {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: '#3a3c42', metalness: 0.6, roughness: 0.55 }), T = R.tower;
  const H = T.h, w = T.r * 2;
  // lattice look: 4 corner legs + cross braces every 9 m
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), dark); leg.position.set(sx * (w / 2 - 0.45), H / 2, sz * (w / 2 - 0.45)); g.add(leg); }
  for (let y = 4; y < H; y += 9) for (const [rx, ry, len] of [[0, 0, w], [0, Math.PI / 2, w]]) { const br = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.4), dark); br.position.y = y; br.rotation.y = ry; for (const sz of [-1, 1]) { const b2 = br.clone(); if (ry) b2.position.x = sz * (w / 2 - 0.45); else b2.position.z = sz * (w / 2 - 0.45); g.add(b2); } }
  // chopsticks reaching toward the stack + the quick-disconnect arm
  for (const dz of [-3, 3]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(T.x - R.r - 1, 1.6, 1.2), dark); arm.position.set(-(T.x - R.r - 1) / 2, H * 0.62, dz); g.add(arm); }
  const qd = new THREE.Mesh(new THREE.BoxGeometry(T.x - R.r - 0.5, 1.2, 1.2), dark); qd.position.set(-(T.x - R.r - 0.5) / 2, H * 0.78, 0); g.add(qd);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3030').multiplyScalar(3) })); lamp.position.y = H + 0.8; g.add(lamp);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(T.x, mountY, 0);
  return g;
}
function mount(R, depth) {
  const g = new THREE.Group(), conc = new THREE.MeshStandardMaterial({ color: '#8a8780', roughness: 0.9 }), st = steel();
  const top = R.base, floor = -depth - 2, h = top - floor;
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, leg = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 2.4), conc); leg.position.set(Math.cos(a) * (R.r + 5), floor + h / 2, Math.sin(a) * (R.r + 5)); g.add(leg); }
  const table = new THREE.Mesh(new THREE.TorusGeometry(R.r + 4, 1.6, 8, 32), st); table.rotation.x = Math.PI / 2; table.position.y = top - 1; g.add(table);
  // the island the site sits on (beach-coloured pad over the shallows) and the tower's footing
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(70, 80, 4, 40), new THREE.MeshStandardMaterial({ color: '#cdb48c', roughness: 1 })); pad.position.y = -depth + 1; g.add(pad);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), conc); deck.position.y = -depth + 3.5; g.add(deck);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(R.tower.r * 2 + 2, h, R.tower.r * 2 + 2), conc); foot.position.set(R.tower.x, floor + h / 2, 0); g.add(foot);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function roadster() {
  const g = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: '#c8102e', metalness: 0.5, roughness: 0.3, emissive: '#400008', emissiveIntensity: 0.6 }), blk = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }), wht = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5, emissive: '#555', emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), red); body.position.y = 0.55; g.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 1.4), red); hood.position.set(0, 0.85, -1.2); g.add(hood);
  for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14), blk); w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); }
  // Starman: suit, helmet, arm on the door
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.35), wht); torso.position.set(-0.4, 1.2, 0.3); g.add(torso);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), wht); helm.position.set(-0.4, 1.72, 0.3); g.add(helm);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), wht); arm.position.set(-0.85, 1.05, 0.3); g.add(arm);
  return g;
}
export function buildStarbase(level, S, scene) {
  const C = S.C, R = level.air.rocket, T = level.time.space || { y0: 160, y1: 520 };
  const site = new THREE.Group(); site.position.set(R.x, 0, -(C.ROAD_LEN + R.z)); scene.add(site);
  site.add(mount(R, C.CANYON_DEPTH)); site.add(tower(R, R.base));
  const ship = stack(R); site.add(ship);
  // plume: an outer glowing cone (additive, soft vertical fade) + a hot core, both scaled to the sim's plume each frame
  const fadeTex = canvasTex(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const cone = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true); cone.translate(0, -0.5, 0); // top at y=0, hangs down
  const outerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3a').multiplyScalar(1.4), alphaMap: fadeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0c0').multiplyScalar(3), alphaMap: fadeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const PL = R.plume.len, pc = new THREE.CylinderGeometry(R.plume.r0, R.plume.r0 + R.plume.spread * PL, PL, 32, 8, true); pc.translate(0, -PL / 2, 0); // exactly the sim's cone at full length
  const outer = new THREE.Mesh(pc, outerMat), core = new THREE.Mesh(cone, coreMat); outer.renderOrder = core.renderOrder = 6; outer.frustumCulled = core.frustumCulled = false;
  site.add(outer, core);
  const star = roadster(); star.scale.setScalar(12); scene.add(star);
  let rk = null;
  return {
    update(s, t, fx, camY, sky, fog, L) {
      rk = S.rocketAt(s);
      ship.position.set(0, rk.yB, 0);
      const lit = rk.lit && rk.plume > 0, flick = 0.9 + Math.sin(t * 37) * 0.05 + Math.sin(t * 61) * 0.05;
      outer.visible = core.visible = lit;
      if (lit) {
        const len = rk.plume; outer.position.set(0, rk.yB, 0); outer.scale.set(1, len / PL, 1); // early on the cone is shorter (y only)
        core.position.set(0, rk.yB, 0); core.scale.set(R.plume.r0 * 0.55 * flick, Math.min(len, 45) * flick, R.plume.r0 * 0.55 * flick);
        outerMat.opacity = 0.55; coreMat.opacity = 0.9;
        // billowing exhaust clouds at the pad and along the plume (quality-gated)
        if (fx && L.fx > 0.2) {
          const base = -C.CANYON_DEPTH + 4, nearPad = rk.yB - base < len;
          if (nearPad && Math.random() < 0.9 * L.fx) for (let k = 0; k < 2; k++) { const a = Math.random() * 6.283; fx.emit({ x: R.x + Math.cos(a) * 20, y: base + Math.random() * 6, z: -(C.ROAD_LEN + R.z) + Math.sin(a) * 20, vx: Math.cos(a) * 22, vy: 3 + Math.random() * 4, vz: Math.sin(a) * 22, jitter: 6, jitterY: 3, life: 3.2, s0: 8, s1: 26, color: '#e8dcd0', alpha: 0.35, drag: 0.6, grav: -0.5 }); }
          if (Math.random() < 0.7 * L.fx) fx.emit({ x: R.x, y: rk.yB - 2, z: -(C.ROAD_LEN + R.z), vy: -40, jitter: 2, life: 0.6, s0: 3, s1: 9, color: '#ffc080', hdr: 2.5, alpha: 0.6, drag: 0.4 });
        }
      }
      // starfield + deep-blue zenith fade in with altitude
      const k = smooth(T.y0, T.y1, camY);
      sky.material.uniforms.night.value = k * 0.9; sky.material.uniforms.starAmt.value = (level.time.sky.stars || 0) + k * 1.4;
      fog.near = Math.max(fog.near, level.time.fog.near * (1 + k * 6)); fog.far = Math.max(fog.far, level.time.fog.far * (1 + k * 4));
      // the Roadster: far ahead and high, drifting with the car (so it hangs in the sky like a landmark) and slowly tumbling
      star.visible = s.phase === 'sky' || s.over;
      star.position.set(-140, Math.max(260, (s.y || 0) + 200), -((s.z || 0) + 1100)); star.rotation.set(0.35, t * 0.12, Math.sin(t * 0.2) * 0.3);
    },
  };
}
