"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Fingerprint, Globe2, Hand } from "lucide-react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/cyber/gsap";
import type { FeedItem } from "@/lib/cyber/feeds";
import { decodeMapDots } from "@/lib/cyber/world-dots";
import { cn } from "@/lib/utils";

/**
 * LIVE THREAT MAP — a FortiGuard-style attack map, in 3D.
 *
 * A dark occluded globe whose landmasses are drawn as a dot matrix from a
 * real NASA-derived land bitmask (7,666 geo-referenced cells). 33 real city
 * hubs sit at their true coordinates. Every recent live article (≤48h)
 * becomes a deterministic attack arc between two hubs — severity-colored,
 * with a packet travelling the arc and impact rings pulsing at both ends —
 * so the map is a live geography of the actual stream. Nothing is random
 * at runtime: traces are hashed from real article IDs. Drag to rotate
 * (with inertia).
 *
 * v9 design pass: fresnel atmosphere rim, faint graticule, starfield
 * backdrop, gradient-tinted land dots and a full light-theme palette
 * (normal blending + daylight-severity colors).
 */

const CITY_HUBS: Array<[number, number]> = [
  [-74.0, 40.7], [-122.4, 37.8], [-77.0, 38.9], [-87.6, 41.9], [-79.4, 43.7],
  [-99.1, 19.4], [-74.1, 4.7], [-46.6, -23.5], [-58.4, -34.6],
  [-0.1, 51.5], [2.35, 48.85], [8.7, 50.1], [4.9, 52.4], [-3.7, 40.4],
  [18.1, 59.3], [21.0, 52.2], [29.0, 41.0], [37.6, 55.75],
  [34.8, 32.1], [31.2, 30.0], [3.4, 6.5], [36.8, -1.3], [28.0, -26.2],
  [55.3, 25.2], [72.9, 19.1], [103.8, 1.35], [114.2, 22.3], [121.5, 31.2],
  [116.4, 39.9], [139.7, 35.7], [127.0, 37.6], [151.2, -33.9], [174.8, -36.8],
];

const MAX_TRACES = 26;
const WINDOW_HOURS = 48;
const HUB_COUNT = CITY_HUBS.length;

/* ── theme palettes ─────────────────────────────────────────────────── */

interface GlobeTheme {
  core: number;
  dot: [number, number, number];
  hub: number;
  halo: number;
  haloOpacity: number;
  atmosphere: number;
  graticule: number;
  graticuleOpacity: number;
  blending: THREE.Blending;
  arcOpacity: number;
  ringBase: number;
  stars: boolean;
  starColor: number;
  severity: Record<string, number>;
}

const THEMES: Record<"dark" | "light", GlobeTheme> = {
  dark: {
    core: 0x05080f,
    dot: [0.16, 0.7, 0.64],
    hub: 0x67e8f9,
    halo: 0x2dd4bf,
    haloOpacity: 0.075,
    atmosphere: 0x2dd4bf,
    graticule: 0x24334f,
    graticuleOpacity: 0.42,
    blending: THREE.AdditiveBlending,
    arcOpacity: 0.34,
    ringBase: 0.85,
    stars: true,
    starColor: 0xa8d8e8,
    severity: {
      CRITICAL: 0xff4d5e,
      HIGH: 0xfb923c,
      ELEVATED: 0xf59e0b,
      MODERATE: 0x2dd4bf,
    },
  },
  light: {
    core: 0xffffff,
    dot: [0.05, 0.55, 0.52],
    hub: 0x0d9488,
    halo: 0x0d9488,
    haloOpacity: 0.06,
    atmosphere: 0x0d9488,
    graticule: 0xaebfd6,
    graticuleOpacity: 0.5,
    blending: THREE.NormalBlending,
    arcOpacity: 0.55,
    ringBase: 0.7,
    stars: false,
    starColor: 0xffffff,
    severity: {
      CRITICAL: 0xdc2626,
      HIGH: 0xc2410c,
      ELEVATED: 0xb45309,
      MODERATE: 0x0d9488,
    },
  },
};

