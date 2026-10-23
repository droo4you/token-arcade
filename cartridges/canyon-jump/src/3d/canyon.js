/* The gorge, the kicker and the landing zone, built from the level + the sim's wall profile (CJSim.C.WALL), so what
   you see is what you can hit: the walls jut into the gap exactly as far as CJSim.wallInset() says (render-only
   erosion only ever carves *into* the rock, giving more room, never less). Sim coords map to three.js as
   (x, y, z) -> (x, y, -z). */
import * as THREE from '../../vendor/three/three.module.min.js';
import { TAU, rng, clamp, smooth, lerp, fbm, noise2, tint, merge, xf, canvasTex } from './util.js';
import * as P from './props.js';

const ridged = (x, y) => 1 - Math.abs(noise2(x, y) * 2 - 1);

/* One cliff wall. dir = +1 for the near wall (rock behind it at smaller z), -1 for the far wall. */
function wall(level, S, terrainHeight, rimZ, dir, seed) {
  const C = S.C, D = C.CANYON_DEPTH, cz = level.canyon, strata = cz.strata.map(h => new THREE.Color(h));
  const X = 2300, cols = 180;
  // depth samples: every 2.5 m plus the profile keys (crisp bench edges)
  const ds = new Set([-0.6]); for (let d = 0; d <= D; d += 3.5) ds.add(+d.toFixed(2)); for (const [d] of C.WALL) { ds.add(d); ds.add(Math.max(0, d - 0.6)); ds.add(Math.min(D, d + 0.6)); }
  const rows = [...ds].sort((a, b) => a - b);
  const pos = new Float32Array((cols + 1) * rows.length * 3), colr = new Float32Array(pos.length), c = new THREE.Color(), tmp = new THREE.Color();
  const benchK = d => { // 1 on the gentle bench slopes, 0 on cliff faces
    const W = C.WALL; for (let k = 0; k < W.length - 1; k++) if (d >= W[k][0] && d <= W[k + 1][0]) { const slope = (W[k + 1][1] - W[k][1]) / Math.max(0.01, W[k + 1][0] - W[k][0]); return smooth(0.4, 1.6, slope); } return 0; };
  let v = 0;
  for (let j = 0; j < rows.length; j++) {
    const d = rows[j];
    for (let i = 0; i <= cols; i++) {
      const u = i / cols * 2 - 1, x = Math.sign(u) * Math.pow(Math.abs(u), 1.9) * X, ax = Math.abs(x);
      const top = terrainHeight(level, x, rimZ + dir * 1.5);
      // depth below the local top, scaled so the floor stays at -D wherever the plateau rises
      const y = d < 0 ? top + 0.6 : top - d * (top + D) / D;
      // erosion into the rock: fluted columns on cliffs, wavy benches, and big buttresses / side canyons away from the flight line
      // gullies: ridged noise stretched vertically at two scales, deepest on the cliff bands
      // Columnar basalt: tall, tight vertical flutes (small d-scale) + broader buttresses — Twin Falls cliffs, not mesa benches.
      const gully = Math.pow(ridged(x * 0.038 + seed, d * 0.0035), 2.5) * 12 + Math.pow(ridged(x * 0.11 + seed * 2, d * 0.012), 2.1) * 4.5;
      const flute = gully + fbm(x * 0.018 + seed, d * 0.018, 3) * cz.wallJitter;
      const butt = (0.3 + 0.7 * smooth(40, 260, ax)) * (Math.pow(fbm(x * 0.0035 + seed * 3, 0.5, 3), 1.6) * 90 + ridged(x * 0.006 + seed, d * 0.004) * 18);
      const off = d < 0 ? 0 : (flute * (1 - benchK(d) * 0.6) + butt) * smooth(0, 3, d);
      const z = rimZ + dir * (S.wallInset(Math.max(0, d)) - off);
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = -z;
      // strata by depth (wobbly), desert varnish streaks down cliffs, sunlit benches, darker toward the bottom
      // fine strata: a continuous band coordinate (gently warped) blended between neighbours, plus thin pale ledges
      const bf = clamp((d / D) * (strata.length - 1) + (fbm(x * 0.006 + seed, d * 0.01, 2) - 0.5) * 0.9, 0, strata.length - 1.001), b0 = Math.floor(bf), bt = smooth(0.25, 0.75, bf - b0);
      c.copy(strata[b0]).lerp(strata[b0 + 1], bt);
      const thin = Math.pow(Math.abs(Math.sin((d + fbm(x * 0.01, 2, 2) * 3) * 0.9)), 18); c.lerp(tmp.set(strata[0]), thin * 0.35);
      const streak = Math.pow(noise2(x * 0.4 + seed, d * 0.015), 3) * (1 - benchK(d));
      // Darker joints in the flutes, cooler pale ledges, deeper shade toward the river.
      c.multiplyScalar(0.82 + 0.26 * fbm(x * 0.06, d * 0.12, 2) - streak * 0.4 - clamp(gully / 11, 0, 1) * 0.34 * (1 - benchK(d)));
      if (benchK(d) > 0.2) c.lerp(tmp.set('#9aa2a8'), benchK(d) * 0.28);
      c.multiplyScalar(1 - 0.38 * smooth(0.25, 1, d / D));
      if (d < 0.5) c.lerp(tmp.set(level.palette.sand), 0.6);
      colr[v * 3] = c.r; colr[v * 3 + 1] = c.g; colr[v * 3 + 2] = c.b; v++;
    }
  }
  const idx = [];
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, cc = a + cols + 1, dd = cc + 1;
    if (dir > 0) idx.push(a, b, cc, b, dd, cc); else idx.push(a, cc, b, b, cc, dd);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3)); g.setIndex(idx);
  const flat = g.toNonIndexed(); flat.computeVertexNormals(); g.dispose();
  return flat;
}

