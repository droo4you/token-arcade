/* Powderline view. The sim is read-only: nothing here changes a score.
   Late-afternoon alpine light from the art bible: 16° sun, cobalt shade,
   a wide slope, ridges inside the fog, and a powder wall that wraps the flanks.
   Sky shader shape is Canyon Jump's r170 dome, retuned and clamped to LDR.
   No bloom, no emissive, no additive halos. */
import * as THREE from '../vendor/three.module.js';
import { buildRider } from './rider.js';

const SLOPE = 0.3;
const SIN = Math.sin(SLOPE);
const COS = Math.cos(SLOPE);
const CHUNK = 48;
const LAUNCH_Y = 1.22;
const HALF_WIDTH = 120;
const ELEV = 16 * Math.PI / 180;
const AZ = 35 * Math.PI / 180;
const FILL_ELEV = 20 * Math.PI / 180;
const SUN_DIR = new THREE.Vector3(
  -Math.sin(AZ) * Math.cos(ELEV),
  Math.sin(ELEV),
  Math.cos(AZ) * Math.cos(ELEV),
).normalize();
const FILL_DIR = new THREE.Vector3(
  Math.sin(AZ) * Math.cos(FILL_ELEV),
  Math.sin(FILL_ELEV),
  -Math.cos(AZ) * Math.cos(FILL_ELEV),
).normalize();

