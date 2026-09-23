"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
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
import type { ScanResult, Finding } from "@/lib/leak-scanner";
import { SEVERITY_META, CATEGORY_META, severityCount } from "@/lib/leak-ui";
import { AuthButton } from "@/components/auth/auth-button";

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

  // Live UTC clock
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const refreshSaved = useCallback(async () => {
    if (!session?.user) {
      setSavedScans([]);
      return;
    }
    setLoadingSaved(true);
    try {
      const res = await fetch("/api/scans", { method: "GET" });
      const data = await res.json();
      if (data.ok) setSavedScans(data.scans);
    } catch {
      // ignore
    } finally {
      setLoadingSaved(false);
    }
  }, [session]);

  useEffect(() => {
    refreshSaved();
  }, [refreshSaved]);

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

    // Bounded 6-stage progression (finite timeouts — not a polling loop)
    const stageTimers: ReturnType<typeof setTimeout>[] = [];
    // Stages 1..5 fire at intervals; stage 6 (complete) fires when response arrives
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
    <div className="min-h-screen flex bg-background text-foreground relative">
      {/* 3D wireframe + grid + scanline background */}
      <div className="fixed inset-0 -z-10 pointer-events-none noise-overlay">
        <div className="absolute inset-0 bg-grid-fine scanline-overlay opacity-60" />
        <BackgroundScene />
      </div>

      {/* ============ SIDEBAR (desktop + tablet) ============ */}
      <aside className="hidden md:flex w-[68px] lg:w-[240px] shrink-0 sticky top-0 h-screen flex-col border-r border-white/5 bg-black/40 backdrop-blur-xl">
        <SidebarContent clock={clock} session={session} />
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
      <main className="flex-1 min-w-0 relative">
        {/* Top status strip (desktop only) */}
        <div className="hidden md:block border-b border-white/5 bg-black/30 backdrop-blur-md">
          <div className="px-6 py-2.5 flex items-center justify-between gap-3 text-[10px] font-mono">
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

        <div className="px-4 md:px-8 lg:px-12 py-8 md:py-12 max-w-7xl mx-auto pt-20 md:pt-12">
          {/* ===== HERO ===== */}
          <section className="mb-12 md:mb-16">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/5 text-cyan-300 text-[10px] font-mono mb-6 tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                BOUNDED · NO LOOPS · NO POLLING
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.05] mb-4">
                <span className="text-white">Find every exposed</span>
                <br />
                <span className="text-gradient-cyan-violet">secret.</span>
                <span className="text-white/50"> Before attackers do.</span>
              </h1>
              <p className="text-sm md:text-base text-white/50 max-w-xl mx-auto leading-relaxed">
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
              className="glass-panel glass-panel-hover rounded-2xl p-2 flex flex-col sm:flex-row gap-2 max-w-2xl mx-auto"
            >
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="pl-11 h-12 bg-transparent border-0 focus-visible:ring-0 font-mono text-sm placeholder:text-white/30"
                  disabled={scanning}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button
                type="submit"
                disabled={scanning}
                className="h-12 px-6 bg-white hover:bg-white/90 text-black font-semibold tracking-tight shadow-[0_0_30px_-8px_rgba(255,255,255,0.4)]"
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
          </section>

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
          <section className="mb-12 md:mb-16">
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
              <div className="relative h-[400px] sm:h-[500px] lg:h-[600px]">
                <LeakGuardScene />
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
          <section className="mb-12 md:mb-16">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Detection Matrix</h2>
                <p className="text-sm text-white/50 mt-1">
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
          </section>

          {/* ===== SCAN RESULTS ===== */}
          {result && !scanning && (
            <ResultDashboard result={result} onExport={exportJson} onClear={clearResults} />
          )}

          {/* ===== SAVED SCANS (logged in) ===== */}
          {session?.user && (
            <section className="mt-12">
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
            </section>
          )}

          {/* ===== SESSION HISTORY ===== */}
          {sessionHistory.length > 0 && !scanning && (
            <section className="mt-12">
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
            </section>
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
      </main>
    </div>
  );
}

// ============================================================================
// Sidebar content (shared by desktop + tablet)
// ============================================================================
function SidebarContent({ clock, session }: { clock: string; session: any }) {
  return (
    <>
      {/* Logo */}
      <div className="px-4 lg:px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <motion.div
            initial={{ rotate: -8, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-9 h-9 rounded-xl border border-cyan-400/40 bg-cyan-400/5 flex items-center justify-center shrink-0"
          >
            <ShieldAlert className="w-4 h-4 text-cyan-300" />
          </motion.div>
          <div className="hidden lg:block">
            <h1 className="text-sm font-bold tracking-tight leading-none">
              <span className="text-white">LEAK</span>
              <span className="text-cyan-300">GUARD</span>
            </h1>
            <p className="text-[9px] text-white/40 mt-1 font-mono uppercase tracking-[0.2em]">
              AI Security Scanner
            </p>
          </div>
        </div>
      </div>

      {/* Status block */}
      <div className="px-4 lg:px-5 py-4 border-b border-white/5 space-y-2">
        <StatusRow icon={Wifi} label="SYS" value="ONLINE" color="text-cyan-300" pulse />
        <StatusRow label="UTC" value={clock || "--:--:--"} mono />
        <StatusRow icon={Signal} label="CHN" value="STABLE" />
      </div>

      {/* Nav */}
      <nav className="px-3 lg:px-3 py-4 flex-1 space-y-0.5">
        <p className="hidden lg:block text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 px-2 mb-2">
          Sections
        </p>
        {NAV_ITEMS.map((n) => (
          <a
            key={n.label}
            href={n.href}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-white/60 hover:bg-white/5 hover:text-white transition group"
          >
            <n.icon className="w-4 h-4 text-white/40 group-hover:text-cyan-300 shrink-0" />
            <span className="hidden lg:block flex-1 font-medium">{n.label}</span>
            <ChevronRight className="hidden lg:block w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
          </a>
        ))}
      </nav>

      {/* Operator */}
      <div className="px-3 lg:px-3 py-3 border-t border-white/5">
        <p className="hidden lg:block text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 px-2 mb-2">
          Operator
        </p>
        <AuthButton />
      </div>

      {/* Footer */}
      <div className="px-4 lg:px-5 py-3 border-t border-white/5 text-[9px] font-mono text-white/30 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <CircuitBoard className="w-2.5 h-2.5" />
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
    <div className="flex items-center justify-between text-[10px] font-mono">
      <span className="text-white/40 uppercase tracking-wider flex items-center gap-1.5">
        {Icon && <Icon className="w-2.5 h-2.5" />}
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
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
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
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="glass-panel glass-panel-hover rounded-xl p-4 relative overflow-hidden"
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
        style={{ background: a.hex }}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">{label}</p>
          <motion.p
            key={value}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-2xl font-bold tabular-nums mt-1 ${a.tailwind}`}
          >
            {value}
          </motion.p>
        </div>
        <Icon className="w-4 h-4 opacity-50" style={{ color: a.hex }} />
      </div>
    </motion.div>
  );
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
  { label: "Target", icon: Crosshair, href: "#" },
  { label: "Verification", icon: Box, href: "#verification" },
  { label: "Detection", icon: Fingerprint, href: "#detection" },
  { label: "Report", icon: FileWarning, href: "#report" },
  { label: "History", icon: Activity, href: "#history" },
];
