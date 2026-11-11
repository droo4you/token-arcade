/* Powderline art direction B. Visual only: the sim stays the authority.
   Painterly golden-hour toon. No bloom, no shadow maps, no emissive lights.
   Phones take the low path: pixel ratio <= 1.5, fewer puffs and flakes, shorter draw. */
import * as THREE from '../vendor/three.module.js';
import { buildRider, poseRider } from './rider.js';

const SLOPE = 0.3;
const SIN = Math.sin(SLOPE);
const COS = Math.cos(SLOPE);
const CHUNK = 48;
const SUN = new THREE.Vector3(-0.536, 0.276, 0.797).normalize();

const slopeBasis = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, COS, SIN),
  new THREE.Vector3(0, -SIN, COS),
);
const slopeQuat = new THREE.Quaternion().setFromRotationMatrix(slopeBasis);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function slopeToWorld(x, y, z, out) {
  return out.set(x, y * COS - z * SIN, z * COS + y * SIN);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function damp(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * Math.max(0, dt))); }
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(geo, hex, shade = 0, jitter = 0, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  const sh = new Float32Array(n);
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (jitter ? (rnd() - 0.5) * jitter : 0);
    for (let v = 0; v < 3 && i + v < n; v++) {
      const j = i + v;
      arr[j * 3] = c.r * k;
      arr[j * 3 + 1] = c.g * k;
      arr[j * 3 + 2] = c.b * k;
      sh[j] = shade;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('shade', new THREE.BufferAttribute(sh, 1));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

function mergeParts(parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const sh = new Float32Array(n);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    sh.set(g.attributes.shade.array, o);
    o += c;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('shade', new THREE.BufferAttribute(sh, 1));
  return geo;
}

function bakeSlope(geo, px, py, pz) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    slopeToWorld(px + p.getX(i), py + p.getY(i), pz + p.getZ(i), tmp);
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  return geo;
}

function rampTexture() {
  const bands = [[0, 5, '#1a3c86'], [5, 10, '#6d86b0'], [10, 16, '#e4cbb6'], [16, 23, '#f4ddc6'], [23, 28, '#fff1e2'], [28, 32, '#ffd7a4']];
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 4;
  const g = canvas.getContext('2d');
  for (const [a, b, hex] of bands) {
    g.fillStyle = hex;
    g.fillRect(a, 0, b - a, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return tex;
}

const TOON_VERT = /* glsl */`
  attribute vec3 color;
  attribute float shade;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vShade;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vColor = color;
    vShade = shade;
    vec3 transformed = position;
    #ifdef USE_INSTANCING
      transformed = (instanceMatrix * vec4(position, 1.0)).xyz;
    #endif
    vec4 world = modelMatrix * vec4(transformed, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const TOON_FRAG = /* glsl */`
  uniform vec3 sunDir;
  uniform sampler2D rampTex;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vShade;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, sunDir);
    float sunAmt = smoothstep(-0.05, 0.72, ndl);
    float bounce = clamp(dot(n, normalize(vec3(0.15, 0.35, -1.0))) * 0.5 + 0.55, 0.0, 1.0);
    float u = mix(0.46, 1.0, sunAmt);
    u = max(u, bounce * 0.58);
    u *= mix(1.0, 0.05, clamp(vShade, 0.0, 1.0));
    vec3 ramp = texture2D(rampTex, vec2(clamp(u, 0.02, 0.98), 0.5)).rgb;
    float rim = smoothstep(0.55, 0.86, 1.0 - max(dot(n, normalize(cameraPosition - vWorld)), 0.0));
    vec3 col = ramp * vColor + vec3(1.0, 0.9, 0.78) * rim * 0.07;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function createToon(rampTex) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { sunDir: { value: SUN.clone() }, rampTex: { value: rampTex } },
    ]),
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    extensions: { derivatives: true },
    fog: true,
  });
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color('#2f5f9e') },
      mid: { value: new THREE.Color('#7aa3cf') },
      horizon: { value: new THREE.Color('#f2d9bd') },
      below: { value: new THREE.Color('#9fb3c6') },
      sunDir: { value: SUN.clone() },
      sunColor: { value: new THREE.Color('#fff4e2') },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 zenith, mid, horizon, below, sunDir, sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.14, h));
        c = mix(c, zenith, smoothstep(0.06, 0.38, h));
        c = mix(c, below, smoothstep(0.0, -0.08, h));
        c = mix(c, horizon, exp(-abs(h) * 11.0) * 0.18);
        float sd = max(dot(d, sunDir), 0.0);
        c += sunColor * pow(sd, 56.0) * 0.12;
        c = mix(c, min(sunColor, vec3(1.0)), smoothstep(0.9996, 0.99986, sd));
        gl_FragColor = vec4(min(c, vec3(1.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function buildRidges() {
  const specs = [
    { ahead: 120, parallax: 0.55, width: 220, height: 34, seed: 3, color: '#6e86a8', fog: true, down: 10 },
    { ahead: 210, parallax: 0.28, width: 320, height: 52, seed: 9, color: '#93abC4', fog: true, down: 14 },
    { ahead: 340, parallax: 0.1, width: 460, height: 78, seed: 15, color: '#c5d4e4', fog: true, down: 18, saddle: true },
  ];
  return specs.map((spec) => {
    const n = 28;
    const rnd = mulberry(spec.seed);
    const pos = [];
    const col = [];
    const base = new THREE.Color(spec.color);
    const warm = base.clone().lerp(new THREE.Color('#ffd7a4'), spec.saddle ? 0.35 : 0.12);
    const cool = base.clone().lerp(new THREE.Color('#1a2744'), 0.35);
    const xs = [];
    const hs = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = (u - 0.5) * spec.width;
      let h = spec.height * (0.28 + 0.72 * Math.pow(Math.abs(Math.sin(i * 1.31 + spec.seed)), 1.15));
      h += rnd() * spec.height * 0.12;
      if (spec.saddle) {
        const notch = Math.exp(-Math.pow((x + 18) / 26, 2));
        h *= 1 - notch * 0.72;
      }
      xs.push(x);
      hs.push(h);
    }
    const push = (x, y, color) => { pos.push(x, y, 0); col.push(color.r, color.g, color.b); };
    for (let i = 0; i < n; i++) {
      const lit = i % 2 === 0 ? warm : cool;
      const shade = lit.clone().lerp(cool, 0.45);
      push(xs[i], -spec.down, shade);
      push(xs[i], hs[i], lit);
      push(xs[i + 1], hs[i + 1], lit);
      push(xs[i], -spec.down, shade);
      push(xs[i + 1], hs[i + 1], lit);
      push(xs[i + 1], -spec.down, shade);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: spec.fog });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.spec = spec;
    return mesh;
  });
}

let PINE = null;
function pineTemplate() {
  if (PINE) return PINE;
  const parts = [];
  const trunk = paint(new THREE.CylinderGeometry(0.09, 0.2, 1.05, 5), '#3a2a22', 0.15, 0.08, 3);
  trunk.translate(0, 0.45, 0);
  parts.push(trunk);
  const tiers = [
    { y: 0.55, r: 1.7, h: 1.7, c: '#1e3a33' },
    { y: 1.65, r: 1.25, h: 1.45, c: '#244840' },
    { y: 2.55, r: 0.78, h: 1.25, c: '#2c5648' },
  ];
  tiers.forEach((t, i) => {
    const cone = paint(new THREE.ConeGeometry(t.r, t.h, 6), t.c, 0.02, 0.08, 11 + i);
    cone.translate(0, t.y + t.h / 2, 0);
    parts.push(cone);
    const cap = paint(new THREE.ConeGeometry(t.r * 0.78, 0.48, 6), '#e9eef3', 0.0, 0.02, 21 + i);
    cap.translate(0, t.y + t.h * 0.72, 0);
    parts.push(cap);
  });
  PINE = mergeParts(parts);
  return PINE;
}

function placePine(x, z, scale, rot) {
  const g = pineTemplate().clone();
  g.scale(scale, scale, scale);
  g.rotateY(rot);
  return bakeSlope(g, x, 0, z);
}

function placeRock(x, z, scale, rot, seed) {
  const g = paint(new THREE.DodecahedronGeometry(0.72, 0), '#8d7564', 0.18, 0.16, seed);
  const p = g.attributes.position;
  const c = g.attributes.color;
  const snow = new THREE.Color('#f4f7fb');
  let maxY = -99;
  for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > maxY * 0.28) c.setXYZ(i, snow.r, snow.g, snow.b);
  }
  g.scale(scale * 1.15, scale * 0.72, scale);
  g.rotateY(rot);
  return bakeSlope(g, x, 0.15 * scale, z);
}