const TIER = {
  high: { segsX: 52, segsZ: 16, ahead: 5, shadow: 2048, pmrem: true, grains: 280, bits: 36, pr: 1.5, px: 2.1e6, fogNear: 70, fogFar: 1100, puffs: 420, debris: 56, trees: 34, sparkle: true, antialias: true, ridges: [340, 680, 1080] },
  mid: { segsX: 36, segsZ: 12, ahead: 4, shadow: 1024, pmrem: true, grains: 160, bits: 24, pr: 1.25, px: 1.0e6, fogNear: 60, fogFar: 900, puffs: 240, debris: 36, trees: 20, sparkle: true, antialias: true, ridges: [280, 520, 800] },
  low: { segsX: 26, segsZ: 8, ahead: 3, shadow: 0, pmrem: false, grains: 80, bits: 0, pr: 1, px: 0.5e6, fogNear: 45, fogFar: 650, puffs: 140, debris: 20, trees: 12, sparkle: false, antialias: false, ridges: [220, 400, 580] },
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hash2(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

function slopeToWorld(x, y, z, out) {
  return out.set(x, y * COS - z * SIN, z * COS + y * SIN);
}

function canvasTex(w, h, draw, color) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = color ? THREE.SRGBColorSpace : (THREE.NoColorSpace || tex.colorSpace);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function snowBump() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sas = Math.sin(y * 0.55 + Math.sin(x * 0.08) * 2);
    const fine = noise2(x * 0.35, y * 0.12);
    const v = clamp(128 + sas * 28 + (fine - 0.5) * 36, 0, 255);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
    uniforms: {
      uHorizon: { value: new THREE.Color('#f2d9bd') },
      uMid: { value: new THREE.Color('#7aa3cf') },
      uZenith: { value: new THREE.Color('#2f5f9e') },
      uBelow: { value: new THREE.Color('#9fb3c6') },
      uHaze: { value: new THREE.Color('#b9c9d8') },
      uSunDir: { value: SUN_DIR.clone() },
      uSunCol: { value: new THREE.Color('#fff4e2') },
      uSunDisk: { value: new THREE.Color('#fff4e2') },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uHorizon, uMid, uZenith, uBelow, uHaze, uSunDir, uSunCol, uSunDisk;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
        c = mix(c, uZenith, smoothstep(0.14, 0.70, h));
        c = mix(c, uBelow, smoothstep(0.0, -0.08, h));
        c = mix(c, uHaze, exp(-abs(h) * 11.0) * 0.28);
        float sd = max(dot(dir, uSunDir), 0.0);
        c += uSunCol * (pow(sd, 8.0) * 0.22 + pow(sd, 64.0) * 0.35);
        c = mix(c, uSunDisk, smoothstep(0.9996, 0.99985, sd));
        c = clamp(c, 0.0, 1.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function readableFog(mat, scale) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * ${scale.toFixed(2)};
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif`,
    );
  };
}

function mergeGeos(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const idx = [];
  let v = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    const c = g.attributes.color;
    const base = v;
    for (let i = 0; i < p.count; i++) {
      pos[(v + i) * 3] = p.getX(i);
      pos[(v + i) * 3 + 1] = p.getY(i);
      pos[(v + i) * 3 + 2] = p.getZ(i);
      if (c) {
        col[(v + i) * 3] = c.getX(i);
        col[(v + i) * 3 + 1] = c.getY(i);
        col[(v + i) * 3 + 2] = c.getZ(i);
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    v += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function colorize(geo, hex, jitter = 0.08) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const c = new THREE.Color(hex);
  const snow = new THREE.Color('#e9eef3');
  const arr = new Float32Array(p.count * 3);
  const out = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (hash2(i, 3) - 0.5) * jitter;
    out.copy(c);
    if (n && n.getY(i) > 0.62) out.lerp(snow, clamp((n.getY(i) - 0.62) / 0.3, 0, 1));
    arr[i * 3] = out.r * k; arr[i * 3 + 1] = out.g * k; arr[i * 3 + 2] = out.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.11, 0.18, 1.1, 5);
  trunk.translate(0, 0.55, 0);
  colorize(trunk, '#2a2622', 0.08);
  const parts = [trunk];
  const layers = [
    [1.15, 1.7, 1.55, '#1e3a33'],
    [0.86, 1.45, 2.45, '#243f38'],
    [0.58, 1.15, 3.25, '#1e3a33'],
    [0.28, 0.7, 3.85, '#e9eef3'],
  ];
  for (const [r, h, y, hex] of layers) {
    const cone = new THREE.ConeGeometry(r, h, 7);
    cone.translate(0, y, 0);
    colorize(cone, hex, 0.06);
    parts.push(cone);
  }
  return mergeGeos(parts);
}

function rockGeometry() {
  const geo = new THREE.IcosahedronGeometry(0.7, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const n = 0.75 + noise2(p.getX(i) * 3 + i, p.getZ(i) * 3) * 0.5;
    p.setXYZ(i, p.getX(i) * n, p.getY(i) * (0.7 + n * 0.3), p.getZ(i) * n);
  }
  geo.computeVertexNormals();
  return colorize(geo, '#4a4f58', 0.16);
}

function kickerGeometry(width, length, height) {
  const nx = 10;
  const nz = 14;
  const count = (nx + 1) * (nz + 1);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const idx = [];
  const snow = new THREE.Color('#fff8ee');
  const shade = new THREE.Color('#9eb4d0');
  const lip = new THREE.Color('#f6f1ea');
  const c = new THREE.Color();
  let v = 0;
  for (let j = 0; j <= nz; j++) {
    const u = j / nz;
    const z = -length + u * (length + 0.45);
    let rise = height * smoothstep(0.02, 0.78, u);
    if (u > 0.74) rise += Math.sin((u - 0.74) / 0.26 * Math.PI) * 0.22;
    for (let i = 0; i <= nx; i++) {
      const t = i / nx * 2 - 1;
      const edge = Math.abs(t);
      const berm = smoothstep(0.62, 1, edge) * 0.16;
      const x = t * (width * 0.5 + 0.22);
      pos[v * 3] = x;
      pos[v * 3 + 1] = rise + berm;
      pos[v * 3 + 2] = z;
      c.copy(edge > 0.78 ? shade : u > 0.8 ? lip : snow);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      v += 1;
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i;
    idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function puffTexture() {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1) - 0.5;
    const v = y / (size - 1) - 0.5;
    const r = Math.hypot(u, v) * 2;
    const alpha = Math.pow(clamp(1 - r, 0, 1), 1.45) * 255;
    const lit = clamp(1 - y / (size - 1), 0, 1);
    const i = (y * size + x) * 4;
    img.data[i] = 150 + lit * 70;
    img.data[i + 1] = 162 + lit * 62;
    img.data[i + 2] = 178 + lit * 48;
    img.data[i + 3] = alpha;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function cabinGeometry() {
  const body = new THREE.BoxGeometry(2.4, 1.5, 1.8);
  body.translate(0, 0.75, 0);
  colorize(body, '#4a4038', 0.05);
  const roof = new THREE.ConeGeometry(2.1, 1.1, 4);
  roof.translate(0, 2.05, 0);
  roof.rotateY(Math.PI / 4);
  colorize(roof, '#e9eef3', 0.04);
  const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5);
  pole.translate(1.5, 1.2, 0);
  colorize(pole, '#14202b', 0);
  const flag = new THREE.BoxGeometry(0.55, 0.36, 0.04);
  flag.translate(1.85, 2.15, 0);
  colorize(flag, '#c4492a', 0);
  return mergeGeos([body, roof, pole, flag]);
}

function snowHeight(x, z) {
  const ax = Math.abs(x);
  const line = 1 - smoothstep(7, 18, ax);
  const roller = (Math.sin(z * 0.045) * 0.34 + Math.sin(z * 0.011 + 1.4) * 0.28) * (0.25 + 0.75 * line);
  const bowl = Math.cos(x * 0.045) * 0.16 * line;
  const wallT = smoothstep(14, 78, ax);
  const wall = wallT * wallT * (8 + 22 * smoothstep(36, 110, ax));
  const und = (noise2(x * 0.035, z * 0.035) - 0.5) * 1.4 * wallT;
  const sas = Math.sin(z * 1.35 + x * 0.35) * 0.018 * line;
  return roller + bowl + wall + und + sas;
}

function xAt(i, n) {
  const u = (i / n) * 2 - 1;
  return Math.sign(u) * Math.pow(Math.abs(u), 2.15) * HALF_WIDTH;
}

function puffGeometry(low) {
  const geo = new THREE.IcosahedronGeometry(1, low ? 0 : 1);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const top = new THREE.Color('#f4f6f8');
  const bot = new THREE.Color('#8c9db3');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(bot).lerp(top, clamp(p.getY(i) * 0.55 + 0.45, 0, 1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function createView(canvas, options) {
  const tier = options.tier || (options.low ? 'low' : 'high');
  const Q = TIER[tier] || TIER.high;
  const reduced = !!options.reduced;
  const low = tier === 'low';

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: Q.antialias, alpha: false,
    powerPreference: low ? 'low-power' : 'high-performance',
  });
  renderer.setClearColor(0xb9c9d8, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = Q.shadow > 0;
  if (Q.shadow) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9c9d8, Q.fogNear, Q.fogFar);
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2500);

  const skyMat = skyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, low ? 16 : 28, low ? 10 : 16), skyMat);
  sky.scale.setScalar(1000);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  if (Q.pmrem) {
    try {
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(80, 20, 12), skyMat));
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(160, 16),
        new THREE.MeshBasicMaterial({ color: 0xcdd8e3 }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = -2;
      envScene.add(pad);
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(envScene, 0.03);
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.8;
      pm.dispose();
    } catch { /* hemisphere still fills the shade */ }
  }

  const hemi = new THREE.HemisphereLight(0x8fb4e0, 0xd9d2c6, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7c8, 3);
  const fill = new THREE.DirectionalLight(0x9db8e6, 0.45);
  scene.add(sun, sun.target, fill, fill.target);
  if (Q.shadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera;
    sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 120;
  }

  const slopeBasis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, COS, SIN),
    new THREE.Vector3(0, -SIN, COS),
  );
  const slopeRoot = new THREE.Group();
  slopeRoot.quaternion.setFromRotationMatrix(slopeBasis);
  scene.add(slopeRoot);
  const upright = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -SLOPE);

  const bump = snowBump();
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xf6f1ea, bumpMap: bump, bumpScale: low ? 0.04 : 0.16,
    vertexColors: true, roughness: 0.82, metalness: 0,
  });
  const sunView = new THREE.Vector3();
  if (Q.sparkle) {
    snowMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSunView = { value: sunView };
      snowMat.userData.shader = shader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPlWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          uniform vec3 uSunView;
          varying vec3 vPlWorld;
          float plHash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float wrap = clamp((dot(normalize(normal), normalize(uSunView)) + 0.45) / 1.45, 0.0, 1.0);
          reflectedLight.indirectDiffuse += vec3(0.50, 0.66, 0.92) * (1.0 - wrap) * 0.22 * diffuseColor.rgb;`)
        .replace('#include <fog_fragment>', `
          float g = plHash(floor(vPlWorld.xz * 90.0));
          float glint = step(0.997, g) * (0.5 + 0.5 * sin(uTime * 6.0 + g * 40.0));
          float ndl = clamp(dot(normalize(normal), normalize(uSunView)), 0.0, 1.0);
          float grazing = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
          float distFade = 1.0 - smoothstep(40.0, 70.0, length(vViewPosition));
          gl_FragColor.rgb += vec3(glint * clamp(ndl * 2.0 + 0.2, 0.0, 1.0) * (0.35 + 0.65 * grazing) * distFade * 0.45);
          #include <fog_fragment>`);
    };
  }

  const pineGeo = pineGeometry();
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const rockGeo = rockGeometry();
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true });
  const kickMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x1f4d3a, roughness: 0.55, metalness: 0 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.7, metalness: 0 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xc4492a, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  const cabinGeo = cabinGeometry();
  const cabinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  readableFog(pineMat, 0.55);
  readableFog(rockMat, 0.55);
  readableFog(kickMat, 0.55);
  const shared = [pineGeo, rockGeo, cabinGeo];

  const chunks = new Map();
  let worldSeed = null;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  const warm = new THREE.Color('#f6f1ea');
  const away = new THREE.Color('#dfe7f0');
  const ice = new THREE.Color('#cfdbe8');
  const groove = new THREE.Color('#5d7fb8');
  const lipCol = new THREE.Color('#fff8ee');

  function paintSnow(geo, z0, displace) {
    const p = geo.attributes.position;
    const cols = geo.attributes.color;
    const base = geo.userData.base;
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const zLocal = base[i * 3 + 2];
      const z = zLocal + z0;
      let y = base[i * 3 + 1];
      let depth = 0;
      let lip = 0;
      if (displace && Math.abs(x) < 8) {
        for (let s = samples.length - 1; s >= 0 && s >= samples.length - 42; s--) {
          const dx = x - samples[s].x;
          const dz = z - samples[s].z;
          const d = Math.hypot(dx, dz);
          if (d < 0.16) depth = Math.max(depth, 1 - d / 0.16);
          else if (d < 0.62) {
            const ring = (d - 0.16) / 0.46;
            lip = Math.max(lip, Math.sin(clamp(ring, 0, 1) * Math.PI) * (ring < 0.55 ? 1 : 0.65));
          }
        }
        y += -depth * 0.22 + lip * 0.085;
      }
      p.setY(i, y);
      const ax = Math.abs(x);
      const fbm = (noise2(x * 0.055, z * 0.055) - 0.5) * 0.08 + (noise2(x * 0.16, z * 0.16) - 0.5) * 0.04;
      c.copy(warm);
      if (ax < 1.6) c.lerp(ice, 0.55);
      if (x * SUN_DIR.x < 0) c.lerp(away, 0.22);
      if (depth > 0.2) c.lerp(groove, clamp(depth, 0, 1));
      else if (lip > 0.4) c.lerp(lipCol, lip * 0.7);
      c.multiplyScalar(1 + fbm);
      cols.setXYZ(i, c.r, c.g, c.b);
    }
    p.needsUpdate = true;
    cols.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function snowGeometry(z0) {
    const nx = Q.segsX;
    const nz = Q.segsZ;
    const count = (nx + 1) * (nz + 1);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const idx = [];
    let v = 0;
    for (let j = 0; j <= nz; j++) {
      const z = -CHUNK / 2 + (j / nz) * CHUNK;
      for (let i = 0; i <= nx; i++) {
        const x = xAt(i, nx);
        const y = snowHeight(x, z + z0 + CHUNK / 2);
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        uv[v * 2] = x / 1.7; uv[v * 2 + 1] = (z + z0) / 1.7;
        v += 1;
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.userData.base = pos.slice(0);
    geo.userData.z0 = z0 + CHUNK / 2;
    paintSnow(geo, geo.userData.z0, false);
    const mesh = new THREE.Mesh(geo, snowMat);
    mesh.receiveShadow = Q.shadow > 0;
    mesh.castShadow = false;
    return mesh;
  }

  function addInstances(geo, mat, items, shadows) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    items.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.quaternion.copy(upright);
      dummy.rotateY(item.ry || 0);
      if (item.tilt) dummy.rotateZ(item.tilt);
      dummy.scale.setScalar(item.s || 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = !!shadows;
    mesh.receiveShadow = Q.shadow > 0;
    return mesh;
  }

  function buildChunk(index, seed) {
    const group = new THREE.Group();
    const z0 = index * CHUNK;
    const snow = snowGeometry(z0);
    group.add(snow);
    group.userData.snow = snow;
    const part = globalThis.PLSim.chunk(seed, index);
    const pines = [];
    const rocks = [];
    for (const o of part.obstacles) {
      if (o.kind === 'tree') pines.push({ x: o.x, y: snowHeight(o.x, o.z), z: o.z - z0 - CHUNK / 2, s: 1.7 + hash2(o.z, 2) * 0.8, ry: hash2(o.x, o.z) * 6, tilt: (hash2(o.z, 4) - 0.5) * 0.12 });
      else rocks.push({ x: o.x, y: snowHeight(o.x, o.z) - 0.15, z: o.z - z0 - CHUNK / 2, s: 0.42 + hash2(o.z, 5) * 0.28, ry: o.z });
    }
    for (let n = 0; n < Q.trees; n++) {
      const side = n % 2 === 0 ? -1 : 1;
      const x = side * (24 + hash2(index * 17 + n, 1) * 78);
      const z = z0 + hash2(index, n + 3) * (CHUNK - 2);
      const s = 1.5 + hash2(n, index + 9) * 2.1;
      pines.push({ x, y: snowHeight(x, z), z: z - z0 - CHUNK / 2, s, ry: hash2(n, 8) * 6, tilt: (hash2(n, 2) - 0.5) * 0.1 });
    }
    if (pines.length) group.add(addInstances(pineGeo, pineMat, pines, Q.shadow > 0));
    if (rocks.length) group.add(addInstances(rockGeo, rockMat, rocks, Q.shadow > 0));
    for (const ramp of part.ramps) {
      const g = new THREE.Group();
      g.position.set(ramp.x, snowHeight(ramp.x, ramp.z), ramp.z - z0 - CHUNK / 2);
      const body = new THREE.Mesh(kickerGeometry(Math.max(2.6, ramp.w), 6.2, LAUNCH_Y), kickMat);
      body.castShadow = Q.shadow > 0;
      body.receiveShadow = Q.shadow > 0;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(Math.max(2.6, ramp.w) + 0.2, 0.07, 0.22), lipMat);
      lip.position.set(0, LAUNCH_Y + 0.16, 0.05);
      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(2.2, ramp.w) * 0.85, 14),
        new THREE.MeshBasicMaterial({ color: 0x6d8bb5, transparent: true, opacity: 0.32, depthWrite: false }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(0, 0.03, -2.2);
      g.add(body, lip, blob);
      group.add(g);
    }
    if (index > 0 && index % 2 === 1) {
      const z = 18;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 5), poleMat);
      pole.position.set(8.4, 0.9 + snowHeight(8.4, z0 + z), z - CHUNK / 2);
      pole.quaternion.copy(upright);
      const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.7, -0.05, 0.08), new THREE.Vector3(0.62, -0.38, 0),
      ]).setIndex([0, 1, 2]).computeVertexNormals(), flagMat);
      flag.position.copy(pole.position);
      flag.position.y += 0.7;
      flag.userData.flag = true;
      group.add(pole, flag);
    }
    if (globalThis.PLSim.gateAt) {
      const gate = globalThis.PLSim.gateAt(seed, index);
      if (gate) {
        for (const x of [gate.x0, gate.x1]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 5), poleMat);
          pole.position.set(x, 1.05 + snowHeight(x, gate.z), gate.z - z0 - CHUNK / 2);
          pole.quaternion.copy(upright);
          const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.36), flagMat);
          cloth.position.set(x, 1.7 + snowHeight(x, gate.z), gate.z - z0 - CHUNK / 2);
          group.add(pole, cloth);
        }
      }
      const rail = globalThis.PLSim.railAt(seed, index);
      if (rail) {
        const len = rail.z1 - rail.z0;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, len, 6), poleMat);
        log.rotation.x = Math.PI / 2;
        log.position.set(rail.x, 0.2 + snowHeight(rail.x, (rail.z0 + rail.z1) / 2), (rail.z0 + rail.z1) / 2 - z0 - CHUNK / 2);
        log.castShadow = Q.shadow > 0;
        group.add(log);
      }
    }
    if (index % 8 === 4) {
      const x = 14;
      const z = 30;
      const hut = new THREE.Mesh(cabinGeo, cabinMat);
      hut.position.set(x, snowHeight(x, z0 + z), z - CHUNK / 2);
      hut.quaternion.copy(upright);
      hut.castShadow = Q.shadow > 0;
      group.add(hut);
    }
    group.position.z = z0 + CHUNK / 2;
    slopeRoot.add(group);
    return group;
  }

  function rangeMesh(layer) {
    const width = 1680;
    const depth = 220;
    const nx = low ? 48 : 90;
    const nz = 6;
    const heights = [110, 210, 360];
    const tints = ['#8ea6c4', '#a9bdd3', '#c3d2e1'];
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const idx = [];
    const tint = new THREE.Color(tints[layer]);
    const rock = new THREE.Color('#4a4f58');
    const strata = new THREE.Color('#6b6560');
    const cap = new THREE.Color('#f6f1ea');
    const c = new THREE.Color();
    let v = 0;
    for (let j = 0; j <= nz; j++) {
      const z = (j / nz - 0.5) * depth;
      const crest = 1 - Math.abs(j / nz - 0.35) / 0.7;
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * width;
        const n = noise2(x * 0.01 + layer * 4, layer * 2.2);
        const jag = Math.abs(Math.sin(x * 0.018 + layer)) * 0.35 + Math.abs(Math.sin(x * 0.047 + n * 3)) * 0.22;
        const peak = Math.pow(Math.abs(Math.sin(x * 0.008 + layer * 1.7)), 0.55);
        let h = (0.45 + peak * 0.55 + jag * 0.35 + (n - 0.35) * 0.2) * heights[layer];
        h *= clamp(crest, 0, 1);
        h += noise2(x * 0.04, z * 0.02 + layer) * 18 * clamp(h / heights[layer], 0, 1);
        pos[v * 3] = x; pos[v * 3 + 1] = Math.max(0, h); pos[v * 3 + 2] = z;
        v += 1;
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const normal = geo.attributes.normal;
    for (let i = 0; i < normal.count; i++) {
      const h = pos[i * 3 + 1] / heights[layer];
      const band = Math.sin(pos[i * 3 + 1] * 0.08);
      c.copy(band > 0.2 ? strata : rock);
      if (normal.getY(i) > 0.62) c.lerp(cap, smoothstep(0.55, 0.86, normal.getY(i)));
      c.lerp(tint, 0.28 + layer * 0.18);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          float fogFactor = min(smoothstep(fogNear, fogFar, vFogDepth), 0.85);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif`,
      );
    };
    ridgeMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  const ridgeMats = [];
  const ridges = [0, 1, 2].map((layer) => {
    const mesh = rangeMesh(layer);
    scene.add(mesh);
    return mesh;
  });

  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(low ? 900 : 1600, low ? 420 : 700, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x9fb3c6, transparent: true, opacity: 0.88, depthWrite: false }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.frustumCulled = false;
  scene.add(deck);

  const rider = buildRider(low, Q.shadow > 0);
  slopeRoot.add(rider.group);

  const puffMap = puffTexture();
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  const puffMat = new THREE.MeshBasicMaterial({
    map: puffMap, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const debrisMat = new THREE.MeshLambertMaterial({ color: 0xd5e2ef, flatShading: true });
  const snowBitMat = new THREE.MeshLambertMaterial({ color: 0xf4f7fb, flatShading: true });
  const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, Q.puffs);
  puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffMesh.frustumCulled = false;
  puffMesh.renderOrder = 3;
  const puffBase = [];
  for (let i = 0; i < Q.puffs; i++) {
    puffBase.push({
      x: (hash2(i, 1) - 0.5) * 46,
      y: 0.4 + hash2(i, 5) * 16,
      back: hash2(i, 2) * 10,
      s: 0.45 + hash2(i, 3) * 1.35,
      phase: hash2(i, 4) * Math.PI * 2,
    });
  }
  const iceGeo = new THREE.IcosahedronGeometry(0.22, 0);
  const debrisMesh = new THREE.InstancedMesh(iceGeo, debrisMat, Q.debris);
  const bitMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.16, 0), snowBitMat, Q.debris);
  debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debrisMesh.frustumCulled = false;
  bitMesh.frustumCulled = false;
  const snapTrees = [];
  for (let i = 0; i < (low ? 4 : 8); i++) {
    const tree = new THREE.Mesh(pineGeo, pineMat);
    tree.castShadow = Q.shadow > 0;
    tree.visible = false;
    slopeRoot.add(tree);
    snapTrees.push(tree);
  }
  const mist = buildMist(low ? 80 : 160);
  slopeRoot.add(mist.points);
  const trenchN = 26;
  const trenchPos = new Float32Array(trenchN * 9);
  const trenchCol = new Float32Array(trenchN * 9);
  const trenchIdx = [];
  for (let i = 0; i < trenchN - 1; i++) {
    const a = i * 3;
    trenchIdx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const trenchGeo = new THREE.BufferGeometry();
  trenchGeo.setAttribute('position', new THREE.BufferAttribute(trenchPos, 3));
  trenchGeo.setAttribute('color', new THREE.BufferAttribute(trenchCol, 3));
  trenchGeo.setIndex(trenchIdx);
  const trenchMat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const trench = new THREE.Mesh(trenchGeo, trenchMat);
  trench.frustumCulled = false;
  trench.renderOrder = 2;
  slopeRoot.add(trench);
  const bermColor = new THREE.Color('#f4efe6');
  const grooveColor = new THREE.Color('#4f73b0');
  const billboardQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const debrisBase = [];
  for (let i = 0; i < Q.debris; i++) {
    debrisBase.push({
      x: (hash2(i, 11) - 0.5) * 70,
      y: 0.4 + hash2(i, 12) * 6,
      z: hash2(i, 13) * 10,
      s: 0.35 + hash2(i, 14) * 0.9,
      snow: hash2(i, 15) > 0.45,
    });
  }
  const cloud = new THREE.Group();
  cloud.add(puffMesh, debrisMesh, bitMesh);
  slopeRoot.add(cloud);

  const spray = buildSpray(Q.grains, Q.bits);
  slopeRoot.add(spray.group);

  const fall = buildFall(low ? 140 : 320);
  slopeRoot.add(fall.points);

  const samples = [];
  const arcN = 9;
  const arcPos = new Float32Array(arcN * 6);
  const arcIdx = [];
  for (let i = 0; i < arcN - 1; i++) {
    const a = i * 2;
    arcIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  arcGeo.setIndex(arcIdx);
  const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0x14202b, side: THREE.DoubleSide }));
  arc.frustumCulled = false;
  arc.renderOrder = 3;
  slopeRoot.add(arc);
  let aim = 0;
  const camS = { x: 0, y: 3, z: -6 };
  const lookS = { x: 0, y: 1, z: 10 };
  const camW = new THREE.Vector3();
  const lookW = new THREE.Vector3();
  let primed = null;
  let fov = 58;
  let lastLand = -1;
  let landKick = 0;

  const grade = makeGrade(low);
  function resize() {
    const w = canvas.clientWidth || window.innerWidth || 1;
    const h = canvas.clientHeight || window.innerHeight || 1;
    let ratio = Math.min(window.devicePixelRatio || 1, Q.pr);
    if (w * h * ratio * ratio > Q.px) ratio *= Math.sqrt(Q.px / (w * h));
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    const bw = Math.max(2, Math.floor(w * ratio));
    const bh = Math.max(2, Math.floor(h * ratio));
    grade.rt.setSize(bw, bh);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function syncWorld(state) {
    if (worldSeed !== state.seed) {
      for (const group of chunks.values()) {
        slopeRoot.remove(group);
        group.traverse((obj) => { if (obj.geometry && !shared.includes(obj.geometry)) obj.geometry.dispose(); });
      }
      chunks.clear();
      samples.length = 0;
      worldSeed = state.seed;
    }
    const center = Math.floor(state.z / CHUNK);
    const keep = new Set();
    for (let i = center - 2; i <= center + Q.ahead; i++) {
      keep.add(i);
      if (!chunks.has(i)) chunks.set(i, buildChunk(i, state.seed));
    }
    for (const [index, group] of chunks) {
      if (!keep.has(index)) {
        slopeRoot.remove(group);
        group.traverse((obj) => { if (obj.geometry && !shared.includes(obj.geometry)) obj.geometry.dispose(); });
        chunks.delete(index);
      }
    }
    const here = chunks.get(center);
    const prev = chunks.get(center - 1);
    if (here?.userData.snow) paintSnow(here.userData.snow.geometry, here.userData.snow.geometry.userData.z0, true);
    if (prev?.userData.snow) paintSnow(prev.userData.snow.geometry, prev.userData.snow.geometry.userData.z0, true);
  }

  function placeRanges(state) {
    Q.ridges.forEach((dist, layer) => {
      slopeToWorld(layer === 1 ? 40 : -30, 0, state.z + dist, tmp);
      ridges[layer].position.set(tmp.x, tmp.y - 48 - layer * 10, tmp.z);
    });
    slopeToWorld(0, -30, state.z + Q.ridges[0] + 80, tmp);
    deck.position.set(tmp.x, Math.min(tmp.y, camW.y - 90), tmp.z + 120);
  }

  function placeCloud(state, time, near) {
    const gap = state.gap;
    const close = clamp((16 - gap) / 10, 0, 1);
    const front = state.z - Math.max(gap, 6);
    cloud.visible = gap < 18;
    slopeRoot.getWorldQuaternion(parentQ);
    billboardQ.copy(parentQ).invert();
    const camX = state.x;
    const camZ = state.z - 5.2;
    puffBase.forEach((base, i) => {
      const flank = Math.min(1, Math.abs(base.x) / 20);
      const churn = Math.sin(time * (0.8 + (i % 5) * 0.15) + base.phase);
      const side = base.x < 0 ? -1 : 1;
      let x = base.x + churn * 0.6;
      let y = Math.max(0.4, base.y * (0.35 + flank * 0.45) + Math.cos(time * 0.6 + base.phase) * 0.25);
      let z = front - base.back * 0.45 + close * flank * flank * 14 + churn * 0.3;
      if (i % 3 === 0) {
        x = side * (5.5 + (i % 4) * 1.6);
        y = 5.5 + (i % 5) * 1.45;
        z = state.z + 10 + (i % 6) * 1.3;
      }
      const dist = Math.hypot(x - camX, z - camZ);
      if (dist < 3.4) {
        const push = 3.4 / Math.max(0.25, dist);
        x = camX + (x - camX) * push;
        z = camZ + (z - camZ) * push;
      }
      const s = (0.85 + base.s) * (1 + churn * 0.12);
      const world = slopeToWorld(x, y, z, tmp2);
      dummy.position.copy(world);
      dummy.up.set(0, 1, 0);
      dummy.lookAt(camera.position);
      dummy.quaternion.premultiply(billboardQ);
      dummy.position.set(x, y, z);
      dummy.scale.set(s, s * (0.8 + flank * 0.35), 1);
      dummy.updateMatrix();
      puffMesh.setMatrixAt(i, dummy.matrix);
    });
    puffMesh.instanceMatrix.needsUpdate = true;
    debrisBase.forEach((base, i) => {
      const ang = time * (1.6 + (i % 4) * 0.2) + i;
      const side = base.x < 0 ? -1 : 1;
      const x = side * (7.5 + Math.abs(base.x) * 0.18);
      const z = state.z - 2 + (base.z % 12) + close * 4;
      dummy.position.set(x, 0.2 + Math.abs(Math.sin(ang)) * 0.7, z);
      dummy.rotation.set(ang, ang * 0.8, ang * 0.35);
      dummy.scale.setScalar(0.45 + (i % 5) * 0.12);
      dummy.updateMatrix();
      (base.snow ? bitMesh : debrisMesh).setMatrixAt(i, dummy.matrix);
    });
    debrisMesh.instanceMatrix.needsUpdate = true;
    bitMesh.instanceMatrix.needsUpdate = true;
    snapTrees.forEach((tree, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const ahead = 5 + Math.floor(i / 2) * 6;
      const x = side * (11 + (i % 3) * 1.5);
      const z = state.z + ahead;
      tree.visible = gap < 15;
      tree.position.set(x, snowHeight(x, z), z);
      tree.quaternion.copy(upright);
      const bend = clamp((13 - gap) / 8, 0, 1);
      tree.rotateZ(side * bend * (0.5 + (i % 3) * 0.3));
      tree.rotateX(bend * 0.12);
      tree.scale.setScalar(1.55 + (i % 3) * 0.4);
    });
    mist.update(state, time, gap);
    if (near > 0.15) spray.dust(state, near);
  }

  function sync(state, dt, time) {
    syncWorld(state);
    const ground = snowHeight(state.x, state.z);
    rider.group.position.set(state.x, state.y + ground, state.z);
    rider.pose(state, time);
    const near = clamp((18 - state.gap) / 12, 0, 1);
    placeCloud(state, time, near);
    placeRanges(state);
    if (!reduced) {
      slopeRoot.traverse((obj) => {
        if (obj.userData.flag) obj.rotation.y = Math.sin(time * 2.2 + obj.position.z) * 0.35;
      });
    }

    const carving = state.y < 0.2 && Math.abs(state.vx) > 0.4;
    if (samples.length === 0) {
      const side = Math.sign(state.vx || 1) || 1;
      for (let i = 36; i >= 0; i--) {
        samples.push({
          x: state.x - state.vx * i * 0.04,
          z: state.z - i * 0.55,
          side,
          hard: Math.min(1, Math.abs(state.vx) / 7),
        });
      }
    }
    if (state.y < 0.25) {
      const last = samples[samples.length - 1];
      if (!last || Math.abs(last.z - state.z) > 0.45) {
        samples.push({ x: state.x, z: state.z, side: Math.sign(state.vx || 1), hard: Math.min(1, Math.abs(state.vx) / 8) });
        if (samples.length > 64) samples.shift();
      }
    }
    trench.visible = state.tick >= 2;
    for (let i = 0; i < trenchN; i++) {
      const s = samples[Math.max(0, samples.length - trenchN + i)] || { x: state.x, z: state.z };
      const behind = s.z < state.z - 4.6 || s.z > state.z - 0.35;
      const groundY = behind ? -8 : snowHeight(s.x, s.z);
      const cols = [bermColor, grooveColor, bermColor];
      const offs = [[-0.38, 0.045], [0, -0.07], [0.38, 0.045]];
      for (let k = 0; k < 3; k++) {
        const o = (i * 3 + k) * 3;
        trenchPos[o] = s.x + offs[k][0];
        trenchPos[o + 1] = groundY + offs[k][1];
        trenchPos[o + 2] = s.z;
        trenchCol[o] = cols[k].r; trenchCol[o + 1] = cols[k].g; trenchCol[o + 2] = cols[k].b;
      }
    }
    trenchGeo.attributes.position.needsUpdate = true;
    trenchGeo.attributes.color.needsUpdate = true;
    const lead = -aim * 5.5;
    arc.visible = state.tick >= 2 && (Math.abs(state.vx) > 0.35 || aim !== 0);
    for (let i = 0; i < arcN; i++) {
      const t = i / (arcN - 1);
      const z = state.z + 1.3 + t * 7.5;
      const x = state.x + state.vx * t * 0.38 + lead * t * t;
      const y = snowHeight(x, z) + 0.07;
      const w = 0.07 + t * 0.05;
      arcPos[i * 6] = x - w;
      arcPos[i * 6 + 1] = y;
      arcPos[i * 6 + 2] = z;
      arcPos[i * 6 + 3] = x + w;
      arcPos[i * 6 + 4] = y;
      arcPos[i * 6 + 5] = z;
    }
    arcGeo.attributes.position.needsUpdate = true;
    spray.curtain(samples, state);
    if (carving) spray.carve(state);
    if (state.landId !== lastLand) {
      lastLand = state.landId;
      if (state.landKind) {
        spray.burst(state, state.landKind === 'clean' ? 36 : 18);
        landKick = 4;
      }
    }
    spray.update(dt);
    fall.update(state, dt, near);

    const air = state.y > 0.35 ? 1 : 0;
    const hero = state.tick < 2;
    const lean = clamp(-state.vx / 13.2, -1, 1);
    const portrait = camera.aspect < 1;
    const trickSide = state.trick ? (portrait ? 1.8 : 2.4) : 0;
    const want = hero ? (portrait ? {
      x: state.x + 0.35, y: 1.85, z: state.z - 4.4,
      lx: state.x, ly: 0.55, lz: state.z + 8,
    } : {
      x: state.x + 1.4, y: 1.9, z: state.z - 5.6,
      lx: state.x - 0.4, ly: 0.85, lz: state.z + 12,
    }) : {
      x: state.x * 0.22 + trickSide - lean * 0.45,
      y: 2.15 + state.y * 0.2 + air * 0.7,
      z: state.z - (state.trick ? 4.4 : 5.5) - air * 1.2,
      lx: state.x * 0.12,
      ly: 0.9 + state.y * 0.35,
      lz: state.z + 14,
    };
    if (primed !== state.seed) {
      camS.x = want.x; camS.y = want.y; camS.z = want.z;
      lookS.x = want.lx; lookS.y = want.ly; lookS.z = want.lz;
      primed = state.seed;
    }
    const dtSafe = Math.max(0.016, dt);
    const kp = 1 - Math.exp(-dtSafe * 6);
    const kl = 1 - Math.exp(-dtSafe * 10);
    camS.x += (want.x - camS.x) * kp; camS.y += (want.y - camS.y) * kp; camS.z += (want.z - camS.z) * kp;
    lookS.x += (want.lx - lookS.x) * kl; lookS.y += (want.ly - lookS.y) * kl; lookS.z += (want.lz - lookS.z) * kl;
    slopeToWorld(camS.x, camS.y, camS.z, camW);
    slopeToWorld(lookS.x, lookS.y, lookS.z, lookW);
    const shake = reduced ? 0 : near * near * 0.06;
    camW.x += Math.sin(time * 47) * shake;
    camW.y += Math.sin(time * 63) * shake * 0.65;
    camera.position.copy(camW);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookW);
    const roll = hero ? 0 : clamp(lean * 0.7 * 0.3, -8 * Math.PI / 180, 8 * Math.PI / 180);
    camera.rotateZ(roll);
    sky.position.copy(camW);
    skyMat.uniforms.uSunDir.value.copy(SUN_DIR);

    slopeToWorld(state.x, state.y + 1, state.z, tmp);
    const step = Q.shadow ? 64 / Q.shadow : 0;
    if (step) {
      tmp.x = Math.round(tmp.x / step) * step;
      tmp.z = Math.round(tmp.z / step) * step;
    }
    sun.position.copy(tmp).addScaledVector(SUN_DIR, 56);
    sun.target.position.copy(tmp);
    fill.position.copy(tmp).addScaledVector(FILL_DIR, 40);
    fill.target.position.copy(tmp);
    sunView.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
    if (snowMat.userData.shader) snowMat.userData.shader.uniforms.uTime.value = time;

    const speed = clamp(state.vz / 33.2, 0, 1.15);
    landKick = Math.max(0, landKick - dtSafe * 10);
    const targetFov = (hero ? (portrait ? 52 : 46) : 58 + (portrait ? 6 : 0) + 12 * smoothstep(0.3, 1, speed)) + landKick;
    fov += (targetFov - fov) * (1 - Math.exp(-dtSafe * 5));
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    renderer.setRenderTarget(grade.rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    grade.mat.uniforms.uTime.value = time;
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(grade.scene, grade.cam);
    renderer.toneMapping = prevTone;
    return near;
  }

  function dispose() {
    renderer.dispose();
    snowMat.dispose(); pineMat.dispose(); rockMat.dispose(); kickMat.dispose();
    lipMat.dispose(); poleMat.dispose(); flagMat.dispose(); cabinMat.dispose();
    puffMat.dispose(); debrisMat.dispose(); snowBitMat.dispose(); skyMat.dispose();
    puffMap.dispose(); bump.dispose();
    grade.rt.dispose();
    grade.mat.dispose();
    for (const mat of ridgeMats) mat.dispose();
    for (const mat of rider.materials) mat.dispose();
    scene.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
  }

  resize();
  return { sync, resize, dispose, canvas, setAim(v) { aim = v || 0; } };
}

function makeGrade(low) {
  const rt = new THREE.WebGLRenderTarget(4, 4);
  if (THREE.SRGBColorSpace) rt.texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt.texture },
      uTime: { value: 0 },
      uGrain: { value: low ? 0 : 0.01 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uGrain;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, col * vec3(0.95, 0.985, 1.04), (1.0 - luma) * 0.22);
        col = pow(max(col, 0.0), vec3(0.98));
        col *= vec3(1.015, 1.005, 0.99);
        float vig = smoothstep(0.55, 1.15, length(vUv - 0.5));
        col *= mix(1.0, 0.9, vig);
        float n = fract(sin(dot(vUv * vec2(940.0, 380.0) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * uGrain;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  return { rt, mat, scene, cam: new THREE.Camera() };
}

function buildMist(count) {
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: puffTexture(), color: 0xe4edf6, size: 1.35, transparent: true,
    opacity: 0.4, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  return {
    points,
    update(state, time, gap) {
      const show = gap < 8.2;
      points.visible = show;
      if (!show) return;
      const roll = time * 7;
      for (let i = 0; i < count; i++) {
        const x = (hash2(i, 21) - 0.5) * 12;
        let z = ((hash2(i, 23) * 16 + roll) % 16) - 6;
        if (Math.hypot(x, z + 5.1) < 2.3) z -= 3.2;
        pos[i * 3] = x;
        pos[i * 3 + 1] = 0.15 + hash2(i, 22) * 0.85;
        pos[i * 3 + 2] = z;
      }
      points.position.set(state.x, snowHeight(state.x, state.z), state.z);
      geo.attributes.position.needsUpdate = true;
      mat.opacity = clamp((8.2 - gap) / 4.5, 0.12, 0.5);
    },
  };
}

function buildFall(count) {
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xf6f1ea, size: 0.07, transparent: true, opacity: 0.75,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (hash2(i, 1) - 0.5) * 28;
    pos[i * 3 + 1] = hash2(i, 2) * 16;
    pos[i * 3 + 2] = (hash2(i, 3) - 0.5) * 36;
  }
  return {
    points,
    update(state, dt, near) {
      const extra = 1 + near * 2.4;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= dt * (1.6 + (i % 5) * 0.15) * extra;
        pos[i * 3 + 2] += dt * 2.2;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 12 + hash2(i, state.tick | 0) * 6;
        if (pos[i * 3 + 2] > 22) pos[i * 3 + 2] = -18;
      }
      points.position.set(state.x, state.y + 1, state.z);
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function buildSpray(grainCount, bitCount) {
  const group = new THREE.Group();
  const pos = new Float32Array(grainCount * 3);
  const col = new Float32Array(grainCount * 3);
  const vel = new Float32Array(grainCount * 3);
  const life = new Float32Array(grainCount);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.2, vertexColors: true, transparent: true, opacity: 0.92,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);
  const lit = new THREE.Color('#f6f1ea');
  const shade = new THREE.Color('#7f9fd0');
  let cursor = 0;

  let bits = null;
  let bitPos = null;
  let bitVel = null;
  let bitLife = null;
  if (bitCount > 0) {
    bits = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(0.07, 0),
      new THREE.MeshLambertMaterial({ color: 0xf4f1ea, flatShading: true }),
      bitCount,
    );
    bits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bits.frustumCulled = false;
    bits.count = bitCount;
    group.add(bits);
    bitPos = new Float32Array(bitCount * 3);
    bitVel = new Float32Array(bitCount * 3);
    bitLife = new Float32Array(bitCount);
    bitPos.fill(-80);
  }

  const sheetN = 42;
  const sheetPos = new Float32Array(sheetN * 3);
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute('position', new THREE.BufferAttribute(sheetPos, 3));
  const sheetMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: puffTexture() }, uCam: { value: new THREE.Vector3() } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform vec3 uCam;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFade = smoothstep(1.15, 2.6, length(position - uCam));
        gl_PointSize = clamp(64.0 / max(1.2, -mv.z), 1.5, 36.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying float vFade;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        if (tex.a < 0.04 || vFade < 0.03) discard;
        gl_FragColor = vec4(mix(vec3(0.55, 0.68, 0.86), vec3(0.98, 0.97, 0.95), tex.r), tex.a * vFade * 0.78);
      }`,
  });
  const sheet = new THREE.Points(sheetGeo, sheetMat);
  sheet.frustumCulled = false;
  sheet.renderOrder = 4;
  group.add(sheet);
  const dummy = new THREE.Object3D();

  function emitGrain(x, y, z, vx, vy, vz, shadowed) {
    const i = cursor;
    cursor = (cursor + 1) % grainCount;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = 0.35 + (i % 5) * 0.05;
    const c = shadowed ? shade : lit;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  function emitBit(x, y, z, vx, vy, vz) {
    if (!bitLife) return;
    let slot = -1;
    for (let i = 0; i < bitLife.length; i++) if (bitLife[i] <= 0) { slot = i; break; }
    if (slot < 0) return;
    bitPos[slot * 3] = x; bitPos[slot * 3 + 1] = y; bitPos[slot * 3 + 2] = z;
    bitVel[slot * 3] = vx; bitVel[slot * 3 + 1] = vy; bitVel[slot * 3 + 2] = vz;
    bitLife[slot] = 0.7;
  }

  return {
    group,
    carve(state) {
      const side = Math.sign(state.vx || 1);
      const hard = Math.min(1, Math.abs(state.vx) / 9);
      const n = 2 + Math.round(hard * 4);
      const edge = state.x + side * 0.2;
      const y = state.y + snowHeight(state.x, state.z) + 0.08;
      for (let k = 0; k < n; k++) {
        emitGrain(
          edge, y, state.z - k * 0.08,
          side * (1.4 + hard * 3.2),
          0.8 + hard * 2.4,
          -0.4 - hard,
          side > 0,
        );
      }
      if (hard > 0.35) emitBit(edge, y, state.z, side * 1.2, 1.4, -0.3);
    },
    burst(state, n) {
      const y = state.y + snowHeight(state.x, state.z) + 0.1;
      for (let k = 0; k < n; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        emitGrain(state.x + side * 0.2, y, state.z, side * (1 + (k % 4)), 2.2 + (k % 3), (k % 5) * 0.2, k % 2 === 0);
      }
    },
    dust(state, near) {
      const y = snowHeight(state.x, state.z) + 0.2;
      for (let k = 0; k < 2; k++) {
        emitGrain(state.x + (hash2(state.tick | 0, k) - 0.5) * 10, y, state.z - 2 - near * 4, (k - 0.5) * 2, 0.6 + near, -1.5, true);
      }
    },
    curtain(samples, state) {
      const hard = Math.min(1, Math.abs(state.vx) / 8);
      const height = 0.2 + hard * 1.15;
      const side = Math.sign(state.vx || 1) || 1;
      sheetMat.uniforms.uCam.value.set(state.x, 2.1, state.z - 5.1);
      for (let i = 0; i < sheetN; i++) {
        const s = samples[Math.max(0, samples.length - 14 + (i % 14))] || { x: state.x, z: state.z, side, hard };
        const t = (i % 7) / 6;
        const behind = s.z < state.z - 3.6 || s.z > state.z + 0.15;
        sheetPos[i * 3] = s.x + (s.side || side) * (0.22 + t * (0.4 + height * 0.45));
        sheetPos[i * 3 + 1] = behind ? -40 : snowHeight(s.x, s.z) + Math.sin(t * Math.PI) * height;
        sheetPos[i * 3 + 2] = s.z - Math.floor(i / 14) * 0.12;
      }
      sheet.geometry.attributes.position.needsUpdate = true;
    },
    update(dt) {
      let alive = false;
      for (let i = 0; i < grainCount; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -40; continue; }
        alive = true;
        life[i] -= dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= 6 * dt;
      }
      if (alive) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      }
      if (!bitLife) return;
      for (let i = 0; i < bitLife.length; i++) {
        if (bitLife[i] <= 0) {
          dummy.position.set(0, -80, 0);
          dummy.scale.setScalar(0.001);
        } else {
          bitLife[i] -= dt;
          bitPos[i * 3] += bitVel[i * 3] * dt;
          bitPos[i * 3 + 1] += bitVel[i * 3 + 1] * dt;
          bitPos[i * 3 + 2] += bitVel[i * 3 + 2] * dt;
          bitVel[i * 3 + 1] -= 7 * dt;
          dummy.position.set(bitPos[i * 3], bitPos[i * 3 + 1], bitPos[i * 3 + 2]);
          dummy.rotation.set(bitLife[i] * 4, bitLife[i] * 3, 0);
          dummy.scale.setScalar(1);
        }
        dummy.updateMatrix();
        bits.setMatrixAt(i, dummy.matrix);
      }
      bits.instanceMatrix.needsUpdate = true;
    },
  };
}
