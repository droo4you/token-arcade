/* Particles in world space: one Points draw call with soft round sprites (dust, sparks, glints).
   Pool-based; render-only (never feeds the sim). */
import * as THREE from '../../vendor/three/three.module.min.js';

export function createParticles(max = 900) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), colr = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { scale: { value: 600 }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
      #include <fog_pars_vertex>
      void main() { vA = alpha; vC = color; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying vec3 vC;
      #include <fog_pars_fragment>
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC, vA * (1.0 - r) * (1.0 - r));
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  const P = []; // {x,y,z,vx,vy,vz,life,max,s0,s1,r,g,b,a,drag,grav}
  const c = new THREE.Color();
  return {
    points: pts, material: mat,
    emit(o, n = 1) {
      for (let i = 0; i < n && P.length < max; i++) {
        c.set(o.color); const k = o.hdr || 1;
        P.push({ x: o.x + (Math.random() - 0.5) * (o.spread || 0), y: o.y + Math.random() * (o.spreadY || 0), z: o.z + (Math.random() - 0.5) * (o.spread || 0),
          vx: (o.vx || 0) + (Math.random() - 0.5) * (o.jitter || 0), vy: (o.vy || 0) + Math.random() * (o.jitterY ?? o.jitter ?? 0), vz: (o.vz || 0) + (Math.random() - 0.5) * (o.jitter || 0),
          life: o.life * (0.7 + Math.random() * 0.6), max: o.life, s0: o.s0, s1: o.s1 ?? o.s0, r: c.r * k, g: c.g * k, b: c.b * k, a: o.alpha ?? 1, drag: o.drag ?? 1.5, grav: o.grav ?? 0 });
      }
    },
    update(dt) {
      let j = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; p.life -= dt; if (p.life <= 0) continue;
        const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.05 && p.grav > 0) { p.y = 0.05; p.vy *= -0.3; }
        P[j++] = p;
      }
      P.length = j;
      for (let i = 0; i < j; i++) {
        const p = P[i], t = 1 - p.life / p.max;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        colr[i * 3] = p.r; colr[i * 3 + 1] = p.g; colr[i * 3 + 2] = p.b;
        size[i] = p.s0 + (p.s1 - p.s0) * t; alpha[i] = p.a * Math.min(1, (1 - t) * 1.6) * Math.min(1, t * 8 + 0.2);
      }
      geo.setDrawRange(0, j);
      for (const k of ['position', 'color', 'size', 'alpha']) { const at = geo.attributes[k]; at.needsUpdate = true; at.clearUpdateRanges?.(); at.addUpdateRange?.(0, j * at.itemSize); }
    },
    clear() { P.length = 0; geo.setDrawRange(0, 0); },
    get count() { return P.length; },
  };
}
