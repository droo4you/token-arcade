/* Obstacle, pickup and roadside prop models. Each builder returns one merged, vertex-colored geometry so
   every type is a single InstancedMesh draw call. Sizes match the sim's hitbox half-widths
   (CJSim.C.OBST_HW): cactus 0.85, rock 1.25, tumbleweed 0.8, cone 0.4. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { TAU, rng, tint, merge, xf, noise2, col } from './util.js';

function capsule(r, len, seg = 10) { return new THREE.CapsuleGeometry(r, len, 4, seg); }

/* Saguaro: ribbed trunk + two elbowed arms. Width across arms ≈ 1.7 m (hit half-width 0.85). */
export function saguaro(c, seed = 1, scale = 1, lod = 1) { // lod 0 = cheap roadside scenery (~10x fewer triangles)
  const r = rng(seed), parts = [], green = c, dark = new THREE.Color(c).multiplyScalar(0.7).getHex();
  const ribbed = (rad, len) => {
    const g = new THREE.CylinderGeometry(rad, rad * 1.04, len, lod ? 14 : 7, lod ? 6 : 1);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.07 * Math.cos(a * 7); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.computeVertexNormals(); return g;
  };
  const H = 4.2 + r() * 1.2;
  parts.push(tint(xf(ribbed(0.34, H), { y: H / 2 }), green, 0.12, seed));
  parts.push(tint(xf(new THREE.SphereGeometry(0.34, lod ? 14 : 7, lod ? 8 : 3, 0, TAU, 0, Math.PI / 2), { y: H, sy: 0.8 }), green, 0.1, seed + 1));
  for (const sx of [-1, 1]) {
    const y0 = 1.4 + r() * 1.2, up = 1.0 + r() * 1.1, out = 0.58;
    parts.push(tint(xf(ribbed(0.2, out), { x: sx * (out / 2 + 0.25), y: y0, rz: Math.PI / 2 }), dark, 0.1, seed + 2));
    parts.push(tint(xf(ribbed(0.21, up), { x: sx * (out + 0.25), y: y0 + up / 2 }), green, 0.1, seed + 3));
    parts.push(tint(xf(new THREE.SphereGeometry(0.21, lod ? 12 : 6, lod ? 6 : 2, 0, TAU, 0, Math.PI / 2), { x: sx * (out + 0.25), y: y0 + up }), green, 0.1, seed + 4));
    parts.push(tint(xf(new THREE.SphereGeometry(0.21, lod ? 10 : 6, lod ? 8 : 4), { x: sx * (out + 0.25), y: y0 }), green, 0.1, seed + 5));
  }
  const g = merge(parts); if (scale !== 1) g.scale(scale, scale, scale); return g;
}
/* Sandstone boulder: noise-displaced icosahedron, flat shaded, banded. Radius ≈ 1.25. */
export function sandstone(c, seed = 3, rad = 1.25, flat = 0.72) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, base = new THREE.Color(c), tmp = new THREE.Color();
  const r = rng(seed), ox = r() * 50, oy = r() * 50, colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i); const n = 0.78 + 0.42 * noise2(v.x * 1.7 + ox, v.y * 1.7 + v.z * 1.3 + oy);
    v.multiplyScalar(n * rad); v.y = v.y * flat + rad * flat * 0.55; if (v.y < 0) v.y *= 0.2; p.setXYZ(i, v.x, v.y, v.z);
  }
  for (let i = 0; i < p.count; i += 3) { // per-face color: strata bands by height + a little noise
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, band = Math.sin(y * 5.5 + seed) * 0.08 + (r() - 0.5) * 0.08;
    tmp.copy(base).multiplyScalar(0.92 + band + y * 0.06);
    for (let k = 0; k < 3; k++) colors.set([tmp.r, tmp.g, tmp.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.deleteAttribute('uv'); g.computeVertexNormals();
  return g;
}
/* Tumbleweed: a ball of thin tangled twig rings. Radius ≈ 0.8. */
export function tumbleweed(seed = 9) {
  const r = rng(seed), parts = [];
  for (let i = 0; i < 16; i++) {
    const t = new THREE.TorusGeometry(0.55 + r() * 0.25, 0.025 + r() * 0.015, 3, 18);
    parts.push(tint(xf(t, { rx: r() * TAU, ry: r() * TAU, rz: r() * TAU }), r() < 0.5 ? '#a7834f' : '#7d5e36', 0.25, seed + i));
  }
  for (let i = 0; i < 26; i++) { const tw = new THREE.CylinderGeometry(0.015, 0.015, 0.7 + r() * 0.5, 3); parts.push(tint(xf(tw, { rx: r() * TAU, ry: r() * TAU, rz: r() * TAU }), '#8f6e40', 0.3, seed + 40 + i)); }
  return merge(parts);
}
/* Traffic cone with reflective collar. Base half-width 0.4. */
export function cone() {
  return merge([
    tint(xf(new THREE.BoxGeometry(0.8, 0.06, 0.8), { y: 0.03 }), '#ff5a1f'),
    tint(xf(new THREE.CylinderGeometry(0.05, 0.27, 0.36, 18, 1, true), { y: 0.88 }), '#ff5a1f'),
    tint(xf(new THREE.CylinderGeometry(0.275, 0.33, 0.16, 18, 1, true), { y: 0.62 }), '#f4f4f0'),
    tint(xf(new THREE.CylinderGeometry(0.33, 0.39, 0.5, 18, 1, true), { y: 0.3 }), '#ff5a1f'),
  ]);
}
/* Pickups */
export function coin() {
  const disc = new THREE.CylinderGeometry(0.62, 0.62, 0.12, 32); disc.rotateX(Math.PI / 2);
  const rimG = new THREE.TorusGeometry(0.6, 0.06, 8, 32);
  const star = new THREE.CylinderGeometry(0.32, 0.32, 0.16, 5); star.rotateX(Math.PI / 2);
  return merge([tint(disc, '#ffd23f'), tint(rimG, '#fff0a0'), tint(star, '#fff6c8')]);
}
export function airCan() {
  return merge([
    tint(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 24), '#e8fbff'),
    tint(xf(new THREE.CylinderGeometry(0.44, 0.44, 0.34, 24), { y: 0.05 }), '#4ff0ff'),
    tint(xf(new THREE.CylinderGeometry(0.2, 0.36, 0.18, 20), { y: 0.59 }), '#cfd8de'),
    tint(xf(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 12), { y: 0.74 }), '#4ff0ff'),
  ]);
}
export function padTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const g = cv.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 3; i++) {
    const y = 30 + i * 80; g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); g.moveTo(10, y + 46); g.lineTo(64, y); g.lineTo(118, y + 46); g.lineTo(118, y + 70); g.lineTo(64, y + 26); g.lineTo(10, y + 70); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* Roadside scenery */
