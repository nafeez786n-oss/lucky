"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Stars,
  Float,
  Billboard,
  Text,
  Icosahedron,
  Octahedron,
  Tetrahedron,
  Dodecahedron,
  Torus,
  Cone,
  Cylinder,
  Box,
  Sphere,
  Plane,
  Line,
  Grid,
} from "@react-three/drei";
import type { Mesh, Group } from "three";
import * as THREE from "three";

// ============================================================================
// LeakGuard 3D Scene — v5 "Constellation"
//
// Centerpiece: nested wireframe polyhedra (icosahedron + octahedron + core)
// 8 detailed 3D models orbit on tilted rings, each representing one leak category:
//   - Key (API keys)
//   - Lock (Secrets)
//   - Fingerprint (AI fingerprints)
//   - Document (Exposed files)
//   - Pyramid (Source maps)
//   - Avatar (PII)
//   - Bug (Debug endpoints)
//   - Gear (Misconfig)
// Extras: grid floor, multi-direction scan rays, floating background shapes
// ============================================================================

const ORBIT_CATS = [
  { id: "key",   label: "API KEYS",     color: "#3b82f6" },  // primary blue
  { id: "lock",  label: "SECRETS",      color: "#1e40af" },  // deep navy
  { id: "fp",    label: "AI FINGERPRINT", color: "#93c5fd" }, // light blue
  { id: "doc",   label: "EXPOSED FILES", color: "#ffffff" }, // pure white
  { id: "pyr",   label: "SOURCE MAPS",  color: "#06b6d4" }, // cyan
  { id: "ava",   label: "PII",          color: "#67e8f9" }, // light cyan
  { id: "bug",   label: "DEBUG ROUTES", color: "#38bdf8" }, // sky blue
  { id: "gear",  label: "MISCONFIG",    color: "#60a5fa" }, // blue-400
];

// ============================================================================
// Centerpiece: nested wireframe polyhedra + glowing core
// ============================================================================
function Centerpiece() {
  const outer = useRef<Group>(null);
  const mid = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const tetraGroup = useRef<Group>(null);

  useFrame((_, delta) => {
    if (outer.current) {
      outer.current.rotation.y += delta * 0.22;
      outer.current.rotation.x += delta * 0.05;
    }
    if (mid.current) {
      mid.current.rotation.y -= delta * 0.35;
      mid.current.rotation.z += delta * 0.15;
    }
    if (tetraGroup.current) {
      tetraGroup.current.rotation.y += delta * 0.5;
    }
    if (core.current) {
      const t = performance.now() * 0.001;
      const s = 1 + Math.sin(t * 2) * 0.06;
      core.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      {/* Outer icosahedron wireframe */}
      <group ref={outer}>
        <Icosahedron args={[1.55, 1]}>
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.42} />
        </Icosahedron>
        {/* Outer halo */}
        <Sphere args={[1.78, 32, 32]}>
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.035} side={THREE.BackSide} />
        </Sphere>
      </group>

      {/* Mid octahedron wireframe (counter-rotating) */}
      <group ref={mid}>
        <Octahedron args={[1.0, 0]}>
          <meshBasicMaterial color="#60a5fa" wireframe transparent opacity={0.55} />
        </Octahedron>
      </group>

      {/* 4 small tetrahedrons at cardinal points (spinning) */}
      <group ref={tetraGroup}>
        {[
          [1.1, 0, 0],
          [-1.1, 0, 0],
          [0, 1.1, 0],
          [0, -1.1, 0],
        ].map((p, i) => (
          <Tetrahedron key={i} args={[0.18, 0]} position={p as [number, number, number]}>
            <meshStandardMaterial
              color="#3b82f6"
              emissive="#3b82f6"
              emissiveIntensity={0.8}
              wireframe
            />
          </Tetrahedron>
        ))}
      </group>

      {/* Glowing core sphere */}
      <Sphere ref={core} args={[0.42, 32, 32]}>
        <meshStandardMaterial
          color="#0f172a"
          emissive="#3b82f6"
          emissiveIntensity={2.2}
          roughness={0.25}
          metalness={0.7}
        />
      </Sphere>

      {/* Core halo */}
      <Sphere args={[0.62, 32, 32]}>
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.12} />
      </Sphere>
    </group>
  );
}

// ============================================================================
// 3D Models — one per leak category
// ============================================================================

