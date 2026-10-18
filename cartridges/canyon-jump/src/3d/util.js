/* Shared helpers for the 3D renderer: deterministic noise/RNG, color, geometry merging, canvas textures.
   Render-only randomness is seeded so the world is identical every load and never touches the sim. */
import * as THREE from '../../vendor/three/three.module.min.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash2 = (x, y) => { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
/* Smooth value noise in [0,1]. */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }

export const col = hex => new THREE.Color(hex);

/* Paint a geometry one flat vertex color (and drop uvs) so differently-colored parts can be merged into one draw call. */
export function tint(geo, hex, jitter = 0, seed = 1) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count, c = new THREE.Color(hex), arr = new Float32Array(n * 3), r = rng(seed);
  for (let i = 0; i < n; i++) { const k = 1 + (jitter ? (r() - 0.5) * jitter : 0); arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
export function merge(geos) { const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose()); return g; }
export function xf(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m); return geo;
}

export function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 8 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
}
/* Speckle noise straight into image data (fast enough at load for 1k textures). */
export function speckle(g, w, h, base, amount, seed, grain = 1) {
  const img = g.getImageData(0, 0, w, h), d = img.data, r = rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, n = (r() - 0.5) * amount + (fbm(x / (18 * grain), y / (18 * grain), 3) - 0.5) * amount * 1.2;
    d[i] = clamp(d[i] + n * base, 0, 255); d[i + 1] = clamp(d[i + 1] + n * base, 0, 255); d[i + 2] = clamp(d[i + 2] + n * base, 0, 255);
  }
  g.putImageData(img, 0, 0);
}
