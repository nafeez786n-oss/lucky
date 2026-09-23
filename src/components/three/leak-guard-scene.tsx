"use client";

import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Stars,
  Float,
  Billboard,
  Text,
  RoundedBox,
  Line,
  Cylinder,
  Box,
  Plane,
  Torus,
} from "@react-three/drei";
import type { Mesh, Group, MeshStandardMaterial } from "three";
import * as THREE from "three";

// ============================================================================
// LeakGuard 3D Scene — "Scanning a website"
//
// Visual narrative:
//   1. A 3D browser window mockup floats in space (the target site)
//   2. The page shows a wireframe layout of typical website sections
//   3. A vertical emerald scan beam sweeps left-to-right across the page
//   4. Leak markers (red/amber) sit at fixed positions on the page surface
//      — when the scan beam crosses each one, it pulses brightly
//   5. Connection beams extend from each leak marker outward to floating
//      category labels ("AWS Key", ".env", "source map", etc.)
//   6. Particles drift upward from the page surface (extracted secrets)
// ============================================================================

// ---------- Page leak markers ----------
interface LeakMarker {
  id: string;
  label: string;
  color: string;
  // x,y position in page-local 2D coords (z is depth, will be set later)
  position: [number, number];
  description: string;
}

const LEAK_MARKERS: LeakMarker[] = [
  { id: "aws",   label: "AWS KEY",     color: "#ef4444", position: [-1.1,  0.6], description: "AKIA…" },
  { id: "env",   label: ".env",        color: "#f97316", position: [ 0.6,  0.7], description: "/.env 200" },
  { id: "oai",   label: "OPENAI",     color: "#ef4444", position: [ 1.1, -0.1], description: "sk-…" },
  { id: "map",   label: "SRC MAP",     color: "#06b6d4", position: [-0.9, -0.5], description: ".js.map" },
  { id: "git",   label: ".git/",       color: "#f59e0b", position: [ 0.1, -0.7], description: "/.git 200" },
  { id: "ai",    label: "v0 / LOVABLE", color: "#10b981", position: [ 1.2,  0.4], description: "meta tag" },
  { id: "jwt",   label: "JWT",         color: "#a78bfa", position: [-0.2,  0.05], description: "eyJ…" },
  { id: "log",   label: "CONSOLE.LOG", color: "#fbbf24", position: [ 0.85, -0.55], description: "12 hits" },
];

// Page size constants (used to clamp scan beam and place markers)
const PAGE_WIDTH = 2.8;
const PAGE_HEIGHT = 1.95;

// ============================================================================
// Component: BrowserWindow — the 3D target site mockup
// ============================================================================
function BrowserWindow() {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      // gentle bob, no rotation (the panel is tilted toward camera by parent)
      const t = performance.now() * 0.001;
      groupRef.current.position.y = Math.sin(t * 0.7) * 0.06;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer browser frame (dark bezel) */}
      <RoundedBox args={[3.2, 2.4, 0.08]} radius={0.06} smoothness={4}>
        <meshStandardMaterial color="#0b1220" metalness={0.4} roughness={0.6} />
      </RoundedBox>

      {/* Top chrome bar (lighter slate) */}
      <Box args={[3.2, 0.32, 0.04]} position={[0, 1.04, 0.04]}>
        <meshStandardMaterial color="#1a2334" metalness={0.5} roughness={0.4} />
      </Box>

      {/* Traffic-light dots */}
      {[
        { x: -1.45, color: "#ef4444" },
        { x: -1.32, color: "#f59e0b" },
        { x: -1.19, color: "#10b981" },
      ].map((d) => (
        <mesh key={d.x} position={[d.x, 1.04, 0.08]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={0.4} />
        </mesh>
      ))}

      {/* URL bar */}
      <RoundedBox args={[2.4, 0.18, 0.04]} radius={0.03} smoothness={3} position={[0.25, 1.04, 0.08]}>
        <meshStandardMaterial color="#0a0f1c" />
      </RoundedBox>
      <Text
        position={[0.25, 1.04, 0.12]}
        fontSize={0.075}
        color="#10b981"
        anchorX="center"
        anchorY="middle"
      >
        https://target-site.com
      </Text>

      {/* Lock icon next to URL */}
      <group position={[-1.02, 1.04, 0.12]}>
        <Torus args={[0.04, 0.012, 8, 16]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.5} />
        </Torus>
        <Box args={[0.06, 0.05, 0.02]} position={[0, -0.05, 0]}>
          <meshStandardMaterial color="#10b981" />
        </Box>
      </group>

      {/* Page content area (the actual website being scanned) */}
      {/* Page background */}
      <Plane args={[PAGE_WIDTH, PAGE_HEIGHT]} position={[0, -0.1, 0.06]}>
        <meshStandardMaterial color="#0f1729" metalness={0.2} roughness={0.8} />
      </Plane>

      {/* Wireframe website layout — typical sections */}
      <WebsiteLayout />

      {/* Scan beam (sweeps left-to-right) */}
      <ScanBeam />

      {/* Leak markers on the page */}
      {LEAK_MARKERS.map((m) => (
        <LeakMarkerMesh key={m.id} marker={m} />
      ))}

      {/* Floating particles drifting up from the page */}
      <ExtractedSecretParticles />
    </group>
  );
}