export function scrub(seed = 2) {
  const r = rng(seed), parts = [];
  for (let i = 0; i < 6; i++) parts.push(tint(xf(new THREE.IcosahedronGeometry(0.35 + r() * 0.3, 0), { x: (r() - 0.5) * 0.9, y: 0.2 + r() * 0.2, z: (r() - 0.5) * 0.9, sy: 0.7 }), r() < 0.5 ? '#8b7b46' : '#6f6a3a', 0.25, seed + i));
  return merge(parts);
}
export function pole(c, h = 9) {
  return merge([
    tint(xf(new THREE.CylinderGeometry(0.12, 0.16, h, 7), { y: h / 2 }), c, 0.1),
    tint(xf(new THREE.BoxGeometry(2.4, 0.14, 0.14), { y: h - 0.7 }), c, 0.1),
    tint(xf(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 6), { x: -1, y: h - 0.5 }), '#d8d0c0'),
    tint(xf(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 6), { x: 1, y: h - 0.5 }), '#d8d0c0'),
  ]);
}
export function reflectorPost() {
  return merge([tint(xf(new THREE.BoxGeometry(0.1, 1.0, 0.1), { y: 0.5 }), '#f2efe8'), tint(xf(new THREE.BoxGeometry(0.11, 0.16, 0.11), { y: 0.86 }), '#ff2a2a')]);
}
/* Sky traffic: low-poly but real models. Nose / head points toward -Z (at the player once the instance is turned
   by PI). Hit radii (CJSim): bird 1.4, plane 3.4, satellite 2.8; every model fits inside ~1.4x its hit radius. */
