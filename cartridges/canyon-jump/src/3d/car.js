/* The roadster, built procedurally: a lofted superellipse body with fender crowns and cut wheel arches,
   a dark glass canopy, full-width emissive taillight, lathe-turned tires with tread, aero rims.
   Generic sleek two-seat EV roadster silhouette; no logos, no trademarked shapes. Local frame: nose
   toward -Z, tail toward +Z (the chase cam sits at +Z), ground at y = 0, units are meters. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { TAU, clamp, smooth, canvasTex, merge, xf } from './util.js';

const L = 4.2, Z0 = -L / 2;               // length; nose z
const AXLE_U = [0.2, 0.79], WHEEL_R = 0.34, AXLE_Y = 0.34, ARCH_R = 0.395, TIRE_W = 0.28;

/* Piecewise-linear keys sampled on a fine grid, then box-smoothed: smooth curves without overshoot. */
function profile(keys, n = 200, passes = 6) {
  const out = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const u = i / n; let k = 0; while (k < keys.length - 2 && keys[k + 1][0] < u) k++;
    const [u0, v0] = keys[k], [u1, v1] = keys[k + 1], t = clamp((u - u0) / (u1 - u0), 0, 1); out[i] = v0 + (v1 - v0) * t;
  }
  for (let p = 0; p < passes; p++) for (let i = 1; i < n; i++) out[i] = (out[i - 1] + out[i] * 2 + out[i + 1]) / 4;
  return u => { const f = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)); return out[i] + (out[i + 1] - out[i]) * (f - i); };
}
const bump = (u, c, w) => { const d = (u - c) / w; return Math.exp(-d * d); };

/* Loft rings of a superellipse along z. sec(u) -> {cy, hh, hw, n, tumble, crown}. Ends are rounded by
   shrinking extra rings to a point. Returns an indexed BufferGeometry with a per-vertex "dark" flag in color. */
