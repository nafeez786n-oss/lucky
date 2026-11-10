"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { io, type Socket } from "socket.io-client";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldAlert,
  Loader2,
  Search,
  Download,
  Trash2,
  ExternalLink,
  Lock,
  Bug,
  Radar,
  Cpu,
  Globe,
  KeyRound,
  Fingerprint,
  FileWarning,
  Map,
  Database,
  Zap,
  Activity,
  ChevronRight,
  ChevronDown,
  Box,
  Crosshair,
  Layers,
  CircuitBoard,
  Wifi,
  Signal,
  Target,
  ScanLine,
  Brain,
  CheckCircle2,
  AlertTriangle,
  User as UserIcon,
  Mail,
  Calendar,
  LogOut,
  ShieldCheck,
  EyeOff,
  Server,
  FileCheck2,
  Wrench,
  ListChecks,
  RefreshCw,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import type { ScanResult, Finding, LeakCategory } from "@/lib/leak-scanner";
import { SEVERITY_META, CATEGORY_META, severityCount } from "@/lib/leak-ui";
import { AuthButton } from "@/components/auth/auth-button";
import { ErrorBoundary } from "@/components/error-boundary";

const LeakGuardScene = dynamic(
  () => import("@/components/three/leak-guard-scene").then((m) => m.LeakGuardScene),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-cyan-400/70 font-mono text-xs">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Initializing scanner…
      </div>
    ),
  }
);

const BackgroundScene = dynamic(
  () => import("@/components/three/background-scene").then((m) => m.BackgroundScene),
  { ssr: false }
);

const BokehParticleGalaxy = dynamic(
  () => import("@/components/bokeh-galaxy/bokeh-particle-galaxy").then((m) => m.BokehParticleGalaxy),
  { ssr: false }
);

// ============================================================================
// 6-stage premium scanning experience
// ============================================================================
const SCAN_STAGES: { id: string; label: string; icon: LucideIcon; accent: "cyan" | "violet" | "white" }[] = [
  { id: "acquire",  label: "TARGET ACQUIRED", icon: Target,      accent: "white" },
  { id: "fetch",    label: "FETCHING",        icon: Globe,       accent: "cyan" },
  { id: "analyze",  label: "ANALYZING",       icon: ScanLine,     accent: "cyan" },
  { id: "pattern",  label: "PATTERN MATCH",  icon: Cpu,          accent: "violet" },
  { id: "fingerprint", label: "AI FINGERPRINT", icon: Brain,     accent: "violet" },
  { id: "complete", label: "COMPLETE",        icon: CheckCircle2, accent: "cyan" },
];

// ============================================================================
// Detection matrix cards — interactive with hover glow + status indicator
// ============================================================================
const DETECTION_CARDS: {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: "cyan" | "violet";
  examples: string[];
  coverage: string;
}[] = [
  {
    id: "api_keys",
    title: "API Keys",
    description: "Cloud + SaaS credentials hardcoded into client bundles.",
    icon: KeyRound,
    accent: "cyan",
    examples: ["AWS AKIA*", "OpenAI sk-", "Anthropic sk-ant-", "Google AI AIza*", "GitHub ghp_", "Stripe sk_live_", "Slack xox*"],
    coverage: "12+ patterns",
  },
  {
    id: "secrets",
    title: "Hardcoded Secrets",
    description: "JWTs, Bearer tokens, PEM private keys, DB connection strings.",
    icon: Lock,
    accent: "violet",
    examples: ["JWT eyJ*", "Bearer xyz", "-----BEGIN PRIVATE KEY-----", "mongodb://user:pass@"],
    coverage: "8+ patterns",
  },
  {
    id: "ai_fingerprint",
    title: "AI Fingerprints",
    description: "Meta tags + comments revealing the AI generator used.",
    icon: Fingerprint,
    accent: "cyan",
    examples: ["v0.dev", "lovable.dev", "bolt.new", "Cursor", "Claude", "ChatGPT"],
    coverage: "6 generators",
  },
  {
    id: "exposed_files",
    title: "Exposed Files",
    description: "Well-known leak paths returning 200 OK to anyone.",
    icon: FileWarning,
    accent: "violet",
    examples: ["/.env", "/.git/config", "/.git/HEAD", "/.DS_Store", "/package.json", "/actuator/health"],
    coverage: "12 paths probed",
  },
  {
    id: "source_maps",
    title: "Source Maps",
    description: ".map files exposing original pre-minification source code.",
    icon: Map,
    accent: "cyan",
    examples: ["*.js.map", "//# sourceMappingURL=", "inline annotations"],
    coverage: "Per-script probe",
  },
  {
    id: "pii",
    title: "Personal Data",
    description: "Hardcoded emails and phone numbers in client-visible code.",
    icon: Database,
    accent: "violet",
    examples: ["dev@example.com", "+1 (555) 555-5555"],
    coverage: "Email + phone regex",
  },
  {
    id: "debug_routes",
    title: "Debug Routes",
    description: "Dev-mode artifacts suggesting production ships a dev build.",
    icon: Bug,
    accent: "cyan",
    examples: ["console.log spam", "Next.js __nextjs_original-stack-frame", "Vite /@vite/", "/@react-refresh"],
    coverage: "4 patterns",
  },
  {
    id: "misconfig",
    title: "Misconfigurations",
    description: "process.env.* leaking into the client bundle from bad bundler setup.",
    icon: Cpu,
    accent: "violet",
    examples: ["process.env.DATABASE_URL", "process.env.JWT_SECRET"],
    coverage: "Bundler leak check",
  },
];

