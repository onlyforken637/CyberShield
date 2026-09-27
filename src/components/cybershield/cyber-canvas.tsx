"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/cyber/gsap";
import { decodeMapDots, lonLatToPlane } from "@/lib/cyber/world-dots";

/**
 * CyberCanvas — "GLOBAL SIGNAL FIELD".
 *
 * A coherent SOC centerpiece instead of abstract noise: the real world as a
 * dot-matrix map (NASA land raster → 7.6k dots) patrolled by a scanning bar,
 * with severity-colored attack arcs pulsing between real threat hubs, a deep
 * starfield for depth, and full pointer reactivity (camera parallax, dots
 * glowing under the cursor). Rendered behind the whole dashboard.
 *
 * Perf: one draw call per layer, DPR cap 1.5, 30fps budget, pauses when the
 * tab is hidden, single static frame under prefers-reduced-motion, and a
 * silent no-op when WebGL is unavailable.
 */

const MAP_W = 4.7; // world units (16:9-ish bleed)
const MAP_H = 2.35;
const ARC_COUNT = 8;
const RING_POOL = 5;

/** Real threat-hub cities (lon, lat) — arcs run between these. */
const CITIES: Array<[number, number]> = [
  [-74.0, 40.7], [-122.4, 37.8], [-77.0, 38.9], [-87.6, 41.9], [-79.4, 43.7],
  [-99.1, 19.4], [-74.1, 4.7], [-46.6, -23.5], [-58.4, -34.6],
  [-0.1, 51.5], [2.35, 48.85], [8.7, 50.1], [4.9, 52.4], [-3.7, 40.4],
  [18.1, 59.3], [21.0, 52.2], [29.0, 41.0], [37.6, 55.75],
  [34.8, 32.1], [31.2, 30.0], [3.4, 6.5], [36.8, -1.3], [28.0, -26.2],
  [55.3, 25.2], [72.9, 19.1], [103.8, 1.35], [114.2, 22.3], [121.5, 31.2],
  [116.4, 39.9], [139.7, 35.7], [127.0, 37.6], [151.2, -33.9], [174.8, -36.8],
];

const TEAL_BRIGHT = new THREE.Color("#5df2ff");
const AMBER = new THREE.Color("#ffb300");
const CRIMSON = new THREE.Color("#ff3b30");

/* ── land-dot shader ─────────────────────────────────────────────── */

const DOTS_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSweepX;
  uniform float uScale;
  uniform vec2 uPointer;
  attribute float aRand;
  varying float vSweep;
  varying float vPtr;
  varying float vTw;

  void main() {
    vec3 p = position;
    float tw = 0.62 + 0.38 * sin(uTime * (0.55 + aRand * 1.2) + aRand * 43.0);
    vTw = tw;

    // scanning bar: trailing boost behind the sweep
    float d = uSweepX - p.x;
    float sweep = exp(-max(d, 0.0) * 7.5) * step(0.0, d);
    vSweep = sweep;

    // pointer: dots ignite under the cursor
    float pd = distance(p.xy, uPointer);
    float ptr = smoothstep(0.30, 0.0, pd);
    vPtr = ptr;

    float boost = sweep + ptr;
    // edge fade so the plane never shows a hard cut
    float fade = smoothstep(0.50, 0.44, abs(p.x)) * smoothstep(0.50, 0.44, abs(p.y));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (0.0046 + tw * 0.0022 + boost * 0.0052) * fade * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DOTS_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying float vSweep;
  varying float vPtr;
  varying float vTw;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    float soft = smoothstep(0.5, 0.05, dist);
    vec3 col = mix(vec3(0.043, 0.55, 0.62), vec3(0.36, 0.95, 1.0), clamp(vSweep, 0.0, 1.0));
    col = mix(col, vec3(1.0, 0.72, 0.2), clamp(vPtr * 0.85, 0.0, 1.0));
    float a = uOpacity * (0.30 + 0.55 * vTw) + vSweep * 0.55 + vPtr * 0.5;
    gl_FragColor = vec4(col, min(a, 1.0) * soft);
  }
