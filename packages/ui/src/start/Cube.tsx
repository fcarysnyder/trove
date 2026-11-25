// Home's mark in 3D: the orange T of five brushed-metal blocks, glowing, inside a 3×3×3 cube of near-invisible glass
// that the T lights. On `intro` the T drops in block by block, the glass grows around it, then `onIntroDone`. Drag to spin it: it trails the pointer, coasts, then springs back to the icon's pose.
// The values below came from the cube tuner; EASY is what was tuned, `derive` turns it into the scene's numbers.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const EASY = { metal: '#f68e36', finish: 0.67, heat: 0.32, halo: 0.35, flicker: 0.63, weight: 0.6, key: 0.3, glass: 0.08, reach: 0.75, roundness: 0.2, gap: 0.1, tint: '#f2851f' };

function derive(e = EASY) {
  const h = e.heat, v = e.glass;
  return {
    spacing: 1 + e.gap,
    metal: { color: e.metal, metalness: 0.1 + 0.8 * e.finish, roughness: 0.55 - 0.2 * e.finish, anisotropy: 0.9 * e.finish, env: 0.6 + 0.8 * e.finish, bump: 1.5 * e.finish,
      glow: 0.1 + h, radius: 0.02 + 0.12 * e.roundness },
    halo: { opacity: (0.15 + 0.35 * e.halo) * (0.4 + 0.6 * h), size: 1.6 + 2.4 * e.halo, bigOpacity: 0.3 * e.halo * (0.4 + 0.6 * h), bigSize: 4 + 6 * e.halo },
    glass: { glow: 0.5 + h, fill: 0.1 + 0.4 * v, rimFill: 0.2 + 0.8 * v, rim: 0.02 + 0.12 * v, rimWhite: 0.05 + 0.3 * v, spec: (0.2 + 0.6 * v) * (0.4 + 0.6 * e.key),
      specPower: 120 - 60 * e.key, falloff: 3.5 - 3.35 * e.reach, floor: 0.03 + 0.09 * e.reach, facing: 0.75, rimPower: 3, radius: 0.02 + 0.4 * e.roundness },
    light: { key: 0.2 + 1.3 * e.key, ambient: 0.95 - 0.45 * e.key },
    flicker: e.flicker, weight: e.weight,
  };
}

const T_CELLS = [[0, 1, -1], [0, 1, 0], [0, 1, 1], [0, 0, 0], [0, -1, 0]]; // the T, in the middle slice
const easeBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

/** Fine streaks along one axis: the brushed grain, as roughness and bump. */
function brushTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const b = c.getContext('2d')!; b.fillStyle = '#8a8a8a'; b.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2400; i++) {
    const y = Math.random() * 512, v = (100 + Math.random() * 90) | 0;
    b.strokeStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.5})`; b.lineWidth = Math.random() * 1.2 + 0.2;
    b.beginPath(); b.moveTo(0, y); b.lineTo(512, y + (Math.random() - 0.5) * 3); b.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  [[0, 1], [0.2, 0.55], [0.45, 0.2], [0.7, 0.06], [1, 0]].forEach(([o, a]) => g.addColorStop(o, `rgba(255,${(130 - 40 * o) | 0},${(45 - 25 * o) | 0},${a})`));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const GLASS_VERT = `varying vec3 vN; varying vec3 vNw; varying vec3 vW;
