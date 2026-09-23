"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Float, Icosahedron, Torus, Sphere, Cone, Line, Billboard, Text } from "@react-three/drei";
import type { Mesh, Group } from "three";
import * as THREE from "three";

// ---------- Leak categories orbiting the target ----------
const ORBIT_CATS: {
  label: string;
  color: string;
  icon: string;
}[] = [
  { label: "API Keys", color: "#ef4444", icon: "🔑" },
  { label: "Secrets", color: "#f97316", icon: "🔐" },
  { label: "AI Fingerprints", color: "#10b981", icon: "🤖" },
  { label: "Exposed Files", color: "#f59e0b", icon: "📂" },
  { label: "Source Maps", color: "#06b6d4", icon: "🗺️" },
  { label: "PII", color: "#a78bfa", icon: "👤" },
  { label: "Debug Routes", color: "#fbbf24", icon: "🐛" },
  { label: "Misconfig", color: "#34d399", icon: "⚙️" },
];

// ---------- Target wireframe (the "website" being scanned) ----------
function TargetGlobe() {
  const groupRef = useRef<Group>(null);
  const innerRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.18;
      groupRef.current.rotation.x += delta * 0.04;
    }
    if (innerRef.current) {
      const t = performance.now() * 0.001;
      const s = 1 + Math.sin(t * 1.8) * 0.04;
      innerRef.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Wireframe outer shell — the website surface */}
      <Icosahedron args={[1.5, 1]}>
        <meshBasicMaterial color="#10b981" wireframe transparent opacity={0.45} />
      </Icosahedron>

      {/* Solid inner core — the leak surface itself, glowing */}
      <Sphere ref={innerRef} args={[0.55, 32, 32]}>
        <meshStandardMaterial
          color="#0f172a"
          emissive="#10b981"
          emissiveIntensity={1.6}
          roughness={0.3}
          metalness={0.6}
        />
      </Sphere>

      {/* Outer halo */}
      <Sphere args={[1.7, 32, 32]}>
        <meshBasicMaterial color="#10b981" transparent opacity={0.04} side={THREE.BackSide} />
      </Sphere>
    </group>
  );
}

// ---------- Rotating radar sweep cone ----------
function RadarSweep() {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 1.2;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0, 0]} rotation={[0, 0, 0]}>
      <Cone args={[1.7, 0.02, 64, 1, true, 0, Math.PI / 3]}>
        <meshBasicMaterial
          color="#10b981"
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </Cone>
    </mesh>
  );
}

// ---------- Orbit ring (visual reference) ----------
function OrbitRing() {
  return (
    <Torus args={[2.6, 0.012, 16, 100]} rotation={[Math.PI / 2.4, 0, 0]}>
      <meshBasicMaterial color="#10b981" transparent opacity={0.25} />
    </Torus>
  );
}

// ---------- Orbiting leak category badges ----------
function OrbitBadges() {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      // counter-rotate the badge ring so labels stay upright
      groupRef.current.rotation.y -= delta * 0.22;
    }
  });

  const items = useMemo(
    () =>
      ORBIT_CATS.map((cat, i) => {
        const angle = (i / ORBIT_CATS.length) * Math.PI * 2;
        const radius = 2.6;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = Math.sin(angle * 2) * 0.4;
        return { ...cat, x, y, z, angle };
      }),
    []
  );

  return (
    <group ref={groupRef} rotation={[Math.PI / 2.4, 0, 0]}>
      {items.map((it, i) => (
        <group key={it.label} position={[it.x, it.y, it.z]}>
          {/* Glowing orb */}
          <Float speed={2} rotationIntensity={0.5} floatIntensity={0.6}>
            <mesh>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshStandardMaterial
                color={it.color}
                emissive={it.color}
                emissiveIntensity={1.4}
                roughness={0.4}
              />
            </mesh>
            {/* Glow halo */}
            <mesh scale={2.2}>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshBasicMaterial color={it.color} transparent opacity={0.12} />
            </mesh>
            {/* 3D label (always faces camera via Billboard + Text) */}
            <Billboard position={[0, 0.32, 0]}>
              <Text
                fontSize={0.16}
                color={it.color}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.008}
                outlineColor="#020617"
                outlineOpacity={0.85}
              >
                {it.label.toUpperCase()}
              </Text>
            </Billboard>
          </Float>
        </group>
      ))}
    </group>
  );
}

// ---------- Connection beams from center to each badge ----------
function ConnectionLines() {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y -= delta * 0.22;
  });

  const points = useMemo(
    () =>
      ORBIT_CATS.map((_, i) => {
        const angle = (i / ORBIT_CATS.length) * Math.PI * 2;
        const radius = 2.6;
        const y = Math.sin(angle * 2) * 0.4;
        // rotated ring tilted by Math.PI/2.4 — approximate endpoint
        const ringTilt = Math.PI / 2.4;
        const x = Math.cos(angle) * radius;
        const z0 = Math.sin(angle) * radius;
        const y2 = y * Math.cos(ringTilt) - z0 * Math.sin(ringTilt);
        const z2 = y * Math.sin(ringTilt) + z0 * Math.cos(ringTilt);
        return [new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y2, z2)];
      }),
    []
  );

  return (
    <group ref={ref} rotation={[Math.PI / 2.4, 0, 0]}>
      {points.map((pts, i) => (
        <Line key={i} points={pts} color={ORBIT_CATS[i].color} lineWidth={1} transparent opacity={0.35} />
      ))}
    </group>
  );
}

// ---------- Suspense fallback (while textures load) ----------
// NOTE: Do not use drei <Html> here — it conflicts with React 19's root
// lifecycle and throws "Attempted to synchronously unmount a root".
function SceneFallback() {
  return null;
}

// ---------- Main exported scene ----------
export function LeakGuardScene() {
  return (
    <Canvas
      camera={{ position: [0, 2.5, 6], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={<SceneFallback />}>
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={2} color="#10b981" />
        <pointLight position={[-5, -3, 4]} intensity={1} color="#f59e0b" />
        <pointLight position={[0, 6, -4]} intensity={0.6} color="#34d399" />

        {/* Target + radar */}
        <TargetGlobe />
        <RadarSweep />

        {/* Orbit system */}
        <OrbitRing />
        <ConnectionLines />
        <OrbitBadges />

        {/* Stars background */}
        <Stars radius={50} depth={30} count={1200} factor={2.5} saturation={0} fade speed={0.5} />

        {/* Controls: limited, gentle */}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.4}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.6}
          enableDamping
          dampingFactor={0.08}
          makeDefault
        />
      </Suspense>
    </Canvas>
  );
}
