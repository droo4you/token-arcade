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

/* Clouds: camera-facing soft puffs, one instanced draw call, billboarded in the vertex shader (no per-frame CPU).
   Each cluster is a handful of puffs; the sunset tint is lighter on top, cooler underneath. */
export function createClouds({ count = 70, seed = 9, z0, z1, yMin = 45, yMax = 230, xSpan = 700, top = '#ffd9cf', bottom = '#9a6a9e', rand }) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  for (let i = 0; i < 14; i++) { const x = 30 + rand() * 68, y = 40 + rand() * 48, r = 18 + rand() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const tex = new THREE.CanvasTexture(cv);
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const offs = [], scl = [], shade = [];
  for (let c = 0; c < count; c++) {
    const cx = (rand() * 2 - 1) * xSpan * (rand() < 0.4 ? 0.1 : 1), cy = yMin + Math.pow(rand(), 1.3) * (yMax - yMin), cz = z0 + rand() * (z1 - z0), n = 5 + Math.floor(rand() * 6), w = 40 + rand() * 70;
    for (let k = 0; k < n; k++) { offs.push(cx + (rand() - 0.5) * w * 1.6, cy + (rand() - 0.3) * w * 0.3, -(cz + (rand() - 0.5) * w)); const s = w * (0.5 + rand() * 0.6); scl.push(s, s * 0.62); shade.push(rand()); }
  }
  geo.setAttribute('ioff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
  geo.setAttribute('iscl', new THREE.InstancedBufferAttribute(new Float32Array(scl), 2));
  geo.setAttribute('ishade', new THREE.InstancedBufferAttribute(new Float32Array(shade), 1));
  geo.instanceCount = shade.length;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { map: { value: tex }, top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) }, fade: { value: 1 }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */`
      attribute vec3 ioff; attribute vec2 iscl; attribute float ishade; varying vec2 vUv; varying float vS; varying float vNear;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vS = ishade; vec4 mvPosition = modelViewMatrix * vec4(ioff, 1.0); mvPosition.xy += position.xy * iscl;
        vNear = smoothstep(4.0, 40.0, -mvPosition.z); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 top, bottom; uniform float fade; varying vec2 vUv; varying float vS; varying float vNear;
      #include <fog_pars_fragment>
      void main() { vec4 t = texture2D(map, vUv); vec3 c = mix(bottom, top, smoothstep(0.15, 0.85, vUv.y) * (0.75 + 0.25 * vS));
        gl_FragColor = vec4(c, t.a * fade * vNear); if (gl_FragColor.a < 0.01) discard;
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 4;
  return { mesh, material: mat };
}

/* Wind streaks: thin additive lines that fly past the camera. World-stationary in feel (they stream toward and
   past you at your speed) but always generated around the camera, so there is nothing to place or recycle on the CPU. */
export function createStreaks(n = 160, rand) {
  const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0); base.rotateX(-Math.PI / 2); // unit quad along -z... local z in [-1, 0]
  const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const a = [];
  for (let i = 0; i < n; i++) { const ang = rand() * Math.PI * 2, r = 4.5 + Math.pow(rand(), 0.6) * 16; a.push(Math.cos(ang) * r, Math.sin(ang) * r * 0.75, rand()); }
  geo.setAttribute('iseed', new THREE.InstancedBufferAttribute(new Float32Array(a), 3)); geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { travel: { value: 0 }, len: { value: 4 }, amt: { value: 0 }, span: { value: 90 }, color: { value: new THREE.Color('#fff4ea') } },
    vertexShader: /* glsl */`
      attribute vec3 iseed; uniform float travel, len, span; varying float vA; varying vec2 vUv;
      void main() { vUv = uv;
        float d = mod(iseed.z * span + travel, span);          // 0..span, grows as we travel
        vec3 p = vec3(iseed.x, iseed.y, -(span - d) + 4.0);       // in view space-ish: ahead of the camera, coming at it
        p.z += position.z * len; vec2 w = normalize(vec2(-iseed.y, iseed.x)); p.xy += w * position.x * 0.035;
        vA = smoothstep(0.0, 0.25, d / span) * (1.0 - smoothstep(0.85, 1.0, d / span));
        gl_Position = projectionMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float amt; uniform vec3 color; varying float vA; varying vec2 vUv;
      void main() { float e = 1.0 - abs(vUv.x - 0.5) * 2.0; gl_FragColor = vec4(color * amt * vA * e * (0.4 + 0.6 * vUv.y), 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6;
  return { mesh, material: mat };
}
