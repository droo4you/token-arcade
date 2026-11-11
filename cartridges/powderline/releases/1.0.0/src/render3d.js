/* Powderline view. The sim is read-only: nothing here changes a score.
   Craft notes from Canyon Jump 3D, with a snow palette instead of its desert:
   a shader sky (gradient, crisp sun, horizon haze, fog off the dome), fog that
   starts far enough for the mountain to read, hemisphere + sun + fill, ACES,
   canvas snow detail, and a low tier with no shadows and a smaller buffer.
   No bloom and no emissive lights. */
import * as THREE from '../vendor/three.module.js';
import { buildRider } from './rider.js';

const SLOPE = 0.3;
const SIN = Math.sin(SLOPE);
const COS = Math.cos(SLOPE);
const CHUNK = 48;
const LAUNCH_Y = 1.22;

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

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function snowMaps() {
  const color = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f7fb';
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sas = Math.sin(y * 0.55 + Math.sin(x * 0.08) * 2) * 10;
      const spec = (hash2(x, y) - 0.5) * 28;
      d[i] = clamp(d[i] + sas + spec, 0, 255);
      d[i + 1] = clamp(d[i + 1] + sas * 0.95 + spec, 0, 255);
      d[i + 2] = clamp(d[i + 2] + sas * 0.8 + spec + 6, 0, 255);
    }
    g.putImageData(img, 0, 0);
  });
  const bump = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = 128 + Math.sin(y * 0.7) * 40 + (hash2(x * 2, y) - 0.5) * 30;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  bump.colorSpace = THREE.NoColorSpace || bump.colorSpace;
  color.repeat.set(1, 1);
  bump.repeat.set(1, 1);
  return { color, bump };
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
    uniforms: {
      zenith: { value: new THREE.Color('#1c5ea3') },
      mid: { value: new THREE.Color('#7eb0d4') },
      horizon: { value: new THREE.Color('#f3e2cc') },
      below: { value: new THREE.Color('#8ea4ae') },
      sunDir: { value: new THREE.Vector3(-0.45, 0.72, -0.53).normalize() },
      sunColor: { value: new THREE.Color('#fff6e8') },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 zenith, mid, horizon, below, sunDir, sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zenith, smoothstep(0.18, 0.78, h));
        c = mix(c, below, smoothstep(0.02, -0.12, h));
        float sd = max(dot(d, sunDir), 0.0);
        float hz = exp(-abs(h) * 8.0);
        c += horizon * hz * 0.18;
        float disk = smoothstep(0.9992, 0.9996, sd);
        c += sunColor * disk * 1.35;
        c += vec3(1.0, 0.97, 0.92) * pow(sd, 24.0) * 0.08;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
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
    else for (let i = 0; i < p.count; i += 3) idx.push(base + i, base + i + 1, base + i + 2);
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
  const c = new THREE.Color(hex);
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (hash2(i, 3) - 0.5) * jitter;
    arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.09, 0.14, 0.7, 6);
  trunk.translate(0, 0.35, 0);
  colorize(trunk, '#4a382c', 0.12);
  const parts = [trunk];
  const layers = [[0.95, 1.55, 1.35, '#1a3c2e'], [0.72, 1.25, 2.15, '#24543c'], [0.42, 0.85, 2.85, '#f4f7f8']];
  for (const [r, h, y, hex] of layers) {
    const cone = new THREE.ConeGeometry(r, h, 7);
    cone.translate(0, y, 0);
    colorize(cone, hex, 0.1);
    parts.push(cone);
  }
  return mergeGeos(parts);
}

function rockGeometry() {
  const geo = new THREE.DodecahedronGeometry(0.55, 0);
  return colorize(geo, '#6a645c', 0.22);
}

