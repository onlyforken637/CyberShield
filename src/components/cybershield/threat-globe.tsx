"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Fingerprint, Globe2, Hand } from "lucide-react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/cyber/gsap";
import type { FeedItem } from "@/lib/cyber/feeds";
import { cn } from "@/lib/utils";

/**
 * LIVE THREAT SPHERE — the exhibition centerpiece.
 *
 * A wireframe sensor globe where every recent live article (≤48h) becomes
 * a deterministic trace: a severity-colored attack arc between two nodes,
 * a packet travelling along it, and an expanding pulse ring at the origin
 * node. Nothing is random at runtime — traces are hashed from real article
 * IDs and colored by the real pipeline severity, so the sphere is a live
 * geography of the actual stream. Drag to rotate (with inertia).
 */

const NODE_COUNT = 150;
const MAX_TRACES = 26;
const WINDOW_HOURS = 48;

const SEVERITY_HEX: Record<string, number> = {
  CRITICAL: 0xff3b30,
  HIGH: 0xff8a3d,
  ELEVATED: 0xffb300,
  MODERATE: 0x00e5ff,
};

const SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: "text-cyber-crimson",
  HIGH: "text-cyber-orange",
  ELEVATED: "text-cyber-amber",
  MODERATE: "text-cyber-teal",
};

function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Evenly distributed points on a sphere (fibonacci lattice). */
function nodePosition(index: number, total: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = Math.acos(1 - (2 * (index + 0.5)) / total);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return out.set(
    Math.cos(theta) * Math.sin(phi),
    Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
  );
}

interface Trace {
  fromIdx: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: number;
  phase: number;
  speed: number;
  hasArc: boolean;
}