/* legend swatches follow the CSS tokens so the key matches both themes */
const SEVERITY_LEGEND: Record<string, string> = {
  CRITICAL: "var(--crimson)",
  HIGH: "var(--orange)",
  ELEVATED: "var(--amber)",
  MODERATE: "var(--teal)",
};

function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** WGS84 lon/lat → position on a sphere of `radius` (three-globe convention). */
function lonLatToVec3(lon: number, lat: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

interface Trace {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: number;
  phase: number;
  speed: number;
}

function buildTrace(item: FeedItem, severity: GlobeTheme["severity"]): Trace {
  const h = hash32(item.id);
  const fromIdx = h % HUB_COUNT;
  let toIdx = (fromIdx + 1 + ((h >>> 9) % (HUB_COUNT - 1))) % HUB_COUNT;
  if (toIdx === fromIdx) toIdx = (fromIdx + 1) % HUB_COUNT;
  const from = lonLatToVec3(CITY_HUBS[fromIdx][0], CITY_HUBS[fromIdx][1], 1.005, new THREE.Vector3());
  const to = lonLatToVec3(CITY_HUBS[toIdx][0], CITY_HUBS[toIdx][1], 1.005, new THREE.Vector3());
  return {
    from,
    to,
    color: severity[item.intel.severity.label] ?? severity.MODERATE!,
    phase: ((h >>> 17) % 997) / 997,
    speed: 0.1 + (((h >>> 5) % 89) / 89) * 0.14,
  };
}

/* ── land dot shader — round points with per-dot twinkle ───────────── */

const LAND_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  attribute float aRand;
  varying float vA;
  void main() {
    float tw = 0.55 + 0.45 * sin(uTime * (0.4 + aRand * 1.1) + aRand * 40.0);
    vA = 0.3 + 0.7 * tw;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (0.75 + aRand * 0.5) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const LAND_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.14, d) * vA;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* ── fresnel atmosphere shader — soft rim glow at the silhouette ───── */

const FRESNEL_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRESNEL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
    gl_FragColor = vec4(uColor, fres * uOpacity);
  }