void main(){ vN = normalize(normalMatrix*normal); vNw = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
// Clear glass: a rim where it turns away, a small highlight, and the T's warm light (stronger on faces turned to it,
// fading with distance, plus a faint floor every face gets).
const GLASS_FRAG = `uniform vec3 uLamps[5]; uniform vec3 uWarm; uniform float uLit;
uniform float u_fill, u_rimFill, u_rim, u_rimPower, u_rimWhite, u_spec, u_specPower, u_falloff, u_facing, u_glow, u_floor;
varying vec3 vN; varying vec3 vNw; varying vec3 vW;
void main(){
  vec3 N = normalize(vN); float rim = pow(1. - abs(N.z), u_rimPower);
  vec3 L = normalize(vec3(-.45,.75,.5)); float spec = pow(max(dot(reflect(-L,N), vec3(0.,0.,1.)), 0.), u_specPower);
  float s = 0.;
  for (int i = 0; i < 5; i++) { vec3 d = uLamps[i] - vW; float k = length(d); s += ((1. - u_facing) + u_facing*max(dot(normalize(vNw), d/k), 0.)) / (1. + k*k*u_falloff); }
  s = (min(s, 1.5) + u_floor) * uLit;
  vec3 col = uWarm*s*(u_glow + rim) + vec3(1.)*(rim*u_rimWhite + spec);
  gl_FragColor = vec4(col, clamp(s*(u_fill + rim*u_rimFill) + rim*u_rim + spec*u_spec, 0., 1.));
}`;

export default function Cube({ intro, onIntroDone }: { intro: boolean; onIntroDone?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(onIntroDone);
  done.current = onIntroDone;

  useEffect(() => {
    const el = box.current!;
    const P = derive();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setClearColor(0, 0);
    el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const F = 5.2, cam = new THREE.OrthographicCamera(-F / 2, F / 2, F / 2, -F / 2, 0.1, 100);
    cam.position.set(10, 10, 10); cam.lookAt(0, 0, 0);
    const fit = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; r.setSize(w, h, false); cam.left = -F * w / h / 2; cam.right = F * w / h / 2; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();
    scene.add(new THREE.AmbientLight(0xffffff, P.light.ambient));
    const key = new THREE.DirectionalLight(0xffffff, P.light.key); key.position.set(-3, 8, 6); scene.add(key);
    const g = new THREE.Group(); scene.add(g);

    const brush = brushTexture();
    const metal = new THREE.MeshPhysicalMaterial({ color: P.metal.color, metalness: P.metal.metalness, roughness: P.metal.roughness, anisotropy: P.metal.anisotropy,
      envMapIntensity: P.metal.env, roughnessMap: brush, bumpMap: brush, bumpScale: P.metal.bump, emissive: 0xff5a00, emissiveIntensity: 0 });
    const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const bigHaloMat = haloMat.clone();
    const lamps = T_CELLS.map(() => new THREE.Vector3());
    const U: Record<string, THREE.IUniform> = { uLamps: { value: lamps }, uWarm: { value: new THREE.Color(EASY.tint) }, uLit: { value: 0 } };
    for (const k of ['fill', 'rimFill', 'rim', 'rimPower', 'rimWhite', 'spec', 'specPower', 'falloff', 'facing', 'glow', 'floor'] as const) U['u_' + k] = { value: P.glass[k] };
    const glassMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: U, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG });

    const S = P.spacing, tBox = new RoundedBoxGeometry(1, 1, 1, 4, P.metal.radius), gBox = new RoundedBoxGeometry(0.96, 0.96, 0.96, 6, P.glass.radius);
    const tops: THREE.Mesh[] = [], glass: { m: THREE.Mesh; d: number }[] = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const isT = x === 0 && (y === 1 || z === 0), p = new THREE.Vector3(x * S, y * S, z * S);
      if (isT) {
        const m = new THREE.Mesh(tBox, metal.clone()); m.position.copy(p); // its own copy, to fade in on its own
        // Drop order: stem bottom, stem middle, centre, then the arms.
        m.userData = { rest: p.clone(), k: y === 1 ? (z === 0 ? 2 : z === 1 ? 3 : 4) : y === 0 ? 1 : 0 };
        const h = new THREE.Sprite(haloMat); h.scale.setScalar(P.halo.size); h.renderOrder = -1; m.add(h);
        g.add(m); tops.push(m);
      } else {
        const d = Math.min(...T_CELLS.map(([a, b, c]) => Math.abs(a - x) + Math.abs(b - y) + Math.abs(c - z)));
        const m = new THREE.Mesh(gBox, glassMat); m.position.copy(p); m.renderOrder = 2; g.add(m); glass.push({ m, d });
      }
    }
    tops.sort((a, b) => a.userData.k - b.userData.k);
    const big = new THREE.Sprite(bigHaloMat); big.scale.setScalar(P.halo.bigSize); big.position.set(0, 0.45 * S, 0); big.renderOrder = -2; g.add(big);

    const playIntro = intro && !still;
    const t0 = performance.now();
    let ready = !playIntro, raf = 0;
    if (!playIntro) done.current?.();
    // Intro: each T block falls with a bounce; then the glass grows outward from the T.
    const introFrame = (now: number) => {
      const t = now - t0;
      tops.forEach((m, n) => {
        const s = 300 + n * 260, u = Math.min(1, Math.max(0, (t - s) / 420));
        // A short drop, fading in, so no block is seen cut off by the canvas's edge.
        const mat = m.material as THREE.MeshPhysicalMaterial, fade = Math.min(1, u / 0.4);
        mat.transparent = fade < 1; mat.opacity = fade;
        m.visible = t >= s; m.position.y = m.userData.rest.y + (1 - easeBack(u)) * 1.6;
      });
      const gt = Math.max(0, t - 1700), lit = Math.min(1, gt / 700);
      glass.forEach(({ m, d }) => { const u = Math.min(1, Math.max(0, (gt - d * 110) / 450)); m.scale.setScalar(Math.max(0.001, easeBack(u))); });
      if (t > 2600) { ready = true; done.current?.(); }
      return lit;
    };

    // Spin: heavier turns less per pixel, trails the pointer and keeps momentum longer; once still, a spring home.
    const sens = 0.014 - 0.009 * P.weight, follow = 0.6 - 0.45 * P.weight, decay = 0.86 + 0.12 * P.weight;
    const vel = { x: 0, y: 0 }, pend = { x: 0, y: 0 }, Y = new THREE.Vector3(), X = new THREE.Vector3();
    let drag = false, last: [number, number] = [0, 0], still8 = 0;
    let hover = false, heat = 0, prev = performance.now(); // heat: 0 resting, 1 fully stoked by the pointer
    let snap: { axis: THREE.Vector3; angle: number; p: number; v: number; last?: number } | null = null;
    const spin = (dx: number, dy: number) => {
      Y.set(0, 1, 0).applyQuaternion(cam.quaternion); X.set(1, 0, 0).applyQuaternion(cam.quaternion);
      g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, dx * sens)).premultiply(new THREE.Quaternion().setFromAxisAngle(X, dy * sens));
    };
    const down = (e: PointerEvent) => { if (!ready) return; drag = true; snap = null; last = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; };
    const move = (e: PointerEvent) => { if (!drag) return; pend.x += e.clientX - last[0]; pend.y += e.clientY - last[1]; last = [e.clientX, e.clientY]; };
    const up = () => { drag = false; el.style.cursor = ''; };
    const enter = () => { hover = true; }, leave = () => { hover = false; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('pointerenter', enter); el.addEventListener('pointerleave', leave);

    const loop = (now: number) => {
      const lit = ready ? 1 : introFrame(now);
      if (drag || Math.abs(pend.x) + Math.abs(pend.y) > 0.01) { vel.x = pend.x * follow; vel.y = pend.y * follow; pend.x -= vel.x; pend.y -= vel.y; spin(vel.x, vel.y); }
      else if (!snap) {
        vel.x *= decay; vel.y *= decay; spin(vel.x, vel.y);
        if (Math.abs(vel.x) + Math.abs(vel.y) < 0.25 && g.quaternion.angleTo(new THREE.Quaternion()) > 0.01) {
          if (++still8 > 8) {
            const q = g.quaternion.clone(); if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
            const angle = 2 * Math.acos(Math.min(1, q.w)), sn = Math.sqrt(1 - q.w * q.w) || 1;
            snap = { axis: new THREE.Vector3(q.x / sn, q.y / sn, q.z / sn), angle, p: 0, v: 0 }; still8 = 0;
          }
        } else still8 = 0;
      }
      if (snap) {
        // An underdamped spring to the icon's pose: it overshoots, then settles in a couple of wobbles.
        const dt = Math.min(0.033, (now - (snap.last ?? now)) / 1000); snap.last = now;
        snap.v += (180 * (1 - snap.p) - 8.5 * snap.v) * dt; snap.p += snap.v * dt;
        g.quaternion.setFromAxisAngle(snap.axis, snap.angle * (1 - snap.p));
        if (Math.abs(1 - snap.p) < 0.001 && Math.abs(snap.v) < 0.01) { g.quaternion.identity(); snap = null; vel.x = vel.y = 0; }
      }
      // Flicker: three slow, uneven waves, like embers; off when motion is reduced.
      // Hover (or a drag) stokes it: quick to heat, slower to cool, like metal.
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const stoked = ready && (hover || drag);
      heat += ((stoked ? 1 : 0) - heat) * (1 - Math.exp(-dt / (stoked ? 0.12 : 0.35)));
      const t = now / 1000, f = still ? 1 : 1 + P.flicker * 0.18 * (0.5 * Math.sin(t * 1.3) + 0.3 * Math.sin(t * 3.1 + 1.7) + 0.2 * Math.sin(t * 7.7 + 4.1));
      tops.forEach((m) => ((m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = (0.1 + (P.metal.glow - 0.1) * lit) * f * (1 + 1.5 * heat)));
      haloMat.opacity = Math.min(1, P.halo.opacity * lit * f * (1 + 2.5 * heat)); bigHaloMat.opacity = Math.min(1, P.halo.bigOpacity * lit * f * (1 + 3 * heat)); U.uLit.value = lit * f * (1 + 1.2 * heat);
      g.updateMatrixWorld(); tops.forEach((m, i) => m.getWorldPosition(lamps[i]));
      r.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave);
      [tBox, gBox].forEach((x) => x.dispose()); [metal, glassMat, haloMat, bigHaloMat, ...tops.map((m) => m.material as THREE.Material)].forEach((m) => m.dispose());
      brush.dispose(); pmrem.dispose(); scene.environment?.dispose(); r.dispose(); r.domElement.remove();
    };
  }, [intro]);

  return <div ref={box} aria-hidden className="size-full cursor-grab touch-none [&>canvas]:block [&>canvas]:size-full" />;
}