function buildTrace(item: FeedItem): Trace {
  const h = hash32(item.id);
  const fromIdx = h % NODE_COUNT;
  const toIdx = (fromIdx + 1 + ((h >>> 9) % (NODE_COUNT - 1))) % NODE_COUNT;
  return {
    fromIdx,
    from: nodePosition(fromIdx, NODE_COUNT, new THREE.Vector3()),
    to: nodePosition(toIdx, NODE_COUNT, new THREE.Vector3()),
    color: SEVERITY_HEX[item.intel.severity.label] ?? SEVERITY_HEX.MODERATE!,
    phase: ((h >>> 17) % 997) / 997,
    speed: 0.1 + (((h >>> 5) % 89) / 89) * 0.14,
    hasArc: (h & 3) !== 0,
  };
}

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
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0.25, 3.35);
    camera.lookAt(0, 0, 0);

    const globe = new THREE.Group();
    scene.add(globe);

    /* ── occluding core (makes the front wireframe pop) ────────────── */
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.965, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x060a13 }),
    );
    globe.add(core);

    /* ── wireframe shell ───────────────────────────────────────────── */
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshBasicMaterial({
        color: 0x1f6f86,
        wireframe: true,
        transparent: true,
        opacity: 0.34,
      }),
    );
    globe.add(wire);

    /* ── sensor nodes ──────────────────────────────────────────────── */
    const nodeGeo = new THREE.BufferGeometry();
    const nodePos = new Float32Array(NODE_COUNT * 3);
    const nodeCol = new Float32Array(NODE_COUNT * 3);
    const base = new THREE.Color(0x2b7d95);
    const tmp = new THREE.Vector3();
    for (let n = 0; n < NODE_COUNT; n++) {
      nodePosition(n, NODE_COUNT, tmp);
      nodePos[n * 3] = tmp.x;
      nodePos[n * 3 + 1] = tmp.y;
      nodePos[n * 3 + 2] = tmp.z;
      nodeCol[n * 3] = base.r;
      nodeCol[n * 3 + 1] = base.g;
      nodeCol[n * 3 + 2] = base.b;
    }
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    nodeGeo.setAttribute("color", new THREE.BufferAttribute(nodeCol, 3));
    const nodePoints = new THREE.Points(
      nodeGeo,
      new THREE.PointsMaterial({
        size: 0.026,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
    globe.add(nodePoints);

    /* ── live traces layer (rebuilt when the stream changes) ───────── */
    const traces: Trace[] = liveKey ? liveKey.split("|").map((id) => {
      const item = itemsRef.current.find((entry) => entry.id === id);
      return item ? buildTrace(item) : null;
    }).filter((t): t is Trace => t !== null) : [];

    const traceGroup = new THREE.Group();
    globe.add(traceGroup);
    const disposables: Array<{ dispose: () => void }> = [];

    // severity-tinted live nodes
    for (const trace of traces) {
      const col = new THREE.Color(trace.color);
      nodeCol[trace.fromIdx * 3] = col.r;
      nodeCol[trace.fromIdx * 3 + 1] = col.g;
      nodeCol[trace.fromIdx * 3 + 2] = col.b;
    }
    (nodeGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // attack arcs
    const packets: Array<{ mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; trace: Trace }> = [];
    for (const trace of traces) {
      if (!trace.hasArc) continue;
      const mid = trace.from.clone().add(trace.to).multiplyScalar(0.5).normalize();
      const lift = 1.3 + trace.phase * 0.35;
      mid.multiplyScalar(lift);
      const curve = new THREE.QuadraticBezierCurve3(
        trace.from.clone().multiplyScalar(1.005),
        mid,
        trace.to.clone().multiplyScalar(1.005),
      );
      const arcGeo = new THREE.TubeGeometry(curve, 28, 0.0062, 5, false);
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

      const packetGeo = new THREE.SphereGeometry(0.016, 10, 10);
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
    }

    // expanding pulse rings at origin nodes
    const rings: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; trace: Trace }> = [];
    for (const trace of traces) {
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
      ring.position.copy(trace.from).multiplyScalar(1.004);
      ring.lookAt(trace.from.clone().multiplyScalar(2));
      traceGroup.add(ring);
      disposables.push(ringGeo, ringMat);
      rings.push({ mesh: ring, mat: ringMat, trace });
    }

    /* ── atmosphere halo ───────────────────────────────────────────── */
    const haloGeo = new THREE.SphereGeometry(1.16, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.045,
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
        globe.rotation.y += 0.0022 + drag.velY;
        globe.rotation.x = THREE.MathUtils.clamp(globe.rotation.x + drag.velX, -0.65, 0.65);
        drag.velX *= 0.94;
        drag.velY *= 0.94;
      }

      for (const ring of rings) {
        const p = (t * 0.42 + ring.trace.phase) % 1;
        const s = 1 + p * 3.4;
        ring.mesh.scale.setScalar(s);
        ring.mat.opacity = (1 - p) * 0.85;
      }

      for (const packet of packets) {
        const p = (t * packet.trace.speed + packet.trace.phase) % 1;
        packet.mesh.position.copy(packet.curve.getPoint(p));
        const fade = Math.sin(Math.PI * THREE.MathUtils.clamp((p - 0.04) / 0.92, 0, 1));
        (packet.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * Math.max(0, fade);
      }

      wire.material.opacity = 0.3 + 0.06 * Math.sin(t * 0.9);

      renderer.render(scene, camera);
    };

    if (reduced) {
      renderer.render(scene, camera); // static but complete composition
    } else {
      raf = requestAnimationFrame(tick);
      return () => {
        intersection.disconnect();
        host.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        cancelAnimationFrame(raf);
        observer.disconnect();
        for (const d of disposables) d.dispose();
        nodeGeo.dispose();
        (nodePoints.material as THREE.Material).dispose();
        core.geometry.dispose();
        (core.material as THREE.Material).dispose();
        wire.geometry.dispose();
        (wire.material as THREE.Material).dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    return () => {
      intersection.disconnect();
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(raf);
      observer.disconnect();
      for (const d of disposables) d.dispose();
      nodeGeo.dispose();
      (nodePoints.material as THREE.Material).dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      wire.geometry.dispose();
      (wire.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
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
          WEBGL UNAVAILABLE — STATIC SENSOR FALLBACK
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "signal-sweep overflow-hidden rounded-2xl border border-cyber-border bg-cyber-panel/85 p-4 shadow-lg backdrop-blur-md",
        className,
      )}
      aria-label="Live threat sphere"
    >
      <GlobeHeader stats={stats} total={live.length} />
      <div
        ref={hostRef}
        className="relative mt-2 aspect-square w-full touch-none select-none"
        role="img"
        aria-label="Rotating threat sphere with live attack traces"
      />
      <p className="digital mt-2 flex items-center justify-center gap-1.5 text-[8px] tracking-widest text-slate-600">
        <Hand className="h-2.5 w-2.5" />
        DRAG TO ROTATE · TRACES = LIVE ARTICLES ≤48H · HASHED TO SENSOR GRID
      </p>
    </section>
  );
}

function GlobeHeader({ stats, total }: { stats: Record<string, number>; total: number }) {
  return (
    <header className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
        <Globe2 className="h-3.5 w-3.5 text-cyber-teal" />
        Live Threat Sphere
        <span className="cyber-ping relative ml-0.5 inline-flex h-1.5 w-1.5 text-cyber-teal">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyber-teal" />
        </span>
      </h2>
      <span className="flex items-center gap-1">
        <Fingerprint className="h-3 w-3 text-slate-500" />
        <span className="digital text-[9px] font-bold tracking-widest text-slate-400">
          {total} TRACES
        </span>
      </span>
      <span className="sr-only">
        {Object.entries(stats)
          .filter(([, count]) => count > 0)
          .map(([label, count]) => `${count} ${label}`)
          .join(", ")}
      </span>
    </header>
  );
}
