/* Static world built from a level definition: sky dome + environment map, lights, desert terrain with
   dunes, highway with lane markings, roadside scenery, mesas, the ramp and the canyon (phase 1: simple
   but solid placeholder geometry for the ramp, gorge and far rim). Sim coords map to three.js as
   (x, y, z) -> (x, y, -z): the road runs toward -Z. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { TAU, rng, clamp, smooth, lerp, fbm, noise2, tint, merge, xf, canvasTex, speckle } from './util.js';
import * as P from './props.js';
import { buildCanyon } from './canyon.js';

const DEG = Math.PI / 180;

export function sunDirection(level) {
  const e = level.time.sun.elevation * DEG, a = level.time.sun.azimuth * DEG;
  // azimuth 0 = straight down the road (-Z), + = to the right (+X)
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

/* Gradient sky with sun disk and glow; HDR output so the disk blooms. */
export function skyMaterial(level, { stars = true } = {}) {
  const t = level.time, lin = h => new THREE.Color(h);
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
    uniforms: {
      zenith: { value: lin(t.sky.zenith) }, mid: { value: lin(t.sky.mid) }, horizon: { value: lin(t.sky.horizon) }, below: { value: lin(t.sky.below) },
      sunDir: { value: sunDirection(level) }, sunColor: { value: lin(t.sun.color) }, glowColor: { value: lin(t.sun.glow) },
      disk: { value: t.sun.disk }, glowK: { value: t.sun.glowStrength }, haze: { value: t.sky.haze }, starAmt: { value: stars ? t.sky.stars : 0 }, night: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 zenith, mid, horizon, below, sunDir, sunColor, glowColor; uniform float disk, glowK, haze, starAmt, night;
      varying vec3 vDir;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zenith, smoothstep(0.16, 0.75, h));
        c = mix(c, below, smoothstep(0.0, -0.08, h));
        float sd = max(dot(d, sunDir), 0.0);
        float hz = exp(-abs(h) * 9.0) * haze;           // bright haze band hugging the horizon
        c += glowColor * (pow(sd, 6.0) * 0.55 + pow(sd, 40.0) * 0.9) * glowK + horizon * hz * 0.35;
        float dsk = smoothstep(cos(disk), cos(disk * 0.82), sd);
        c += sunColor * dsk * 14.0;
        c = mix(c, c * vec3(0.18, 0.2, 0.42), night * smoothstep(0.0, 0.4, h));
        if (starAmt + night > 0.0 && h > 0.05) {
          vec2 g = floor(vec2(atan(d.z, d.x), asin(h)) * 260.0); float s = h21(g);
          c += vec3(step(0.9975, s) * (starAmt + night) * 2.0 * smoothstep(0.05, 0.3, h));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* Terrain height: flat band around the road, dunes and rolling rise further out. */
export function terrainHeight(level, x, z) {
  const T = level.terrain, d = T.dunes, ax = Math.abs(x);
  const f = smooth(T.flatHalfWidth, T.flatHalfWidth + 70, ax);
  const h = (fbm(x * d.scale + 13.1, z * d.scale, 4) - 0.42) * d.amp * 2 + (noise2(x * d.detailScale, z * d.detailScale) - 0.5) * d.detailAmp;
  return f * (h + smooth(200, 1600, ax) * 30) - (1 - f) * 0.02;
}

function groundPatch(level, z0, z1, mat) {
  const size = level.terrain.size, segX = 110, segZ = Math.max(24, Math.round((z1 - z0) / 24));
  const g = new THREE.PlaneGeometry(size, z1 - z0, segX, segZ); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, cols = new Float32Array(p.count * 3), pal = level.palette;
  const sand = new THREE.Color(pal.sand), dark = new THREE.Color(pal.sandDark), light = new THREE.Color(pal.sandLight), sh = new THREE.Color(pal.shoulder), c = new THREE.Color();
  // non-uniform x spacing: dense near the road, sparse far away
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (size / 2), x = Math.sign(u) * Math.pow(Math.abs(u), 2.2) * size / 2;
    const sz = -(p.getZ(i) - (z1 - z0) / 2) + z0; // sim z
    const y = terrainHeight(level, x, sz); p.setXYZ(i, x, y, -sz);
    const n = fbm(x * 0.01, sz * 0.01, 3), m = fbm(x * 0.002 + 4, sz * 0.002, 2);
    c.copy(sand).lerp(dark, clamp((n - 0.45) * 2.2, 0, 1) * 0.8).lerp(light, clamp((m - 0.55) * 3, 0, 1) * 0.6);
    const ax = Math.abs(x); if (ax < 13) c.lerp(sh, smooth(13, 7.5, ax) * 0.55);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.userData.tag = 'ground'; return m;
}

function roadTexture(level) {
  const pal = level.palette, W = 512, H = 1024; // 14 m x 28 m tile
  const tex = canvasTex(W, H, (g) => {
    g.fillStyle = pal.asphalt; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 60, 0.5, 77, 1.4);
    const mPx = W / 14, X = m => W / 2 + m * mPx;
    // tire-worn darker tracks in each lane
    g.globalAlpha = 0.18; g.fillStyle = '#120e16'; for (const l of [-1, 0, 1]) for (const o of [-0.8, 0.8]) g.fillRect(X(l * 3.4 + o) - 14, 0, 28, H); g.globalAlpha = 1;
    // edge lines
    g.fillStyle = pal.edgeLine; g.fillRect(X(-5.4) - 5, 0, 10, H); g.fillRect(X(5.4) - 5, 0, 10, H);
    // dashed lane dividers: 3 m dash every 9 m (28 m tile ~ 3 dashes)
    g.fillStyle = pal.laneLine; for (const lx of [-1.7, 1.7]) for (let k = 0; k < 3; k++) { const y0 = k * H / 3; g.fillRect(X(lx) - 4, y0, 8, H / 9.3); }
    // shoulders (outside edge line): lighter, dusty
    g.fillStyle = pal.asphaltLight; g.globalAlpha = 0.65; g.fillRect(0, 0, X(-5.6), H); g.fillRect(X(5.6), 0, W - X(5.6), H); g.globalAlpha = 1;
    // rumble strip dashes
    for (let k = 0; k < 14; k++) { g.fillStyle = k % 2 ? pal.rumble[0] : pal.rumble[1]; g.fillRect(X(-6.6), k * H / 14, 14, H / 14); g.fillRect(X(6.6) - 14, k * H / 14, 14, H / 14); }
    speckle(g, W, H, 30, 0.25, 91, 0.6);
    // cracks / tar snakes
    g.strokeStyle = 'rgba(10,8,14,0.55)'; g.lineWidth = 2; const r = rng(4);
    for (let i = 0; i < 10; i++) { let x = X((r() - 0.5) * 10), y = r() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 24; y += 6 + r() * 14; g.lineTo(x, y); } g.stroke(); }
  });
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function sandTexture(level) {
  const tex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); speckle(g, w, h, 140, 0.55, 12, 0.5); }, { srgb: false });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
}
function signTexture(text, color = '#2f6e3a') {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h); g.strokeStyle = '#f4f1ea'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#f4f1ea'; g.font = '900 64px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  });
}
/* Mesas: noise-displaced cylinders with flat tops and strata colors, merged into one draw call. */
function mesas(level, C) {
  const M = level.terrain.mesas, r = rng(M.seed), pal = level.palette.mesa, parts = [], gapZ1 = C.ROAD_LEN + C.CANYON_W;
  for (let i = 0; i < M.count; i++) {
    const side = r() < 0.5 ? -1 : 1, dist = lerp(M.minDist, M.maxDist, Math.pow(r(), 0.8));
    const x = side * dist * (0.4 + r() * 0.6), z = -600 + r() * (gapZ1 + 3600);
    if (Math.abs(x) < 160) continue;
    const h = lerp(M.height[0], M.height[1], r()), rad = lerp(M.radius[0], M.radius[1], r()), segs = 9 + Math.floor(r() * 5);
    const g = new THREE.CylinderGeometry(rad * (0.72 + r() * 0.15), rad, h, segs, 7).toNonIndexed();
    const p = g.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color(), seed = r() * 100;
    for (let k = 0; k < p.count; k++) {
      let vx = p.getX(k), vy = p.getY(k) + h / 2, vz = p.getZ(k);
      const a = Math.atan2(vz, vx), top = vy > h - 0.01;
      const n = 0.75 + 0.5 * noise2(a * 2.2 + seed, vy * 0.03 + seed) + (vy < h * 0.35 ? 0.25 * (1 - vy / (h * 0.35)) : 0); // talus flare at the base
      if (!top) { vx *= n; vz *= n; } else { vx *= 0.92; vz *= 0.92; }
      p.setXYZ(k, vx * (1 + 0.4 * (side * 0)), vy, vz);
      const band = Math.floor((vy / h) * 6 + noise2(a, seed) * 1.2);
      c.set(pal[((band % pal.length) + pal.length) % pal.length]).multiplyScalar(top ? 0.95 : 0.85 + 0.15 * (vy / h));
      cols.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.deleteAttribute('uv'); g.computeVertexNormals();
    xf(g, { x, y: terrainHeight(level, x, z) - 4, z: -z, ry: r() * TAU, sx: 1 + r() * 0.8 });
    parts.push(g);
  }
  return merge(parts);
}

export function buildWorld(level, S, renderer, { lowQ = false } = {}) {
  const C = S.C, scene = new THREE.Scene(), t = level.time;
  scene.fog = new THREE.Fog(t.fog.color, t.fog.near, t.fog.far);
  // sky dome follows the camera
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(level)); sky.scale.setScalar(4500); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  // environment: the same sky + a sand-colored ground hemisphere, prefiltered (PMREM)
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMaterial(level, { stars: false })); envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(level.palette.sand).multiplyScalar(0.55) })); envGround.rotation.x = -Math.PI / 2; envGround.position.y = -2; envScene.add(envGround);
  const envRT = pm.fromScene(envScene, 0.03); scene.environment = envRT.texture; scene.environmentIntensity = t.envIntensity ?? 1; pm.dispose();
  // lights
  const sunDir = sunDirection(level);
  const hemi = new THREE.HemisphereLight(t.hemi.sky, t.hemi.ground, t.hemi.intensity); scene.add(hemi);
  const sun = new THREE.DirectionalLight(t.sun.color, t.sun.intensity);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 260;
  scene.add(sun); scene.add(sun.target);
  if (t.fill) { const f = new THREE.DirectionalLight(t.fill.color, t.fill.intensity), e = t.fill.elevation * DEG, a = t.fill.azimuth * DEG;
    f.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(100); scene.add(f); scene.add(f.target); }

  // ground (near side up to the rim, far side from the far rim)
  const sandMap = sandTexture(level); sandMap.repeat.set(level.terrain.size / 6, 1);
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: sandMap });
  groundMat.onBeforeCompile = sh => { // world-space sand detail so the texture never stretches with the non-uniform grid
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = (modelMatrix * vec4(position,1.0)).xz / 5.0;');
  };
  const near = groundPatch(level, -900, C.ROAD_LEN, groundMat), far = groundPatch(level, C.ROAD_LEN + C.CANYON_W, C.ROAD_LEN + C.CANYON_W + 4200, groundMat);
  scene.add(near, far);
  // road
  const roadTex = roadTexture(level), roadLen = C.ROAD_LEN - C.RAMP_LEN + 900;
  roadTex.repeat.set(1, roadLen / 28);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82, metalness: 0, bumpMap: roadTex, bumpScale: 0.6 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(14, roadLen), roadMat); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.015, -(C.ROAD_LEN - C.RAMP_LEN - roadLen / 2)); road.receiveShadow = true; scene.add(road);
  const farLen = 4000, farTex = roadTex.clone(); farTex.repeat.set(1, farLen / 28); farTex.needsUpdate = true;
  const roadFar = new THREE.Mesh(new THREE.PlaneGeometry(14, farLen), new THREE.MeshStandardMaterial({ map: farTex, roughness: 0.82, bumpMap: farTex, bumpScale: 0.6 }));
  roadFar.rotation.x = -Math.PI / 2; roadFar.position.set(0, 0.015, -(C.ROAD_LEN + C.CANYON_W + farLen / 2)); roadFar.receiveShadow = true; scene.add(roadFar);
  const gorge = buildCanyon(level, S, terrainHeight); scene.add(gorge.group);
  const gorgeProps = []; gorge.group.traverse(o => { if (o.userData.tag === 'canyonProps') gorgeProps.push(o); });
  const mesaMesh = new THREE.Mesh(mesas(level, C), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  scene.add(mesaMesh);

  // roadside scatter (instanced): cacti, boulders, scrub; keeps clear of the lanes and the gorge
  const sc2 = level.terrain.scatter, r = rng(sc2.seed), pal = level.palette, gap = [C.ROAD_LEN - 10, C.ROAD_LEN + C.CANYON_W + 10];
  const place = (n, minX, spread, zMin, zMax) => { const out = []; let guard = 0; while (out.length < n && guard++ < n * 5) { const side = r() < 0.5 ? -1 : 1, x = side * (minX + Math.pow(r(), 1.6) * spread), z = zMin + r() * (zMax - zMin); if (z > gap[0] && z < gap[1]) continue; out.push([x, z]); } return out; };
  // Scatter is split into z-chunks (one InstancedMesh each, with a real bounding sphere) so three.js frustum-culls
  // them, the shadow pass only draws the chunk(s) inside the ±34 m sun frustum, and setDrawDistance() can drop far chunks.
  const CHUNK = 240, chunks = [];
  const inst = (geo, mat, pts, sFn, cast, tag) => {
    const o = new THREE.Object3D(), mats = pts.map(([x, z]) => { o.position.set(x, terrainHeight(level, x, z) - 0.05, -z); o.rotation.set(0, r() * TAU, 0); o.scale.setScalar(sFn()); o.updateMatrix(); return [z, o.matrix.clone()]; });
    const by = new Map(); for (const [z, m] of mats) { const k = Math.floor(z / CHUNK); if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
    for (const [k, list] of by) {
      const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.computeBoundingSphere(); m.castShadow = !!cast; m.receiveShadow = true; m.userData.tag = tag; m.userData.z0 = k * CHUNK; m.userData.z1 = (k + 1) * CHUNK;
      scene.add(m); chunks.push(m);
    }
  };
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const vcFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const zEnd = C.ROAD_LEN + C.CANYON_W + 2500;
  inst(P.saguaro(pal.cactus, 21, 1, 0), vc, place(sc2.cactus, sc2.minX + 2, sc2.spread, -300, zEnd), () => 0.8 + r() * 0.7, true, 'scatter');
  inst(P.sandstone(pal.rock, 31, 1.6, 0.72, 1), vcFlat, place(sc2.rock, sc2.minX + 3, sc2.spread, -300, zEnd), () => 0.6 + r() * 2.2, false, 'scatter');
  inst(P.scrub(7, 4), vcFlat, place(sc2.scrub, sc2.minX - 1, sc2.spread * 0.6, -300, zEnd), () => 0.7 + r() * 0.9, false, 'scatter');
  // telephone poles + sagging wires
  const PL = level.terrain.poles, polePts = []; for (let z = -200; z < C.ROAD_LEN - 30; z += PL.spacing) polePts.push([PL.side * PL.offset, z]);
  for (let z = C.ROAD_LEN + C.CANYON_W + 40; z < C.ROAD_LEN + C.CANYON_W + 2400; z += PL.spacing) polePts.push([PL.side * PL.offset, z]);
  const poleM = new THREE.InstancedMesh(P.pole(pal.pole, PL.height), vc, polePts.length), o = new THREE.Object3D(); poleM.userData.tag = 'poles';
  polePts.forEach(([x, z], i) => { o.position.set(x, 0, -z); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix(); poleM.setMatrixAt(i, o.matrix); });
  poleM.castShadow = true; scene.add(poleM);
  const wire = []; for (let i = 0; i < polePts.length - 1; i++) { const [x, z0] = polePts[i], z1 = polePts[i + 1][1]; if (z1 - z0 > PL.spacing + 1) continue; for (const wx of [-1, 1]) for (let k = 0; k < 8; k++) { const a = k / 8, b = (k + 1) / 8, sag = q => Math.sin(q * Math.PI) * 1.1; wire.push(x + wx, PL.height - 0.4 - sag(a), -(z0 + (z1 - z0) * a), x + wx, PL.height - 0.4 - sag(b), -(z0 + (z1 - z0) * b)); } }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: pal.wire, transparent: true, opacity: 0.7 })));
  // reflector posts on both shoulders (red caps glow a little)
  const RF = level.terrain.reflectors, rp = []; for (let z = -100; z < C.ROAD_LEN - C.RAMP_LEN - 10; z += RF.spacing) { rp.push([-RF.offset, z], [RF.offset, z + RF.spacing / 2]); }
  const refMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: '#ff2020', emissiveIntensity: 0.0 });
  refMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * step(0.5, vColor.r - vColor.g) * 2.2;'); };
  const refM = new THREE.InstancedMesh(P.reflectorPost(), refMat, rp.length);
  rp.forEach(([x, z], i) => { o.position.set(x, 0, -z); o.updateMatrix(); refM.setMatrixAt(i, o.matrix); }); scene.add(refM);
  // distance signs
  for (const sg of level.terrain.signs) {
    const grp = new THREE.Group(), face = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.6), new THREE.MeshStandardMaterial({ map: signTexture(sg.text), roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.05 }));
    face.position.y = 4.2; grp.add(face);
    for (const sx of [-1.8, 1.8]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.2, 0.14), new THREE.MeshStandardMaterial({ color: '#8d8a86', metalness: 0.6, roughness: 0.4 })); post.position.set(sx, 2.1, -0.05); post.castShadow = true; grp.add(post); }
    grp.position.set(-10.5, 0, -sg.at); grp.rotation.y = 0.12; scene.add(grp);
  }
  // Far scenery culling (render-only): chunks more than `dist` m ahead of / 140 m behind the camera are hidden.
  let drawDist = 1e9;
  const cull = camZ => { for (const m of chunks) m.visible = m.userData.z1 > camZ - 140 && m.userData.z0 < camZ + drawDist;
    for (const m of gorgeProps) m.visible = camZ > C.ROAD_LEN - drawDist * 0.6 && camZ < C.ROAD_LEN + C.CANYON_W + 400; }; // river boulders / scrub only near the gorge
  return { scene, sky, sun, sunDir, hemi, envRT, roadMat, groundMat, chunks, setDrawDistance(d) { drawDist = d; }, update: (t, camZ) => { gorge.update(t); if (camZ != null) cull(camZ); } };
}