`;

/* ── hotspot shader (city beacons) ───────────────────────────────── */

const HOT_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute vec3 aColor;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vPulse;

  void main() {
    vColor = aColor;
    vPulse = 0.55 + 0.45 * sin(uTime * (1.1 + aPhase) + aPhase * 17.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (0.028 + vPulse * 0.02) * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const HOT_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float core = smoothstep(0.22, 0.02, dist);
    float halo = smoothstep(0.5, 0.1, dist) * 0.45;
    gl_FragColor = vec4(vColor, (core + halo) * (0.5 + 0.5 * vPulse));
  }
`;

/* ── soft round sprite texture (packets / stars) ─────────────────── */

function makeSoftTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

function makeRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

/* ── scan bar gradient texture ───────────────────────────────────── */

function makeSweepTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, "rgba(0,229,255,0)");
    grad.addColorStop(0.5, "rgba(0,229,255,0.85)");
    grad.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/* ── arc pool types ──────────────────────────────────────────────── */

interface ArcUnit {
  curve: THREE.QuadraticBezierCurve3;
  line: THREE.Line;
  lineGeo: THREE.BufferGeometry;
  lineMat: THREE.LineBasicMaterial;
  packet: THREE.Points;
  packetGeo: THREE.BufferGeometry;
  packetMat: THREE.PointsMaterial;
  from: THREE.Vector3;
  to: THREE.Vector3;
  phase: "draw" | "travel" | "fade" | "idle";
  t: number;
  speed: number;
}

interface RingUnit {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  t: number;
  active: boolean;
}