function rampGeometry(width) {
  const w = Math.max(1.15, width / 2);
  const L = 6.6;
  const H = 1.22;
  const N = 7;
  const pos = [];
  const col = [];
  const sh = [];
  const top = new THREE.Color('#f4efe4');
  const sideL = new THREE.Color('#cbbba6');
  const sideR = new THREE.Color('#fff6ea');
  const lip = new THREE.Color('#8d3f2c');
  const tri = (a, b, c, color, shade) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      col.push(color.r, color.g, color.b);
      sh.push(shade);
    }
  };
  for (let i = 0; i < N; i++) {
    const t0 = i / N;
    const t1 = (i + 1) / N;
    const z0 = -L * (1 - t0);
    const z1 = -L * (1 - t1);
    const y0 = H * Math.pow(t0, 1.28);
    const y1 = H * Math.pow(t1, 1.28);
    tri([-w, y0, z0], [w, y0, z0], [w, y1, z1], top, i > N - 3 ? 0.02 : 0.12);
    tri([-w, y0, z0], [w, y1, z1], [-w, y1, z1], top, i > N - 3 ? 0.02 : 0.12);
    tri([-w, 0, z0], [-w, y0, z0], [-w, y1, z1], sideL, 0.62);
    tri([-w, 0, z0], [-w, y1, z1], [-w, 0, z1], sideL, 0.62);
    tri([w, 0, z0], [w, y1, z1], [w, y0, z0], sideR, 0.12);
    tri([w, 0, z0], [w, 0, z1], [w, y1, z1], sideR, 0.12);
  }
  tri([-w, 0, 0.02], [w, 0, 0.02], [w, H, 0.02], lip, 0.08);
  tri([-w, 0, 0.02], [w, H, 0.02], [-w, H, 0.02], lip, 0.08);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
  return geo;
}