// ============================================================================
// Component: WebsiteLayout — wireframe boxes representing typical website sections
// ============================================================================
function WebsiteLayout() {
  // sections: [x, y, w, h, color]
  const sections: [number, number, number, number, string][] = [
    [-0.9, 0.7, 1.7, 0.18, "#1f2a40"], // top nav bar
    [-0.9, 0.3, 0.85, 0.4, "#27375a"], // hero left
    [0.05, 0.3, 0.85, 0.4, "#1e2a47"], // hero right
    [-0.9, -0.15, 0.55, 0.4, "#1c2740"], // sidebar
    [-0.25, -0.15, 1.15, 0.4, "#212d4a"], // content
    [-0.9, -0.65, 1.8, 0.18, "#19233a"], // footer
  ];

  return (
    <group position={[0, 0, 0.07]}>
      {sections.map((s, i) => (
        <group key={i} position={[s[0] + s[2] / 2, s[1] + s[3] / 2, 0]}>
          {/* Solid fill (very subtle) */}
          <Plane args={[s[2], s[3]]}>
            <meshBasicMaterial color={s[4]} transparent opacity={0.45} />
          </Plane>
          {/* Wireframe outline */}
          <mesh>
            <planeGeometry args={[s[2], s[3]]} />
            <meshBasicMaterial color="#10b981" wireframe transparent opacity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ============================================================================
// Component: ScanBeam — vertical emerald plane sweeping left-to-right
// ============================================================================
function ScanBeam() {
  const ref = useRef<Mesh>(null);
  const halfW = PAGE_WIDTH / 2;
  // Period: 3.2 seconds for full sweep, with a brief pause at edges
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // ping-pong: ease in/out
    const period = 3.2;
    const phase = (t % period) / period;
    // triangular wave 0→1→0
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    // smoothstep
    const smoothed = tri * tri * (3 - 2 * tri);
    const x = -halfW + smoothed * PAGE_WIDTH;
    ref.current.position.x = x;
    // Fade opacity at edges
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    const edgeFade = Math.min(smoothed, 1 - smoothed) * 4;
    mat.opacity = 0.18 + Math.min(edgeFade, 1) * 0.32;
  });

  return (
    <mesh ref={ref} position={[0, -0.1, 0.15]}>
      <planeGeometry args={[0.08, PAGE_HEIGHT + 0.05]} />
      <meshBasicMaterial
        color="#10b981"
        transparent
        opacity={0.35}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ============================================================================
// Component: LeakMarkerMesh — a leak marker on the page that pulses when beam hits
// ============================================================================
function LeakMarkerMesh({ marker }: { marker: LeakMarker }) {
  const orbRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  // beam x at any given time is approximated by repeating the same wave as ScanBeam
  // (we sync via clock.elapsedTime — both use the same clock)
  useFrame((state) => {
    if (!orbRef.current || !haloRef.current) return;
    const t = state.clock.elapsedTime;
    const period = 3.2;
    const phase = (t % period) / period;
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    const smoothed = tri * tri * (3 - 2 * tri);
    const beamX = -PAGE_WIDTH / 2 + smoothed * PAGE_WIDTH;
    const dist = Math.abs(beamX - marker.position[0]);
    // proximity: 1 when beam is on top, 0 when far away
    const proximity = Math.max(0, 1 - dist / 0.35);
    // base pulse (slow idle)
    const idle = 0.5 + 0.5 * Math.sin(t * 2.5 + marker.position[0] * 3);
    const intensity = 0.4 + idle * 0.3 + proximity * 1.4;
    const mat = orbRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = intensity;
    const haloMat = haloRef.current.material as THREE.MeshBasicMaterial;
    haloMat.opacity = 0.12 + proximity * 0.5;
    const scale = 1 + proximity * 0.8;
    haloRef.current.scale.setScalar(scale);
  });

  // label position: above and to the side, connected by a line
  const labelOffset: [number, number, number] = [
    marker.position[0] * 0.45 + (marker.position[0] > 0 ? 0.6 : -0.6),
    marker.position[1] + 0.55,
    0.4,
  ];

  return (
    <group>
      {/* Marker orb on the page surface */}
      <group position={[marker.position[0], marker.position[1], 0.12]}>
        <mesh ref={orbRef}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial
            color={marker.color}
            emissive={marker.color}
            emissiveIntensity={1}
            roughness={0.3}
          />
        </mesh>
        {/* Halo (pulses when beam crosses) */}
        <mesh ref={haloRef}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color={marker.color} transparent opacity={0.15} />
        </mesh>
      </group>

      {/* Connection line from marker to label */}
      <Line
        points={[
          new THREE.Vector3(marker.position[0], marker.position[1], 0.13),
          new THREE.Vector3(labelOffset[0], labelOffset[1], labelOffset[2]),
        ]}
        color={marker.color}
        lineWidth={1}
        transparent
        opacity={0.55}
      />

      {/* Floating category label */}
      <Float speed={2.4} rotationIntensity={0.3} floatIntensity={0.4}>
        <group position={labelOffset}>
          {/* Label backdrop (small rounded plane) */}
          <mesh>
            <planeGeometry args={[0.55, 0.18]} />
            <meshBasicMaterial
              color="#020617"
              transparent
              opacity={0.78}
            />
          </mesh>
          {/* Border via wireframe overlay */}
          <mesh position={[0, 0, 0.001]}>
            <planeGeometry args={[0.55, 0.18]} />
            <meshBasicMaterial color={marker.color} wireframe transparent opacity={0.7} />
          </mesh>
          {/* Label text */}
          <Billboard position={[0, 0, 0.01]}>
            <Text
              fontSize={0.075}
              color={marker.color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.004}
              outlineColor="#020617"
              outlineOpacity={0.9}
            >
              {marker.label}
            </Text>
          </Billboard>
        </group>
      </Float>
    </group>
  );
}

// ============================================================================
// Component: ExtractedSecretParticles — small points drifting upward from page
// ============================================================================
function ExtractedSecretParticles() {
  const ref = useRef<Group>(null);
  // Build a pool of 14 particles with random initial params
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }).map(() => ({
        x: (Math.random() - 0.5) * PAGE_WIDTH * 0.85,
        z: (Math.random() - 0.5) * 0.2,
        speed: 0.18 + Math.random() * 0.28,
        offset: Math.random() * 10,
        size: 0.012 + Math.random() * 0.012,
        color: Math.random() > 0.5 ? "#10b981" : "#34d399",
      })),
    []
  );

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Update each particle's y position (loop within [-PAGE_HEIGHT/2, PAGE_HEIGHT/2 + 1])
    ref.current.children.forEach((child, i) => {
      const p = particles[i];
      const cycleTime = (PAGE_HEIGHT + 1.5) / p.speed;
      const cyclePhase = (t + p.offset) % cycleTime;
      const y = -PAGE_HEIGHT / 2 - 0.1 + cyclePhase * p.speed;
      child.position.y = y;
      // Fade out near top
      const topDist = (PAGE_HEIGHT / 2 + 1) - y;
      const fade = Math.min(1, topDist / 0.3);
      const mat = (child as Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = fade * 0.7;
      child.visible = fade > 0.01;
    });
  });

  return (
    <group ref={ref} position={[0, 0, 0.25]}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, 0, p.z]}>
          <sphereGeometry args={[p.size, 8, 8]} />
          <meshBasicMaterial color={p.color} transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================================
// Component: Orbiting magnifying glass — adds context "we're inspecting this"
// ============================================================================
function OrbitingMagnifier() {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.35;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.1, 0]}>
      {/* Orbit pivot */}
      <group>
        {/* Glass lens */}
        <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.5}>
          <group position={[2.6, 0.5, 0.6]} rotation={[0.4, 0, 0.5]}>
            <Torus args={[0.28, 0.04, 16, 32]}>
              <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.4} metalness={0.7} roughness={0.3} />
            </Torus>
            {/* Glass */}
            <mesh>
              <circleGeometry args={[0.27, 32]} />
              <meshStandardMaterial color="#10b981" transparent opacity={0.18} side={THREE.DoubleSide} />
            </mesh>
            {/* Handle */}
            <Cylinder args={[0.04, 0.04, 0.4, 12]} position={[0.45, -0.45, 0]} rotation={[0, 0, Math.PI / 4]}>
              <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.3} metalness={0.7} roughness={0.3} />
            </Cylinder>
            {/* Label */}
            <Billboard position={[0, 0.45, 0]}>
              <Text fontSize={0.09} color="#10b981" anchorX="center" outlineWidth={0.004} outlineColor="#020617" outlineOpacity={0.9}>
                INSPECTING
              </Text>
            </Billboard>
          </group>
        </Float>
      </group>
    </group>
  );
}

// ============================================================================
// Suspense fallback — empty (avoid drei <Html> which breaks React 19)
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
      camera={{ position: [0, 0.5, 5.8], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={<SceneFallback />}>
        {/* Lighting */}
        <ambientLight intensity={0.55} />
        <pointLight position={[4, 4, 4]} intensity={1.6} color="#10b981" />
        <pointLight position={[-4, 2, 3]} intensity={0.8} color="#f59e0b" />
        <pointLight position={[0, 5, -3]} intensity={0.5} color="#34d399" />
        <directionalLight position={[0, 0, 5]} intensity={0.6} color="#10b981" />

        {/* The 3D browser window — tilted toward camera */}
        <group rotation={[-0.18, -0.25, 0]} position={[0, 0, 0]}>
          <BrowserWindow />
        </group>

        {/* Orbiting magnifier for context */}
        <OrbitingMagnifier />

        {/* Stars background */}
        <Stars radius={50} depth={30} count={1000} factor={2.5} saturation={0} fade speed={0.4} />

        {/* Camera controls */}
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