function kickerGeometry(width, length, height) {
  const hw = width / 2;
  const pos = [
    -hw, 0, -length, hw, 0, -length, hw, height, 0,
    -hw, 0, -length, hw, height, 0, -hw, height, 0,
    -hw, 0, -length, -hw, height, 0, -hw, 0, 0,
    hw, 0, -length, hw, 0, 0, hw, height, 0,
    -hw, 0, 0, -hw, height, 0, hw, height, 0,
    -hw, 0, 0, hw, height, 0, hw, 0, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const cols = new Float32Array(pos.length);
  const top = new THREE.Color('#f7f5f0');
  const side = new THREE.Color('#c5d2de');
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1];
    const c = y > height * 0.72 ? top : side;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

function snowHeight(x, z) {
  const ax = Math.abs(x);
  const flat = smoothstep(6.6, 10, ax);
  const roll = (Math.sin(x * 0.09 + z * 0.018) * 0.7 + Math.sin(z * 0.012 + 1.7) * 0.45) * flat;
  const berm = Math.max(0, ax - 7.1);
  const sas = Math.sin(z * 1.6 + x * 0.4) * 0.02;
  return roll + berm * berm * 0.07 + sas;
}

function flakeTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(16, 16, 5, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export function createView(canvas, options) {
  const low = !!options.low;
  const reduced = !!options.reduced;
  const Q = low
    ? { segsX: 16, segsZ: 6, ahead: 3, shadow: 0, pmrem: false, flakes: 64, pr: 1.15, px: 0.85e6, fogNear: 42, fogFar: 210, puffs: 16, ridge: 5, antialias: false }
    : { segsX: 42, segsZ: 14, ahead: 6, shadow: 1024, pmrem: true, flakes: 150, pr: 1.5, px: 1.6e6, fogNear: 78, fogFar: 460, puffs: 30, ridge: 6, antialias: true };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.antialias, alpha: false, powerPreference: low ? 'low-power' : 'high-performance' });
  renderer.setClearColor(0xf3e2cc, 1);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
  }
  renderer.shadowMap.enabled = Q.shadow > 0;
  if (Q.shadow) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc9d8e4, Q.fogNear, Q.fogFar);
  scene.background = new THREE.Color(0x7eb0d4);
  const camera = new THREE.PerspectiveCamera(low ? 60 : 54, 1, 0.08, 700);

  const skyMat = skyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, low ? 20 : 40, low ? 12 : 20), skyMat);
  sky.scale.setScalar(600);
  sky.frustumCulled = false;
  scene.add(sky);

  if (Q.pmrem) {
    try {
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), skyMat));
      const pad = new THREE.Mesh(new THREE.CircleGeometry(80, 12), new THREE.MeshBasicMaterial({ color: 0xd5e0ea }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = -1;
      envScene.add(pad);
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(envScene, 0.04);
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.8;
      pm.dispose();
    } catch { /* reflections are optional */ }
  }

  const hemi = new THREE.HemisphereLight(0xc5dff0, 0xa9c0d2, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e2, 2.55);
  const fill = new THREE.DirectionalLight(0xe7f1f8, 1.25);
  scene.add(sun, sun.target, fill, fill.target);
  if (Q.shadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.035;
    const sc = sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 0.5; sc.far = 70;
  }

  const slopeBasis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, COS, SIN),
    new THREE.Vector3(0, -SIN, COS),
  );
  const slopeRoot = new THREE.Group();
  slopeRoot.quaternion.setFromRotationMatrix(slopeBasis);
  scene.add(slopeRoot);

  const maps = snowMaps();
  const snowMat = new THREE.MeshStandardMaterial({ map: maps.color, bumpMap: maps.bump, bumpScale: 0.12, vertexColors: true, roughness: 0.82, metalness: 0 });
  const pineGeo = pineGeometry();
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const rockGeo = rockGeometry();
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, flatShading: true });
  const kickMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x1f4d3a, roughness: 0.55, metalness: 0 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.7, metalness: 0 });
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xc24b2e, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  const shared = [pineGeo, rockGeo];

  const chunks = new Map();
  let worldSeed = null;
  const tmp = new THREE.Vector3();
  const dummy = new THREE.Object3D();

  function snowGeometry(z0) {
    const geo = new THREE.PlaneGeometry(24, CHUNK, Q.segsX, Q.segsZ);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const snow = new THREE.Color('#f3f6fa');
    const shade = new THREE.Color('#c5d4e2');
    const ice = new THREE.Color('#e7eef4');
    const c = new THREE.Color();
    const uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i) + z0 + CHUNK / 2;
      const y = snowHeight(x, z);
      p.setXYZ(i, x, y, z - z0 - CHUNK / 2);
      uv.setXY(i, x / 1.4, z / 1.4);
      const n = noise2(x * 0.15, z * 0.15);
      c.copy(snow).lerp(shade, n * 0.45 + smoothstep(6.2, 10, Math.abs(x)) * 0.35);
      if (n > 0.62) c.lerp(ice, 0.35);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    p.needsUpdate = true;
    uv.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, snowMat);
    mesh.position.z = z0 + CHUNK / 2;
    mesh.receiveShadow = Q.shadow > 0;
    return mesh;
  }

  function addInstances(geo, mat, max, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    items.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.ry || 0, 0);
      dummy.scale.setScalar(item.s || 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = Q.shadow > 0 && mat === pineMat;
    mesh.computeBoundingSphere();
    return mesh;
  }

  function buildChunk(index, seed) {
    const group = new THREE.Group();
    const z0 = index * CHUNK;
    group.add(snowGeometry(z0));
    const part = globalThis.PLSim.chunk(seed, index);
    const pines = [];
    const rocks = [];
    for (const o of part.obstacles) {
      if (o.kind === 'tree') pines.push({ x: o.x, y: snowHeight(o.x, o.z), z: o.z, s: 0.85 + hash2(o.z, 2) * 0.45, ry: hash2(o.x, o.z) * 6 });
      else rocks.push({ x: o.x, y: snowHeight(o.x, o.z) + 0.2, z: o.z, s: 0.7 + hash2(o.z, 5) * 0.8, ry: o.z });
    }
    for (const spot of [[-8.4, 14], [8.6, 34]]) {
      const z = z0 + spot[1];
      const x = spot[0];
      if (!pines.some((p) => Math.abs(p.x - x) < 1.5 && Math.abs(p.z - z) < 2)) {
        pines.push({ x, y: snowHeight(x, z), z, s: 0.7 + hash2(index, spot[1]) * 0.5, ry: index });
      }
    }
    if (pines.length) group.add(addInstances(pineGeo, pineMat, pines.length, pines));
    if (rocks.length) group.add(addInstances(rockGeo, rockMat, rocks.length, rocks));
    for (const ramp of part.ramps) {
      const g = new THREE.Group();
      g.position.set(ramp.x, snowHeight(ramp.x, ramp.z), ramp.z);
      const body = new THREE.Mesh(kickerGeometry(Math.max(2.3, ramp.w), 5.6, LAUNCH_Y), kickMat);
      body.castShadow = Q.shadow > 0;
      body.receiveShadow = Q.shadow > 0;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(Math.max(2.3, ramp.w), 0.06, 0.16), lipMat);
      lip.position.set(0, LAUNCH_Y + 0.02, -0.02);
      g.add(body, lip);
      group.add(g);
    }
    if (index > 0) {
      const z = z0 + 22;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.7, 5), poleMat);
      pole.position.set(6.7, 0.85 + snowHeight(6.7, z), z);
      const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.55, -0.08, 0.05), new THREE.Vector3(0.5, -0.32, 0),
      ]).setIndex([0, 1, 2]).computeVertexNormals(), flagMat);
      flag.position.set(6.74, 1.55, z);
      flag.userData.flag = true;
      group.add(pole, flag);
    }
    slopeRoot.add(group);
    return group;
  }

  const ridgeMat = [];
  function rangeMesh(length, depth, peaks, tint) {
    const geo = new THREE.PlaneGeometry(length, depth, 28, 5);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const rock = new THREE.Color(tint);
    const cap = new THREE.Color('#eef3f6');
    const c = new THREE.Color();
    let maxH = 1;
    for (const peak of peaks) maxH = Math.max(maxH, peak.h);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      let h = 0;
      for (const peak of peaks) {
        const d = (x - peak.x) / peak.w;
        h = Math.max(h, peak.h * Math.exp(-d * d));
      }
      h *= Math.max(0, 1 - Math.abs(z) / (depth * 0.55));
      p.setY(i, h);
      c.copy(rock).lerp(cap, clamp((h / maxH - 0.55) / 0.45, 0, 1));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    ridgeMat.push(mat);
    return new THREE.Mesh(geo, mat);
  }
  const ranges = [
    [-62, 190, 90, 36, [{ x: -18, h: 28, w: 16 }, { x: 0, h: 40, w: 14 }, { x: 16, h: 24, w: 12 }], '#6f8ea3'],
    [58, 260, 100, 40, [{ x: -20, h: 34, w: 18 }, { x: 8, h: 52, w: 16 }, { x: 28, h: 30, w: 14 }], '#7f9aaf'],
    [-70, 460, 120, 48, [{ x: -10, h: 48, w: 22 }, { x: 24, h: 36, w: 16 }], '#93adbf'],
    [64, 680, 130, 50, [{ x: -16, h: 44, w: 20 }, { x: 18, h: 58, w: 18 }], '#a9c0d0'],
  ];
  for (const [x, z, length, depth, peaks, tint] of ranges) {
    const mesh = rangeMesh(length, depth, peaks, tint);
    mesh.position.set(x, 0, z);
    slopeRoot.add(mesh);
  }

  const rider = buildRider(low, Q.shadow > 0);
  slopeRoot.add(rider.group);

  const puffGeo = new THREE.SphereGeometry(1, low ? 6 : 8, low ? 5 : 6);
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xfbfcfd, roughness: 0.9, metalness: 0 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0xc5d0dc, roughness: 0.96, metalness: 0 });
  const cloud = new THREE.Group();
  const puffs = [];
  for (let i = 0; i < Q.puffs; i++) {
    const row = Math.floor(i / 8);
    const col = (i % 8) - 3.5;
    const mesh = new THREE.Mesh(puffGeo, row === 0 ? dirtMat : puffMat);
    const scale = (row === 0 ? 0.9 : 1.45) + (i % 4) * 0.4;
    mesh.position.set(col * 2.4, 1.1 + row * 2.35, -row * 0.2);
    mesh.scale.set(scale * 1.45, scale * 0.9, scale * 0.85);
    mesh.userData.base = mesh.position.clone();
    mesh.userData.row = row;
    cloud.add(mesh);
    puffs.push(mesh);
  }
  const debris = [];
  for (let i = 0; i < (low ? 6 : 12); i++) {
    const mesh = new THREE.Mesh(rockGeo, dirtMat);
    mesh.position.set((i - 6) * 1.3, 0.35, 0.4);
    mesh.scale.setScalar(0.28 + (i % 3) * 0.08);
    cloud.add(mesh);
    debris.push(mesh);
  }
  slopeRoot.add(cloud);

  const flakes = buildFlakes(Q.flakes);
  slopeRoot.add(flakes.points);

  const trailN = 26;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(trailN * 2 * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailIdx = [];
  for (let i = 0; i < trailN - 1; i++) {
    const a = i * 2;
    trailIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  trailGeo.setIndex(trailIdx);
  const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xb7c5d2, transparent: true, opacity: 0.7, depthWrite: false }));
  trail.frustumCulled = false;
  trail.renderOrder = 2;
  slopeRoot.add(trail);
  const samples = [];

  const camS = { x: 0, y: 3, z: -6 };
  const lookS = { x: 0, y: 1, z: 10 };
  const camW = new THREE.Vector3();
  const lookW = new THREE.Vector3();
  let primed = null;
  let fov = low ? 60 : 54;
  let lastLand = -1;

  function resize() {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    let ratio = Math.min(window.devicePixelRatio || 1, Q.pr);
    if (w * h * ratio * ratio > Q.px) ratio *= Math.sqrt(Q.px / (w * h));
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
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
    for (let i = Math.max(0, center - 1); i <= center + Q.ahead; i++) {
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
  }

  function placeCloud(state, time, near) {
    const behind = Math.max(state.gap, 5.8);
    cloud.position.set(0, 0, state.z - behind);
    cloud.visible = state.gap < 28;
    const reach = near * near * 16;
    for (const mesh of puffs) {
      const base = mesh.userData.base;
      const lift = clamp(base.y / 5.5, 0, 1);
      mesh.position.set(
        base.x + Math.sin(time * 0.6 + base.y) * 0.18,
        base.y + Math.sin(time * 0.8 + base.x) * 0.1,
        base.z + reach * lift,
      );
    }
    debris.forEach((mesh, i) => { mesh.rotation.y = time * 0.8 + i; mesh.rotation.x = time * 0.4; });
  }

  function sync(state, dt, time) {
    syncWorld(state);
    rider.group.position.set(state.x, state.y, state.z);
    rider.pose(state, time);
    const near = clamp((16 - state.gap) / 10, 0, 1);
    placeCloud(state, time, near);
    if (!reduced) {
      slopeRoot.traverse((obj) => {
        if (obj.userData.flag) obj.rotation.y = Math.sin(time * 2 + obj.position.z) * 0.25;
      });
    }

    if (state.y < 0.2) {
      const last = samples[samples.length - 1];
      if (!last || Math.abs(last.z - state.z) > 0.7) samples.push({ x: state.x, z: state.z });
      if (samples.length > trailN) samples.shift();
    }
    const pos = trail.geometry.attributes.position;
    for (let i = 0; i < trailN; i++) {
      const s = samples[Math.max(0, samples.length - trailN + i)] || samples[0] || { x: state.x, z: state.z };
      const y = 0.03 + snowHeight(s.x, s.z);
      pos.setXYZ(i * 2, s.x - 0.11, y, s.z);
      pos.setXYZ(i * 2 + 1, s.x + 0.11, y, s.z);
    }
    pos.needsUpdate = true;

    const want = {
      x: state.x * 0.18 + 1.15,
      y: state.y + 1.85 + near * 0.3,
      z: state.z - 4.55,
      lx: state.x * 0.08,
      ly: state.y + 0.85,
      lz: state.z + 5.4,
    };
    if (primed !== state.seed) {
      camS.x = want.x; camS.y = want.y; camS.z = want.z;
      lookS.x = want.lx; lookS.y = want.ly; lookS.z = want.lz;
      primed = state.seed;
    }
    const k = 1 - Math.exp(-Math.max(0.016, dt) * 7);
    camS.x += (want.x - camS.x) * k; camS.y += (want.y - camS.y) * k; camS.z += (want.z - camS.z) * k;
    lookS.x += (want.lx - lookS.x) * k; lookS.y += (want.ly - lookS.y) * k; lookS.z += (want.lz - lookS.z) * k;
    slopeToWorld(camS.x, camS.y, camS.z, camW);
    slopeToWorld(lookS.x, lookS.y, lookS.z, lookW);
    const shake = reduced ? 0 : near * near * 0.12;
    camW.x += Math.sin(time * 41) * shake;
    camW.y += Math.sin(time * 57) * shake * 0.55;
    camera.position.copy(camW);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookW);
    camera.rotateZ(clamp(-state.vx / 13.2, -1, 1) * 0.05);
    sky.position.copy(camW);

    slopeToWorld(state.x - 12, 20, state.z - 6, sun.position);
    slopeToWorld(state.x, 1, state.z + 8, sun.target.position);
    slopeToWorld(state.x + 8, 6, state.z + 12, fill.position);
    fill.target.position.copy(sun.target.position);
    skyMat.uniforms.sunDir.value.copy(sun.position).sub(camW).normalize();

    const targetFov = (low ? 60 : 54) + (state.boosting ? 2.5 : 0) + near * 3;
    fov += (targetFov - fov) * (1 - Math.exp(-Math.max(dt, 0.016) * 5));
    camera.fov = fov;
    camera.updateProjectionMatrix();

    if (state.landId !== lastLand) {
      lastLand = state.landId;
      if (state.landKind) flakes.burst(state, state.landKind === 'clean' ? 14 : 8);
    }
    if (Math.abs(state.vx) > 2.2 && state.y < 0.25) flakes.carve(state);
    if (near > 0.2) flakes.slide(state, near);
    flakes.update(dt);
    renderer.render(scene, camera);
    return near;
  }

  function dispose() {
    renderer.dispose();
    snowMat.dispose(); pineMat.dispose(); rockMat.dispose(); kickMat.dispose(); lipMat.dispose();
    poleMat.dispose(); flagMat.dispose(); puffMat.dispose(); dirtMat.dispose(); skyMat.dispose();
    maps.color.dispose(); maps.bump.dispose();
    for (const mat of ridgeMat) mat.dispose();
    for (const mat of rider.materials) mat.dispose();
    scene.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
  }

  resize();
  return { sync, resize, dispose, canvas };
}