function hash2(x, z) {
  let n = Math.imul(Math.floor(x * 10), 374761393) + Math.imul(Math.floor(z * 10), 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function snowGeometry(z0, low, casters) {
  const segX = low ? 20 : 30;
  const segZ = low ? 7 : 10;
  const half = 110;
  const geo = new THREE.PlaneGeometry(2, CHUNK, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const heights = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const x = Math.sign(u) * Math.pow(Math.abs(u), 1.45) * half;
    const z = p.getZ(i) + z0 + CHUNK / 2;
    const ax = Math.abs(x);
    let y = Math.sin(x * 0.09 + z * 0.05) * 0.28 + Math.sin(x * 0.23 + z * 0.11) * 0.1;
    if (ax < 9) y *= 0.22;
    const bank = clamp((ax - 18) / 62, 0, 1);
    y += bank * bank * (12 + 22 * hash2(x * 0.15, z * 0.15));
    heights[i] = y;
    p.setXYZ(i, x, y, z);
  }
  const cols = new Float32Array(p.count * 3);
  const shade = new Float32Array(p.count);
  const warm = new THREE.Color('#f6f1ea');
  const cool = new THREE.Color('#e4edf5');
  const blue = new THREE.Color('#7f9fd0');
  const tint = new THREE.Color();
  const ax = 0.56;
  const az = -0.83;
  const px = -az;
  const pz = ax;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const n = hash2(x, z);
    tint.copy(warm).lerp(cool, n * 0.22);
    let s = 0;
    const alongBand = x * ax + z * az;
    s += Math.pow(clamp(Math.sin(alongBand * 0.42 + Math.sin(x * 0.05) * 1.2) * 0.5 + 0.5, 0, 1), 2.4) * 0.85;
    if (heights[i] < 0.05 && Math.abs(x) < 10) s += 0.06;
    for (let c = 0; c < casters.length; c++) {
      const o = casters[c];
      const dx = x - o.x;
      const dz = z - o.z;
      const along = dx * ax + dz * az;
      const side = dx * px + dz * pz;
      const half = o.w * (1 - along / o.len * 0.35);
      if (along > 0.15 && along < o.len && Math.abs(side) < half) {
        const fall = (1 - along / o.len) * (1 - Math.abs(side) / half);
        s += fall * o.k;
      }
    }
    s = clamp(s, 0, 1);
    tint.lerp(blue, Math.min(1, s * 0.95));
    cols[i * 3] = tint.r;
    cols[i * 3 + 1] = tint.g;
    cols[i * 3 + 2] = tint.b;
    shade[i] = s;
    slopeToWorld(x, heights[i], z, tmp);
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  return geo;
}

function flakeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  const r = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSpray(max) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { scale: { value: 500 }, map: { value: flakeTexture() } },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */`
      attribute float psize;
      attribute float alpha;
      attribute vec3 color;
      varying float vA;
      varying vec3 vC;
      uniform float scale;
      #include <fog_pars_vertex>
      void main() {
        vA = alpha;
        vC = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(psize * scale / max(1.0, -mvPosition.z), 0.0, 22.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying float vA;
      varying vec3 vC;
      #include <fog_pars_fragment>
      void main() {
        float a = texture2D(map, gl_PointCoord).a * vA;
        if (a < 0.04) discard;
        gl_FragColor = vec4(vC, a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  const pool = [];
  const white = new THREE.Color('#fff8f2');
  const blue = new THREE.Color('#c5d4ee');
  function emit(state, n, burst) {
    for (let k = 0; k < n && pool.length < max; k++) {
      const side = (k % 2 === 0 ? -1 : 1) * (0.18 + Math.abs(state.vx) * 0.012);
      const ox = side + (mulberry((state.tick + k * 17) >>> 0)() - 0.5) * 0.12;
      const oz = -0.35 - (k % 3) * 0.08;
      slopeToWorld(state.x + ox, state.y + 0.12, state.z + oz, tmp);
      const kick = burst ? 2.4 : 0.9 + Math.abs(state.vx) * 0.08;
      slopeToWorld(Math.sign(ox) * (0.6 + Math.abs(state.vx) * 0.15), kick, -0.4, tmp2);
      const tint = k % 4 === 0 ? blue : white;
      pool.push({
        x: tmp.x, y: tmp.y, z: tmp.z,
        vx: tmp2.x, vy: tmp2.y, vz: tmp2.z,
        life: burst ? 0.7 : 0.48,
        max: burst ? 0.7 : 0.48,
        s0: burst ? 0.22 : 0.1,
        s1: burst ? 0.7 : 0.42,
        r: tint.r, g: tint.g, b: tint.b,
      });
    }
  }
  function age(dt) {
    let j = 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 4.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      pool[j++] = p;
    }
    pool.length = j;
  }
  function write() {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const t = 1 - p.life / p.max;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r;
      col[i * 3 + 1] = p.g;
      col[i * 3 + 2] = p.b;
      size[i] = p.s0 + (p.s1 - p.s0) * t;
      alpha[i] = (1 - t) * 0.85;
    }
    geo.setDrawRange(0, pool.length);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.psize.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }
  return { points, mat, emit, age, write };
}

function createStreaks(count) {
  const base = new THREE.PlaneGeometry(1, 1);
  base.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const seeds = [];
  const rnd = mulberry(19);
  for (let i = 0; i < count; i++) {
    const ang = rnd() * Math.PI * 2;
    const r = 2.2 + Math.pow(rnd(), 0.65) * 9;
    seeds.push(Math.cos(ang) * r, Math.sin(ang) * r * 0.72, rnd());
  }
  geo.setAttribute('iseed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 3));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      travel: { value: 0 },
      len: { value: 3.2 },
      amt: { value: 0 },
      span: { value: 42 },
      color: { value: new THREE.Color('#fff6ea') },
    },
    vertexShader: /* glsl */`
      attribute vec3 iseed;
      uniform float travel, len, span;
      varying float vA;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        float d = mod(iseed.z * span + travel, span);
        vec3 p = vec3(iseed.x, iseed.y, -(span - d) + 3.0);
        p.z += position.z * len;
        vec2 w = normalize(vec2(-iseed.y, iseed.x));
        p.xy += w * position.x * 0.028;
        vA = smoothstep(0.0, 0.18, d / span) * (1.0 - smoothstep(0.72, 1.0, d / span));
        gl_Position = projectionMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float amt;
      uniform vec3 color;
      varying float vA;
      varying vec2 vUv;
      void main() {
        float e = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = amt * vA * e * vUv.y;
        if (a < 0.02) discard;
        gl_FragColor = vec4(color, a * 0.55);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return { mesh, mat };
}

function powderSphere() {
  const g = new THREE.SphereGeometry(1, 6, 5).toNonIndexed();
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const top = new THREE.Color('#f4f6f8');
  const midC = new THREE.Color('#d7e0ea');
  const bot = new THREE.Color('#8c9db3');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const col = y > 0.28 ? top : y > -0.15 ? midC : bot;
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}

function createAvalanche(low) {
  const puffMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const debrisMat = new THREE.MeshBasicMaterial({ color: 0xe7eef3, fog: true });
  const puffs = new THREE.InstancedMesh(powderSphere(), puffMat, low ? 42 : 72);
  const debris = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.38, 0), debrisMat, low ? 14 : 24);
  puffs.frustumCulled = false;
  debris.frustumCulled = false;
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const anchor = new THREE.Group();
  anchor.add(puffs, debris);
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
    color: 0x5d7fb8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }));
  shadow.renderOrder = 2;
  shadow.frustumCulled = false;
  return {
    anchor, puffs, debris, shadow, dummy,
    layout(gap, near, time) {
      const face = Math.max(2.5, gap - 1.1);
      const height = 8 + near * 7;
      const cols = 9;
      const n = puffs.count;
      puffs.visible = near > 0.08;
      debris.visible = near > 0.15;
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const u = col / (cols - 1);
        const edge = Math.abs(u - 0.5) * 2;
        const rowT = row / Math.max(1, Math.ceil(n / cols) - 1);
        let x = (u - 0.5) * (16 + near * 4);
        let y = 1.8 + rowT * (height + 4);
        let z = face + rowT * 0.35;
        if (Math.abs(x) < 3.4) {
          y = 7.2 + rowT * 5.5;
          x *= 0.35;
        }
        const boil = Math.sin(time * 0.55 + i * 0.7) * 0.2;
        const s = 1.25 + rowT * 0.55;
        dummy.position.set(x, y + boil, z);
        dummy.rotation.set(time * 0.12 + i, i * 0.4, 0);
        dummy.scale.set(s * 1.15, s * 0.82, s);
        dummy.updateMatrix();
        puffs.setMatrixAt(i, dummy.matrix);
      }
      puffs.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < debris.count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (2.4 + (i % 6) * 0.7);
        const y = 2.2 + (i % 5) * 0.9 + Math.sin(time * 1.6 + i) * 0.3;
        const z = face + 0.3 + (i % 3) * 0.25;
        dummy.position.set(x, y, z);
        dummy.rotation.set(time * 1.4 + i, time * 0.9, time * 0.4);
        dummy.scale.setScalar(0.28 + (i % 4) * 0.12);
        dummy.updateMatrix();
        debris.setMatrixAt(i, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      shadow.material.opacity = near < 0.05 ? 0 : 0.16 + near * 0.42;
    },
  };
}