// Key (API Keys)
function KeyModel({ color }: { color: string }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Bow (handle ring) */}
      <Torus args={[0.13, 0.025, 12, 24]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
      </Torus>
      {/* Shaft */}
      <Cylinder args={[0.025, 0.025, 0.3, 16]} position={[0, -0.25, 0]} rotation={[0, 0, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
      </Cylinder>
      {/* Teeth */}
      <Box args={[0.04, 0.04, 0.04]} position={[0.06, -0.38, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
      </Box>
      <Box args={[0.04, 0.04, 0.04]} position={[-0.06, -0.34, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
      </Box>
    </group>
  );
}

// Lock (Secrets)
function LockModel({ color }: { color: string }) {
  return (
    <group>
      {/* Shackle */}
      <Torus args={[0.08, 0.018, 12, 24, Math.PI]} position={[0, 0.12, 0]} rotation={[0, 0, Math.PI]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.5} roughness={0.4} />
      </Torus>
      {/* Body */}
      <Box args={[0.22, 0.2, 0.12]} position={[0, -0.05, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.5} roughness={0.4} />
      </Box>
      {/* Keyhole */}
      <Cylinder args={[0.018, 0.018, 0.02, 12]} position={[0, -0.05, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#020617" />
      </Cylinder>
      <Box args={[0.015, 0.04, 0.02]} position={[0, -0.075, 0.07]}>
        <meshStandardMaterial color="#020617" />
      </Box>
    </group>
  );
}

// Fingerprint (AI Fingerprints)
function FingerprintModel({ color }: { color: string }) {
  return (
    <group>
      {[0.18, 0.13, 0.08, 0.03].map((r, i) => (
        <Torus
          key={i}
          args={[r, 0.012, 8, 32]}
          position={[0, 0, i * 0.008 - 0.012]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.6 - i * 0.08}
            metalness={0.4}
            roughness={0.5}
          />
        </Torus>
      ))}
    </group>
  );
}

// Document (Exposed Files)
function DocumentModel({ color }: { color: string }) {
  return (
    <group>
      {/* Paper body */}
      <Box args={[0.22, 0.28, 0.015]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.2} roughness={0.7} />
      </Box>
      {/* Folded corner */}
      <mesh position={[0.075, 0.12, 0.012]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.06, 0.06]} />
        <meshStandardMaterial color="#020617" />
      </mesh>
      {/* Text lines */}
      {[-0.04, 0, 0.04, 0.08].map((y, i) => (
        <Box key={i} args={[0.14, 0.012, 0.005]} position={[0, y, 0.012]}>
          <meshStandardMaterial color="#020617" />
        </Box>
      ))}
    </group>
  );
}

// Pyramid (Source Maps)
function PyramidModel({ color }: { color: string }) {
  return (
    <group rotation={[0, 0, 0]}>
      <Cone args={[0.18, 0.3, 4, 1]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.4} roughness={0.4} flatShading />
      </Cone>
      <mesh>
        <coneGeometry args={[0.18, 0.3, 4, 1]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// Avatar (PII)
function AvatarModel({ color }: { color: string }) {
  return (
    <group>
      {/* Head */}
      <Sphere args={[0.075, 24, 24]} position={[0, 0.1, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.4} roughness={0.4} />
      </Sphere>
      {/* Shoulders / body */}
      <Cylinder args={[0.04, 0.13, 0.16, 16]} position={[0, -0.04, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.4} roughness={0.4} />
      </Cylinder>
    </group>
  );
}

// Bug (Debug Endpoints)
function BugModel({ color }: { color: string }) {
  return (
    <group>
      {/* Body (two spheres) */}
      <Sphere args={[0.1, 16, 16]} position={[0, 0, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.3} roughness={0.5} />
      </Sphere>
      <Sphere args={[0.06, 16, 16]} position={[0, 0.12, 0]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.3} roughness={0.5} />
      </Sphere>
      {/* Legs (3 per side) */}
      {[-1, 0, 1].flatMap((s) =>
        [-0.08, 0, 0.08].map((y, i) => (
          <Cylinder
            key={`${s}-${i}`}
            args={[0.005, 0.005, 0.12, 6]}
            position={[s * 0.06, y, 0]}
            rotation={[0, 0, s * Math.PI / 4 + (i - 1) * 0.2]}
          >
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
          </Cylinder>
        ))
      )}
      {/* Antennae */}
      {[1, -1].map((s) => (
        <Cylinder
          key={`ant-${s}`}
          args={[0.003, 0.003, 0.08, 6]}
          position={[s * 0.04, 0.18, 0]}
          rotation={[0, 0, s * Math.PI / 6]}
        >
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </Cylinder>
      ))}
    </group>
  );
}

// Gear (Misconfig)
function GearModel({ color }: { color: string }) {
  const teeth = 8;
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Ring */}
      <Torus args={[0.13, 0.025, 12, 32]}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.5} roughness={0.4} />
      </Torus>
      {/* Teeth */}
      {Array.from({ length: teeth }).map((_, i) => {
        const angle = (i / teeth) * Math.PI * 2;
        return (
          <Box
            key={i}
            args={[0.03, 0.06, 0.025]}
            position={[Math.cos(angle) * 0.15, Math.sin(angle) * 0.15, 0]}
            rotation={[0, 0, angle + Math.PI / 2]}
          >
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.5} roughness={0.4} />
          </Box>
        );
      })}
      {/* Hub */}
      <Cylinder args={[0.035, 0.035, 0.04, 16]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#020617" />
      </Cylinder>
    </group>
  );
}

function renderModel(id: string, color: string) {
  switch (id) {
    case "key":  return <KeyModel color={color} />;
    case "lock": return <LockModel color={color} />;
    case "fp":   return <FingerprintModel color={color} />;
    case "doc":  return <DocumentModel color={color} />;
    case "pyr":  return <PyramidModel color={color} />;
    case "ava":  return <AvatarModel color={color} />;
    case "bug":  return <BugModel color={color} />;
    case "gear": return <GearModel color={color} />;
    default: return null;
  }
}

// ============================================================================
// Orbits — each model sits on its own tilted ring at a unique radius/speed
// ============================================================================
function OrbitingModels() {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      // slow counter-rotation of the whole ring system
      groupRef.current.rotation.y -= delta * 0.08;
    }
  });

  // Each orbit: angle, radius, tilt, speed, phase
  const orbits = useMemo(
    () =>
      ORBIT_CATS.map((cat, i) => ({
        ...cat,
        radius: 2.4 + (i % 3) * 0.25,
        tilt: (i * 0.4) % (Math.PI / 2),
        speed: 0.2 + (i % 4) * 0.08,
        phase: (i / ORBIT_CATS.length) * Math.PI * 2,
      })),
    []
  );

  return (
    <group ref={groupRef}>
      {orbits.map((o) => (
        <OrbitRing key={o.id} orbit={o} />
      ))}
    </group>
  );
}

function OrbitRing({
  orbit,
}: {
  orbit: {
    id: string;
    label: string;
    color: string;
    radius: number;
    tilt: number;
    speed: number;
    phase: number;
  };
}) {
  const ringRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * orbit.speed;
    }
  });

  const angle = orbit.phase;
  const x = Math.cos(angle) * orbit.radius;
  const z = Math.sin(angle) * orbit.radius;

  return (
    <group rotation={[orbit.tilt, 0, orbit.tilt * 0.5]}>
      {/* Visual orbit ring (faint) */}
      <Torus args={[orbit.radius, 0.005, 8, 80]}>
        <meshBasicMaterial color={orbit.color} transparent opacity={0.18} />
      </Torus>
      {/* Rotating carrier for the model */}
      <group ref={ringRef}>
        <group position={[x, 0, z]}>
          <Float speed={2} rotationIntensity={0.6} floatIntensity={0.5}>
            {/* Glow halo behind the model */}
            <mesh scale={2.6}>
              <sphereGeometry args={[0.13, 12, 12]} />
              <meshBasicMaterial color={orbit.color} transparent opacity={0.12} />
            </mesh>
            {/* The actual 3D model */}
            {renderModel(orbit.id, orbit.color)}
            {/* Label below */}
            <Billboard position={[0, -0.35, 0]}>
              <Text
                fontSize={0.085}
                color={orbit.color}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.005}
                outlineColor="#020617"
                outlineOpacity={0.9}
              >
                {orbit.label}
              </Text>
            </Billboard>
          </Float>
        </group>
      </group>
    </group>
  );
}

// ============================================================================
// Connection beams — animated lines from center to each orbiting model
// ============================================================================
function ConnectionBeams() {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.08;
    }
  });

  const lines = useMemo(() => {
    return ORBIT_CATS.map((cat, i) => {
      const radius = 2.4 + (i % 3) * 0.25;
      const tilt = (i * 0.4) % (Math.PI / 2);
      const phase = (i / ORBIT_CATS.length) * Math.PI * 2;
      const x = Math.cos(phase) * radius;
      const z = Math.sin(phase) * radius;
      // approximate the tilt-rotated endpoint
      const y = z * Math.sin(tilt);
      const z2 = z * Math.cos(tilt);
      return {
        color: cat.color,
        points: [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(x, y, z2),
        ],
      };
    });
  }, []);

  return (
    <group ref={groupRef}>
      {lines.map((l, i) => (
        <Line key={i} points={l.points} color={l.color} lineWidth={1} transparent opacity={0.4} />
      ))}
    </group>
  );
}