function buildFlakes(count) {
  const positions = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xf7f9fb, size: 0.11, map: flakeTexture(), transparent: true, opacity: 0.95,
    depthWrite: false, alphaTest: 0.5, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let cursor = 0;
  function emit(state, n, spread, up) {
    for (let k = 0; k < n; k++) {
      const i = cursor;
      cursor = (cursor + 1) % count;
      positions[i * 3] = state.x + Math.sin(i * 12.1 + state.tick) * spread;
      positions[i * 3 + 1] = state.y + 0.15;
      positions[i * 3 + 2] = state.z + Math.cos(i * 4.3) * spread * 0.35;
      vel[i * 3] = (i % 7 - 3) * 0.6;
      vel[i * 3 + 1] = up;
      vel[i * 3 + 2] = -0.4;
      life[i] = 0.28 + (i % 5) * 0.04;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return {
    points,
    burst(state, n) { emit(state, n, 0.55, 2.2); },
    carve(state) { emit(state, 1, 0.22, 0.7); },
    slide(state, near) { emit(state, near > 0.55 ? 2 : 1, 1.6, 1.1); },
    update(dt) {
      let alive = false;
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) { positions[i * 3 + 1] = -40; continue; }
        alive = true;
        life[i] -= dt;
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= 4 * dt;
      }
      if (alive) geo.attributes.position.needsUpdate = true;
    },
  };
}