function waterNormalTex() {
  const t = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data, H = (x, y) => fbm(x / 22, y / 9, 4) * 0.7 + noise2(x / 6, y / 3) * 0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // tileable-ish by sampling on a torus of offsets
      const hx = H(x + 1, y) - H(x - 1, y), hy = H(x, y + 1) - H(x, y - 1), i = (y * w + x) * 4;
      d[i] = 128 + hx * 400; d[i + 1] = 128 + hy * 400; d[i + 2] = 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, aniso: 4 });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function floorAndRiver(level, S, group, seed) {
  const C = S.C, D = C.CANYON_DEPTH, inset = S.wallInset(D), z0 = C.ROAD_LEN + inset - 6, z1 = C.ROAD_LEN + C.CANYON_W - inset + 6;
  const mid = C.ROAD_LEN + C.CANYON_W / 2, rw = level.canyon.river.width, X = 2300;
  const meander = x => Math.sin(x * 0.0042 + seed) * 22 + Math.sin(x * 0.011) * 6;
  // floor: sand bars and gravel, gently bumpy, never above the splash line
  const fg = new THREE.PlaneGeometry(X * 2, z1 - z0, 200, 24); fg.rotateX(-Math.PI / 2);
  const p = fg.attributes.position, cols = new Float32Array(p.count * 3), sand = new THREE.Color(level.palette.sand), light = new THREE.Color(level.palette.sandLight), wet = new THREE.Color(level.canyon.strata.at(-1)), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / X, x = Math.sign(u) * Math.pow(Math.abs(u), 1.8) * X, z = mid - p.getZ(i) * ((z1 - z0) / (z1 - z0));
    const zr = Math.abs(z - (mid + meander(x)));
    const y = -D - 0.4 + smooth(rw * 0.5, rw * 0.5 + 30, zr) * (0.5 + fbm(x * 0.02, z * 0.02, 3) * 0.6);
    p.setXYZ(i, x, y, -z);
    c.copy(sand).lerp(light, 0.35 * fbm(x * 0.01 + 7, z * 0.02, 2)).lerp(wet, 0.55 * (1 - smooth(rw * 0.5, rw * 0.5 + 16, zr))).multiplyScalar(0.85 + 0.25 * fbm(x * 0.03, z * 0.05, 2));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  fg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); fg.computeVertexNormals();
  const floor = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); floor.receiveShadow = true; group.add(floor);
  // river: a meandering ribbon with foamy banks and a scrolling normal map
  const n = 260, rp = [], rc = [], ru = [], ri = [], water = new THREE.Color(level.canyon.river.color), foam = new THREE.Color('#e8fff8');
  for (let i = 0; i <= n; i++) {
    const u = i / n * 2 - 1, x = Math.sign(u) * Math.pow(Math.abs(u), 1.8) * X, zc = mid + meander(x);
    for (let k = 0; k <= 4; k++) {
      const f = k / 4, z = zc + (f - 0.5) * rw; rp.push(x, -D + 0.25, -z); ru.push(x / 30, f * rw / 30);
      c.copy(water).lerp(foam, Math.pow(Math.abs(f - 0.5) * 2, 6) * 0.7); rc.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const a = i * 5 + k, b = a + 5; ri.push(a, b, a + 1, a + 1, b, b + 1); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2)); rg.setIndex(ri); rg.computeVertexNormals();
  const nrm = waterNormalTex();
  const riverMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.15, normalMap: nrm, normalScale: new THREE.Vector2(0.6, 0.6), emissive: level.canyon.river.color, emissiveIntensity: 0.18, envMapIntensity: 1.35 });
  const river = new THREE.Mesh(rg, riverMat); river.receiveShadow = true; group.add(river);
  // boulders, riverside scrub and hoodoo spires (well outside the |x| <= SKY_X flight corridor)
  const r = rng(seed * 31 + 7), o = new THREE.Object3D(), vcFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const bould = new THREE.InstancedMesh(P.sandstone(level.palette.rock, 41, 1.5), vcFlat, 100);
  for (let i = 0; i < 100; i++) { const x = (r() * 2 - 1) * 1200, side = r() < 0.5 ? -1 : 1, z = mid + meander(x) + side * (rw * 0.5 + 6 + r() * 70);
    o.position.set(x, -D - 0.3, -z); o.rotation.set(0, r() * TAU, 0); o.scale.setScalar(0.6 + r() * 3); o.updateMatrix(); bould.setMatrixAt(i, o.matrix); }
  bould.receiveShadow = true; bould.userData.tag = 'canyonProps'; group.add(bould);
  const scrubMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, color: '#c4d0ac' });
  const bush = new THREE.InstancedMesh(P.scrub(13), scrubMat, 180);
  for (let i = 0; i < 180; i++) { const x = (r() * 2 - 1) * 1300, side = r() < 0.5 ? -1 : 1, z = mid + meander(x) + side * (rw * 0.5 + 1 + r() * 9);
    o.position.set(x, -D - 0.2, -z); o.rotation.set(0, r() * TAU, 0); o.scale.setScalar(1 + r() * 1.8); o.updateMatrix(); bush.setMatrixAt(i, o.matrix); }
  bush.userData.tag = 'canyonProps'; group.add(bush);
  const spireParts = [];
  for (let i = 0; i < 9; i++) {
    const side = r() < 0.5 ? -1 : 1, x = side * (90 + r() * 700), z = mid + (r() - 0.5) * 120, h = 45 + r() * 50, rad = 6 + r() * 9;
    spireParts.push(hoodoo(level, h, rad, i + seed, x, -D, z));
  }
  const spires = new THREE.Mesh(merge(spireParts), vcFlat); spires.castShadow = false; spires.receiveShadow = true; group.add(spires);
  return { river, riverMat, nrm };
}

