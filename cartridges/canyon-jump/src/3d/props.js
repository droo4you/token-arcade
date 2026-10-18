/* Obstacle, pickup and roadside prop models. Each builder returns one merged, vertex-colored geometry so
   every type is a single InstancedMesh draw call. Sizes match the sim's hitbox half-widths
   (CJSim.C.OBST_HW): cactus 0.85, rock 1.25, tumbleweed 0.8, cone 0.4. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { TAU, rng, tint, merge, xf, noise2, col } from './util.js';

function capsule(r, len, seg = 10) { return new THREE.CapsuleGeometry(r, len, 4, seg); }

/* Saguaro: ribbed trunk + two elbowed arms. Width across arms ≈ 1.7 m (hit half-width 0.85). */
export function saguaro(c, seed = 1, scale = 1) {
  const r = rng(seed), parts = [], green = c, dark = new THREE.Color(c).multiplyScalar(0.7).getHex();
  const ribbed = (rad, len) => {
    const g = new THREE.CylinderGeometry(rad, rad * 1.04, len, 14, 6);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.07 * Math.cos(a * 7); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.computeVertexNormals(); return g;
  };
  const H = 4.2 + r() * 1.2;
  parts.push(tint(xf(ribbed(0.34, H), { y: H / 2 }), green, 0.12, seed));
  parts.push(tint(xf(new THREE.SphereGeometry(0.34, 14, 8, 0, TAU, 0, Math.PI / 2), { y: H, sy: 0.8 }), green, 0.1, seed + 1));
  for (const sx of [-1, 1]) {
    const y0 = 1.4 + r() * 1.2, up = 1.0 + r() * 1.1, out = 0.58;
    parts.push(tint(xf(ribbed(0.2, out), { x: sx * (out / 2 + 0.25), y: y0, rz: Math.PI / 2 }), dark, 0.1, seed + 2));
    parts.push(tint(xf(ribbed(0.21, up), { x: sx * (out + 0.25), y: y0 + up / 2 }), green, 0.1, seed + 3));
    parts.push(tint(xf(new THREE.SphereGeometry(0.21, 12, 6, 0, TAU, 0, Math.PI / 2), { x: sx * (out + 0.25), y: y0 + up }), green, 0.1, seed + 4));
    parts.push(tint(xf(new THREE.SphereGeometry(0.21, 10, 8), { x: sx * (out + 0.25), y: y0 }), green, 0.1, seed + 5));
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
/* Sky traffic (phase 1 placeholders: simple but readable silhouettes). */
export function crow() {
  return merge([
    tint(xf(new THREE.ConeGeometry(0.22, 1.0, 6), { rx: -Math.PI / 2 }), '#2a1d2e'),
    tint(xf(new THREE.BoxGeometry(2.6, 0.05, 0.5), { z: 0.1 }), '#3a2a40'),
  ]);
}
export function jet() {
  return merge([
    tint(xf(new THREE.CylinderGeometry(0.55, 0.45, 7, 12), { rx: Math.PI / 2 }), '#f3f4f6'),
    tint(xf(new THREE.ConeGeometry(0.55, 1.4, 12), { z: -4.2, rx: -Math.PI / 2 }), '#f3f4f6'),
    tint(xf(new THREE.BoxGeometry(7.5, 0.12, 1.6), { z: 0.2 }), '#d9dde4'),
    tint(xf(new THREE.BoxGeometry(2.6, 0.1, 0.8), { z: 3.1 }), '#d9dde4'),
    tint(xf(new THREE.BoxGeometry(0.1, 1.4, 1.0), { y: 0.7, z: 3.1 }), '#ff4f6a'),
  ]);
}
export function sat() {
  return merge([
    tint(new THREE.BoxGeometry(1.2, 1.2, 1.6), '#d9a43a'),
    tint(xf(new THREE.BoxGeometry(2.4, 0.05, 1.1), { x: -1.9 }), '#2a4cc9'),
    tint(xf(new THREE.BoxGeometry(2.4, 0.05, 1.1), { x: 1.9 }), '#2a4cc9'),
    tint(xf(new THREE.ConeGeometry(0.5, 0.4, 12, 1, true), { y: 0.8 }), '#e8e8e8'),
  ]);
}
export const SKINS = { saguaro, sandstone, tumbleweed, cone, crow, jet, sat };
export { col };