function loft(sec, u0, u1, rings, around, opts = {}) {
  const pos = [], colr = [], idx = [];
  const us = []; for (let i = 0; i <= rings; i++) us.push(u0 + (u1 - u0) * i / rings);
  const capRings = (u, dir) => [0.86, 0.6, 0.3, 0.02].map((k, j) => ({ u, k, dz: dir * (0.018 + j * 0.016) * (opts.capScale || 1) }));
  const list = [...capRings(u0, -1).reverse(), ...us.map(u => ({ u, k: 1, dz: 0 })), ...capRings(u1, 1)];
  for (const { u, k, dz } of list) {
    const s = sec(u), z = Z0 + u * L + dz;
    for (let j = 0; j < around; j++) {
      const th = (j / around) * TAU, c = Math.cos(th), sn = Math.sin(th), e = 2 / s.n;
      let x = s.hw * Math.sign(c) * Math.pow(Math.abs(c), e), yo = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      x *= (1 - (s.tumble || 0) * Math.max(0, yo)) * (1 - (s.tuck || 0) * Math.pow(Math.max(0, -yo), 2));
      let y = s.cy + s.hh * yo;
      if (yo > 0 && s.crown) y += s.crown * Math.pow(Math.abs(x) / s.hw, 1.5) * yo; // fenders stand proud of the hood
      x *= k; y = s.cy + (y - s.cy) * k;
      let dark = y < (opts.trimY ?? -1) ? 1 : 0;
      if (opts.arches) for (const au of AXLE_U) {
        const az = Z0 + au * L, d = z - az;
        if (Math.abs(d) < ARCH_R && Math.abs(x) > s.hw * k - 0.31) { const ay = AXLE_Y + Math.sqrt(ARCH_R * ARCH_R - d * d); if (y < ay) { y = ay; } }
      }
      pos.push(x, y, z); colr.push(dark ? 0.05 : 1, dark ? 0.05 : 1, dark ? 0.06 : 1);
    }
  }
  const R = list.length;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < around; j++) {
    const a = i * around + j, b = i * around + (j + 1) % around, c = a + around, d = b + around;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function bodyGeometry() {
  // Low wedge: a long, gently rising hood, the cab set well back, high rounded rear haunches and a tail that rolls
  // under in plan and profile (a two-seat EV roadster stance; generic, no trademarked surfaces).
  const top = profile([[0, 0.3], [0.04, 0.41], [0.12, 0.52], [0.25, 0.6], [0.36, 0.66], [0.5, 0.75], [0.64, 0.835], [0.76, 0.87], [0.86, 0.855], [0.94, 0.79], [0.985, 0.67], [1, 0.56]]);
  const bot = profile([[0, 0.22], [0.06, 0.16], [0.5, 0.14], [0.9, 0.17], [0.97, 0.25], [1, 0.36]]);
  const hw = profile([[0, 0.55], [0.04, 0.8], [0.12, 0.93], [0.22, 0.975], [0.38, 0.9], [0.5, 0.885], [0.66, 0.98], [0.78, 1.03], [0.88, 1.0], [0.96, 0.9], [1, 0.72]]);
  const sec = u => {
    const t = top(u), b = bot(u);
    return { cy: (t + b) / 2, hh: (t - b) / 2, hw: hw(u), n: 3.2, tumble: 0.16, tuck: 0.1, crown: 0.11 * bump(u, 0.2, 0.1) + 0.12 * bump(u, 0.79, 0.12) - 0.02 * bump(u, 0.5, 0.12) };
  };
  return loft(sec, 0, 1, 150, 72, { arches: true, trimY: 0.26 });
}
function canopyGeometry() {
  const top = profile([[0, 0.66], [0.1, 0.82], [0.3, 1.02], [0.48, 1.075], [0.65, 1.03], [0.82, 0.93], [1, 0.84]], 120, 5);
  const hw = profile([[0, 0.5], [0.25, 0.72], [0.5, 0.745], [0.8, 0.64], [1, 0.45]], 120, 5);
  const sec = u => { const t = top(u), b = 0.6; return { cy: (t + b) / 2, hh: (t - b) / 2, hw: hw(u), n: 2.4, tumble: 0.36 }; };
  const U0 = 0.35, U1 = 0.83, span = U1 - U0; // canopy spans body u 0.35..0.83 (cab set back, long hood)
  const g = loft(v => sec(v), 0, 1, 70, 64, { capScale: 0.6 });
  g.scale(1, 1, span);
  g.translate(0, 0, -Z0 * span + Z0 + U0 * L);
  g.deleteAttribute('color');
  return g;
}

function tireGeometry() {
  const w = TIRE_W / 2, R = WHEEL_R;
  const pts = [[0.22, -w], [0.29, -w - 0.004], [R - 0.02, -w + 0.012], [R - 0.004, -w * 0.62], [R, 0], [R - 0.004, w * 0.62], [R - 0.02, w - 0.012], [0.29, w + 0.004], [0.22, w]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(Math.PI / 2); // axle along x
  return g;
}
function rimGeometry() {
  const parts = [];
  parts.push(xf(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 24), { rz: Math.PI / 2 }));        // center disc
  parts.push(xf(new THREE.TorusGeometry(0.228, 0.014, 6, 32), { ry: Math.PI / 2 }));                 // lip
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    parts.push(xf(new THREE.BoxGeometry(0.03, 0.2, 0.055), { x: 0.022, y: Math.cos(a) * 0.115, z: Math.sin(a) * 0.115, rx: a }));
  }
  parts.push(xf(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), { x: 0.02, rz: Math.PI / 2 }));    // hub
  parts.forEach(p => { p.deleteAttribute('uv'); });
  return merge(parts.map(p => p.index ? p.toNonIndexed() : p));
}

/* Neutral studio environment for the paint only: the scene's sunset sky env made the white body reflect purple and
   orange everywhere, so it read pink / brown. Reflections now come from a white softbox sky over a grey floor. */
function studioEnv(renderer) {
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: {},
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vD; void main(){ float h = vD.y; vec3 c = mix(vec3(0.42,0.42,0.44), vec3(0.92,0.93,0.95), smoothstep(-0.25, 0.1, h)); c = mix(c, vec3(1.35,1.35,1.38), smoothstep(0.35, 0.9, h)); c += vec3(1.2) * smoothstep(0.97, 0.995, abs(vD.x)) * step(0.0, h); gl_FragColor = vec4(c, 1.0); }' })));
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.02); pm.dispose(); return rt.texture;
}