/* A banded rock spire: stacked, noise-displaced drums that narrow upward, with a caprock. */
function hoodoo(level, h, rad, seed, x, y0, z) {
  const r = rng(seed * 97 + 3), parts = [], strata = level.canyon.strata, n = 5 + Math.floor(r() * 3);
  let y = 0;
  for (let k = 0; k < n; k++) {
    const hh = h / n, rr = rad * (1 - k / n * 0.45) * (0.85 + r() * 0.3);
    const g = new THREE.CylinderGeometry(rr * (0.8 + r() * 0.2), rr, hh, 9, 2);
    const ps = g.attributes.position; for (let i = 0; i < ps.count; i++) { const a = Math.atan2(ps.getZ(i), ps.getX(i)), f = 0.8 + 0.4 * noise2(a * 2 + seed, k + ps.getY(i) * 0.1); ps.setX(i, ps.getX(i) * f); ps.setZ(i, ps.getZ(i) * f); }
    parts.push(tint(xf(g, { y: y + hh / 2 }), strata[(k + seed) % strata.length], 0.15, seed + k)); y += hh;
  }
  parts.push(tint(xf(new THREE.CylinderGeometry(rad * 0.9, rad * 0.6, 3, 8), { y: y + 1.2 }), level.canyon.strata[0], 0.1, seed + 99));
  const g = merge(parts); g.computeVertexNormals(); xf(g, { x, y: y0, z: -z, ry: r() * TAU });
  return g;
}

