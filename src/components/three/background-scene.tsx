"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import type { Mesh, Group } from "three";
import * as THREE from "three";

// ============================================================================
// BackgroundScene — fixed full-viewport Three.js scene behind all content
//
// Very lightweight by design:
//   - 24 wireframe shapes drifting slowly in 3D space
//   - 600-star field at low opacity
//   - All meshBasicMaterial (no lighting cost)
//   - dpr capped [0.75, 1.25]
//   - Slow rotation increments in useFrame
// ============================================================================

function DriftingShapes() {
  const groupRef = useRef<Group>(null);

  const shapes = useMemo(() => {
    const types = ["tetra", "octa", "dodeca", "ico", "cube"] as const;
    return Array.from({ length: 24 }).map(() => {
      const t = types[Math.floor(Math.random() * types.length)];
      // Spread across a wide cube in front of camera
      return {
        type: t,
        pos: [
          (Math.random() - 0.5) * 28,
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 18 - 4,
        ] as [number, number, number],
        scale: 0.15 + Math.random() * 0.6,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        rotAxis: Math.floor(Math.random() * 3),
      };
    });
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Gentle whole-group drift — barely perceptible
    groupRef.current.rotation.y += delta * 0.015;
    groupRef.current.children.forEach((child, i) => {
      const s = shapes[i];
      if (!s) return;
      const m = child as Mesh;
      if (s.rotAxis === 0) m.rotation.x += delta * s.rotSpeed;
      else if (s.rotAxis === 1) m.rotation.y += delta * s.rotSpeed;
      else m.rotation.z += delta * s.rotSpeed;
      // Gentle vertical bob
      m.position.y += Math.sin(performance.now() * 0.0003 + i) * 0.0007;
    });
  });

  // Greys from very dark to nearly white
  const greys = ["#1a1a1a", "#2a2a2a", "#3a3a3a", "#4a4a4a", "#5a5a5a", "#6a6a6a", "#7a7a7a", "#909090"];
  const opacities = [0.18, 0.22, 0.28, 0.32, 0.4];

  return (
    <group ref={groupRef}>
      {shapes.map((s, i) => {
        const color = greys[i % greys.length];
        const opacity = opacities[i % opacities.length];
        return (
          <mesh key={i} position={s.pos} scale={s.scale}>
            {s.type === "tetra" && <tetrahedronGeometry args={[1, 0]} />}
            {s.type === "octa" && <octahedronGeometry args={[1, 0]} />}
            {s.type === "dodeca" && <dodecahedronGeometry args={[1, 0]} />}
            {s.type === "ico" && <icosahedronGeometry args={[1, 0]} />}
            {s.type === "cube" && <boxGeometry args={[1, 1, 1]} />}
            <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
}

function SceneFallback() {
  return null;
}

export function BackgroundScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 12], fov: 55 }}
      dpr={[0.75, 1.25]}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      style={{ background: "transparent" }}
      frameloop="always"
    >
      <Suspense fallback={<SceneFallback />}>
        <DriftingShapes />
        <Stars radius={80} depth={50} count={600} factor={3} saturation={0} fade speed={0.2} />
      </Suspense>
    </Canvas>
  );
}