function createTrail() {
  const MAX = 40;
  const ACROSS = 4;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * ACROSS * 3);
  const col = new Float32Array(MAX * ACROSS * 3);
  const idx = [];
  for (let i = 0; i < MAX - 1; i++) {
    for (let k = 0; k < ACROSS - 1; k++) {
      const a = i * ACROSS + k;
      const b = a + ACROSS;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const cGeo = new THREE.BufferGeometry();
  const cPos = new Float32Array(12 * 5 * 3);
  const cCol = new Float32Array(12 * 5 * 3);
  const cIdx = [];
  for (let i = 0; i < 11; i++) {
    for (let k = 0; k < 4; k++) {
      const a = i * 5 + k;
      cIdx.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
    }
  }
  cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
  cGeo.setAttribute('color', new THREE.BufferAttribute(cCol, 3));
  cGeo.setIndex(cIdx);
  cGeo.setDrawRange(0, 0);
  const curtain = new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
  }));
  curtain.frustumCulled = false;
  curtain.renderOrder = 3;
  const pts = [];
  const groove = new THREE.Color('#5d7fb8');
  const berm = new THREE.Color('#fff8ee');
  const dust = new THREE.Color('#f6f1ea');
  function push(state) {
    if (state.y > 0.28) return;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(state.x - last.x, state.z - last.z) < 0.38) return;
    pts.push({ x: state.x, z: state.z, vx: state.vx });
    if (pts.length > MAX) pts.shift();
  }
  function write() {
    const n = pts.length;
    if (n < 2) {
      geo.setDrawRange(0, 0);
      cGeo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const side = -dz;
      const forward = dx;
      const age = i / (n - 1);
      const half = 0.22 + age * 0.2;
      const offsets = [-half, -half * 0.28, half * 0.28, half];
      const lifts = [0.07, 0.02, 0.02, 0.07];
      const colors = [berm, groove, groove, berm];
      for (let k = 0; k < 4; k++) {
        slopeToWorld(p.x + side * offsets[k], lifts[k], p.z + forward * offsets[k], tmp);
        const vi = i * 4 + k;
        pos[vi * 3] = tmp.x;
        pos[vi * 3 + 1] = tmp.y;
        pos[vi * 3 + 2] = tmp.z;
        col[vi * 3] = colors[k].r;
        col[vi * 3 + 1] = colors[k].g;
        col[vi * 3 + 2] = colors[k].b;
      }
    }
    geo.setDrawRange(0, (n - 1) * 3 * 6);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    const samples = Math.min(12, n);
    const hard = Math.min(1, Math.abs(pts[n - 1].vx) / 10);
    if (hard < 0.25) {
      cGeo.setDrawRange(0, 0);
      return;
    }
    const edge = Math.sign(pts[n - 1].vx || 1);
    for (let i = 0; i < samples; i++) {
      const p = pts[n - samples + i];
      const along = i / (samples - 1);
      for (let row = 0; row < 5; row++) {
        const t = row / 4;
        const curl = Math.sin(t * Math.PI) * (0.35 + hard * 1.15);
        const out = (0.2 + t * 0.85) * edge;
        const up = t * (0.25 + hard * 1.1) * (1 - along * 0.35);
        slopeToWorld(p.x + out, 0.08 + up, p.z - along * 0.15, tmp);
        tmp.x += curl * 0.15 * edge;
        const vi = i * 5 + row;
        cPos[vi * 3] = tmp.x;
        cPos[vi * 3 + 1] = tmp.y + curl * 0.2;
        cPos[vi * 3 + 2] = tmp.z;
        const tint = dust.clone().lerp(groove, t * 0.35);
        cCol[vi * 3] = tint.r;
        cCol[vi * 3 + 1] = tint.g;
        cCol[vi * 3 + 2] = tint.b;
      }
    }
    cGeo.setDrawRange(0, (samples - 1) * 4 * 6);
    cGeo.attributes.position.needsUpdate = true;
    cGeo.attributes.color.needsUpdate = true;
  }
  return { mesh, curtain, push, write, clear() { pts.length = 0; } };
}