/* The kicker: chevron deck on a steel truss, edge rails, an LED lip and pylons with flags. */
function rampTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#ffcf1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1220'; for (let i = 0; i < 6; i++) { const y = 30 + i * 80; g.beginPath(); g.moveTo(20, y + 50); g.lineTo(128, y); g.lineTo(236, y + 50); g.lineTo(236, y + 74); g.lineTo(128, y + 24); g.lineTo(20, y + 74); g.closePath(); g.fill(); }
    g.fillStyle = '#ff3b5c'; g.fillRect(0, 0, 16, h); g.fillRect(w - 16, 0, 16, h);
    g.globalAlpha = 0.18; g.fillStyle = '#000'; const r = rng(5); for (let i = 0; i < 400; i++) g.fillRect(r() * w, r() * h, 2, 2); g.globalAlpha = 1;
  }, { repeat: [1, 1] });
}
function buildRamp(C, S) {
  const grp = new THREE.Group(), W = 7.2, N = 28, z0 = C.ROAD_LEN - C.RAMP_LEN;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) { const z = z0 + (C.RAMP_LEN * i) / N, y = S.rampY(z) + 0.04; pos.push(-W, y, -z, W, y, -z); uv.push(0, i / N * 5, 1, i / N * 5); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const deck = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.55, metalness: 0.1, emissive: '#ffb000', emissiveIntensity: 0.06, side: THREE.DoubleSide }));
  deck.receiveShadow = true; deck.castShadow = true; grp.add(deck);
  // deck slab thickness (underside) so it reads as a solid plate
  const under = g.clone(); under.translate(0, -0.35, 0); const um = new THREE.Mesh(under, new THREE.MeshStandardMaterial({ color: '#3a3440', roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide })); grp.add(um);
  // steel: rails along the edges, posts and X braces under the deck (one instanced draw call)
  const steel = new THREE.MeshStandardMaterial({ color: '#5b5f6b', metalness: 0.85, roughness: 0.35, envMapIntensity: 1.2 });
  const beams = [], o = new THREE.Object3D();
  const beam = (x0, y0, za, x1, y1, zb, t = 0.22) => { const a = new THREE.Vector3(x0, y0, -za), b = new THREE.Vector3(x1, y1, -zb), len = a.distanceTo(b); o.position.copy(a).add(b).multiplyScalar(0.5); o.lookAt(b); o.scale.set(t, t, len); o.updateMatrix(); beams.push(o.matrix.clone()); };
  for (const sx of [-1, 1]) {
    for (let i = 0; i < N; i++) { const za = z0 + C.RAMP_LEN * i / N, zb = z0 + C.RAMP_LEN * (i + 1) / N; beam(sx * (W + 0.15), S.rampY(za) + 0.55, za, sx * (W + 0.15), S.rampY(zb) + 0.55, zb, 0.18); } // top rail
    for (let k = 1; k <= 7; k++) { const z = z0 + C.RAMP_LEN * k / 7, y = S.rampY(z) - 0.3; if (y < 0.3) continue;
      beam(sx * (W - 0.4), 0, z, sx * (W - 0.4), y, z, 0.32); beam(0, 0, z, 0, y, z, 0.32); // posts
      const zp = z0 + C.RAMP_LEN * (k - 1) / 7, yp = Math.max(0, S.rampY(zp) - 0.3); beam(sx * (W - 0.4), 0, zp, sx * (W - 0.4), y, z, 0.16); beam(sx * (W - 0.4), yp, zp, sx * (W - 0.4), 0, z, 0.16); // X braces
      beam(-W + 0.4, y, z, W - 0.4, y, z, 0.24); } // cross member
  }
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, beams.length); beams.forEach((m, i) => bm.setMatrixAt(i, m)); bm.castShadow = true; bm.receiveShadow = true; grp.add(bm);
  // lip: steel nose plate + LED strip
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.6, 0.5, 0.5), steel); lip.position.set(0, C.RAMP_H - 0.15, -C.ROAD_LEN - 0.1); lip.castShadow = true; grp.add(lip);
  const ledMat = new THREE.MeshStandardMaterial({ color: '#0a2a30', emissive: '#4ff0ff', emissiveIntensity: 3 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.12, 0.06), ledMat); led.position.set(0, C.RAMP_H - 0.05, -C.ROAD_LEN - 0.38); grp.add(led);
  // pylons with chevron lights and flags at the lip
  const pyl = new THREE.MeshStandardMaterial({ color: '#2a2030', metalness: 0.4, roughness: 0.5 });
  const flagMat = new THREE.MeshStandardMaterial({ map: checkerTex(), side: THREE.DoubleSide, roughness: 0.8 });
  const flags = [];
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 14, 10), pyl); pole.position.set(sx * (W + 2.2), 7, -C.ROAD_LEN + 0.5); pole.castShadow = true; grp.add(pole);
    for (let k = 0; k < 4; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 16), ledMat); ring.rotation.x = Math.PI / 2; ring.position.set(sx * (W + 2.2), 4 + k * 2.6, -C.ROAD_LEN + 0.5); grp.add(ring); }
    const fg = new THREE.PlaneGeometry(3.2, 2, 12, 2); fg.translate(1.6, 0, 0);
    const flag = new THREE.Mesh(fg, flagMat); flag.position.set(sx * (W + 2.2), 13, -C.ROAD_LEN + 0.5); flag.rotation.y = sx > 0 ? Math.PI : 0; flag.userData.base = fg.attributes.position.array.slice(); grp.add(flag); flags.push(flag);
  }
  return { group: grp, ledMat, flags };
}
function checkerTex() {
  return canvasTex(128, 80, (g, w, h) => { for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'; g.fillRect(x * 16, y * 16, 16, 16); } });
}

/* The far rim: a marked landing strip, runway-style light pylons and checkered flags at the edge. */
function landingZone(level, S) {
  const C = S.C, grp = new THREE.Group(), FAR = C.ROAD_LEN + C.CANYON_W;
  const tex = canvasTex(256, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * 32, h - 64 + y * 8, 32, 8); // checkered start line
    for (let i = 0; i < 5; i++) { const y = h - 180 - i * 150; g.beginPath(); g.moveTo(30, y + 70); g.lineTo(128, y); g.lineTo(226, y + 70); g.lineTo(226, y + 100); g.lineTo(128, y + 30); g.lineTo(30, y + 100); g.closePath(); g.fill(); }
    g.font = '900 64px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.save(); g.translate(w / 2, 120); g.fillText('LAND', 0, 0); g.restore();
  }, { aniso: 8 });
  const deco = new THREE.Mesh(new THREE.PlaneGeometry(10, 120), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 }));
  deco.rotation.x = -Math.PI / 2; deco.position.set(0, 0.03, -(FAR + 8 + 60)); deco.receiveShadow = true; grp.add(deco);
  const lightMat = new THREE.MeshStandardMaterial({ color: '#331a00', emissive: '#ffb347', emissiveIntensity: 4 });
  const postMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const post = merge([tint(xf(new THREE.CylinderGeometry(0.1, 0.14, 1.6, 8), { y: 0.8 }), '#f2efe8'), tint(xf(new THREE.BoxGeometry(0.6, 0.12, 0.6), { y: 0.06 }), '#3a3440')]);
  const bulb = new THREE.SphereGeometry(0.22, 10, 6); bulb.translate(0, 1.7, 0);
  const pts = []; for (let z = FAR + 6; z < FAR + 640; z += 24) pts.push([-9, z], [9, z]);
  const pm = new THREE.InstancedMesh(post, postMat, pts.length), lm = new THREE.InstancedMesh(bulb, lightMat, pts.length), o = new THREE.Object3D();
  pts.forEach(([x, z], i) => { o.position.set(x, 0, -z); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); lm.setMatrixAt(i, o.matrix); });
  grp.add(pm, lm);
  return { group: grp, lightMat };
}