// Bird body (a red-tailed hawk / raven): wings are separate instanced meshes so they can flap.
export function crow() {
  return merge([
    tint(xf(new THREE.IcosahedronGeometry(0.34, 1), { sz: 2.1, sy: 0.85 }), '#2a1d2e', 0.15, 3),         // body
    tint(xf(new THREE.IcosahedronGeometry(0.2, 1), { z: -0.72, y: 0.08 }), '#1f1524', 0.1, 4),            // head
    tint(xf(new THREE.ConeGeometry(0.07, 0.3, 6), { z: -0.98, y: 0.04, rx: -Math.PI / 2 }), '#f2a93b'),   // beak
    tint(xf(new THREE.ConeGeometry(0.32, 0.7, 4), { z: 0.86, rx: Math.PI / 2, sy: 0.25, ry: Math.PI / 4 }), '#3a2a40', 0.1, 5), // tail fan
    tint(xf(new THREE.SphereGeometry(0.035, 6, 4), { x: 0.12, z: -0.82, y: 0.14 }), '#ffd23f'), tint(xf(new THREE.SphereGeometry(0.035, 6, 4), { x: -0.12, z: -0.82, y: 0.14 }), '#ffd23f'), // eyes
  ]);
}
/* One wing (right side, +X), pivot at the shoulder: a tapered, slightly swept two-panel blade with primaries. */
export function wing(side = 1) {
  const shape = new THREE.Shape(); shape.moveTo(0, -0.28); shape.lineTo(0.75, -0.3); shape.lineTo(1.55, -0.12); shape.lineTo(1.75, 0.18); shape.lineTo(1.2, 0.28); shape.lineTo(0.5, 0.3); shape.lineTo(0, 0.25); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 0.02, 0);
  const parts = [tint(g, '#3a2a40', 0.12, 8)];
  for (let k = 0; k < 4; k++) parts.push(tint(xf(new THREE.BoxGeometry(0.5, 0.02, 0.06), { x: 1.6 + k * 0.02, z: 0.25 + k * 0.1, ry: -0.3 - k * 0.15 }), '#1a1020'));
  const m = merge(parts); if (side < 0) { m.scale(-1, 1, 1); const idx = m.index; if (!idx) { const p = m.attributes.position; for (let i = 0; i < p.count; i += 3) { for (const k of ['position', 'color', 'normal']) { const a = m.attributes[k]; if (!a) continue; for (let c = 0; c < a.itemSize; c++) { const t = a.array[(i + 1) * a.itemSize + c]; a.array[(i + 1) * a.itemSize + c] = a.array[(i + 2) * a.itemSize + c]; a.array[(i + 2) * a.itemSize + c] = t; } } } } m.computeVertexNormals(); }
  return m;
}
/* A light business jet: lathed fuselage, swept wings and tail, rear engines, livery stripe, windows.
   Wing / tail tips carry nav-light colors picked out by the emissive hook in render3d (pure red / green / white). */
