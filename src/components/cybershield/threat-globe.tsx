"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const SEVERITY_HEX: Record<string, number> = {
  CRITICAL: 0xff3b30,
  HIGH: 0xff8a3d,
  ELEVATED: 0xffb300,
  MODERATE: 0x00e5ff,
};

const SEVERITY_CSS: Record<string, string> = {
  CRITICAL: "#ff3b30",
  HIGH: "#ff8a3d",
  ELEVATED: "#ffb300",
  MODERATE: "#00e5ff",
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

function buildTrace(item: FeedItem): Trace {
  const h = hash32(item.id);
  const fromIdx = h % HUB_COUNT;
  let toIdx = (fromIdx + 1 + ((h >>> 9) % (HUB_COUNT - 1))) % HUB_COUNT;
  if (toIdx === fromIdx) toIdx = (fromIdx + 1) % HUB_COUNT;
  const from = lonLatToVec3(CITY_HUBS[fromIdx][0], CITY_HUBS[fromIdx][1], 1.005, new THREE.Vector3());
  const to = lonLatToVec3(CITY_HUBS[toIdx][0], CITY_HUBS[toIdx][1], 1.005, new THREE.Vector3());
  return {
    from,
    to,
    color: SEVERITY_HEX[item.intel.severity.label] ?? SEVERITY_HEX.MODERATE!,
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
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.14, d) * vA;
    gl_FragColor = vec4(vec3(0.13, 0.55, 0.66), alpha);
  }
`;

export function ThreatGlobe({ items, className }: { items: FeedItem[]; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [failed, setFailed] = useState(false);

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

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    } catch {
      setFailed(true);
      return;
    }

    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(dpr);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0.22, 3.3);
    camera.lookAt(0, 0, 0);

    const globe = new THREE.Group();
    globe.rotation.x = 0.16;
    // open on the Atlantic corridor — North America ↔ Europe, FortiGuard-style
    globe.rotation.y = -1.1;
    scene.add(globe);

    const disposables: Array<{ dispose: () => void }> = [];

    /* ── occluding core (hides the far side) ───────────────────────── */
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.965, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x060a13 }),
    );
    globe.add(core);
    disposables.push(core.geometry, core.material as THREE.Material);

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
    const dotUniforms = { uTime: { value: 0 }, uSize: { value: 9.5 * dpr } };
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
      color: 0x5df2ff,
      size: 0.028,
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
          .map((item) => buildTrace(item))
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
      const arcGeo = new THREE.TubeGeometry(curve, 30, 0.005, 5, false);
      const arcMat = new THREE.MeshBasicMaterial({
        color: trace.color,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const arc = new THREE.Mesh(arcGeo, arcMat);
      traceGroup.add(arc);
      disposables.push(arcGeo, arcMat);

      // packet travelling the arc
      const packetGeo = new THREE.SphereGeometry(0.015, 10, 10);
      const packetMat = new THREE.MeshBasicMaterial({
        color: trace.color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
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
          opacity: 0.9,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
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

    /* ── atmosphere halo ───────────────────────────────────────────── */
    const haloGeo = new THREE.SphereGeometry(1.16, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    globe.add(halo);
    disposables.push(haloGeo, haloMat);

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

      dotUniforms.uTime.value = t;

      for (const ring of rings) {
        const p = (t * 0.42 + ring.trace.phase + ring.offset) % 1;
        const s = 1 + p * 3.2;
        ring.mesh.scale.setScalar(s);
        ring.mat.opacity = (1 - p) * 0.85;
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
  }, [liveKey]);

  if (failed) {
    return (
      <div className={cn("cyber-grid-bg relative overflow-hidden rounded-2xl border border-cyber-border bg-cyber-panel p-4", className)}>
        <GlobeHeader stats={stats} total={live.length} />
        <div className="relative mx-auto my-6 flex aspect-square max-h-[300px] w-full max-w-[300px] items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-cyber-teal/25" />
          <div className="absolute inset-[15%] rounded-full border border-cyber-teal/20" />
          <div className="absolute inset-[32%] rounded-full border border-cyber-teal/15" />
          <Globe2 className="h-10 w-10 text-cyber-teal/70" />
        </div>
        <p className="digital text-center text-[8px] tracking-widest text-slate-600">
          WEBGL UNAVAILABLE — STATIC MAP FALLBACK
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "signal-sweep overflow-hidden rounded-2xl border border-cyber-border bg-cyber-surface p-4 shadow-lg",
        className,
      )}
      aria-label="Live threat map"
    >
      <GlobeHeader stats={stats} total={live.length} />
      <div
        ref={hostRef}
        className="relative mt-2 aspect-square w-full touch-none select-none"
        role="img"
        aria-label="Rotating 3D world map with live attack arcs between real cities"
      />
      <p className="digital mt-2 flex items-center justify-center gap-1.5 text-[8px] tracking-widest text-slate-600">
        <Hand className="h-2.5 w-2.5" />
        DRAG TO ROTATE · ARCS = LIVE ARTICLES ≤48H · REAL GEOGRAPHY
      </p>
    </section>
  );
}

function GlobeHeader({ stats, total }: { stats: Record<string, number>; total: number }) {
  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          <Globe2 className="h-3.5 w-3.5 text-cyber-teal" />
          Live Threat Map
          <span className="cyber-ping relative ml-0.5 inline-flex h-1.5 w-1.5 text-cyber-teal">
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyber-teal" />
          </span>
        </h2>
        <span className="flex items-center gap-1">
          <Fingerprint className="h-3 w-3 text-slate-500" />
          <span className="digital text-[9px] font-bold tracking-widest text-slate-400">
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
      <div className="digital mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[7.5px] tracking-[0.16em] text-slate-500">
        {(Object.keys(SEVERITY_CSS) as Array<keyof typeof SEVERITY_CSS>).map((label) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: SEVERITY_CSS[label], boxShadow: `0 0 5px ${SEVERITY_CSS[label]}88` }}
            />
            {label} {stats[label] ? `· ${stats[label]}` : "· 0"}
          </span>
        ))}
      </div>
    </>
  );
}