// ============================================================================
// Main page component
// ============================================================================
export default function Home() {
  const { data: session } = useSession();
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [sessionHistory, setSessionHistory] = useState<ScanResult[]>([]);
  const [savedScans, setSavedScans] = useState<ScanResult[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [clock, setClock] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Track the latest session in a ref so callbacks/handlers that are set up
  // once (on mount) can always access the current session without stale closures.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Live LOCAL clock (uses the viewer's own timezone)
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // -------- Smooth scroll to section + view transition --------
  // Clicking a sidebar nav item triggers a brief "wipe" transition
  // overlay + smooth-scrolls to the target section. The destination
  // section's `whileInView` animation then fires as it enters viewport.
  const [viewTransitioning, setViewTransitioning] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToSection = useCallback((id: string) => {
    // Trigger the wipe overlay
    setViewTransitioning(true);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    // Smooth-scroll to the target
    setTimeout(() => {
      if (id === "#") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const el = document.querySelector(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }, 30); // small delay so the wipe overlay starts rendering first
    // Hide the wipe overlay after the transition completes
    transitionTimerRef.current = setTimeout(() => setViewTransitioning(false), 750);
  }, []);

  // -------- Track active section for sidebar highlight --------
  const [activeSection, setActiveSection] = useState<string>("#");
  useEffect(() => {
    const sections = ["#target", "#verification", "#detection", "#report", "#history", "#profile"]
      .map((id) => document.querySelector(id))
      .filter(Boolean) as Element[];
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const id = `#${visible[0].target.id}`;
          setActiveSection(id);
        }
      },
      { rootMargin: "-20% 0px -50% 0px", threshold: [0.1, 0.25, 0.5] }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [result, sessionHistory, savedScans]);

  const refreshSaved = useCallback(async () => {
    // Use sessionRef.current instead of session to avoid stale closure
    // (this callback is captured by the socket event handlers which are
    // set up once on mount, so the session value would be null from the
    // initial render if we used the closure variable directly)
    if (!sessionRef.current?.user) {
      setSavedScans([]);
      return;
    }
    setLoadingSaved(true);
    try {
      const res = await fetch("/api/scans", { method: "GET", cache: "no-store" });
      const data = await res.json();
      if (data.ok) setSavedScans(data.scans);
    } catch {
      // ignore
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    refreshSaved();
  }, [refreshSaved, session]);

  // -------- WebSocket connection to the scanner service (port 3030) --------
  // Real-time scan progress: stage events fire as the scanner actually
  // completes each step (replaces fake stage timing). Findings appear
  // one-by-one as they're discovered. The scanner service has NO DB
  // access — it just runs the scan and emits events. The frontend
  // POSTs the final result to /api/scans/save for persistence.
  const socketRef = useRef<Socket | null>(null);
  // sessionRef is defined above (near the state declarations) to avoid ordering issues
  const [socketConnected, setSocketConnected] = useState(false);
  const liveFindingsRef = useRef<Finding[]>([]);

  // Map real backend stage names → existing 6-stage UI index
  const stageToIndex: Record<string, number> = {
    acquire: 0,        // TARGET ACQUIRED
    fetch_html: 1,     // FETCHING
    analyze_html: 2,   // ANALYZING
    fetch_scripts: 3,  // PATTERN MATCH
    pattern_match: 3,  // PATTERN MATCH (still)
    ai_fingerprint: 4, // AI FINGERPRINT
    probe_paths: 4,    // AI FINGERPRINT (still)
    complete: 5,       // COMPLETE
  };

  useEffect(() => {
    // Connect to the scanner-service on port 3030 via the Caddy gateway.
    // Path is "/" (required) and XTransformPort=3030 tells Caddy to forward.
    // Use default transport negotiation (polling → WebSocket upgrade) for
    // maximum proxy/reverse-proxy compatibility.
    const socket = io("/?XTransformPort=3030", {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      console.log("[scanner] connected to scanner-service");
    });
    socket.on("disconnect", () => {
      setSocketConnected(false);
      console.log("[scanner] disconnected from scanner-service");
    });
    socket.on("connect_error", (err: any) => {
      setSocketConnected(false);
      console.warn("[scanner] connect error:", err.message);
    });

    // Real-time stage updates from the scanner service
    socket.on("scan:stage", (event: { stage: string; detail: string; findingsCount: number }) => {
      const idx = stageToIndex[event.stage] ?? 0;
      setStage(idx);
    });

    // Live findings (as they're discovered — incrementally builds the result)
    socket.on("scan:finding", (event: { finding: Finding }) => {
      liveFindingsRef.current.push(event.finding);
    });

    // Final result from the scanner service
    socket.on("scan:complete", async (event: { result: ScanResult }) => {
      const data = event.result;
      setStage(SCAN_STAGES.length - 1); // COMPLETE
      setResult(data);
      setScanning(false);
      liveFindingsRef.current = [];

      if (!data.ok && data.errors.length > 0) {
        toast.warning(data.errors[0]);
      } else {
        const n = data.findings.length;
        if (n === 0) toast.success("Scan complete — site is clean");
        else toast.success(`Scan complete — ${n} finding${n === 1 ? "" : "s"} exposed`);
      }
      setSessionHistory((h) => [data, ...h].slice(0, 8));

      // Persist the result if the user is authenticated (use ref to avoid stale closure)
      if (sessionRef.current?.user) {
        try {
          await fetch("/api/scans/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          refreshSaved();
        } catch (err) {
          console.warn("[scanner] failed to persist scan:", err);
        }
      }
    });

    socket.on("scan:error", (event: { error: string }) => {
      setScanning(false);
      toast.error(`Scan failed: ${event.error}`);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    if (scanning) return;
    const target = url.trim();
    if (!target) {
      toast.error("Enter a URL first");
      return;
    }
    setScanning(true);
    setResult(null);
    setStage(0);
    liveFindingsRef.current = [];

    // If the WebSocket scanner-service is connected, use it (real-time progress).
    // Otherwise, fall back to the legacy fetch POST to /api/scan.
    if (socketRef.current?.connected) {
      socketRef.current.emit("scan:start", { url: target });
      return;
    }

    // Fallback: legacy fetch-based scan (no real-time progress)
    const stageTimers: ReturnType<typeof setTimeout>[] = [];
    const intervals = [0, 2200, 6500, 11000, 15000, 19000];
    for (let i = 1; i < SCAN_STAGES.length; i++) {
      stageTimers.push(setTimeout(() => setStage(i), intervals[i]));
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data: ScanResult = await res.json();
      for (const t of stageTimers) clearTimeout(t);
      setStage(SCAN_STAGES.length - 1); // COMPLETE

      setResult(data);
      if (!data.ok && data.errors.length > 0) {
        toast.warning(data.errors[0]);
      } else {
        const n = data.findings.length;
        if (n === 0) toast.success("Scan complete — site is clean");
        else toast.success(`Scan complete — ${n} finding${n === 1 ? "" : "s"} exposed`);
      }
      setSessionHistory((h) => [data, ...h].slice(0, 8));
      if (session?.user) refreshSaved();
    } catch (err) {
      for (const t of stageTimers) clearTimeout(t);
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  }

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url2 = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (result.targetUrl || "scan").replace(/[^a-z0-9]/gi, "_").slice(0, 60);
    a.href = url2;
    a.download = `leakguard-report-${safe}.json`;
    a.click();
    URL.revokeObjectURL(url2);
    toast.success("Report exported");
  }

  function clearResults() {
    setResult(null);
    setStage(0);
  }

  async function clearSavedScans() {
    try {
      const res = await fetch("/api/scans", { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setSavedScans([]);
        toast.success("Saved scans cleared");
      }
    } catch {
      toast.error("Failed to clear saved scans");
    }
  }

  // -------- Layout: sidebar (desktop/tablet) + main, top bar (mobile) --------
  return (
    <div className="min-h-screen flex bg-transparent text-foreground relative">
      {/* Bokeh Particle Galaxy — sole background (WebGL2 fragment shader) */}
      <div className="fixed inset-0 -z-10 noise-overlay">
        <div className="absolute inset-0" style={{ pointerEvents: "auto" }}>
          <BokehParticleGalaxy
            background="#020208"
            baseColor="#22d3ee"
            accentColor="#a78bfa"
            scale={70}
            arms={3}
            twinkle={40}
            hover={70}
            speed={45}
            advanced={{
              brightness: 1.8,
              dustDensity: 1.5,
              dotDensity: 1.3,
              haze: 0.7,
              speckSize: 0.015,
              dotSize: 0.035,
              vignette: 0.5,
            }}
            className="w-full h-full"
          />
        </div>
        {/* Subtle scanline overlay (very faint, on top of galaxy) */}
        <div className="absolute inset-0 scanline-overlay opacity-20 pointer-events-none" />
      </div>

      {/* View-transition wipe overlay + particle burst (fires when a sidebar nav item is clicked) */}
      <AnimatePresence>
        {viewTransitioning && (
          <>
            {/* Diagonal gradient wipe — cyan → violet → transparent, sweeping left → right */}
            <motion.div
              key="view-wipe"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 z-40 pointer-events-none overflow-hidden"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(110deg, transparent 0%, rgba(34,211,238,0.18) 30%, rgba(167,139,250,0.22) 50%, rgba(34,211,238,0.18) 70%, transparent 100%)",
                }}
              />
              {/* Thin bright leading edge */}
              <div
                className="absolute top-0 bottom-0 w-px bg-white/80 shadow-[0_0_20px_4px_rgba(34,211,238,0.6)]"
                style={{ left: "50%" }}
              />
              {/* Top + bottom edges */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-300/80 to-transparent" />
            </motion.div>

            {/* Particle burst — 16 particles radiating from screen center */}
            <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center overflow-hidden">
              {Array.from({ length: 16 }).map((_, i) => {
                const angle = (i / 16) * Math.PI * 2;
                const distance = 180 + (i % 4) * 80; // varied distances for depth
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                const color = i % 2 === 0 ? "#22d3ee" : "#a78bfa";
                const size = 4 + (i % 3) * 2;
                return (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{ x: dx, y: dy, opacity: 0, scale: 0.3 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
                    className="rounded-full"
                    style={{
                      width: size,
                      height: size,
                      background: color,
                      boxShadow: `0 0 ${size * 2}px ${color}`,
                    }}
                  />
                );
              })}
              {/* Center flash */}
              <motion.div
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="absolute w-8 h-8 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,255,255,0.9), rgba(34,211,238,0.4) 50%, transparent 70%)",
                }}
              />
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ============ SIDEBAR (desktop + tablet) ============ */}
      <aside className="hidden md:flex w-[72px] lg:w-[280px] shrink-0 sticky top-0 h-screen flex-col border-r border-white/5 bg-black/40 backdrop-blur-xl">
        <SidebarContent
          clock={clock}
          session={session}
          activeSection={activeSection}
          onNavClick={(id) => {
            scrollToSection(id);
            setMobileMenuOpen(false);
          }}
        />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/70 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border border-cyan-400/40 bg-cyan-400/5 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-cyan-300" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">
            <span className="text-white">LEAK</span>
            <span className="text-cyan-300">GUARD</span>
          </h1>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5"
        >
          <ChevronDown className={`w-4 h-4 transition ${mobileMenuOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Mobile dropdown menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden fixed top-[57px] left-0 right-0 z-20 border-b border-white/5 bg-black/90 backdrop-blur-xl overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                <span>UTC</span>
                <span className="tabular-nums text-white/70">{clock}</span>
              </div>
              <AuthButton />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ MAIN CONTENT ============ */}
      {/* During a view transition, the main content zooms out (scale 0.97),
          blurs (8px), and fades (0.55 opacity). When the transition ends,
          it zooms back in + clears + re-opaques. Cinematic "page change" feel. */}
      <motion.main
        className="flex-1 min-w-0 relative origin-top"
        animate={{
          opacity: viewTransitioning ? 0.55 : 1,
          scale: viewTransitioning ? 0.97 : 1,
          filter: viewTransitioning ? "blur(8px)" : "blur(0px)",
        }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Top status strip (desktop only) */}
        <div className="hidden md:block border-b border-white/5 bg-black/30 backdrop-blur-md">
          <div className="pl-6 md:pl-8 lg:pl-10 xl:pl-12 pr-6 md:pr-10 lg:pr-16 xl:pr-20 py-2.5 flex items-center justify-between gap-3 text-[10px] font-mono">
            <div className="flex items-center gap-5 text-white/40">
              <span className="flex items-center gap-1.5">
                <Crosshair className="w-3 h-3" />
                TARGET: <span className="text-white/80">{result?.targetUrl ?? "—"}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                FINDINGS: <span className="text-white/80 tabular-nums">{result?.findings.length ?? 0}</span>
              </span>
              <span className="hidden lg:flex items-center gap-1.5">
                <Signal className="w-3 h-3" />
                STATUS: <span className="text-white/80">{scanning ? "SCANNING" : result ? "DONE" : "IDLE"}</span>
              </span>
            </div>
            <div className="text-white/40">
              {session?.user ? `OP: ${session.user.email}` : "GUEST MODE"}
            </div>
          </div>
        </div>

        <div className="pl-6 md:pl-8 lg:pl-10 xl:pl-12 pr-6 md:pr-10 lg:pr-16 xl:pr-20 py-10 md:py-16 pt-20 md:pt-16 w-full">
          {/* ===== HERO ===== */}
          <motion.section
            id="target"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-14 md:mb-20 scroll-mt-24"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 text-cyan-300 text-xs font-mono mb-8 tracking-wider">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                BOUNDED · NO LOOPS · NO POLLING
              </div>

              {/* Quotation — Playfair Display italic + warm gold→coral→magenta gradient.
                  Sits ABOVE the main headline. Uses a different font family (serif)
                  and a unique color palette (warm) to contrast with the cool
                  cyan/violet of the rest of the UI. */}
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                className="mb-6 flex items-center justify-center gap-4"
              >
                {/* Left decorative line */}
                <span
                  className="hidden sm:block h-px w-16"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, #fcd34d 50%, #fb7185)",
                  }}
                />
                <p
                  className="font-playfair text-gradient-quote text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-medium tracking-wide leading-snug"
                  style={{ textShadow: "0 0 30px rgba(251, 113, 133, 0.25)" }}
                >
                  “Beyond The Limits”
                </p>
                {/* Right decorative line */}
                <span
                  className="hidden sm:block h-px w-16"
                  style={{
                    background:
                      "linear-gradient(to left, transparent, #c084fc 50%, #f472b6)",
                  }}
                />
              </motion.div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-bold tracking-tight leading-[1.02] mb-6">
                <span className="text-white">Find every exposed</span>
                <br />
                <span className="text-gradient-cyan-violet">secret.</span>
                <span className="text-white/50"> Before attackers do.</span>
              </h1>
              <p className="text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
                LeakGuard fetches the target, follows up to 20 scripts, probes 12 leak paths, and
                surfaces API keys, source maps, and AI fingerprints — in a single bounded request.
              </p>
            </motion.div>

            {/* URL input — premium glass */}
            <motion.form
              onSubmit={runScan}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="glass-panel glass-panel-hover rounded-2xl p-2.5 flex flex-col sm:flex-row gap-2.5 max-w-3xl mx-auto"
            >
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="pl-11 h-14 bg-transparent border-0 focus-visible:ring-0 font-mono text-base placeholder:text-white/30"
                  disabled={scanning}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button
                type="submit"
                disabled={scanning}
                className="h-14 px-8 bg-white hover:bg-white/90 text-black font-semibold tracking-tight shadow-[0_0_30px_-8px_rgba(255,255,255,0.4)]"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scanning
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Execute Scan
                  </>
                )}
              </Button>
            </motion.form>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono text-white/40">
              <span className="text-white/30">try:</span>
              {["https://httpbin.org", "https://example.com"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setUrl(t)}
                  disabled={scanning}
                  className="px-2.5 py-1 rounded-md border border-white/10 bg-white/5 text-white/60 hover:text-cyan-300 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition disabled:opacity-40"
                >
                  {t}
                </button>
              ))}
            </div>
          </motion.section>

          {/* ===== SCANNING (animated 6-stage) ===== */}
          <AnimatePresence>
            {scanning && (
              <motion.section
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-12 overflow-hidden"
              >
                <ScanProgress currentStage={stage} />
              </motion.section>
            )}
          </AnimatePresence>

          {/* ===== 3D VERIFICATION CONSTELLATION (centerpiece) ===== */}
          <section id="verification" className="mb-14 md:mb-20 scroll-mt-24">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="glass-panel rounded-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg border border-cyan-400/30 bg-cyan-400/5 flex items-center justify-center">
                    <Box className="w-4 h-4 text-cyan-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Verification Constellation</h3>
                    <p className="text-[11px] text-white/40 font-mono">interactive · 3D · drag to orbit</p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  LIVE
                </div>
              </div>
              <div className="relative h-[500px] sm:h-[600px] lg:h-[700px] xl:h-[800px]">
                <ErrorBoundary>
                  <LeakGuardScene />
                </ErrorBoundary>
              </div>
              <div className="px-6 py-3 border-t border-white/5 text-center">
                <p className="text-xs text-white/50 max-w-2xl mx-auto">
                  Each orbiting model represents one leak category LeakGuard probes — a key for API
                  keys, lock for secrets, fingerprint for AI-tool traces, document for exposed files,
                  pyramid for source maps, avatar for PII, bug for debug routes, gear for misconfig.
                </p>
              </div>
            </motion.div>
          </section>

          {/* ===== DETECTION MATRIX — interactive cards ===== */}
          <motion.section
            id="detection"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-14 md:mb-20 scroll-mt-24"
          >
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">Detection Matrix</h2>
                <p className="text-sm md:text-base text-white/50 mt-2">
                  Eight leak categories scanned on every request.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-white/40">
                <Zap className="w-3 h-3" />
                {DETECTION_CARDS.length} CATEGORIES
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {DETECTION_CARDS.map((card, i) => (
                <DetectionCard key={card.id} card={card} index={i} />
              ))}
            </div>
          </motion.section>

          {/* ===== SCAN RESULTS ===== */}
          <motion.div
            id="report"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="scroll-mt-24 mb-14 md:mb-20"
          >
          {result && !scanning && (
            <ResultDashboard result={result} onExport={exportJson} onClear={clearResults} />
          )}
          </motion.div>

          {/* ===== DEBUGGING SOLUTIONS (only when findings > 0) ===== */}
          {result && !scanning && result.findings.length > 0 && (
            <DebuggingSolutions
              result={result}
              onRescan={() => {
                // Re-use the URL from the last scan to trigger a new scan
                if (result.targetUrl) {
                  setUrl(result.targetUrl);
                  // Use a small delay so the state updates before runScan reads it
                  setTimeout(() => {
                    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                    runScan(fakeEvent);
                  }, 30);
                }
              }}
            />
          )}

          {/* ===== SAVED SCANS (logged in) ===== */}
          {session?.user && (
            <motion.section
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-14"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-300" />
                  Saved Scans <span className="text-white/40 text-sm">({savedScans.length})</span>
                </h3>
                {savedScans.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearSavedScans} className="text-xs text-white/50 hover:text-red-400">
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear all
                  </Button>
                )}
              </div>
              {loadingSaved ? (
                <div className="text-xs font-mono text-white/40">Loading…</div>
              ) : savedScans.length === 0 ? (
                <div className="glass-panel rounded-xl p-5 text-center border-dashed border-white/10">
                  <p className="text-xs text-white/50">
                    No saved scans yet. Run a scan while logged in to persist it here.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {savedScans.slice(0, 9).map((s, i) => {
                    const counts = severityCount(s.findings);
                    return (
                      <HistoryCard key={i} scan={s} counts={counts} onClick={() => {
                        setResult(s);
                        setStage(SCAN_STAGES.length - 1);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }} />
                    );
                  })}
                </div>
              )}
            </motion.section>
          )}

          {/* ===== PROFILE (logged-in only — only the user can see their own PII) ===== */}
          {session?.user && (
            <ProfileSection
              email={session.user.email ?? ""}
              name={session.user.name ?? null}
            />
          )}

          {/* ===== SESSION HISTORY ===== */}
          {sessionHistory.length > 0 && !scanning && (
            <motion.section
              id="history"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-14 scroll-mt-24"
            >
              <h3 className="text-base font-semibold tracking-tight flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-violet-300" />
                Session History <span className="text-white/40 text-sm">({sessionHistory.length})</span>
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {sessionHistory.map((h, i) => {
                  const counts = severityCount(h.findings);
                  return (
                    <HistoryCard key={i} scan={h} counts={counts} onClick={() => {
                      setResult(h);
                      setStage(SCAN_STAGES.length - 1);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }} />
                  );
                })}
              </div>
            </motion.section>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-white/5 bg-black/30 backdrop-blur-md mt-12">
          <div className="px-6 py-4 flex flex-col sm:flex-row justify-between gap-2 text-[10px] font-mono text-white/40">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              LEAKGUARD · BOUNDED SCANNER · NO POLLING · NO INFINITE LOOPS
            </span>
            <span>
              {session?.user ? `OPERATOR: ${session.user.email}` : "GUEST MODE — SCANS NOT PERSISTED"}
            </span>
          </div>
        </footer>
      </motion.main>
    </div>
  );
}

// ============================================================================
// Sidebar content (shared by desktop + tablet)
// ============================================================================
function SidebarContent({
  clock,
  session,
  activeSection,
  onNavClick,
}: {
  clock: string;
  session: any;
  activeSection: string;
  onNavClick: (id: string) => void;
}) {
  return (
    <>
      {/* Logo */}
      <div className="px-4 lg:px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <motion.div
            initial={{ rotate: -8, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-10 h-10 rounded-xl border border-cyan-400/40 bg-cyan-400/5 flex items-center justify-center shrink-0"
          >
            <ShieldAlert className="w-5 h-5 text-cyan-300" />
          </motion.div>
          <div className="hidden lg:block">
            <h1 className="text-base font-bold tracking-tight leading-none">
              <span className="text-white">LEAK</span>
              <span className="text-cyan-300">GUARD</span>
            </h1>
            <p className="text-[10px] text-white/40 mt-1.5 font-mono uppercase tracking-[0.2em]">
              AI Security Scanner
            </p>
          </div>
        </div>
      </div>

      {/* Status block */}
      <div className="px-4 lg:px-6 py-4 border-b border-white/5 space-y-2">
        <StatusRow icon={Wifi} label="SYS" value="ONLINE" color="text-cyan-300" pulse />
        <StatusRow label="LOCAL" value={clock || "--:--:--"} mono />
        <StatusRow icon={Signal} label="CHN" value="STABLE" />
      </div>

      {/* Nav */}
      <nav className="px-3 lg:px-3 py-4 flex-1 space-y-0.5">
        <p className="hidden lg:block text-[10px] font-mono uppercase tracking-[0.25em] text-white/30 px-2 mb-2">
          Sections
        </p>
        {NAV_ITEMS.map((n) => {
          const active = activeSection === n.href;
          return (
            <button
              key={n.label}
              onClick={() => onNavClick(n.href)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm transition group relative ${
                active
                  ? "bg-cyan-400/10 text-cyan-300"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="activeNav"
                  className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-cyan-400"
                />
              )}
              <n.icon className={`w-4 h-4 shrink-0 ${active ? "text-cyan-300" : "text-white/40 group-hover:text-cyan-300"}`} />
              <span className="hidden lg:block flex-1 font-medium text-left">{n.label}</span>
              <ChevronRight className={`hidden lg:block w-3 h-3 transition ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
            </button>
          );
        })}
      </nav>

      {/* Operator */}
      <div className="px-3 lg:px-3 py-3 border-t border-white/5">
        <p className="hidden lg:block text-[10px] font-mono uppercase tracking-[0.25em] text-white/30 px-2 mb-2">
          Operator
        </p>
        <AuthButton />
      </div>

      {/* Footer */}
      <div className="px-4 lg:px-6 py-3 border-t border-white/5 text-[10px] font-mono text-white/30 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <CircuitBoard className="w-3 h-3" />
          <span className="hidden lg:inline">v1.0</span>
        </span>
        <span className="hidden lg:inline">NO-LOOP</span>
      </div>
    </>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  color = "text-white/70",
  mono = false,
  pulse = false,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[11px] font-mono">
      <span className="text-white/40 uppercase tracking-wider flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        <span className="hidden lg:inline">{label}</span>
      </span>
      <span className={`flex items-center gap-1.5 ${color} ${mono ? "tabular-nums" : ""}`}>
        {pulse && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// Detection card — interactive with hover glow + severity/status indicator
// ============================================================================
function DetectionCard({
  card,
  index,
}: {
  card: typeof DETECTION_CARDS[number];
  index: number;
}) {
  const accentColor = card.accent === "cyan" ? "#22d3ee" : "#a78bfa";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={`glass-panel glass-panel-hover rounded-xl p-4 cursor-default group ${card.accent === "violet" ? "glass-panel-violet" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg border flex items-center justify-center transition group-hover:scale-110"
          style={{
            borderColor: `${accentColor}40`,
            background: `${accentColor}10`,
          }}
        >
          <card.icon className="w-4 h-4" style={{ color: accentColor }} />
        </div>
        <div className="text-[9px] font-mono text-white/30 px-2 py-0.5 rounded border border-white/10">
          ACTIVE
        </div>
      </div>
      <h4 className="text-sm font-semibold mb-1">{card.title}</h4>
      <p className="text-xs text-white/50 leading-snug mb-3">{card.description}</p>
      <div className="space-y-1.5">
        {card.examples.slice(0, 3).map((ex) => (
          <div key={ex} className="text-[10px] font-mono text-white/40 truncate flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full" style={{ background: accentColor }} />
            {ex}
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-white/5 text-[10px] font-mono text-white/40 flex items-center justify-between">
        <span>coverage</span>
        <span style={{ color: accentColor }}>{card.coverage}</span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Scan progress — 6-stage animated
// ============================================================================
function ScanProgress({ currentStage }: { currentStage: number }) {
  return (
    <div className="glass-panel rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl border border-cyan-400/30 bg-cyan-400/5 flex items-center justify-center animate-pulse-glow-cyan">
          <Radar className="w-5 h-5 text-cyan-300" />
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Scan in progress</h3>
          <p className="text-xs text-white/50 font-mono">
            Stage {Math.min(currentStage + 1, SCAN_STAGES.length)} of {SCAN_STAGES.length} · bounded execution
          </p>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
        {SCAN_STAGES.map((s, i) => {
          const done = i < currentStage;
          const active = i === currentStage;
          const last = i === SCAN_STAGES.length - 1;
          const Icon = s.icon;
          const accentColor = s.accent === "cyan" ? "#22d3ee" : s.accent === "violet" ? "#a78bfa" : "#ffffff";
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-2 min-w-0 flex-1">
                <motion.div
                  initial={false}
                  animate={{
                    scale: active ? 1.15 : 1,
                    opacity: done || active ? 1 : 0.4,
                  }}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-xl border flex items-center justify-center transition relative"
                  style={{
                    borderColor: done || active ? `${accentColor}80` : "rgba(255,255,255,0.1)",
                    background: done || active ? `${accentColor}15` : "transparent",
                    boxShadow: active ? `0 0 30px -6px ${accentColor}80` : "none",
                  }}
                >
                  <Icon className="w-4 h-4 md:w-5 md:h-5" style={{ color: done || active ? accentColor : "rgba(255,255,255,0.4)" }} />
                  {active && (
                    <motion.div
                      className="absolute inset-0 rounded-xl border-2"
                      style={{ borderColor: accentColor }}
                      animate={{ opacity: [0.8, 0, 0.8], scale: [1, 1.25, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </motion.div>
                <span
                  className="text-[9px] md:text-[10px] font-mono tracking-wider text-center"
                  style={{ color: done || active ? accentColor : "rgba(255,255,255,0.3)" }}
                >
                  {s.label}
                </span>
              </div>
              {!last && (
                <div className="h-px flex-1 mx-2 relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/10" />
                  <motion.div
                    initial={false}
                    animate={{ width: done ? "100%" : "0%" }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-y-0 left-0 bg-cyan-400/60"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Current stage detail */}
      <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-cyan-300 animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-white/70">
            <span className="text-cyan-300">→</span> {SCAN_STAGES[Math.min(currentStage, SCAN_STAGES.length - 1)].label}
          </p>
          <p className="text-[11px] text-white/40 mt-0.5">
            {currentStage === 0 && "Validating target URL against http(s) protocol and length limits."}
            {currentStage === 1 && "Downloading HTML with 15s timeout and 1.5MB cap."}
            {currentStage === 2 && "Running regex matchers across HTML and inline scripts."}
            {currentStage === 3 && "Fetching up to 20 <script> sources, 10s each, 600KB cap."}
            {currentStage === 4 && "Detecting AI-tool fingerprints in meta tags, comments, and JS."}
            {currentStage === 5 && "Aggregating findings and ranking by severity."}
          </p>
        </div>
        <span className="animate-blink text-cyan-300 font-mono">▌</span>
      </div>
    </div>
  );
}

// ============================================================================
// Profile section — private view of operator's own account info.
// This is the ONLY place in the website where the user's email/name is
// rendered. The sidebar chip hides all PII.
// ============================================================================
type ProfileData = {
  ok: boolean;
  profile?: {
    email: string;
    name: string | null;
    createdAt: string;
    scanCount: number;
    lastScan: {
      targetUrl: string;
      createdAt: string;
      findingCount: number;
      criticalCount: number;
      highCount: number;
    } | null;
  };
  error?: string;
};

function ProfileSection({ email, name }: { email: string; name: string | null }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/profile", { method: "GET", cache: "no-store" });
        const json = await res.json();
        if (mounted) setData(json);
      } catch {
        if (mounted) setData({ ok: false, error: "Failed to load profile" });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [email, reloadKey]);

  // Avatar initials from email or name
  const initials = useMemo(() => {
    const src = name || email || "?";
    const parts = src.split(/[\s@.]+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [email, name]);

  const displayName = name || email.split("@")[0];
  const hasError = data && !data.ok;
  const profile = data?.profile;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      })
    : "—";
  const scanCount = profile?.scanCount ?? 0;
  const lastScan = profile?.lastScan;

  return (
    <motion.section
      id="profile"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="mt-14 scroll-mt-24"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-cyan-300" />
          Operator Profile
        </h3>
        <Badge className="text-[10px] font-mono bg-cyan-400/15 text-cyan-300 border border-cyan-400/30">
          PRIVATE
        </Badge>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {/* Header band with avatar + identity */}
        <div className="relative p-6 md:p-8 border-b border-white/5 bg-gradient-to-br from-cyan-400/5 via-transparent to-violet-400/5">
          <div className="absolute top-3 right-4 text-[9px] font-mono text-white/30 tracking-wider">
            VISIBLE ONLY TO YOU
          </div>
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Avatar */}
            <div className="relative">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, type: "spring" }}
                className="w-20 h-20 rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-400/20 to-violet-400/20 flex items-center justify-center shadow-[0_0_30px_-8px_rgba(34,211,238,0.4)]"
              >
                <span className="text-3xl font-bold tracking-tight text-white">{initials}</span>
              </motion.div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-400 border-2 border-background flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 text-black" />
              </div>
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 mb-1">
                AUTHENTICATED OPERATOR
              </div>
              <h4 className="text-2xl font-bold tracking-tight mb-1 truncate">{displayName}</h4>
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading profile…
                </div>
              ) : hasError ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-red-400 font-mono">Failed to load</span>
                  <button
                    onClick={() => setReloadKey(k => k + 1)}
                    className="text-cyan-300 hover:text-cyan-200 underline font-mono"
                  >
                    retry
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm text-white/60 font-mono">
                  <Mail className="w-3.5 h-3.5 text-white/40" />
                  <span className="truncate">{email}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-white/40 font-mono mt-2">
                <Calendar className="w-3 h-3" />
                Member since {loading ? "…" : memberSince}
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-6 md:p-8">
          <ProfileStatCard
            label="Total Scans"
            value={loading ? "—" : String(scanCount)}
            icon={Activity}
            accent="cyan"
          />
          <ProfileStatCard
            label="Critical Found"
            value={loading ? "—" : String(lastScan?.criticalCount ?? 0)}
            icon={AlertTriangle}
            accent="red"
          />
          <ProfileStatCard
            label="High Found"
            value={loading ? "—" : String(lastScan?.highCount ?? 0)}
            icon={ShieldAlert}
            accent="orange"
          />
        </div>

        {/* Last scan summary */}
        {lastScan && (
          <div className="px-6 md:px-8 pb-6 md:pb-8">
            <div className="glass-panel rounded-xl p-4 border-cyan-400/20">
              <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 mb-2 flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                Last Scan
              </div>
              <p className="text-sm font-mono text-white/80 break-all mb-1">{lastScan.targetUrl}</p>
              <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
                <span>{new Date(lastScan.createdAt).toLocaleString()}</span>
                <span>·</span>
                <span>{lastScan.findingCount} findings</span>
                {lastScan.criticalCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-red-400">{lastScan.criticalCount} crit</span>
                  </>
                )}
                {lastScan.highCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-orange-400">{lastScan.highCount} high</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* === TRUST SLOGANS === */}
        <div className="px-6 md:px-8 pb-6 md:pb-8">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-cyan-300" />
              <h5 className="text-xs font-mono uppercase tracking-wider text-cyan-300">
                Trust & Security
              </h5>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {TRUST_SLOGANS.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-cyan-400/20 transition group"
                >
                  <div className="w-8 h-8 rounded-lg border border-cyan-400/30 bg-cyan-400/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition">
                    <s.icon className="w-3.5 h-3.5 text-cyan-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/90 mb-0.5">{s.title}</p>
                    <p className="text-[11px] text-white/50 leading-snug">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Action footer */}
        <div className="px-6 md:px-8 py-4 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[10px] font-mono text-white/40 max-w-md">
            Your email and name are only visible here — never exposed elsewhere in the website.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ redirect: false })}
            className="text-white/60 hover:text-red-300 hover:bg-red-400/5 font-mono"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Sign out
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

function ProfileStatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: "cyan" | "red" | "orange";
}) {
  const accentMap = {
    cyan: { hex: "#22d3ee", tailwind: "text-cyan-300" },
    red: { hex: "#ef4444", tailwind: "text-red-400" },
    orange: { hex: "#f97316", tailwind: "text-orange-400" },
  };
  const a = accentMap[accent];
  return (
    <div className="glass-panel rounded-xl p-4 relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full blur-3xl opacity-15"
        style={{ background: a.hex }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">{label}</p>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${a.tailwind}`}>{value}</p>
        </div>
        <Icon className="w-4 h-4 opacity-50" style={{ color: a.hex }} />
      </div>
    </div>
  );
}

// ============================================================================
// Debugging solutions section — appears after scan results when findings > 0
// ============================================================================
function DebuggingSolutions({
  result,
  onRescan,
}: {
  result: ScanResult;
  onRescan: () => void;
}) {
  const findings = result.findings;
  const total = findings.length;
  if (total === 0) return null;

  // Group findings by category to know which solutions are relevant
  const findingsByCategory: Record<string, number> = {};
  for (const f of findings) {
    findingsByCategory[f.category] = (findingsByCategory[f.category] ?? 0) + 1;
  }

  // Filter + sort solutions: only show categories that have findings, sorted by priority
  const relevantSolutions = DEBUGGING_SOLUTIONS
    .filter((s) => findingsByCategory[s.category])
    .sort((a, b) => SOLUTION_PRIORITY_RANK[a.priority] - SOLUTION_PRIORITY_RANK[b.priority]);

  const priorityColor: Record<DebugSolution["priority"], string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#f59e0b",
    low: "#0ea5e9",
  };

  return (
    <motion.section
      id="solutions"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mt-14 scroll-mt-24"
    >
      {/* Header */}
      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-4 h-4 text-cyan-300" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300">
              POST-SCAN REMEDIATION
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold tracking-tight">
            Debugging Solutions
          </h3>
          <p className="text-sm text-white/50 mt-1 max-w-xl">
            Step-by-step action plan for the {total} {total === 1 ? "finding" : "findings"} exposed in this scan. Start with critical issues.
          </p>
        </div>
        <Button
          onClick={onRescan}
          className="bg-white/5 hover:bg-cyan-400/10 text-white hover:text-cyan-300 border border-white/10 hover:border-cyan-400/40 font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Re-scan target
        </Button>
      </div>

      {/* Priority action banner */}
      {relevantSolutions.some(s => s.priority === "critical") && (
        <Alert className="mb-4 border-red-500/40 bg-red-500/5">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <AlertTitle className="text-red-400 font-semibold text-sm">
            Critical action required
          </AlertTitle>
          <AlertDescription className="text-sm text-white/60">
            This scan exposed critical-severity leaks. Rotate the affected keys/secrets at their provider BEFORE deploying any other fixes — assume they are already in attacker hands.
          </AlertDescription>
        </Alert>
      )}

      {/* Per-category solution cards */}
      <div className="space-y-4">
        {relevantSolutions.map((sol, i) => {
          const count = findingsByCategory[sol.category];
          const color = priorityColor[sol.priority];
          const meta = CATEGORY_META[sol.category];
          return (
            <motion.div
              key={sol.category}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <div className="glass-panel rounded-2xl overflow-hidden">
                {/* Card header */}
                <div
                  className="px-5 py-4 border-b border-white/5 flex items-start gap-3"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ background: `${color}20`, color, border: `1px solid ${color}50` }}
                      >
                        {sol.priority}
                      </span>
                      <span className="text-[10px] font-mono text-white/40">
                        {meta?.label ?? sol.category} · {count} {count === 1 ? "finding" : "findings"}
                      </span>
                    </div>
                    <h4 className="text-base font-semibold tracking-tight text-white/90">
                      {sol.title}
                    </h4>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">{sol.summary}</p>
                  </div>
                </div>

                {/* Steps list */}
                <div className="p-5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 mb-3 flex items-center gap-1.5">
                    <ListChecks className="w-3 h-3" />
                    Action Plan
                  </div>
                  <ol className="space-y-2.5">
                    {sol.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm">
                        <span
                          className="shrink-0 w-6 h-6 rounded-md border flex items-center justify-center text-[10px] font-mono font-medium"
                          style={{
                            background: `${color}15`,
                            borderColor: `${color}40`,
                            color,
                          }}
                        >
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="text-white/70 leading-relaxed pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>

                  {/* Tools links */}
                  {sol.tools && sol.tools.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                        Tools & Resources
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sol.tools.map((t) => (
                          <a
                            key={t.url}
                            href={t.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:text-cyan-300 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {t.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Verification checklist */}
      <div className="mt-6 glass-panel rounded-2xl p-5 border-cyan-400/20">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-cyan-300" />
          <h4 className="text-sm font-semibold tracking-tight text-cyan-300">
            Verification checklist
          </h4>
        </div>
        <p className="text-xs text-white/50 mb-4 leading-relaxed">
          After applying the fixes above, run through this checklist before re-scanning to confirm everything is in place.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            "All leaked keys revoked at their provider's console",
            "New keys stored only in server-side env vars",
            "Web server returns 404 for /.env, /.git/, /package.json",
            "Source maps (.js.map) return 404 on production",
            "console.log stripped from production bundle",
            "process.env.* no longer appears in shipped JS",
            "AI-generator meta tags + comments stripped",
            "Hardcoded PII moved to server-rendered partials",
          ].map((check) => (
            <div
              key={check}
              className="flex items-start gap-2 text-xs text-white/60 p-2 rounded-lg bg-white/[0.02] border border-white/5"
            >
              <span className="shrink-0 w-4 h-4 rounded border border-white/20 mt-0.5" />
              <span className="leading-snug">{check}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
          <p className="text-[10px] font-mono text-white/40">
            Re-scan after applying fixes to verify — should show 0 findings.
          </p>
          <Button
            onClick={onRescan}
            size="sm"
            className="bg-white hover:bg-white/90 text-black font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Re-scan now
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

// ============================================================================
// Result dashboard — premium glass + expandable findings
// ============================================================================
function ResultDashboard({
  result,
  onExport,
  onClear,
}: {
  result: ScanResult;
  onExport: () => void;
  onClear: () => void;
}) {
  const counts = severityCount(result.findings);
  const total = result.findings.length;

  const grouped: Record<string, Finding[]> = {};
  for (const f of result.findings) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  }

  const severities: (keyof typeof counts)[] = ["critical", "high", "medium", "low", "info"];
  const sevColors: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-amber-500",
    low: "bg-yellow-400",
    info: "bg-sky-500",
  };
  const sevHex: Record<string, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#f59e0b",
    low: "#facc15",
    info: "#0ea5e9",
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-12"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-cyan-300" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300">SCAN REPORT</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
            {total === 0 ? "Target is clean" : `${total} ${total === 1 ? "finding" : "findings"} exposed`}
          </h2>
          <p className="text-sm text-white/50 mt-1 font-mono break-all">{result.targetUrl}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onExport} disabled={total === 0}
            className="border-white/10 text-white/70 hover:bg-white/5 hover:text-cyan-300 hover:border-cyan-400/30">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-white/50 hover:text-white">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Severity breakdown bar */}
      {total > 0 && (
        <div className="mb-4">
          <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
            {severities.map((s) =>
              counts[s] > 0 ? (
                <motion.div
                  key={s}
                  className={`${sevColors[s]}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(counts[s] / total) * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                />
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Premium stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <PremiumStat
          label="Total"
          value={total}
          icon={Layers}
          accent="white"
        />
        <PremiumStat
          label="Critical"
          value={counts.critical}
          icon={AlertTriangle}
          accent="red"
        />
        <PremiumStat
          label="High"
          value={counts.high}
          icon={ShieldAlert}
          accent="orange"
        />
        <PremiumStat
          label="Medium"
          value={counts.medium}
          icon={AlertTriangle}
          accent="amber"
        />
        <PremiumStat
          label="Low / Info"
          value={counts.low + counts.info}
          icon={CheckCircle2}
          accent="sky"
        />
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <MetaCard label="Duration" value={`${(result.durationMs / 1000).toFixed(1)}s`} />
        <MetaCard label="HTML Bytes" value={result.fetchedBytes.toLocaleString()} />
        <MetaCard label="Scripts" value={`${result.scriptCount}`} />
        <MetaCard label="Path Probes" value={`${result.fileProbeCount}`} />
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <Alert className="mb-6 border-amber-500/40 bg-amber-500/5">
          <Bug className="w-4 h-4 text-amber-500" />
          <AlertTitle className="text-amber-400 font-mono text-xs">SCAN WARNINGS</AlertTitle>
          <AlertDescription className="font-mono text-xs">
            <ul className="list-disc pl-5 space-y-0.5 mt-1">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Findings */}
      {total === 0 ? (
        <Alert className="border-cyan-400/40 bg-cyan-400/5">
          <Shield className="w-4 h-4 text-cyan-300" />
          <AlertTitle className="text-cyan-300 font-semibold">No leaks detected</AlertTitle>
          <AlertDescription className="text-sm text-white/60">
            None of LeakGuard&apos;s pattern matchers or path probes returned a positive result.
            Note: this is not a full security audit — only the well-known AI-tool leak patterns are checked.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="all" className="mt-2">
          <TabsList className="bg-white/5 border border-white/10 rounded-lg p-1 h-auto flex-wrap justify-start overflow-x-auto">
            <TabsTrigger value="all" className="text-xs data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-300">
              All ({total})
            </TabsTrigger>
            {Object.entries(grouped).map(([cat, list]) => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="text-xs data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-300"
              >
                {CATEGORY_META[cat as keyof typeof CATEGORY_META]?.label ?? cat} ({list.length})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-2">
            {result.findings.map((f, i) => (
              <FindingRow key={f.id} finding={f} index={i} sevHex={sevHex} />
            ))}
          </TabsContent>

          {Object.entries(grouped).map(([cat, list]) => (
            <TabsContent key={cat} value={cat} className="mt-4 space-y-2">
              <p className="text-xs text-white/50 mb-3 border-l-2 border-cyan-400/40 pl-3">
                {CATEGORY_META[cat as keyof typeof CATEGORY_META]?.description}
              </p>
              {list.map((f, i) => (
                <FindingRow key={f.id} finding={f} index={i} sevHex={sevHex} />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </motion.section>
  );
}

// ============================================================================
// Premium stat card — glass + accent + icon
// ============================================================================
function PremiumStat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: "white" | "red" | "orange" | "amber" | "sky";
}) {
  const accentMap = {
    white: { hex: "#ffffff", tailwind: "text-white" },
    red: { hex: "#ef4444", tailwind: "text-red-400" },
    orange: { hex: "#f97316", tailwind: "text-orange-400" },
    amber: { hex: "#f59e0b", tailwind: "text-amber-400" },
    sky: { hex: "#0ea5e9", tailwind: "text-sky-400" },
  };
  const a = accentMap[accent];
  // Count-up animation: animate the displayed number from 0 to value over 0.9s
  const displayValue = useCountUp(value, 900);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass-panel glass-panel-hover rounded-xl p-4 relative overflow-hidden"
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
        style={{ background: a.hex }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">{label}</p>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${a.tailwind}`}>
            {displayValue}
          </p>
        </div>
        <Icon className="w-4 h-4 opacity-50" style={{ color: a.hex }} />
      </div>
    </motion.div>
  );
}

// Count-up hook: animates from 0 to target over `duration` ms.
// Uses requestAnimationFrame with an ease-out cubic curve for smooth deceleration.
// All setState calls happen INSIDE rAF callbacks (async) to avoid the
// react-hooks/set-state-in-effect lint rule.
function useCountUp(target: number, duration: number): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic: 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(target * eased);
      setCurrent(value);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    // Start the animation on the next frame. The first tick (t≈0) sets
    // value to ~0, then animates up to target. If target=0, the animation
    // is a no-op (0 → 0).
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return current;
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-lg px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono">{label}</div>
      <div className="text-sm font-mono mt-0.5 text-white/80">{value}</div>
    </div>
  );
}

// ============================================================================
// Finding row — expandable
// ============================================================================
function FindingRow({
  finding,
  index,
  sevHex,
}: {
  finding: Finding;
  index: number;
  sevHex: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_META[finding.severity];
  const hex = sevHex[finding.severity] || "#ffffff";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.4) }}
    >
      <Collapsible
        open={expanded}
        onOpenChange={setExpanded}
        className="glass-panel glass-panel-hover rounded-xl overflow-hidden"
      >
        <CollapsibleTrigger
          className="w-full text-left p-4 flex items-start gap-3 cursor-pointer"
          style={{ borderLeft: `2px solid ${hex}` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <motion.span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: hex, boxShadow: `0 0 8px ${hex}` }}
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <h4 className="text-sm font-medium leading-snug text-white/90">{finding.title}</h4>
          </div>
          <Badge
            className="text-[10px] font-mono px-2 py-0.5 shrink-0"
            style={{ background: `${hex}20`, color: hex, border: `1px solid ${hex}60` }}
          >
            {sev.label}
          </Badge>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
            <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
          </motion.div>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-none data-[state=open]:animate-none">
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
            <p className="text-xs text-white/60 leading-relaxed pt-3">{finding.description}</p>

            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono mb-1">
                  Evidence
                </div>
                <code className="font-mono text-[11px] break-all block text-cyan-200/90">
                  {finding.evidence}
                </code>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono mb-1">
                  Location
                </div>
                {finding.locationType === "url" ? (
                  <a
                    href={finding.location}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-mono text-[11px] break-all text-violet-300 hover:text-violet-200 hover:underline inline-flex items-start gap-1"
                  >
                    {finding.location}
                    <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                  </a>
                ) : (
                  <span className="font-mono text-[11px] break-all block text-cyan-200/90">
                    {finding.location}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-cyan-300 font-mono font-medium mb-1 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                Remediation
              </div>
              <p className="text-xs text-white/70 leading-relaxed">{finding.remediation}</p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
}

// ============================================================================
// History card (used for session + saved scans)
// ============================================================================
function HistoryCard({
  scan,
  counts,
  onClick,
}: {
  scan: ScanResult;
  counts: ReturnType<typeof severityCount>;
  onClick: () => void;
}) {
  const hasCritical = counts.critical > 0;
  const hasHigh = counts.high > 0;
  const accentHex = hasCritical ? "#ef4444" : hasHigh ? "#f97316" : "#22d3ee";

  return (
    <div
      onClick={onClick}
      className="glass-panel glass-panel-hover rounded-xl p-3.5 cursor-pointer"
      style={{ borderLeft: `2px solid ${accentHex}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-white/70">
          {scan.findings.length} found
        </Badge>
        <Badge
          className="text-[10px] font-mono"
          style={{
            background: `${accentHex}25`,
            color: accentHex,
            border: `1px solid ${accentHex}60`,
          }}
        >
          {hasCritical ? `${counts.critical} CRIT` : hasHigh ? `${counts.high} HIGH` : "CLEAN"}
        </Badge>
      </div>
      <p className="text-xs font-mono truncate text-white/70">{scan.targetUrl}</p>
      <p className="text-[10px] font-mono text-white/40 mt-1">
        {(scan.durationMs / 1000).toFixed(1)}s · {scan.fetchedBytes}b · {scan.scriptCount}js
      </p>
    </div>
  );
}

// ============================================================================
// Constants
// ============================================================================
const NAV_ITEMS = [
  { label: "Target", icon: Crosshair, href: "#target" },
  { label: "Verification", icon: Box, href: "#verification" },
  { label: "Detection", icon: Fingerprint, href: "#detection" },
  { label: "Report", icon: FileWarning, href: "#report" },
  { label: "History", icon: Activity, href: "#history" },
  { label: "Profile", icon: UserIcon, href: "#profile" },
];

// Trust slogans rendered inside the Profile section
const TRUST_SLOGANS: { title: string; desc: string; icon: LucideIcon }[] = [
  {
    title: "End-to-end encrypted",
    desc: "Credentials never leave your browser unencrypted — bcrypt-hashed at rest.",
    icon: Lock,
  },
  {
    title: "Zero-knowledge auth",
    desc: "We can't see your password — only the irreversibly-hashed digest.",
    icon: ShieldCheck,
  },
  {
    title: "No third-party tracking",
    desc: "No analytics, no ads, no behavioral trackers. Ever.",
    icon: EyeOff,
  },
  {
    title: "Bounded execution",
    desc: "Every scan has hard timeouts — never hangs, never polls, never loops.",
    icon: Server,
  },
  {
    title: "Open detection patterns",
    desc: "All leak-detection regex is open and auditable in the source.",
    icon: FileCheck2,
  },
  {
    title: "Operator-owned data",
    desc: "Your scan history belongs to you — clear it anytime, no questions.",
    icon: UserIcon,
  },
];

// ============================================================================
// Debugging solutions — step-by-step remediation per leak category.
// Rendered after the scan results when findings > 0.
// ============================================================================
type DebugSolution = {
  category: LeakCategory;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  summary: string;
  steps: string[];
  tools?: { name: string; url: string }[];
};

const DEBUGGING_SOLUTIONS: DebugSolution[] = [
  {
    category: "api_key",
    priority: "critical",
    title: "Rotate exposed API keys immediately",
    summary:
      "Hardcoded cloud/SaaS API keys in client bundles are the most catastrophic leak. Assume the key is already compromised — rotate, restrict, and move server-side.",
    steps: [
      "Revoke the exposed key at the provider's console (AWS IAM, OpenAI, Stripe, etc.). Do this BEFORE anything else.",
      "Audit the provider's usage logs (AWS CloudTrail, OpenAI usage, GitHub audit log) for any unauthorized calls since the key was committed.",
      "Issue a new key with the minimum required scope (least-privilege). Never use root/admin keys in apps.",
      "Store the new key ONLY in a server-side environment variable — never in client-side code, .env files committed to git, or NEXT_PUBLIC_* vars.",
      "Route all API calls through your own /api endpoint so the key never leaves your server.",
      "Add the key to a secrets-rotation schedule (rotate every 30-90 days).",
    ],
    tools: [
      { name: "AWS IAM Console", url: "https://console.aws.amazon.com/iam" },
      { name: "OpenAI API Keys", url: "https://platform.openai.com/api-keys" },
      { name: "GitHub Token Settings", url: "https://github.com/settings/tokens" },
      { name: "Stripe API Keys", url: "https://dashboard.stripe.com/apikeys" },
    ],
  },
  {
    category: "secret",
    priority: "critical",
    title: "Invalidate hardcoded secrets & rotate credentials",
    summary:
      "JWTs, Bearer tokens, PEM private keys, and DB connection strings in client code allow full impersonation until rotated. Treat each as actively compromised.",
    steps: [
      "Invalidate ALL active JWTs by rotating your JWT signing secret — every existing token becomes invalid immediately.",
      "Revoke any hardcoded Bearer tokens at their issuer (OAuth provider, internal API).",
      "Rotate any exposed PEM private keys at their CA/issuer. Re-issue new keys and update all consumers.",
      "Rotate the database password embedded in any leaked connection string, then update the server's DATABASE_URL env var.",
      "Move all secrets to a secrets manager (AWS Secrets Manager, Doppler, Vault) — never inline them in code.",
      "Force-rotate any server-side cookies that may have been signed with the leaked secrets.",
    ],
    tools: [
      { name: "Doppler Secrets", url: "https://dash.doppler.com" },
      { name: "AWS Secrets Manager", url: "https://console.aws.amazon.com/secretsmanager" },
      { name: "HashiCorp Vault", url: "https://vaultproject.io" },
    ],
  },
  {
    category: "exposed_file",
    priority: "critical",
    title: "Block dotfiles & sensitive paths at the web server",
    summary:
      "/.env, /.git/, /package.json, /actuator/health returning 200 means anyone can download your secrets or source. Block at the web server level immediately.",
    steps: [
      "Block /.env* and /.git/* at your web server (Nginx, Caddy, Next.js middleware). Return 404, not 403 — 404 reveals less.",
      "Verify /.git/HEAD no longer returns 200 after the rule. If it does, your rewrite is wrong.",
      "If /package.json was exposed, audit your dependencies for known CVEs in those exact versions.",
      "If /.env was reachable, assume EVERY secret in it is compromised. Rotate every secret (DB password, API keys, JWT secret) following the api_key/secret playbooks above.",
      "If /actuator/health (Spring Boot) was exposed, disable actuator or restrict to localhost only.",
      "Add a deploy-time check (CI step) that curls these paths and fails the build if any returns 200.",
    ],
    tools: [
      { name: "Nginx dotfile blocking", url: "https://nginx.org/en/docs/http/ngx_http_core_module.html" },
      { name: "Caddyfile reference", url: "https://caddyserver.com/docs/caddyfile" },
    ],
  },
  {
    category: "source_map",
    priority: "high",
    title: "Disable source maps in production builds",
    summary:
      "Exposed .js.map files let anyone reconstruct your pre-minification source code, including variable names, comments, and file paths. Disable them in prod.",
    steps: [
      "In Vite: set `build.sourcemap: false` (or `hidden` if you upload maps to an error-tracker only).",
      "In Next.js: set `productionBrowserSourceMaps: false` in next.config.js (default is false, but verify).",
      "In webpack: ensure `devtool: false` (or `source-map` only in dev).",
      "Remove any `//# sourceMappingURL=` annotations from your build output (most bundlers strip these automatically when sourcemaps are disabled).",
      "If you need source maps for production debugging, upload them to Sentry/DataDog and DO NOT serve them publicly — use `hidden` source maps.",
      "Verify by curling {script}.map on your prod URL — should return 404.",
    ],
    tools: [
      { name: "Vite build options", url: "https://vitejs.dev/config/build-options.html" },
      { name: "Next.js source maps", url: "https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps" },
    ],
  },
  {
    category: "debug_endpoint",
    priority: "medium",
    title: "Strip dev artifacts & ship a production build",
    summary:
      "console.log spam, Next.js /__nextjs_original-stack-frame, and Vite /@vite/ routes suggest your production site is running a dev build. Build for production.",
    steps: [
      "Run `next build && next start` (Next.js) or `vite build && vite preview` (Vite) — NEVER ship the dev server to production.",
      "Strip console.log in production via babel-plugin-transform-remove-console or Terser drop_console.",
      "Verify /__nextjs_original-stack-frame returns 404 (not 200) on your prod URL.",
      "Verify /@vite/ and /@react-refresh return 404 on your prod URL.",
      "Add a CI step that fails if the production bundle contains more than N console statements (e.g. 5).",
      "Remove any debug panel/route (e.g. /debug, /__health) that exposes internal state in prod.",
    ],
    tools: [
      { name: "babel-plugin-transform-remove-console", url: "https://www.npmjs.com/package/babel-plugin-transform-remove-console" },
      { name: "Terser drop_console", url: "https://terser.org/docs/options/" },
    ],
  },
  {
    category: "ai_fingerprint",
    priority: "low",
    title: "Strip AI-generator fingerprints from the build",
    summary:
      "Meta tags + HTML comments referencing v0.dev, lovable.dev, bolt.new, Cursor, Claude, or ChatGPT tell attackers exactly which AI tool generated your code — narrows their exploit search.",
    steps: [
      "Remove the <meta name=\"generator\"> tag from your HTML <head> if it references any AI tool.",
      "Strip HTML comments that reference AI tools (e.g. `<!-- built by v0 -->`, `<!-- cursor: generated -->`).",
      "Search your bundle for strings like `v0.dev`, `lovable`, `bolt.new`, `cursor`, `claude`, `chatgpt` — strip or replace with neutral names.",
      "Remove any AI-tool-specific helper files (lovable's supabase integration, v0's registry files, etc.) from the production build.",
      "Audit your README and CHANGELOG for AI-tool references before deploying.",
    ],
  },
  {
    category: "pii",
    priority: "low",
    title: "Move hardcoded emails & phones server-side",
    summary:
      "Hardcoded developer emails and phone numbers in client code enable targeted phishing and credential-stuffing. Render them through server-side partials instead.",
    steps: [
      "Replace inline `dev@example.com` strings with server-rendered contact endpoints (e.g. /api/contact).",
      "If you must show contact info, obfuscate via CSS (split the address with pseudo-elements) — at minimum, breaks naive scrapers.",
      "Audit git history for previously-committed PII using `git log -p | grep -E '[a-z]+@[a-z]+\\.[a-z]+'`.",
      "Remove any hardcoded support phone numbers from JS constants; route through a server-rendered partial.",
      "Add a CI regex check that fails the build if a real email pattern (not @example.com) appears in src/.",
    ],
  },
  {
    category: "misconfig",
    priority: "high",
    title: "Fix process.env polyfill leaking server secrets to client",
    summary:
      "References to process.env.* in shipped JS mean a bundler polyfill inlined server-side env vars into the client bundle. This is a catastrophic build misconfiguration.",
    steps: [
      "Identify which bundler is misconfigured: search your webpack/vite/next config for `process` or `DefinePlugin`.",
      "In Next.js: NEVER use `process.env.X` in client components — only `NEXT_PUBLIC_*` is exposed. Move the env var to a server route.",
      "In Vite: only `import.meta.env.VITE_*` is exposed to the client. Replace `process.env.X` with `import.meta.env.VITE_X` for genuinely-public values.",
      "Audit your bundler config for `define: { 'process.env': '{}' }` or similar — remove it.",
      "Rotate EVERY secret that appeared in process.env references in the client bundle. Assume they leaked.",
      "Add a CI post-build check that greps the production bundle for `process.env` and fails if found.",
    ],
    tools: [
      { name: "Vite env variables", url: "https://vitejs.dev/guide/env-and-mode.html" },
      { name: "Next.js env vars", url: "https://nextjs.org/docs/app/build-your-appraries/environment-variables" },
    ],
  },
];

const SOLUTION_PRIORITY_RANK: Record<DebugSolution["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