// ============================================================================
// Multi-direction scan rays — emanate from the core outward in 6 directions
// ============================================================================
function ScanRays() {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.45;
      groupRef.current.rotation.x = Math.sin(performance.now() * 0.0008) * 0.2;
    }
  });

  // Each ray: position offset + rotation to align cylinder Y-axis with direction
  // Default cylinder is along Y; we rotate to point outward in each of 6 directions
  const rays: {
    pos: [number, number, number];
    rot: [number, number, number];
  }[] = [
    { pos: [0.9, 0, 0], rot: [0, 0, -Math.PI / 2] },   // +X
    { pos: [-0.9, 0, 0], rot: [0, 0, Math.PI / 2] },  // -X
    { pos: [0, 0.9, 0], rot: [0, 0, 0] },              // +Y
    { pos: [0, -0.9, 0], rot: [0, 0, Math.PI] },       // -Y
    { pos: [0, 0, 0.9], rot: [Math.PI / 2, 0, 0] },    // +Z
    { pos: [0, 0, -0.9], rot: [-Math.PI / 2, 0, 0] },  // -Z
  ];

  return (
    <group ref={groupRef}>
      {rays.map((r, i) => (
        <mesh key={i} position={r.pos} rotation={r.rot}>
          <cylinderGeometry args={[0.012, 0.001, 1.8, 8, 1, true]} />
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.32}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================================
// Grid floor
// ============================================================================
function GridFloor() {
  return (
    <group position={[0, -3.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1e3a8a"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#3b82f6"
        fadeDistance={18}
        fadeStrength={1.5}
        infiniteGrid
      />
    </group>
  );
}

// ============================================================================
// Floating background shapes
// ============================================================================
function FloatingShapes() {
  const shapes = useMemo(() => {
    const types = ["tetra", "octa", "dodeca", "ico", "cube"] as const;
    return Array.from({ length: 12 }).map((_, i) => ({
      type: types[i % types.length],
      pos: [
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 14 - 4,
      ] as [number, number, number],
      scale: 0.05 + Math.random() * 0.12,
      speed: 0.5 + Math.random() * 1,
      rotSpeed: 0.2 + Math.random() * 0.5,
    }));
  }, []);

  return (
    <>
      {shapes.map((s, i) => (
        <FloatingShape key={i} shape={s} />
      ))}
    </>
  );
}

function FloatingShape({
  shape,
}: {
  shape: {
    type: "tetra" | "octa" | "dodeca" | "ico" | "cube";
    pos: [number, number, number];
    scale: number;
    speed: number;
    rotSpeed: number;
  };
}) {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * shape.rotSpeed;
    ref.current.rotation.y += delta * shape.rotSpeed * 1.3;
    ref.current.position.y += Math.sin(performance.now() * 0.001 * shape.speed) * 0.0008;
  });

  const common = (
    <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.28} />
  );

  return (
    <mesh ref={ref} position={shape.pos} scale={shape.scale}>
      {shape.type === "tetra" && <tetrahedronGeometry args={[1, 0]} />}
      {shape.type === "octa" && <octahedronGeometry args={[1, 0]} />}
      {shape.type === "dodeca" && <dodecahedronGeometry args={[1, 0]} />}
      {shape.type === "ico" && <icosahedronGeometry args={[1, 0]} />}
      {shape.type === "cube" && <boxGeometry args={[1, 1, 1]} />}
      {common}
    </mesh>
  );
}

// ============================================================================
// Suspense fallback
// ============================================================================
function SceneFallback() {
  return null;
}

// ============================================================================
// Main exported scene
// ============================================================================
export function LeakGuardScene() {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 6.2], fov: 48 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={<SceneFallback />}>
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <pointLight position={[5, 5, 5]} intensity={1.8} color="#3b82f6" />
        <pointLight position={[-5, -2, 4]} intensity={1} color="#93c5fd" />
        <pointLight position={[0, 6, -4]} intensity={0.6} color="#60a5fa" />
        <directionalLight position={[2, 4, 3]} intensity={0.7} color="#3b82f6" />

        {/* Centerpiece + scan rays */}
        <Centerpiece />
        <ScanRays />

        {/* Connection beams + orbiting models */}
        <ConnectionBeams />
        <OrbitingModels />

        {/* Grid floor */}
        <GridFloor />

        {/* Floating shapes in background */}
        <FloatingShapes />

        {/* Stars */}
        <Stars radius={60} depth={40} count={1500} factor={3} saturation={0} fade speed={0.4} />

        {/* Camera */}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.3}
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