export function jet() {
  const prof = [[0, -4.6], [0.28, -4.35], [0.55, -3.9], [0.72, -3.1], [0.78, -1.5], [0.78, 1.8], [0.62, 3.2], [0.32, 4.2], [0.08, 4.5], [0, 4.52]].map(([r, z]) => new THREE.Vector2(r, z));
  const fus = new THREE.LatheGeometry(prof, 16); fus.rotateX(Math.PI / 2); // axis along z
  const sweptPanel = (span, root, tip, sweep, thick) => { const sh = new THREE.Shape(); sh.moveTo(0, -root / 2); sh.lineTo(span, -root / 2 + sweep); sh.lineTo(span, -root / 2 + sweep + tip); sh.lineTo(0, root / 2); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, thick / 2, 0); return g; };
  const parts = [tint(fus, '#f3f4f6', 0.04, 1)];
  parts.push(tint(xf(new THREE.BoxGeometry(0.02, 0.28, 5.4), { x: 0.77, y: 0.05, z: 0.3 }), '#ff4f6a'), tint(xf(new THREE.BoxGeometry(0.02, 0.28, 5.4), { x: -0.77, y: 0.05, z: 0.3 }), '#ff4f6a')); // livery stripe
  parts.push(tint(xf(new THREE.BoxGeometry(0.02, 0.12, 4.2), { x: 0.775, y: 0.3, z: 0.1 }), '#1b2230'), tint(xf(new THREE.BoxGeometry(0.02, 0.12, 4.2), { x: -0.775, y: 0.3, z: 0.1 }), '#1b2230')); // cabin windows
  parts.push(tint(xf(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), { z: -3.55, y: 0.18, sx: 1.05, sy: 0.55, sz: 1.2, rx: -0.35 }), '#141a26')); // cockpit glass
  for (const sx of [-1, 1]) {
    const w = sweptPanel(4.4, 2.2, 0.8, 1.7, 0.14); if (sx < 0) w.scale(-1, 1, 1);
    parts.push(tint(xf(w, { y: -0.3, z: 0.1 }), '#d9dde4', 0.03, 2));
    parts.push(tint(xf(new THREE.BoxGeometry(0.16, 0.16, 0.3), { x: sx * 4.4, y: -0.3, z: 1.9 }), sx > 0 ? '#00ff40' : '#ff0000')); // nav lights
    const st = sweptPanel(1.7, 1.2, 0.5, 0.9, 0.08); if (sx < 0) st.scale(-1, 1, 1);
    parts.push(tint(xf(st, { y: 1.95, z: 3.9 }), '#d9dde4', 0.03, 3)); // T-tail stabilizer
    parts.push(tint(xf(new THREE.CylinderGeometry(0.36, 0.3, 1.7, 12), { x: sx * 1.05, y: 0.35, z: 2.5, rx: Math.PI / 2 }), '#c8ccd4', 0.03, 4)); // engines
    parts.push(tint(xf(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 12), { x: sx * 1.05, y: 0.35, z: 1.64, rx: Math.PI / 2 }), '#1a1d24'));
    parts.push(tint(xf(new THREE.BoxGeometry(0.5, 0.12, 0.5), { x: sx * 0.75, y: 0.35, z: 2.5 }), '#c8ccd4'));
  }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(1.6, 0); fin.lineTo(2.35, 2.0); fin.lineTo(1.6, 2.0); fin.closePath();
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.1, bevelEnabled: false }); fg.rotateY(-Math.PI / 2); fg.translate(0.05, 0, 0);
  parts.push(tint(xf(fg, { y: 0.4, z: 2.4 }), '#ff4f6a', 0.02, 5));
  parts.push(tint(xf(new THREE.BoxGeometry(0.14, 0.14, 0.14), { y: 2.45, z: 4.75 }), '#ffffff'));
  const g = merge(parts.map(p => p.index ? p.toNonIndexed() : p)); g.computeVertexNormals(); return g;
}
/* Satellite: gold-foil bus, two solar wings with cell grids, a dish and whip antennas. */
export function sat() {
  const parts = [tint(new THREE.CylinderGeometry(0.75, 0.75, 1.6, 6), '#d9a43a', 0.25, 7)];
  parts.push(tint(xf(new THREE.CylinderGeometry(0.78, 0.78, 0.12, 6), { y: 0.8 }), '#e8e8e8'), tint(xf(new THREE.CylinderGeometry(0.78, 0.78, 0.12, 6), { y: -0.8 }), '#e8e8e8'));
  for (const sx of [-1, 1]) {
    parts.push(tint(xf(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), { x: sx * 1.2, rz: Math.PI / 2 }), '#bbbbbb'));
    for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) parts.push(tint(xf(new THREE.BoxGeometry(0.95, 0.04, 0.75), { x: sx * (2.15 + k * 1.0), z: (j - 0.5) * 0.8 }), (k + j) % 2 ? '#1f3fb0' : '#2a52d4', 0.1, k * 2 + j));
    parts.push(tint(xf(new THREE.BoxGeometry(3.05, 0.05, 0.04), { x: sx * 3.15 }), '#d0d4dc'));
  }
  const dish = new THREE.LatheGeometry([[0, 0], [0.3, 0.04], [0.55, 0.16], [0.7, 0.32]].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  parts.push(tint(xf(dish, { y: 0.9 }), '#f0f0f0'), tint(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), { y: 1.15 }), '#cccccc'));
  parts.push(tint(xf(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), { y: -1.4, x: 0.3, rz: 0.2 }), '#cccccc'));
  parts.push(tint(xf(new THREE.SphereGeometry(0.06, 6, 4), { y: -0.9, x: 0.5 }), '#ff0000'));
  return merge(parts.map(p => p.index ? p.toNonIndexed() : p));
}
/* Boost ring: a fat torus with bevel ring and inner chevron spokes. Radius = CJSim.C.RING_R. */
export function ring(R = 3.2) {
  const parts = [tint(new THREE.TorusGeometry(R, 0.26, 10, 40), '#ffd23f'), tint(new THREE.TorusGeometry(R + 0.3, 0.08, 6, 40), '#ff9f1a'), tint(new THREE.TorusGeometry(R - 0.32, 0.06, 6, 40), '#fff3c0')];
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; parts.push(tint(xf(new THREE.BoxGeometry(0.5, 0.18, 0.18), { x: Math.cos(a) * (R + 0.15), y: Math.sin(a) * (R + 0.15), rz: a }), '#ffffff')); }
  return merge(parts.map(p => p.index ? p.toNonIndexed() : p));
}
export const SKINS = { saguaro, sandstone, tumbleweed, cone, crow, jet, sat, ring };
export { col };