`;

export function ThreatGlobe({ items, className }: { items: FeedItem[]; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    // keep the scene builder's view of the stream fresh without rebuilding
    // the Three.js scene on every items identity change
    itemsRef.current = items;
  }, [items]);
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();
  const themeName: "dark" | "light" = resolvedTheme === "light" ? "light" : "dark";

  /* rotation is preserved across scene rebuilds (theme flips, stream syncs) */
  const rotRef = useRef({ x: 0.16, y: -1.1 });

  /* ── live trace selection (≤48h, newest first, deterministic) ───── */
  const live = useMemo(() => {
    const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
    return items
      .filter((item) => item.publishedAt >= cutoff)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, MAX_TRACES);
  }, [items]);

  const liveKey = useMemo(() => live.map((item) => item.id).join("|"), [live]);

  const stats = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, ELEVATED: 0, MODERATE: 0 } as Record<string, number>;
    for (const item of live) counts[item.intel.severity.label] = (counts[item.intel.severity.label] ?? 0) + 1;
    return counts;
  }, [live]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const T = THEMES[themeName];

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      // defer: setState synchronously inside an effect causes cascading renders
      queueMicrotask(() => setFailed(true));
      return;
    }

    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(dpr);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    camera.position.set(0, 0.22, 3.3);
    camera.lookAt(0, 0, 0);

    const globe = new THREE.Group();
    globe.rotation.x = rotRef.current.x;
    globe.rotation.y = rotRef.current.y;
    // open on the Atlantic corridor — North America ↔ Europe, FortiGuard-style
    scene.add(globe);

    const disposables: Array<{ dispose: () => void }> = [];

    /* ── occluding core (hides the far side) ───────────────────────── */
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.965, 56, 56),
      new THREE.MeshBasicMaterial({ color: T.core }),
    );
    globe.add(core);
    disposables.push(core.geometry, core.material as THREE.Material);

    /* ── graticule — faint lat/lon wireframe for cartographic depth ── */
    {
      const pts: number[] = [];
      const r = 1.001;
      const v = new THREE.Vector3();
      for (let lat = -60; lat <= 60; lat += 20) {
        for (let lon = -180; lon < 180; lon += 4) {
          lonLatToVec3(lon, lat, r, v);
          pts.push(v.x, v.y, v.z);
          lonLatToVec3(lon + 4, lat, r, v);
          pts.push(v.x, v.y, v.z);
        }
      }
      for (let lon = -180; lon < 180; lon += 20) {
        for (let lat = -88; lat < 88; lat += 4) {
          lonLatToVec3(lon, lat, r, v);
          pts.push(v.x, v.y, v.z);
          lonLatToVec3(lon, lat + 4, r, v);
          pts.push(v.x, v.y, v.z);
        }
      }
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const gridMat = new THREE.LineBasicMaterial({
        color: T.graticule,
        transparent: true,
        opacity: T.graticuleOpacity,
        depthWrite: false,
      });
      const grid = new THREE.LineSegments(gridGeo, gridMat);
      globe.add(grid);
      disposables.push(gridGeo, gridMat);
    }

    /* ── land dot matrix — real geography from the NASA bitmask ────── */
    const dots = decodeMapDots();
    const dotCount = dots.length;
    const dotPos = new Float32Array(dotCount * 3);
    const dotRand = new Float32Array(dotCount);
    const v = new THREE.Vector3();
    for (let i = 0; i < dotCount; i++) {
      lonLatToVec3(dots[i].lon, dots[i].lat, 1, v);
      dotPos[i * 3] = v.x;
      dotPos[i * 3 + 1] = v.y;
      dotPos[i * 3 + 2] = v.z;
      dotRand[i] = Math.random();
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
    dotGeo.setAttribute("aRand", new THREE.BufferAttribute(dotRand, 1));
    const dotUniforms = {
      uTime: { value: 0 },
      uSize: { value: 10.5 * dpr },
      uColor: { value: new THREE.Vector3(...T.dot) },
    };
    const dotMat = new THREE.ShaderMaterial({
      uniforms: dotUniforms,
      vertexShader: LAND_VERT,
      fragmentShader: LAND_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const landDots = new THREE.Points(dotGeo, dotMat);
    globe.add(landDots);
    disposables.push(dotGeo, dotMat);

    /* ── city hubs at true coordinates ─────────────────────────────── */
    const hubPos = new Float32Array(HUB_COUNT * 3);
    for (let i = 0; i < HUB_COUNT; i++) {
      lonLatToVec3(CITY_HUBS[i][0], CITY_HUBS[i][1], 1.006, v);
      hubPos[i * 3] = v.x;
      hubPos[i * 3 + 1] = v.y;
      hubPos[i * 3 + 2] = v.z;
    }
    const hubGeo = new THREE.BufferGeometry();
    hubGeo.setAttribute("position", new THREE.BufferAttribute(hubPos, 3));
    const hubMat = new THREE.PointsMaterial({
      color: T.hub,
      size: 0.03,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const hubs = new THREE.Points(hubGeo, hubMat);
    globe.add(hubs);
    disposables.push(hubGeo, hubMat);

    /* ── live traces layer (rebuilt when the stream changes) ───────── */
    const traces: Trace[] = liveKey
      ? liveKey
          .split("|")
          .map((id) => itemsRef.current.find((entry) => entry.id === id))
          .filter((item): item is FeedItem => Boolean(item))
          .map((item) => buildTrace(item, T.severity))
      : [];

    const traceGroup = new THREE.Group();
    globe.add(traceGroup);

    const packets: Array<{ mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; trace: Trace }> = [];
    const rings: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; trace: Trace; at: THREE.Vector3; offset: number }> = [];

    for (const trace of traces) {
      // arc — quadratic bezier lifted between the two hubs, height ∝ distance
      const angular = trace.from.angleTo(trace.to);
      const mid = trace.from.clone().add(trace.to).multiplyScalar(0.5).normalize();
      mid.multiplyScalar(1 + 0.16 + 0.42 * (angular / Math.PI));
      const curve = new THREE.QuadraticBezierCurve3(
        trace.from.clone().multiplyScalar(1.002),
        mid,
        trace.to.clone().multiplyScalar(1.002),
      );
      const arcGeo = new THREE.TubeGeometry(curve, 32, 0.0052, 6, false);
      const arcMat = new THREE.MeshBasicMaterial({
        color: trace.color,
        transparent: true,
        opacity: T.arcOpacity,
        blending: T.blending,
        depthWrite: false,
      });
      const arc = new THREE.Mesh(arcGeo, arcMat);
      traceGroup.add(arc);
      disposables.push(arcGeo, arcMat);

      // packet travelling the arc
      const packetGeo = new THREE.SphereGeometry(0.016, 12, 12);
      const packetMat = new THREE.MeshBasicMaterial({
        color: trace.color,
        transparent: true,
        opacity: 0.95,
        blending: T.blending,
        depthWrite: false,
      });
      const packet = new THREE.Mesh(packetGeo, packetMat);
      traceGroup.add(packet);
      disposables.push(packetGeo, packetMat);
      packets.push({ mesh: packet, curve, trace });

      // impact rings at both endpoints (destination ring lags to match arrival)
      for (const [at, offset] of [
        [trace.from, 0],
        [trace.to, 0.62],
      ] as Array<[THREE.Vector3, number]>) {
        const ringGeo = new THREE.RingGeometry(0.016, 0.026, 28);
        const ringMat = new THREE.MeshBasicMaterial({
          color: trace.color,
          transparent: true,
          opacity: T.ringBase,
          side: THREE.DoubleSide,
          blending: T.blending,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(at).multiplyScalar(1.004);
        ring.lookAt(at.clone().multiplyScalar(2));
        traceGroup.add(ring);
        disposables.push(ringGeo, ringMat);
        rings.push({ mesh: ring, mat: ringMat, trace, at, offset });
      }
    }

    /* ── fresnel atmosphere rim ────────────────────────────────────── */
    const atmoGeo = new THREE.SphereGeometry(1.13, 48, 48);
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(T.atmosphere) },
        uOpacity: { value: themeName === "dark" ? 0.5 : 0.32 },
        uPower: { value: 2.4 },
      },
      vertexShader: FRESNEL_VERT,
      fragmentShader: FRESNEL_FRAG,
      transparent: true,
      blending: T.blending,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    globe.add(atmosphere);
    disposables.push(atmoGeo, atmoMat);

    /* ── soft inner halo ───────────────────────────────────────────── */
    const haloGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: T.halo,
      transparent: true,
      opacity: T.haloOpacity,
      side: THREE.BackSide,
      blending: T.blending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    globe.add(halo);
    disposables.push(haloGeo, haloMat);

    /* ── starfield backdrop (dark theme only) ──────────────────────── */
    let starPoints: THREE.Points | null = null;
    if (T.stars) {
      const starCount = 900;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        // uniform distribution on a large shell
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const r = 16 + Math.random() * 10;
        starPos[i * 3] = r * s * Math.cos(phi);
        starPos[i * 3 + 1] = r * u;
        starPos[i * 3 + 2] = r * s * Math.sin(phi);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        color: T.starColor,
        size: 0.045,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      starPoints = new THREE.Points(starGeo, starMat);
      scene.add(starPoints);
      disposables.push(starGeo, starMat);
    }

    /* ── interaction: drag with inertia ────────────────────────────── */
    const drag = { active: false, lastX: 0, lastY: 0, velX: 0, velY: 0 };
    const onDown = (event: PointerEvent) => {
      drag.active = true;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      host.style.cursor = "grabbing";
    };
    const onMove = (event: PointerEvent) => {
      if (!drag.active) return;
      drag.velY = (event.clientX - drag.lastX) * 0.0052;
      drag.velX = (event.clientY - drag.lastY) * 0.0034;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      globe.rotation.y += drag.velY;
      globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + drag.velX, -0.65, 0.65);
    };
    const onUp = () => {
      drag.active = false;
      host.style.cursor = "grab";
    };
    host.style.cursor = "grab";
    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });

    /* ── sizing ────────────────────────────────────────────────────── */
    const resize = () => {
      const w = host.clientWidth || 300;
      const h = host.clientHeight || w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    /* ── animation loop (30fps budget + offscreen pause) ───────────── */
    const startedAt = performance.now();
    const FRAME_BUDGET_MS = 1000 / 30;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let inView = true;
    const intersection = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 },
    );
    intersection.observe(host);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = now - last;
      last = now;
      acc += dt;
      if (!inView || document.hidden || acc < FRAME_BUDGET_MS) return;
      acc = 0;
      const t = (now - startedAt) / 1000;

      if (!drag.active) {
        globe.rotation.y += 0.002 + drag.velY;
        globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + drag.velX, -0.65, 0.65);
        drag.velX *= 0.94;
        drag.velY *= 0.94;
      }
      rotRef.current.x = globe.rotation.x;
      rotRef.current.y = globe.rotation.y;

      if (starPoints) starPoints.rotation.y = t * 0.004;

      dotUniforms.uTime.value = t;

      for (const ring of rings) {
        const p = (t * 0.42 + ring.trace.phase + ring.offset) % 1;
        const s = 1 + p * 3.2;
        ring.mesh.scale.setScalar(s);
        ring.mat.opacity = (1 - p) * T.ringBase;
      }

      for (const packet of packets) {
        const p = (t * packet.trace.speed + packet.trace.phase) % 1;
        packet.mesh.position.copy(packet.curve.getPoint(p));
        const fade = Math.sin(Math.PI * THREE.MathUtils.clamp((p - 0.04) / 0.92, 0, 1));
        (packet.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * Math.max(0, fade);
      }

      renderer.render(scene, camera);
    };

    const cleanup = () => {
      intersection.disconnect();
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(raf);
      observer.disconnect();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };

    if (reduced) {
      renderer.render(scene, camera); // static but complete composition
      return cleanup;
    }

    raf = requestAnimationFrame(tick);
    return cleanup;
  }, [liveKey, themeName]);

  if (failed) {
    return (
      <div className={cn("card-surface cyber-grid-bg relative overflow-hidden p-5", className)}>
        <GlobeHeader stats={stats} total={live.length} />
        <div className="relative mx-auto my-6 flex aspect-square max-h-[300px] w-full max-w-[300px] items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-cyber-teal/25" />
          <div className="absolute inset-[15%] rounded-full border border-cyber-teal/20" />
          <div className="absolute inset-[32%] rounded-full border border-cyber-teal/15" />
          <Globe2 className="h-10 w-10 text-cyber-teal/70" />
        </div>
        <p className="digital text-center text-[9px] tracking-widest text-low">
          WEBGL UNAVAILABLE — STATIC MAP FALLBACK
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "card-surface signal-sweep overflow-hidden p-5",
        className,
      )}
      aria-label="Live threat map"
    >
      <GlobeHeader stats={stats} total={live.length} />
      <div
        ref={hostRef}
        className="relative mt-3 aspect-square w-full touch-none select-none"
        role="img"
        aria-label="Rotating 3D world map with live attack arcs between real cities"
      />
      <p className="digital mt-3 flex items-center justify-center gap-1.5 text-[9px] tracking-widest text-low">
        <Hand className="h-3 w-3" />
        DRAG TO ROTATE · ARCS = LIVE ARTICLES ≤48H · REAL GEOGRAPHY
      </p>
    </section>
  );
}

function GlobeHeader({ stats, total }: { stats: Record<string, number>; total: number }) {
  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-hi">
          <Globe2 className="h-4 w-4 text-cyber-teal" />
          Live Threat Map
          <span className="cyber-ping relative ml-0.5 inline-flex h-1.5 w-1.5 text-cyber-teal">
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyber-teal" />
          </span>
        </h2>
        <span className="flex items-center gap-1">
          <Fingerprint className="h-3.5 w-3.5 text-low" />
          <span className="digital text-[9.5px] font-bold tracking-widest text-mid">
            {total} ARCS
          </span>
        </span>
        <span className="sr-only">
          {Object.entries(stats)
            .filter(([, count]) => count > 0)
            .map(([label, count]) => `${count} ${label}`)
            .join(", ")}
        </span>
      </header>
      <div className="digital mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[9px] tracking-[0.14em] text-mid">
        {(Object.keys(SEVERITY_LEGEND) as Array<keyof typeof SEVERITY_LEGEND>).map((label) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: SEVERITY_LEGEND[label] }}
            />
            {label} {stats[label] ? `· ${stats[label]}` : "· 0"}
          </span>
        ))}
      </div>
    </>
  );
}