/* Tall basalt column props along the cliff faces (outside the flight corridor). Cheap instanced cylinders. */
function basaltColumns(level, S, group, seed) {
  const n = level.canyon.columns | 0; if (!n) return;
  const C = S.C, D = C.CANYON_DEPTH, r = rng(seed * 53 + 11), o = new THREE.Object3D();
  const strata = level.canyon.strata;
  const geo = new THREE.CylinderGeometry(1, 1.05, 1, 6, 1);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  const baseCol = new THREE.Color(strata[Math.min(2, strata.length - 1)]);
  const g = geo.clone();
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    const k = 0.85 + (i % 5) * 0.03; cols[i * 3] = baseCol.r * k; cols[i * 3 + 1] = baseCol.g * k; cols[i * 3 + 2] = baseCol.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mesh = new THREE.InstancedMesh(g, mat, n);
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const rimZ = side > 0 ? C.ROAD_LEN : C.ROAD_LEN + C.CANYON_W;
    const x = (r() < 0.5 ? -1 : 1) * (55 + r() * 900);
    const h = 30 + r() * 60;
    const rad = 2.2 + r() * 3.2;
    const inset = S.wallInset(h * 0.55) + 1.5 + r() * 3;
    const z = rimZ + side * inset;
    const yTop = -10 - r() * 40; // tops stay below the rim lip (no posts poking above the plateau)
    o.position.set(x, yTop - h / 2, -z);
    o.rotation.set((r() - 0.5) * 0.08, r() * TAU, (r() - 0.5) * 0.06);
    o.scale.set(rad, h, rad * (0.9 + r() * 0.2));
    o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
  }
  mesh.receiveShadow = true; mesh.userData.tag = 'canyonProps'; group.add(mesh);
}