function createChunks(max) {
  const geo = new THREE.TetrahedronGeometry(0.12, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf6f1ea, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const pool = [];
  const dummy = new THREE.Object3D();
  function emit(state, n) {
    const side = Math.sign(state.vx || 1);
    for (let k = 0; k < n && pool.length < max; k++) {
      slopeToWorld(state.x + side * 0.22, state.y + 0.12, state.z, tmp);
      slopeToWorld(side * (1.2 + Math.abs(state.vx) * 0.12), 1.6, -0.3, tmp2);
      pool.push({
        x: tmp.x, y: tmp.y, z: tmp.z,
        vx: tmp2.x, vy: tmp2.y, vz: tmp2.z,
        life: 0.55, max: 0.55, spin: k,
      });
    }
  }
  function age(dt) {
    let j = 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      pool[j++] = p;
    }
    pool.length = j;
    mesh.count = j;
    for (let i = 0; i < j; i++) {
      const p = pool[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.spin + p.life * 4, p.spin * 2, p.life * 3);
      dummy.scale.setScalar(0.7 + (1 - p.life / p.max) * 0.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    if (j) mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, mat, emit, age };
}

export function createView(canvas, options) {
  const low = !!options.low;
  const reduced = !!options.reduced;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !low,
    alpha: false,
    stencil: false,
    powerPreference: low ? 'low-power' : 'default',
  });
  renderer.setClearColor(0x2f5f9e, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = false;
  renderer.debug.onShaderError = (gl, program) => {
    console.error('[powderline] shader', gl.getProgramInfoLog(program));
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9c9d8, low ? 52 : 78, low ? 720 : 1200);
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(52, 1, 0.12, 520);
  const hemi = new THREE.HemisphereLight(0xffc8a0, 0x6a84b8, 0.35);
  scene.add(hemi);

  const toon = createToon(rampTexture());
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, low ? 20 : 28, low ? 12 : 16), skyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  scene.add(sky);
  const ridges = buildRidges();
  for (const ridge of ridges) scene.add(ridge);

  const rider = buildRider(toon);
  scene.add(rider.group);
  const ava = createAvalanche(low);
  scene.add(ava.anchor, ava.shadow);
  const spray = createSpray(low ? 180 : 360);
  scene.add(spray.points);
  const streaks = createStreaks(low ? 70 : 120);
  scene.add(streaks.mesh);
  const trail = createTrail();
  scene.add(trail.mesh, trail.curtain);
  const slabs = createChunks(low ? 28 : 48);
  scene.add(slabs.mesh);
  const deck = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshBasicMaterial({ color: 0xb7c6d6, fog: true }), 12);
  deck.frustumCulled = false;
  scene.add(deck);
  const deckDummy = new THREE.Object3D();

  const chunks = new Map();
  let worldSeed = null;
  const camS = { x: 0, y: 2.4, z: -6 };
  const lookS = { x: 0, y: 1.1, z: 8 };
  let fov = 52;
  let primed = null;
  const perf = { calls: 0, tris: 0, pr: 1 };
  globalThis.__plPerf = perf;
  const fogA = new THREE.Color('#b9c9d8');
  const fogB = new THREE.Color('#c5d4e2');

  function resize() {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const cap = low ? 1.5 : 2;
    const budget = low ? 1.15e6 : 1.9e6;
    const budgetRatio = Math.sqrt(budget / Math.max(1, w * h));
    const ratio = Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap, budgetRatio));
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    perf.pr = ratio;
    const focal = (h * ratio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    spray.mat.uniforms.scale.value = focal;
  }

  function buildChunk(index, seed) {
    const part = globalThis.PLSim.chunk(seed, index);
    const z0 = index * CHUNK;
    const rnd = mulberry((seed ^ Math.imul(index + 1, 0x85EBCA6B)) >>> 0);
    const casters = [];
    const props = [];
    const trees = [];
    for (let i = 0; i < part.obstacles.length; i++) {
      const o = part.obstacles[i];
      if (o.kind === 'tree') {
        const s = 1.45 + hash2(o.x, o.z) * 0.55;
        trees.push(placePine(o.x, o.z, s, o.z * 0.2));
        casters.push({ x: o.x, z: o.z, len: 14 * s, w: 1.35 * s, k: 0.95 });
      } else {
        const s = 0.85 + hash2(o.z, o.x) * 0.55;
        props.push(placeRock(o.x, o.z, s, o.z, i + 3));
        casters.push({ x: o.x, z: o.z, len: 3.2 * s, w: 0.9 * s, k: 0.7 });
      }
    }
    const decor = low ? 16 : 28;
    for (let i = 0; i < decor; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (18 + Math.pow(rnd(), 0.65) * 78);
      const z = z0 + 2 + rnd() * (CHUNK - 4);
      let blocked = false;
      for (const o of part.obstacles) {
        if (Math.hypot(o.x - x, o.z - z) < 3) blocked = true;
      }
      if (blocked) continue;
      const s = 1.8 + rnd() * 2.6;
      trees.push(placePine(x, z, s, rnd() * 6.2));
      casters.push({ x, z, len: 16 * s, w: 1.5 * s, k: 0.95 });
    }
    for (let i = 0; i < (low ? 2 : 3); i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (10 + rnd() * 6);
      const z = z0 + 4 + rnd() * (CHUNK - 8);
      const s = 0.5 + rnd() * 0.7;
      props.push(placeRock(x, z, s, rnd() * 4, i + 9));
      casters.push({ x, z, len: 2.4 * s, w: 0.7 * s, k: 0.55 });
    }
    for (const ramp of part.ramps) {
      const g = rampGeometry(Math.max(2.3, ramp.w));
      props.push(bakeSlope(g, ramp.x, 0, ramp.z));
      casters.push({ x: ramp.x, z: ramp.z - 1.2, len: 5.5, w: ramp.w * 0.55, k: 0.6 });
    }
    const group = new THREE.Group();
    const snow = new THREE.Mesh(snowGeometry(z0, low, casters), toon);
    group.add(snow);
    const merged = trees.concat(props);
    if (merged.length) group.add(new THREE.Mesh(mergeParts(merged), toon));
    scene.add(group);
    return group;
  }

  function dropChunk(group) {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry && obj.geometry !== PINE) obj.geometry.dispose();
    });
  }

  function syncWorld(state) {
    if (worldSeed !== state.seed) {
      for (const group of chunks.values()) dropChunk(group);
      chunks.clear();
      trail.clear();
      worldSeed = state.seed;
    }
    const ahead = low ? 3 : 4;
    const center = Math.floor(state.z / CHUNK);
    const keep = new Set();
    for (let i = Math.max(0, center - 1); i <= center + ahead; i++) {
      keep.add(i);
      if (!chunks.has(i)) chunks.set(i, buildChunk(i, state.seed));
    }
    for (const [index, group] of chunks) {
      if (!keep.has(index)) {
        dropChunk(group);
        chunks.delete(index);
      }
    }
  }

  function placeWorldDressing(state, time, near) {
    slopeToWorld(state.x, Math.max(0, state.y), state.z, tmp);
    rider.group.position.copy(tmp);
    rider.group.quaternion.copy(slopeQuat);
    poseRider(rider, state, time, reduced);

    const behind = Math.max(state.gap, 5.5);
    slopeToWorld(0, 0, state.z - behind, tmp);
    ava.anchor.position.copy(tmp);
    ava.anchor.quaternion.copy(slopeQuat);
    ava.layout(state.gap, near, reduced ? 0 : time);
    slopeToWorld(1.2, 0, state.z - behind + 2, tmp);
    ava.shadow.position.x = tmp.x;
    ava.shadow.position.z = tmp.z;
    const shadeLen = 6 + near * 7;
    slopeToWorld(0.8, 0, state.z - 1, tmp2);
    ava.shadow.position.set(tmp2.x, tmp2.y + 0.07, tmp2.z);
    ava.shadow.quaternion.copy(slopeQuat);
    ava.shadow.scale.set(18, 1, shadeLen);
    ava.shadow.material.opacity = near < 0.08 ? 0 : 0.1 + near * 0.34;

    for (const ridge of ridges) {
      const spec = ridge.userData.spec;
      slopeToWorld(state.x * spec.parallax, 0, state.z + spec.ahead, ridge.position);
    }
    for (let i = 0; i < deck.count; i++) {
      const side = (i % 2 === 0 ? -1 : 1) * (8 + (i % 5) * 14);
      slopeToWorld(state.x * 0.2 + side, 3, state.z + 150 + (i % 3) * 18, deckDummy.position);
      deckDummy.scale.set(16 + (i % 4) * 6, 4.2, 11);
      deckDummy.updateMatrix();
      deck.setMatrixAt(i, deckDummy.matrix);
    }
    deck.instanceMatrix.needsUpdate = true;
  }

  function sample(state) {
    trail.push(state);
    spray.age(1 / 60);
    slabs.age(1 / 60);
    if (state.y < 0.25 && (state.tick % 2 === 0)) {
      spray.emit(state, 1, false);
      if (Math.abs(state.vx) > 4 && state.tick % 4 === 0) slabs.emit(state, 1);
    }
  }

  function sync(state, dt, time) {
    syncWorld(state);
    const near = clamp((14 - state.gap) / 10, 0, 1);
    const poster = state.tick === 0 && state.z < 0.4;
    placeWorldDressing(state, time, near);
    if (!poster) {
      trail.push(state);
      if (state.y < 0.25 && (Math.abs(state.vx) > 1.5 || state.vz > 16)) spray.emit(state, low ? 1 : 2, false);
      if (state.y < 0.2 && Math.abs(state.vx) > 6) {
        spray.emit(state, 1, false);
        slabs.emit(state, low ? 1 : 2);
      }
    }
    spray.age(dt);
    slabs.age(dt);
    spray.write();
    trail.write();
    const lean = clamp(-state.vx / 13.2, -1, 1);
    const air = clamp(state.y / 5, 0, 1);
    const trick = state.trick ? state.trick.id : '';
    let want;
    if (poster) {
      want = { x: 1.55, y: 1.72, z: -4.35, lx: 0.15, ly: 1.05, lz: 6.5, fov: 46 };
    } else if (trick) {
      const side = trick === 'backside' || trick === 'mute' ? -1 : 1;
      want = {
        x: state.x + side * 2.35,
        y: state.y + 2.15,
        z: state.z - 5.4,
        lx: state.x * 0.4,
        ly: state.y + 1.05,
        lz: state.z + 1.4,
        fov: 50,
      };
    } else {
      want = {
        x: state.x * 0.42 - lean * 1.15,
        y: state.y + 2.85 + air * 0.7,
        z: state.z - 6.5 - air * 0.6,
        lx: state.x * 0.45,
        ly: state.y + 1.15,
        lz: state.z + 12,
        fov: 54 + (state.boosting ? 2.4 : 0) + near * 2.2,
      };
    }
    const camKey = `${state.seed}:${poster ? 'poster' : 'run'}:${trick || ''}`;
    if (primed !== camKey) {
      camS.x = want.x; camS.y = want.y; camS.z = want.z;
      lookS.x = want.lx; lookS.y = want.ly; lookS.z = want.lz;
      fov = want.fov;
      primed = camKey;
    }
    const kdt = Math.max(dt, poster ? 0.016 : 0);
    fov = damp(fov, want.fov, 6, kdt || 0.016);
    const k = 1 - Math.exp(-(kdt || 0.016) * (state.y > 0.4 ? 5 : 8));
    camS.x += (want.x - camS.x) * k;
    camS.y += (want.y - camS.y) * k;
    camS.z += (want.z - camS.z) * k;
    lookS.x += (want.lx - lookS.x) * k;
    lookS.y += (want.ly - lookS.y) * k;
    lookS.z += (want.lz - lookS.z) * k;
    slopeToWorld(camS.x, camS.y, camS.z, tmp);
    slopeToWorld(lookS.x, lookS.y, lookS.z, tmp2);
    const amp = reduced || poster ? 0 : near * near * 0.2;
    tmp.x += Math.sin(time * 37) * amp;
    tmp.y += Math.cos(time * 53) * amp * 0.7;
    camera.position.copy(tmp);
    camera.up.set(0, 1, 0);
    camera.lookAt(tmp2);
    const aspect = camera.aspect || 1;
    const minH = 58 * Math.PI / 180;
    const vFromH = aspect < 1 ? 2 * Math.atan(Math.tan(minH / 2) / aspect) * 180 / Math.PI : fov;
    camera.fov = Math.max(fov, Math.min(96, vFromH));
    camera.updateProjectionMatrix();
    camera.rotateZ(lean * 0.045 + (reduced ? 0 : Math.sin(time * 41) * amp * 0.12));
    sky.position.copy(camera.position);

    streaks.mat.uniforms.travel.value += Math.max(dt, 0) * (state.vz || 0) * (state.boosting ? 0.85 : 0);
    streaks.mat.uniforms.len.value = 2.4 + (state.boosting ? 2.8 : 0);
    const amtTarget = state.boosting && !poster ? 0.85 : 0;
    streaks.mat.uniforms.amt.value = damp(streaks.mat.uniforms.amt.value, amtTarget, 7, Math.max(dt, 0.016));
    streaks.mesh.visible = streaks.mat.uniforms.amt.value > 0.02;

    scene.fog.near = Math.max(28, (low ? 52 : 78) * (1 - near * 0.45));
    scene.fog.far = (low ? 720 : 1200) * (1 - near * 0.25);
    scene.fog.color.copy(fogA).lerp(fogB, near * 0.55);
    const focal = (renderer.domElement.height) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    spray.mat.uniforms.scale.value = focal;

    renderer.render(scene, camera);
    perf.calls = renderer.info.render.calls;
    perf.tris = renderer.info.render.triangles;
    return near;
  }

  function dispose() {
    renderer.dispose();
    toon.dispose();
    sky.material.dispose();
    spray.mat.dispose();
    streaks.mat.dispose();
    slabs.mat.dispose();
    trail.mesh.material.dispose();
    trail.curtain.material.dispose();
    deck.material.dispose();
    ava.shadow.material.dispose();
    rider.blob.material.dispose();
    if (PINE) PINE.dispose();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    globalThis.__plPerf = null;
  }

  resize();
  return { sync, resize, dispose, sample, canvas };
}