export function buildCar(level, { lowQ = false, renderer = null } = {}) {
  const group = new THREE.Group(); group.name = 'roadster';
  const tilt = new THREE.Group(); group.add(tilt); // banking / pitch / kickflip live here, wheels included
  // Pearl white: neutral base, no iridescence (it tinted pink at sunset), a clearcoat over a satin base, studio
  // reflections, and a soft camera-side fill so the tail and flanks stay white when the low sun is in front of you.
  const paint = new THREE.MeshPhysicalMaterial({
    color: level.car.paint, vertexColors: true, metalness: 0.0, roughness: 0.26,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.95, sheen: 0.25, sheenColor: new THREE.Color('#eef3ff'), sheenRoughness: 0.5,
  });
  if (renderer) paint.envMap = studioEnv(renderer);
  const fill = { value: new THREE.Color(level.car.fill || '#3d3f44') };
  paint.onBeforeCompile = sh => {
    sh.uniforms.paintFill = fill;
    sh.fragmentShader = 'uniform vec3 paintFill;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += paintFill * vColor * (0.45 + 0.55 * max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0));');
  };
  const glass = new THREE.MeshPhysicalMaterial({ color: '#020306', metalness: 0.0, roughness: 0.02, envMapIntensity: 0.75, specularIntensity: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: '#121216', metalness: 0.4, roughness: 0.35, envMapIntensity: 1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#2a0006', emissive: '#ff1f35', emissiveIntensity: 5.5, roughness: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#dfe8ff', emissive: '#e8f0ff', emissiveIntensity: 2.2, roughness: 0.2 });

  const body = new THREE.Mesh(bodyGeometry(), paint); body.castShadow = true; tilt.add(body);
  const canopy = new THREE.Mesh(canopyGeometry(), glass); canopy.castShadow = true; tilt.add(canopy);
  // rear fascia, light bar, diffuser
  const tailZ = Z0 + L;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.04), trim); fascia.position.set(0, 0.6, tailZ + 0.015); tilt.add(fascia);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.04, 0.03), tailMat); bar.position.set(0, 0.615, tailZ + 0.04); tilt.add(bar);
  for (const sx of [-1, 1]) { const end = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.035), tailMat); end.position.set(sx * 0.6, 0.615, tailZ + 0.02); end.rotation.y = sx * 0.5; tilt.add(end); }
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.13, 0.32), trim); diff.position.set(0, 0.25, tailZ - 0.12); tilt.add(diff);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.05), headMat); hl.position.set(sx * 0.5, 0.53, Z0 + 0.16); hl.rotation.y = sx * 0.42; hl.rotation.z = -sx * 0.08; tilt.add(hl);
  }
  // wheels
  const tread = canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0c0c0d'; for (let i = 0; i < w; i += 8) { g.fillRect(i, 4, 3, h - 8); }
    g.fillStyle = '#29292c'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  }, { srgb: true, aniso: 4 });
  tread.wrapS = THREE.RepeatWrapping;
  const tireMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tread, roughness: 0.82, metalness: 0 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#d4d8de', metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: '#d4183a', roughness: 0.4, metalness: 0.2 });
  const tireGeo = tireGeometry(), rimGeo = rimGeometry();
  const wheels = [];
  const hwAt = [0.99, 1.02];
  AXLE_U.forEach((u, ai) => {
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * (hwAt[ai] - TIRE_W / 2 - 0.02), AXLE_Y, Z0 + u * L);
      const spin = new THREE.Group(); pivot.add(spin);
      const tire = new THREE.Mesh(tireGeo, tireMat); tire.castShadow = true; spin.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat); rim.scale.x = sx; rim.position.x = sx * (TIRE_W / 2 - 0.035); spin.add(rim);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.16), caliperMat); cal.position.set(sx * 0.06, 0.1, ai ? -0.1 : 0.1); pivot.add(cal);
      tilt.add(pivot); wheels.push(spin);
    }
  });
  // floor pan so the arches never show daylight through the car
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, L * 0.86), trim); floor.position.set(0, 0.2, 0.05); tilt.add(floor);

  // contact shadow (also the only shadow in the low tier)
  const blobTex = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, h / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, 1); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore();
  }, { srgb: false, aniso: 1 });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 5.2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; blob.renderOrder = 1; group.add(blob);

  // boost light trails off the taillight ends (additive, scaled by boost)
  const trailTex = canvasTex(32, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h); }, { srgb: false, aniso: 1 });
  const trailMat = new THREE.MeshBasicMaterial({ map: trailTex, color: new THREE.Color('#4ff0ff').multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const trails = [];
  for (const sx of [-1, 1]) {
    const tr = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1).translate(0, -0.5, 0), trailMat);
    tr.rotation.x = -Math.PI / 2; tr.position.set(sx * 0.76, 0.7, tailZ + 0.08); tilt.add(tr); trails.push(tr);
  }

  return {
    group, tilt, wheels, trails, trailMat, tailMat, paint,
    update({ spin, bank, roll, pitch, boost, glow }) {
      for (const w of wheels) w.rotation.x = -spin;
      tilt.rotation.set(pitch, -bank * 0.11, roll, 'YXZ');
      tilt.position.y = 0;
      const b = clamp(boost, 0, 1);
      trailMat.opacity = b * 0.7; for (const t of trails) { t.scale.y = 0.2 + b * 3.5; t.visible = b > 0.01; }
      tailMat.emissiveIntensity = 5.5 + (glow || 0) * 4;
    },
  };
}
export const CAR = { L, AXLE_U, WHEEL_R, AXLE_Y, Z0, smooth };
