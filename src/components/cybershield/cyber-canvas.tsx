"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/cyber/gsap";

/**
 * CyberCanvas — the exhibition-grade WebGL backdrop.
 *
 * A GPU-animated "digital ocean" of ~9k shader-displaced points (teal →
 * fuchsia by wave height) plus a slow drift of data motes, rendered behind
 * the whole dashboard. Mouse moves parallax the camera; the render loop
 * pauses when the tab is hidden, the DPR is capped, reduced-motion users
 * get a single static frame, and unsupported WebGL simply renders nothing.
 */

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  attribute float aPhase;
  varying float vGlow;
  varying float vHeight;

  void main() {
    vec3 p = position;
    float wave = sin(p.x * 0.42 + uTime * 0.65) * cos(p.y * 0.34 + uTime * 0.45);
    p.z += wave * 0.55;
    p.z += sin(p.x * 0.10 + uTime * 0.16) * 0.5;
    p.z += sin((p.x + p.y) * 0.08 + uTime * 0.23) * 0.25;
    vHeight = p.z;
    vGlow = 0.5 + 0.5 * sin(uTime * 1.35 + aPhase * 6.2831);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (0.9 + vGlow * 0.9 + uPulse * 0.5) * (120.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vGlow;
  varying float vHeight;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uColorA, uColorB, smoothstep(-0.9, 1.3, vHeight));
    float tw = 0.5 + 0.5 * vGlow;
    gl_FragColor = vec4(col, uOpacity * soft * tw);
  }
`;

interface Mote {
  x: number;
  y: number;
  z: number;
  speed: number;
}

export function CyberCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // WebGL unavailable — the CSS grid backdrop is the fallback
    }

    const reduced = prefersReducedMotion();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 4.6, 13.5);
    camera.lookAt(0, 0.4, 0);

    renderer.setClearColor(0x000000, 0);
    // perf: low DPR + half-resolution rendering — this layer is soft glow,
    // stretching it is invisible and cuts fill cost massively
    renderer.setPixelRatio(1);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    /* ── digital ocean (shader-displaced points, zero CPU per frame) ── */
    const COLS = 130;
    const ROWS = 72;
    const SPREAD_X = 52;
    const SPREAD_Z = 30;
    const count = COLS * ROWS;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    let i = 0;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        positions[i * 3] = (col / (COLS - 1) - 0.5) * SPREAD_X;
        positions[i * 3 + 1] = -2.4;
        positions[i * 3 + 2] = (row / (ROWS - 1) - 0.5) * SPREAD_Z;
        phases[i] = Math.random();
        i++;
      }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    gridGeo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

    const gridUniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uOpacity: { value: 0.16 },
      uColorA: { value: new THREE.Color("#00e5ff") },
      uColorB: { value: new THREE.Color("#e879f9") },
    };
    const gridMat = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: gridUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ocean = new THREE.Points(gridGeo, gridMat);
    scene.add(ocean);

    /* ── data motes drifting upward ────────────────────────────────── */
    const MOTES = 240;
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(MOTES * 3);
    const motes: Mote[] = [];
    for (let m = 0; m < MOTES; m++) {
      motes.push({
        x: (Math.random() - 0.5) * 44,
        y: Math.random() * 10 - 1,
        z: (Math.random() - 0.5) * 22,
        speed: 0.12 + Math.random() * 0.5,
      });
      motePos[m * 3] = motes[m].x;
      motePos[m * 3 + 1] = motes[m].y;
      motePos[m * 3 + 2] = motes[m].z;
    }
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
    // round, soft circular sprite for the motes (default points are squares)
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = 32;
    spriteCanvas.height = 32;
    const spriteCtx = spriteCanvas.getContext("2d");
    if (spriteCtx) {
      const grad = spriteCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      spriteCtx.fillStyle = grad;
      spriteCtx.fillRect(0, 0, 32, 32);
    }
    const spriteTex = new THREE.CanvasTexture(spriteCanvas);
    const moteMat = new THREE.PointsMaterial({
      color: 0x9fd8e8,
      size: 0.09,
      map: spriteTex,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const moteCloud = new THREE.Points(moteGeo, moteMat);
    scene.add(moteCloud);

    /* ── pointer parallax ──────────────────────────────────────────── */
    const pointer = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      const scale = w > 900 ? 0.55 : 0.75; // backdrop is soft — render small, stretch big
      renderer.setSize(Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)), false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const FRAME_BUDGET_MS = 1000 / 30; // backdrop runs at 30fps — plenty for ambience
    let raf = 0;
    let running = true;
    let last = performance.now();
    let acc = 0;

    const renderFrame = (dt: number) => {
      const t = last / 1000;
      gridUniforms.uTime.value = t;
      gridUniforms.uPulse.value = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.35));

      const posAttr = moteGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let m = 0; m < MOTES; m++) {
        let y = posAttr.getY(m) + motes[m].speed * dt;
        if (y > 9) y = -1.5;
        posAttr.setY(m, y);
      }
      posAttr.needsUpdate = true;

      camera.position.x += (pointer.x * 1.15 - camera.position.x) * 0.045;
      camera.position.y += (4.6 - pointer.y * 0.85 - camera.position.y) * 0.045;
      camera.lookAt(0, 0.4, 0);

      renderer.render(scene, camera);
    };

    if (reduced) {
      renderFrame(0.016); // one static, tasteful frame
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
        gridGeo.dispose();
        gridMat.dispose();
        moteGeo.dispose();
        moteMat.dispose();
        spriteTex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    return () => {
      window.removeEventListener("pointermove", onPointer);
      observer.disconnect();
      gridGeo.dispose();
      gridMat.dispose();
      moteGeo.dispose();
      moteMat.dispose();
      spriteTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 [&>*]:h-full [&>*]:w-full"
    />
  );
}