export function buildCanyon(level, S, terrainHeight) {
  const C = S.C, group = new THREE.Group(), seed = level.canyon.seed ?? 3;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, flatShading: true });
  const near = new THREE.Mesh(wall(level, S, terrainHeight, C.ROAD_LEN, 1, seed), mat), far = new THREE.Mesh(wall(level, S, terrainHeight, C.ROAD_LEN + C.CANYON_W, -1, seed + 17), mat);
  near.receiveShadow = far.receiveShadow = true; group.add(near, far);
  basaltColumns(level, S, group, seed);
  const fr = floorAndRiver(level, S, group, seed);
  const ramp = buildRamp(C, S); group.add(ramp.group);
  const land = landingZone(level, S); group.add(land.group);
  if (level.canyon.plaque) {
    const pl = level.canyon.plaque, side = pl.side || -1, z = C.ROAD_LEN + (pl.zOff || -24);
    const tex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#2a2c30'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c8b070'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
      g.fillStyle = '#e8d8a8'; g.font = '700 48px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(pl.text || 'SKYCYCLE', w / 2, h * 0.42);
      g.font = '600 32px "Trebuchet MS", system-ui, sans-serif'; g.fillStyle = '#a8b0b8';
      g.fillText(pl.sub || '', w / 2, h * 0.72);
    }, { aniso: 4 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.04 }));
    face.position.set(side * 9.2, 1.1, -z); face.rotation.y = side > 0 ? -0.2 : 0.2; group.add(face);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), new THREE.MeshStandardMaterial({ color: '#3a3a36', metalness: 0.4, roughness: 0.5 }));
    post.position.set(side * 9.2, 0.55, -z); post.castShadow = true; group.add(post);
  }

  return {
    group,
    update(t) {
      fr.nrm.offset.set(t * 0.035, t * 0.012);
      ramp.ledMat.emissiveIntensity = 2.4 + Math.sin(t * 6) * 1.2;
      land.lightMat.emissiveIntensity = 3 + Math.sin(t * 4) * 1.5;
      for (const f of ramp.flags) { const a = f.geometry.attributes.position, b = f.userData.base; for (let i = 0; i < a.count; i++) { const x = b[i * 3]; a.array[i * 3 + 2] = Math.sin(x * 1.6 - t * 9) * 0.22 * (x / 3.2); } a.needsUpdate = true; }
    },
  };
}