export function CyberCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" });
    } catch {
      return; // WebGL unavailable — the CSS grid backdrop is the fallback
    }

    const reduced = prefersReducedMotion();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0, 2.35);
    camera.lookAt(0, 0, 0);

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const disposables: Array<{ dispose: () => void }> = [];
    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    /* ── deep starfield (depth layer) ───────────────────────────── */
    const STARS = 640;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 9;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 5.5;
      starPos[i * 3 + 2] = -1.4 - Math.random() * 1.6;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const softTex = makeSoftTexture();
    const starMat = new THREE.PointsMaterial({
      color: 0x8fd8e8,
      size: 0.012,
      map: softTex,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    disposables.push(starGeo, starMat, softTex);

    /* ── graticule (faint lat/lon grid) ─────────────────────────── */
    {
      const verts: number[] = [];
      for (let lon = -180; lon <= 180; lon += 30) {
        const x = lonLatToPlane(lon, 0).x * MAP_W;
        verts.push(x, -MAP_H / 2, -0.001, x, MAP_H / 2, -0.001);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = lonLatToPlane(0, lat).y * MAP_H;
        verts.push(-MAP_W / 2, y, -0.001, MAP_W / 2, y, -0.001);
      }
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      const gridMat = new THREE.LineBasicMaterial({
        color: 0x1b3350,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const grid = new THREE.LineSegments(gridGeo, gridMat);
      mapGroup.add(grid);
      disposables.push(gridGeo, gridMat);
    }

    /* ── land dots ──────────────────────────────────────────────── */
    const dots = decodeMapDots();
    const dotCount = dots.length;
    const dotGeo = new THREE.BufferGeometry();
    const dotPos = new Float32Array(dotCount * 3);
    const dotRand = new Float32Array(dotCount);
    for (let i = 0; i < dotCount; i++) {
      dotPos[i * 3] = dots[i].x * MAP_W;
      dotPos[i * 3 + 1] = dots[i].y * MAP_H;
      dotPos[i * 3 + 2] = 0;
      dotRand[i] = Math.random();
    }
    dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
    dotGeo.setAttribute("aRand", new THREE.BufferAttribute(dotRand, 1));

    const dotUniforms = {
      uTime: { value: 0 },
      uSweepX: { value: -MAP_W / 2 - 1 },
      uScale: { value: 800 },
      uPointer: { value: new THREE.Vector2(99, 99) },
      uOpacity: { value: 0.6 },
    };
    const dotMat = new THREE.ShaderMaterial({
      vertexShader: DOTS_VERT,
      fragmentShader: DOTS_FRAG,
      uniforms: dotUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dotCloud = new THREE.Points(dotGeo, dotMat);
    mapGroup.add(dotCloud);
    disposables.push(dotGeo, dotMat);

    /* ── city hotspots ──────────────────────────────────────────── */
    const HOT_N = CITIES.length;
    const hotGeo = new THREE.BufferGeometry();
    const hotPos = new Float32Array(HOT_N * 3);
    const hotCol = new Float32Array(HOT_N * 3);
    const hotPhase = new Float32Array(HOT_N);
    const cityVecs: THREE.Vector3[] = [];
    for (let i = 0; i < HOT_N; i++) {
      const { x, y } = lonLatToPlane(CITIES[i][0], CITIES[i][1]);
      const v = new THREE.Vector3(x * MAP_W, y * MAP_H, 0.004);
      cityVecs.push(v);
      hotPos[i * 3] = v.x;
      hotPos[i * 3 + 1] = v.y;
      hotPos[i * 3 + 2] = v.z;
      // severity-weighted beacon colors: mostly amber, some crimson, some teal
      const roll = Math.random();
      const c = roll > 0.82 ? CRIMSON : roll > 0.52 ? AMBER : TEAL_BRIGHT;
      hotCol[i * 3] = c.r;
      hotCol[i * 3 + 1] = c.g;
      hotCol[i * 3 + 2] = c.b;
      hotPhase[i] = Math.random() * 3;
    }
    hotGeo.setAttribute("position", new THREE.BufferAttribute(hotPos, 3));
    hotGeo.setAttribute("aColor", new THREE.BufferAttribute(hotCol, 3));
    hotGeo.setAttribute("aPhase", new THREE.BufferAttribute(hotPhase, 1));
    const hotUniforms = { uTime: { value: 0 }, uScale: { value: 800 } };
    const hotMat = new THREE.ShaderMaterial({
      vertexShader: HOT_VERT,
      fragmentShader: HOT_FRAG,
      uniforms: hotUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const hotspots = new THREE.Points(hotGeo, hotMat);
    mapGroup.add(hotspots);
    disposables.push(hotGeo, hotMat);

    /* ── attack arcs + packets + arrival rings ──────────────────── */
    const arcs: ArcUnit[] = [];
    const ringTex = makeRingTexture();
    disposables.push(ringTex);
    const rings: RingUnit[] = [];
    for (let i = 0; i < RING_POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: ringTex,
        color: 0xffb300,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.02);
      sprite.visible = false;
      mapGroup.add(sprite);
      rings.push({ sprite, mat, t: 0, active: false });
      disposables.push(mat);
    }

    const tmpColorFrom = new THREE.Color();
    const tmpColorTo = new THREE.Color();

    for (let i = 0; i < ARC_COUNT; i++) {
      const lineGeo = new THREE.BufferGeometry();
      const SEGMENTS = 56;
      lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
      lineGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
      lineGeo.setDrawRange(0, 0);
      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      mapGroup.add(line);

      const packetGeo = new THREE.BufferGeometry();
      packetGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
      const packetMat = new THREE.PointsMaterial({
        color: 0xffb300,
        size: 0.035,
        map: softTex,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const packet = new THREE.Points(packetGeo, packetMat);
      packet.visible = false;
      mapGroup.add(packet);

      arcs.push({
        curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
        line,
        lineGeo,
        lineMat,
        packet,
        packetGeo,
        packetMat,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        phase: "idle",
        t: Math.random() * 2,
        speed: 1,
      });
      disposables.push(lineGeo, lineMat, packetGeo, packetMat);
    }

    const spawnArc = (arc: ArcUnit) => {
      let a = Math.floor(Math.random() * CITIES.length);
      let b = Math.floor(Math.random() * CITIES.length);
      if (a === b) b = (b + 1 + Math.floor(Math.random() * (CITIES.length - 1))) % CITIES.length;
      arc.from.copy(cityVecs[a]);
      arc.to.copy(cityVecs[b]);
      arc.curve.v0.copy(arc.from);
      arc.curve.v2.copy(arc.to);
      arc.curve.v1.copy(arc.from.clone().add(arc.to).multiplyScalar(0.5));
      // lift the control point toward the camera + away from center for an arc
      const lift = 0.16 + Math.random() * 0.22;
      arc.curve.v1.z += lift;
      arc.curve.v1.y += (arc.curve.v1.y >= 0 ? 0.05 : -0.05);

      // write the full polyline once; drawRange animates the reveal
      const posAttr = arc.lineGeo.getAttribute("position") as THREE.BufferAttribute;
      const colAttr = arc.lineGeo.getAttribute("color") as THREE.BufferAttribute;
      const destRoll = Math.random();
      tmpColorFrom.set(TEAL_BRIGHT);
      tmpColorTo.set(destRoll > 0.72 ? CRIMSON : destRoll > 0.4 ? AMBER : TEAL_BRIGHT);
      for (let s = 0; s <= 56; s++) {
        const p = arc.curve.getPoint(s / 56);
        posAttr.setXYZ(s, p.x, p.y, p.z);
        // color gradient: dim at origin, bright at destination
        const mix = Math.pow(s / 56, 1.4);
        const c = tmpColorFrom.clone().lerp(tmpColorTo, mix);
        const shade = 0.35 + mix * 0.65;
        colAttr.setXYZ(s, c.r * shade, c.g * shade, c.b * shade);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      arc.packetMat.color.copy(tmpColorTo);
      arc.lineMat.opacity = 0.8;
      arc.lineGeo.setDrawRange(0, 0);
      arc.line.visible = true;
      arc.packet.visible = false;
      arc.phase = "draw";
      arc.t = 0;
      arc.speed = 0.9 + Math.random() * 0.9;
    };

    const fireRing = (pos: THREE.Vector3, color: THREE.Color) => {
      const ring = rings.find((r) => !r.active);
      if (!ring) return;
      ring.active = true;
      ring.t = 0;
      ring.sprite.position.copy(pos);
      ring.sprite.position.z = 0.01;
      ring.mat.color.copy(color);
      ring.mat.opacity = 0.85;
      ring.sprite.scale.setScalar(0.02);
      ring.sprite.visible = true;
    };

    const stepArcs = (dt: number) => {
      for (const arc of arcs) {
        arc.t += dt * arc.speed;
        if (arc.phase === "idle") {
          if (arc.t >= 1) spawnArc(arc);
        } else if (arc.phase === "draw") {
          const n = Math.floor(Math.min(1, arc.t) * 57);
          arc.lineGeo.setDrawRange(0, n);
          if (arc.t >= 1) {
            arc.phase = "travel";
            arc.t = 0;
            arc.speed = 1.1 + Math.random() * 1.0;
            arc.packet.visible = true;
          }
        } else if (arc.phase === "travel") {
          const p = arc.curve.getPoint(Math.min(1, arc.t));
          (arc.packetGeo.getAttribute("position") as THREE.BufferAttribute).setXYZ(0, p.x, p.y, p.z);
          (arc.packetGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
          if (arc.t >= 1) {
            arc.packet.visible = false;
            fireRing(arc.to, arc.packetMat.color);
            arc.phase = "fade";
            arc.t = 0;
            arc.speed = 1.4;
          }
        } else if (arc.phase === "fade") {
          arc.lineMat.opacity = Math.max(0, 0.8 * (1 - arc.t));
          if (arc.t >= 1) {
            arc.line.visible = false;
            arc.lineGeo.setDrawRange(0, 0);
            arc.phase = "idle";
            arc.t = Math.random() * 1.6; // staggered respawn delay
            arc.speed = 1;
          }
        }
      }
      for (const ring of rings) {
        if (!ring.active) continue;
        ring.t += dt * 1.6;
        const k = Math.min(1, ring.t);
        ring.sprite.scale.setScalar(0.02 + k * 0.17);
        ring.mat.opacity = 0.85 * (1 - k);
        if (k >= 1) {
          ring.active = false;
          ring.sprite.visible = false;
        }
      }
    };

    // seed all arcs so the field is alive from frame one
    for (const arc of arcs) arc.t = Math.random() * 1.2;

    /* ── scan bar ───────────────────────────────────────────────── */
    const sweepTex = makeSweepTexture();
    const sweepGeo = new THREE.PlaneGeometry(0.5, MAP_H * 1.06);
    const sweepMat = new THREE.MeshBasicMaterial({
      map: sweepTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sweep = new THREE.Mesh(sweepGeo, sweepMat);
    sweep.position.z = 0.002;
    mapGroup.add(sweep);
    disposables.push(sweepTex, sweepGeo, sweepMat);
    const SWEEP_PERIOD = 9.5; // seconds across the map (incl. rest)

    /* ── pointer parallax + cursor ignition ─────────────────────── */
    const pointer = { x: 0, y: 0 };
    const pointerWorld = new THREE.Vector2(99, 99);
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
      pointerWorld.set(pointer.x, pointer.y);
    };
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

    /* ── sizing ─────────────────────────────────────────────────── */
    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const pointScale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
      dotUniforms.uScale.value = pointScale;
      hotUniforms.uScale.value = pointScale;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const FRAME_BUDGET_MS = 1000 / 30;
    let raf = 0;
    let running = true;
    let last = performance.now();
    let acc = 0;
    let simTime = 0;

    const OFFSCREEN = new THREE.Vector2(99, 99);
    const tmpPointerWorld = new THREE.Vector2();
    const visibleHeight = () => 2 * 2.35 * Math.tan((camera.fov * Math.PI) / 360);

    const renderFrame = (dt: number) => {
      simTime += dt;
      dotUniforms.uTime.value = simTime;
      hotUniforms.uTime.value = simTime;

      // scan bar sweep + matching shader boost
      const cyc = (simTime % SWEEP_PERIOD) / SWEEP_PERIOD;
      const sx = -MAP_W / 2 - 0.4 + cyc * (MAP_W + 0.8);
      sweep.position.x = sx;
      dotUniforms.uSweepX.value = sx;

      // pointer → world coords on the map plane
      const vh = visibleHeight();
      const vw = vh * camera.aspect;
      tmpPointerWorld.set(
        pointerWorld.x * (vw / 2),
        -pointerWorld.y * (vh / 2) - mapGroup.position.y,
      );
      const inside = Math.abs(tmpPointerWorld.x) < MAP_W / 2 && Math.abs(tmpPointerWorld.y) < MAP_H / 2;
      dotUniforms.uPointer.value.copy(inside ? tmpPointerWorld : OFFSCREEN);

      // camera parallax
      camera.position.x += (pointer.x * 0.10 - camera.position.x) * 0.04;
      camera.position.y += (-pointer.y * 0.06 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      // scroll drift — the field recedes slightly as you read
      const targetY = Math.min(0.5, (window.scrollY || 0) * 0.00045);
      mapGroup.position.y += (targetY - mapGroup.position.y) * 0.06;

      // stars drift slowly
      const starAttr = starGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < STARS; i++) {
        let x = starAttr.getX(i) + dt * 0.012;
        if (x > 4.5) x = -4.5;
        starAttr.setX(i, x);
      }
      starAttr.needsUpdate = true;

      if (!reduced) stepArcs(dt);
      renderer.render(scene, camera);
    };

    if (reduced) {
      // one considered static frame: sweep mid-map, arcs fully drawn
      dotUniforms.uSweepX.value = MAP_W * 0.22;
      for (const arc of arcs) {
        spawnArc(arc);
        arc.lineGeo.setDrawRange(0, 57);
        arc.lineMat.opacity = 0.6;
        arc.phase = "idle";
        arc.t = 10;
      }
      renderFrame(0.016);
    } else {
      const loop = () => {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        acc += now - last;
        last = now;
        if (acc >= FRAME_BUDGET_MS) {
          acc = 0;
          renderFrame(dt);
        }
      };
      raf = requestAnimationFrame(loop);

      const onVisibility = () => {
        running = !document.hidden;
        if (running) {
          last = performance.now();
          acc = 0;
          raf = requestAnimationFrame(loop);
        } else {
          cancelAnimationFrame(raf);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointer);
        cancelAnimationFrame(raf);
        observer.disconnect();
        for (const d of disposables) d.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    return () => {
      window.removeEventListener("pointermove", onPointer);
      observer.disconnect();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 [&>*]:h-full [&>*]:w-full"
    >
      {/* vignette + legibility gradients above the WebGL layer */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 78% 62% at 50% 40%, transparent 42%, rgba(5,7,13,0.42) 74%, rgba(5,7,13,0.85) 100%), linear-gradient(to top, rgba(5,7,13,0.82), transparent 18%), linear-gradient(to bottom, rgba(5,7,13,0.6), transparent 12%)",
        }}
      />
    </div>
  );
}
