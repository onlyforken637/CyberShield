"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gsap, prefersReducedMotion } from "@/lib/cyber/gsap";

/**
 * BootScene — the Three.js centerpiece of the boot sequence (v3 style).
 *
 * A vortex of ~900 GPU-animated particles starts scattered in a wide chaotic
 * disc and converges into a tight glowing ring around the shield glyph as the
 * boot counter climbs (progress is read from a shared ref every frame — zero
 * React re-renders). A faint double wireframe icosahedron rotates behind the
 * shield; spin accelerates with progress and, at 100%, GSAP fires a flash +
 * scale punch the instant the voice engages.
 *
 * All motion happens in the vertex shader; the CPU only touches uniforms.
 * Pauses offscreen / on hidden tabs, renders a static frame under reduced
 * motion, silently renders nothing without WebGL, and fully disposes.
 */

export function BootScene({
  progress,
  className,
}: {
  /** shared mutable boot progress 0–100 (owned by the boot timeline) */
  progress: { v: number };
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || prefersReducedMotion()) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // no WebGL — the SVG shield stays the centerpiece
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    camera.position.set(0, 0, 5.4);

    const uniforms = {
      uProgress: { value: 0 },
      uFlash: { value: 0 },
      uSize: { value: 34 * dpr },
    };

    /* particle vortex — scattered disc → tight convergence ring */
    const COUNT = 900;
    const scatter = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spreadR = 2.2 + Math.random() * 2.4;
      const ringR = 1.35 + Math.random() * 0.55;
      scatter[i * 3] = Math.cos(angle) * spreadR;
      scatter[i * 3 + 1] = (Math.random() - 0.5) * 3.4 * (0.4 + Math.random() * 0.6);
      scatter[i * 3 + 2] = Math.sin(angle) * spreadR * 0.7;
      target[i * 3] = Math.cos(angle) * ringR;
      target[i * 3 + 1] = (Math.random() - 0.5) * 0.9;
      target[i * 3 + 2] = Math.sin(angle) * ringR * 0.7;
      seeds[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(scatter, 3));
    geo.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aTarget;
        attribute float aSeed;
        uniform float uProgress;
        uniform float uSize;
        uniform float uFlash;
        varying float vGlow;
        void main() {
          // staggered convergence — particles arrive in seed order
          float edge = smoothstep(aSeed * 0.55, 1.0, uProgress);
          vec3 pos = mix(position, aTarget, edge);
          // orbital swirl while scattered, settling as it converges
          float swirl = (1.0 - edge) * (1.5 + aSeed);
          float c = cos(swirl * 0.7);
          float s = sin(swirl * 0.7);
          pos.xz = mat2(c, -s, s, c) * pos.xz;
          vGlow = mix(0.35, 1.0, edge) + uFlash * (0.6 + aSeed * 0.4);
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = uSize * (0.5 + aSeed * 0.8) * (1.0 + uFlash * 0.5) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float alpha = smoothstep(0.5, 0.05, d) * 0.85 * vGlow;
          vec3 teal = vec3(0.0, 0.898, 1.0);
          vec3 amber = vec3(1.0, 0.702, 0.0);
          vec3 col = mix(teal, amber, clamp(vGlow - 0.6, 0.0, 1.0));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const points = new THREE.Points(geo, mat);

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.62, 1)),
      new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3 }),
    );
    const core = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.08, 0)),
      new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.14 }),
    );

    const group = new THREE.Group();
    group.add(points, wire, core);
    scene.add(group);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    io.observe(host);

    let punched = false;
    let last = performance.now();

    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;

      const p = Math.min(1, Math.max(0, progress.v / 100));
      uniforms.uProgress.value = p;

      group.rotation.y += dt * (0.22 + p * 0.9);
      group.rotation.x = -0.16 + Math.sin(now * 0.0004) * 0.05;
      core.rotation.y -= dt * 0.5;
      core.rotation.z += dt * 0.3;

      if (p >= 1 && !punched) {
        punched = true;
        gsap.to(uniforms.uFlash, { value: 1, duration: 0.22, ease: "power2.out" });
        gsap.to(uniforms.uFlash, { value: 0.25, duration: 0.9, ease: "power2.inOut", delay: 0.22 });
        gsap.fromTo(
          group.scale,
          { x: 1, y: 1, z: 1 },
          { x: 1.07, y: 1.07, z: 1.07, duration: 0.5, ease: "expo.out", yoyo: true, repeat: 1 },
        );
      }

      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      gsap.killTweensOf([uniforms.uFlash, group.scale]);
      geo.dispose();
      mat.dispose();
      wire.geometry.dispose();
      (wire.material as THREE.Material).dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [progress]);

  return <div ref={hostRef} aria-hidden="true" className={className} />;
}
