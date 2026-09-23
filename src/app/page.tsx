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
  Terminal,
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
  Box,
  ScanLine,
  Crosshair,
  Layers,
  CircuitBoard,
  Wifi,
  Signal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { ScanResult, Finding } from "@/lib/leak-scanner";
import { SEVERITY_META, CATEGORY_META, severityCount } from "@/lib/leak-ui";
import { AuthButton } from "@/components/auth/auth-button";

// Heavy 3D scene — load client-side only
const LeakGuardScene = dynamic(
  () => import("@/components/three/leak-guard-scene").then((m) => m.LeakGuardScene),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] flex items-center justify-center text-neutral-500 font-mono text-xs">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Initializing 3D scanner…
      </div>
    ),
  }
);

// Background 3D scene — also client-side only
const BackgroundScene = dynamic(
  () => import("@/components/three/background-scene").then((m) => m.BackgroundScene),
  { ssr: false }
);

const SCANNER_STAGES = [
  { label: "Validating target URL", icon: Globe },
  { label: "Fetching HTML (15s timeout)", icon: Download },
  { label: "Scanning HTML for secrets", icon: Search },
  { label: "Extracting <script> URLs (cap 20)", icon: FileWarning },
  { label: "Fetching each script (10s each, cap 600KB)", icon: Cpu },
  { label: "Probing .map files", icon: Map },
  { label: "Probing 12 well-known leak paths", icon: Database },
  { label: "Scoring & ranking findings", icon: Activity },
];

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

  // Live UTC clock for HUD feel
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

    const stageTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < SCANNER_STAGES.length; i++) {
      stageTimers.push(setTimeout(() => setStage(i), i * 1100));
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data: ScanResult = await res.json();
      for (const t of stageTimers) clearTimeout(t);
      setStage(SCANNER_STAGES.length);

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

  // ---------- Layout: sidebar + main ----------
  return (
    <div className="min-h-screen flex bg-background text-foreground relative">
      {/* Fixed 3D wireframe background (always visible) */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid scanline opacity-50" />
        <BackgroundScene />
      </div>

      {/* ============== SIDEBAR (fixed left) ============== */}
      <aside className="w-[240px] shrink-0 border-r border-neutral-800/60 bg-black/70 backdrop-blur-md sticky top-0 h-screen flex flex-col">
        {/* Logo / system title */}
        <div className="px-4 py-5 border-b border-neutral-800/60">
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ rotate: -8, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="w-8 h-8 border border-neutral-400/60 bg-neutral-100/5 flex items-center justify-center"
            >
              <ShieldAlert className="w-4 h-4 text-neutral-200" />
            </motion.div>
            <div>
              <h1 className="text-sm font-mono font-semibold tracking-tight leading-none">
                <span className="text-white text-glow-white">LEAK</span>
                <span className="text-neutral-400">GUARD</span>
              </h1>
              <p className="text-[9px] text-neutral-500 mt-1 font-mono uppercase tracking-[0.2em]">
                v1.0 // OP-CONSOLE
              </p>
            </div>
          </div>
        </div>

        {/* Status block */}
        <div className="px-4 py-4 border-b border-neutral-800/60 space-y-2.5">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-neutral-500 uppercase tracking-wider">SYS</span>
            <span className="flex items-center gap-1.5 text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-200 animate-pulse" />
              ONLINE
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-neutral-500 uppercase tracking-wider">UTC</span>
            <span className="text-neutral-300 tabular-nums">{clock || "--:--:--"}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-neutral-500 uppercase tracking-wider">CHN</span>
            <span className="flex items-center gap-1.5 text-neutral-300">
              <Wifi className="w-2.5 h-2.5" />
              STABLE
            </span>
          </div>
        </div>

        {/* Nav (single-page, just indicators) */}
        <nav className="px-2 py-4 flex-1 space-y-0.5">
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-neutral-600 px-2 mb-2">
            {"// MODULES"}
          </p>
          {NAV_ITEMS.map((n) => (
            <a
              key={n.label}
              href={n.href}
              className="flex items-center gap-2.5 px-2.5 py-2 text-xs font-mono text-neutral-400 hover:bg-neutral-100/5 hover:text-neutral-100 transition group"
            >
              <n.icon className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-200" />
              <span className="flex-1">{n.label}</span>
              <ChevronRight className="w-3 h-3 opacity-30 group-hover:opacity-100" />
            </a>
          ))}
        </nav>

        {/* Operator block */}
        <div className="px-3 py-3 border-t border-neutral-800/60">
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-neutral-600 px-1 mb-2">
            {"// OPERATOR"}
          </p>
          <AuthButton />
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-neutral-800/60 text-[9px] font-mono text-neutral-600 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <CircuitBoard className="w-2.5 h-2.5" />
            BOUNDED // NO-LOOP
          </span>
          <span>v1.0</span>
        </div>
      </aside>

      {/* ============== MAIN CONTENT ============== */}
      <main className="flex-1 min-w-0 relative">
        {/* Top status strip */}
        <div className="border-b border-neutral-800/60 bg-black/40 backdrop-blur-sm">
          <div className="px-6 py-2 flex items-center justify-between gap-3 text-[10px] font-mono">
            <div className="flex items-center gap-4 text-neutral-500">
              <span className="flex items-center gap-1.5">
                <Crosshair className="w-3 h-3" />
                TARGET: <span className="text-neutral-300">{result?.targetUrl ?? "—"}</span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                FINDINGS: <span className="text-neutral-300 tabular-nums">{result?.findings.length ?? 0}</span>
              </span>
              <span className="hidden md:flex items-center gap-1.5">
                <Signal className="w-3 h-3" />
                STATUS: <span className="text-neutral-300">{scanning ? "SCANNING" : result ? "DONE" : "IDLE"}</span>
              </span>
            </div>
            <div className="text-neutral-600">
              {session?.user ? `OP: ${session.user.email}` : "GUEST"}
            </div>
          </div>
        </div>

        <div className="px-6 py-8 max-w-6xl">
          {/* ===== HERO (asymmetric: large input left, status panel right) ===== */}
          <section className="mb-8 grid lg:grid-cols-[1.6fr_1fr] gap-4">
            {/* Hero input panel */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="hud-card hud-brackets-bottom p-6 relative"
            >
              <div className="absolute top-2 right-3 text-[9px] font-mono text-neutral-600 tracking-wider">
                MODULE_01 // TARGET_INPUT
              </div>
              <h2 className="text-2xl md:text-3xl font-mono font-bold tracking-tight leading-tight mb-3">
                <span className="text-neutral-200">Find every</span>{" "}
                <span className="text-white text-glow-white">leaked secret</span>
                <br />
                <span className="text-neutral-200">in AI-built websites</span>
              </h2>
              <p className="text-xs text-neutral-500 mb-5 max-w-md leading-relaxed">
                Drop a URL. LeakGuard fetches the HTML, follows up to 20 scripts, probes 12 leak
                paths, and surfaces API keys, source maps, and AI fingerprints — in one bounded request.
              </p>

              <form onSubmit={runScan} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-neutral-500 text-sm pointer-events-none">
                    $
                  </span>
                  <Input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="scan https://example.com"
                    className="pl-7 font-mono text-sm h-11 bg-black/70 border-neutral-700 focus-visible:border-neutral-400 focus-visible:ring-neutral-400/20"
                    disabled={scanning}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={scanning}
                  className="h-11 bg-white hover:bg-neutral-200 text-black font-mono font-semibold border border-neutral-300 shadow-[0_0_20px_-8px_rgba(220,220,220,0.55)]"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      SCANNING
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      EXECUTE
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-600">
                <span className="text-neutral-500">try:</span>
                {["https://httpbin.org", "https://example.com"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setUrl(t)}
                    disabled={scanning}
                    className="px-2 py-0.5 border border-neutral-700 bg-neutral-100/5 text-neutral-300 hover:bg-neutral-100/10 hover:border-neutral-500 transition disabled:opacity-50"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Side panel — quick stats */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="hud-card hud-brackets-bottom p-5 flex flex-col justify-between"
            >
              <div className="absolute top-2 right-3 text-[9px] font-mono text-neutral-600 tracking-wider">
                MODULE_02 // TELEMETRY
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 mb-3 uppercase tracking-wider">
                  <Zap className="w-3 h-3" />
                  Bounded // No loops
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="MAX SCRIPTS" value="20" />
                  <Stat label="MAX JS BYTES" value="600K" />
                  <Stat label="PATH PROBES" value="12" />
                  <Stat label="TIMEOUT" value="15s" />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-neutral-800/60">
                <p className="text-[10px] font-mono text-neutral-500 leading-relaxed">
                  Every fetch has a hard timeout. Every loop iterates over a capped array. The
                  scan finishes in under 60 seconds.
                </p>
              </div>
            </motion.div>
          </section>

          {/* ===== Scanning radar (during scan) ===== */}
          {scanning && (
            <section className="mb-8">
              <div className="hud-card hud-brackets-bottom p-5">
                <div className="grid md:grid-cols-[220px_1fr] gap-5 items-center">
                  <ScanRadar />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-300" />
                      <h3 className="font-mono text-sm text-neutral-200 tracking-wider">
                        SCAN IN PROGRESS
                      </h3>
                    </div>
                    <ol className="space-y-1 text-sm">
                      {SCANNER_STAGES.map((s, i) => {
                        const done = i < stage;
                        const active = i === stage;
                        const Icon = s.icon;
                        return (
                          <li
                            key={s.label}
                            className={`flex items-center gap-2 font-mono text-xs ${
                              done
                                ? "text-neutral-200"
                                : active
                                ? "text-neutral-100"
                                : "text-neutral-700"
                            }`}
                          >
                            <span
                              className={`w-5 h-5 flex items-center justify-center text-[9px] ${
                                done
                                  ? "bg-white text-black"
                                  : active
                                  ? "bg-neutral-200/20 text-neutral-100 border border-neutral-400/40"
                                  : "bg-neutral-900 text-neutral-700"
                              }`}
                            >
                              {done ? "✓" : i + 1}
                            </span>
                            <Icon className={`w-3 h-3 ${done || active ? "text-neutral-200" : ""}`} />
                            {s.label}
                            {active && <span className="animate-blink text-neutral-200">▌</span>}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ===== 3D Verification section ===== */}
          <section className="mb-8">
            <div className="hud-card hud-brackets-bottom overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 border border-neutral-600 bg-neutral-100/5 flex items-center justify-center">
                    <Box className="w-3.5 h-3.5 text-neutral-300" />
                  </div>
                  <div>
                    <h3 className="font-mono text-xs text-neutral-200 tracking-wider">
                      MODULE_03 // VERIFICATION CONSTELLATION
                    </h3>
                    <p className="text-[10px] font-mono text-neutral-500">
                      Interactive 3D map of LeakGuard&apos;s detection surface
                    </p>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-neutral-600 hidden sm:block">
                  WEBGL · THREE.JS · R3F
                </div>
              </div>
              <div className="grid lg:grid-cols-[1fr_300px]">
                <div className="relative h-[420px] sm:h-[460px] border-b lg:border-b-0 lg:border-r border-neutral-800/60">
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 border border-neutral-700 bg-black/70 text-[10px] font-mono text-neutral-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-200 animate-pulse" />
                    LIVE · DRAG TO ORBIT
                  </div>
                  <div className="absolute bottom-3 right-3 z-10 text-[10px] font-mono text-neutral-600">
                    3D · CONSTELLATION
                  </div>
                  <LeakGuardScene />
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ScanLine className="w-3.5 h-3.5 text-neutral-300" />
                      <h4 className="text-xs font-mono font-semibold text-neutral-200 tracking-wider uppercase">
                        What LeakGuard verifies
                      </h4>
                    </div>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      The 3D constellation maps every capability to a unique orbiting model: key
                      for API keys, lock for secrets, fingerprint for AI-tool traces, document for
                      exposed files, pyramid for source maps, avatar for PII, bug for debug routes,
                      gear for misconfig. Six scan rays fire from the glowing core on every scan.
                    </p>
                  </div>

                  <ul className="space-y-2">
                    {VERIFICATION_POINTS.map((p, i) => (
                      <motion.li
                        key={p.title}
                        initial={{ opacity: 0, x: -6 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.06 }}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span className="w-5 h-5 flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5 border border-neutral-700 bg-neutral-100/5 text-neutral-300">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <span className="font-mono font-medium text-neutral-200">{p.title}</span>
                          <span className="text-neutral-500 block mt-0.5 leading-snug">{p.desc}</span>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* ===== Result ===== */}
          {result && !scanning && (
            <ResultView result={result} onExport={exportJson} onClear={clearResults} />
          )}

          {/* ===== Saved scans (logged in) ===== */}
          {session?.user && (
            <section className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-mono text-neutral-300 flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  SAVED SCANS <span className="text-neutral-600">({savedScans.length})</span>
                </h3>
                {savedScans.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearSavedScans} className="text-xs text-neutral-500 hover:text-red-400">
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear all
                  </Button>
                )}
              </div>
              {loadingSaved ? (
                <div className="text-xs font-mono text-neutral-500">Loading…</div>
              ) : savedScans.length === 0 ? (
                <div className="hud-card hud-brackets-bottom p-5 text-center border-dashed border-neutral-800">
                  <p className="text-xs font-mono text-neutral-500">
                    No saved scans yet. Run a scan while logged in to persist it here.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {savedScans.slice(0, 9).map((s, i) => {
                    const counts = severityCount(s.findings);
                    return (
                      <div
                        key={i}
                        className="hud-card hud-brackets-bottom p-3 cursor-pointer hover:border-neutral-500 transition"
                        onClick={() => {
                          setResult(s);
                          setStage(SCANNER_STAGES.length);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-[10px] font-mono border-neutral-700 text-neutral-300">
                            {s.findings.length} found
                          </Badge>
                          <Badge
                            className={`text-[10px] font-mono ${
                              counts.critical > 0
                                ? "bg-red-500/90 text-white"
                                : counts.high > 0
                                ? "bg-orange-500/90 text-white"
                                : "bg-neutral-200 text-black"
                            }`}
                          >
                            {counts.critical > 0
                              ? `${counts.critical} CRIT`
                              : counts.high > 0
                              ? `${counts.high} HIGH`
                              : "CLEAN"}
                          </Badge>
                        </div>
                        <p className="text-[11px] font-mono truncate text-neutral-400">{s.targetUrl}</p>
                        <p className="text-[10px] font-mono text-neutral-600 mt-1">
                          {(s.durationMs / 1000).toFixed(1)}s · {s.fetchedBytes}b · {s.scriptCount}js
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ===== Session history ===== */}
          {sessionHistory.length > 0 && !scanning && (
            <section className="mt-8">
              <h3 className="text-sm font-mono text-neutral-300 flex items-center gap-2 mb-3">
                <Activity className="w-3.5 h-3.5" />
                SESSION LOG <span className="text-neutral-600">({sessionHistory.length})</span>
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {sessionHistory.map((h, i) => {
                  const counts = severityCount(h.findings);
                  return (
                    <div
                      key={i}
                      className="hud-card hud-brackets-bottom p-3 cursor-pointer hover:border-neutral-500 transition"
                      onClick={() => {
                        setResult(h);
                        setStage(SCANNER_STAGES.length);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-[10px] font-mono border-neutral-700 text-neutral-300">
                          {h.findings.length} found
                        </Badge>
                        <Badge
                          className={`text-[10px] font-mono ${
                            counts.critical > 0
                              ? "bg-red-500/90 text-white"
                              : counts.high > 0
                              ? "bg-orange-500/90 text-white"
                              : "bg-neutral-200 text-black"
                          }`}
                        >
                          {counts.critical > 0
                            ? `${counts.critical} CRIT`
                            : counts.high > 0
                            ? `${counts.high} HIGH`
                            : "CLEAN"}
                        </Badge>
                      </div>
                      <p className="text-[11px] font-mono truncate text-neutral-400">{h.targetUrl}</p>
                      <p className="text-[10px] font-mono text-neutral-600 mt-1">
                        {(h.durationMs / 1000).toFixed(1)}s · {h.fetchedBytes}b · {h.scriptCount}js
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ===== Empty state ===== */}
          {!result && !scanning && sessionHistory.length === 0 && (
            <section className="mt-6">
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                {FEATURE_CARDS.map((c, i) => (
                  <motion.div
                    key={c.title}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                  >
                    <div className="hud-card hud-brackets-bottom p-4 hover:border-neutral-500 transition h-full">
                      <div className="w-8 h-8 border border-neutral-700 bg-neutral-100/5 flex items-center justify-center mb-2">
                        <c.icon className="w-3.5 h-3.5 text-neutral-300" />
                      </div>
                      <h4 className="text-xs font-mono text-neutral-200 tracking-wider">
                        {c.title}
                      </h4>
                      <p className="text-xs text-neutral-500 mt-1 leading-snug">{c.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mb-3 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-neutral-300" />
                <h3 className="text-sm font-mono text-neutral-300">DETECTION MATRIX</h3>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {Object.entries(CATEGORY_META).map(([k, v], i) => {
                  const Icon = CATEGORY_ICONS[k as keyof typeof CATEGORY_ICONS] ?? Bug;
                  return (
                    <motion.div
                      key={k}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 * i }}
                      className="hud-card hud-brackets-bottom p-3 hover:border-neutral-500 transition group"
                    >
                      <Icon className="w-3.5 h-3.5 text-neutral-300 mb-2 group-hover:scale-110 transition" />
                      <div className="text-xs font-mono font-medium text-neutral-200">{v.label}</div>
                      <div className="text-[10px] text-neutral-500 mt-1 leading-snug">
                        {v.description}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Footer strip */}
        <footer className="border-t border-neutral-800/60 bg-black/40 backdrop-blur-sm mt-10">
          <div className="px-6 py-3 flex flex-col sm:flex-row justify-between gap-2 text-[10px] font-mono text-neutral-600">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-pulse" />
              LEAKGUARD // OP-CONSOLE // BOUNDED SCANNER
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

// ---------- Matrix rain removed — replaced by 3D wireframe background ----------

// ---------- Scan radar (during scan) ----------
function ScanRadar() {
  return (
    <div className="relative w-[220px] h-[220px] mx-auto">
      <div className="absolute inset-0 border border-neutral-700" />
      <div className="absolute inset-5 border border-neutral-800" />
      <div className="absolute inset-10 border border-neutral-800/60" />
      <div className="absolute inset-[60px] border border-neutral-800/40" />

      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-700/40 -translate-x-1/2" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-neutral-700/40 -translate-y-1/2" />

      <div
        className="absolute inset-0 animate-scan-sweep"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(220,220,220,0.4) 30deg, transparent 60deg, transparent 360deg)",
          maskImage: "radial-gradient(circle, transparent 30%, black 30%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 30%, black 30%)",
        }}
      />

      <motion.div
        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.8, repeat: Infinity }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-neutral-100 shadow-[0_0_20px_4px_rgba(220,220,220,0.7)]"
      />

      {[
        { x: "30%", y: "25%", d: 0 },
        { x: "70%", y: "40%", d: 0.4 },
        { x: "55%", y: "70%", d: 0.8 },
        { x: "20%", y: "60%", d: 1.2 },
        { x: "80%", y: "75%", d: 1.6 },
      ].map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-neutral-300"
          style={{ left: p.x, top: p.y }}
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: p.d }}
        />
      ))}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <Radar className="w-6 h-6 text-neutral-500/30" />
      </div>
    </div>
  );
}

// ---------- Result view ----------
function ResultView({
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="hud-card hud-brackets-bottom mb-6">
        <div className="px-5 py-3 border-b border-neutral-800/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-neutral-300" />
              <h3 className="font-mono text-xs text-neutral-200 tracking-wider">
                MODULE_04 // SCAN_REPORT
              </h3>
            </div>
            <p className="mt-1.5 font-mono text-xs break-all">
              <span className="text-neutral-500">$ target:</span>{" "}
              <span className="text-neutral-200">{result.targetUrl}</span>
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onExport} disabled={total === 0}
              className="font-mono text-xs border-neutral-700 text-neutral-300 hover:bg-neutral-100/5">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear} className="font-mono text-xs text-neutral-500">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              CLEAR
            </Button>
          </div>
        </div>

        <div className="p-5">
          {/* Severity stacked bar */}
          {total > 0 && (
            <div className="mb-4">
              <div className="flex h-1.5 overflow-hidden bg-neutral-900">
                {severities.map((s) =>
                  counts[s] > 0 ? (
                    <motion.div
                      key={s}
                      className={`${sevColors[s]}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(counts[s] / total) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <Stat label="TOTAL" value={total} tone="bg-neutral-100/10 border border-neutral-700 text-neutral-200" />
            <Stat label="CRITICAL" value={counts.critical} tone="bg-red-500/15 border border-red-500/40 text-red-300" />
            <Stat label="HIGH" value={counts.high} tone="bg-orange-500/15 border border-orange-500/40 text-orange-300" />
            <Stat label="MEDIUM" value={counts.medium} tone="bg-amber-500/15 border border-amber-500/40 text-amber-300" />
            <Stat label="LOW/INFO" value={counts.low + counts.info} tone="bg-sky-500/15 border border-sky-500/40 text-sky-300" />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <Meta label="DURATION" value={`${(result.durationMs / 1000).toFixed(1)}s`} />
            <Meta label="HTML BYTES" value={result.fetchedBytes.toLocaleString()} />
            <Meta label="SCRIPTS" value={`${result.scriptCount}`} />
            <Meta label="PATH PROBES" value={`${result.fileProbeCount}`} />
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <Alert className="mt-4 border-amber-500/40 bg-amber-500/5">
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
            <Alert className="mt-4 border-neutral-500/40 bg-neutral-100/5">
              <Shield className="w-4 h-4 text-neutral-300" />
              <AlertTitle className="text-neutral-200 font-mono text-xs">NO LEAKS DETECTED</AlertTitle>
              <AlertDescription className="font-mono text-xs">
                None of LeakGuard&apos;s pattern matchers or path probes returned a positive result.
                Note: this is not a full security audit — only the well-known AI-tool leak patterns are checked.
              </AlertDescription>
            </Alert>
          ) : (
            <Tabs defaultValue="all" className="mt-5">
              <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap bg-black/40 border border-neutral-800">
                <TabsTrigger value="all" className="font-mono text-xs data-[state=active]:text-neutral-100 data-[state=active]:bg-neutral-100/10">
                  ALL ({total})
                </TabsTrigger>
                {Object.entries(grouped).map(([cat, list]) => (
                  <TabsTrigger
                    key={cat}
                    value={cat}
                    className="font-mono text-xs data-[state=active]:text-neutral-100 data-[state=active]:bg-neutral-100/10"
                  >
                    {CATEGORY_META[cat as keyof typeof CATEGORY_META]?.label ?? cat} ({list.length})
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-4 space-y-3">
                <AnimatePresence>
                  {result.findings.map((f, i) => (
                    <FindingCard key={f.id} finding={f} index={i} />
                  ))}
                </AnimatePresence>
              </TabsContent>

              {Object.entries(grouped).map(([cat, list]) => (
                <TabsContent key={cat} value={cat} className="mt-4 space-y-3">
                  <p className="text-xs text-neutral-500 font-mono mb-2 border-l-2 border-neutral-600 pl-3">
                    {CATEGORY_META[cat as keyof typeof CATEGORY_META]?.description}
                  </p>
                  <AnimatePresence>
                    {list.map((f, i) => (
                      <FindingCard key={f.id} finding={f} index={i} />
                    ))}
                  </AnimatePresence>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`rounded-sm ${tone} px-3 py-2.5 flex items-center justify-between`}
    >
      <span className="text-[10px] font-mono font-medium tracking-wider opacity-80">{label}</span>
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg font-mono font-bold tabular-nums"
      >
        {value}
      </motion.span>
    </motion.div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-800 bg-black/40 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono">{label}</div>
      <div className="text-sm font-mono mt-0.5 text-neutral-200">{value}</div>
    </div>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const sev = SEVERITY_META[finding.severity];
  const sevBorder: Record<string, string> = {
    critical: "border-l-red-500",
    high: "border-l-orange-500",
    medium: "border-l-amber-500",
    low: "border-l-yellow-400",
    info: "border-l-sky-500",
  };
  const sevGlow: Record<string, string> = {
    critical: "hover:shadow-[0_0_25px_-8px_rgba(239,68,68,0.6)]",
    high: "hover:shadow-[0_0_25px_-8px_rgba(249,115,22,0.6)]",
    medium: "hover:shadow-[0_0_25px_-8px_rgba(245,158,11,0.5)]",
    low: "hover:shadow-[0_0_25px_-8px_rgba(250,204,21,0.4)]",
    info: "hover:shadow-[0_0_25px_-8px_rgba(14,165,233,0.5)]",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.5) }}
    >
      <div className={`hud-card border-l-2 ${sevBorder[finding.severity]} border-neutral-800 ${sevGlow[finding.severity]} transition-all hover:border-neutral-600`}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full ${sev.dot} shrink-0 animate-pulse`} />
              <h4 className="font-mono text-sm font-medium leading-snug text-neutral-100">
                {finding.title}
              </h4>
            </div>
            <Badge className={`text-[10px] font-mono px-2 py-0.5 ${sev.badge}`}>
              {sev.label}
            </Badge>
          </div>

          <p className="text-xs text-neutral-500 leading-relaxed mb-3 font-sans">
            {finding.description}
          </p>

          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="bg-black/60 border border-neutral-800 p-2">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono mb-1">
                EVIDENCE
              </div>
              <code className="font-mono text-[11px] break-all block text-neutral-300">
                {finding.evidence}
              </code>
            </div>
            <div className="bg-black/60 border border-neutral-800 p-2">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono mb-1">
                LOCATION
              </div>
              {finding.locationType === "url" ? (
                <a
                  href={finding.location}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-mono text-[11px] break-all text-neutral-300 hover:text-neutral-100 hover:underline inline-flex items-start gap-1"
                >
                  {finding.location}
                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                </a>
              ) : (
                <span className="font-mono text-[11px] break-all block text-neutral-300">
                  {finding.location}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 p-2 border border-neutral-800 bg-neutral-100/5 text-xs">
            <div className="text-[9px] uppercase tracking-wider text-neutral-300 font-mono font-medium mb-1 flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              REMEDIATION
            </div>
            <p className="text-neutral-500 leading-relaxed font-sans">{finding.remediation}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------- Constants ----------
const NAV_ITEMS = [
  { label: "TARGET", icon: Crosshair, href: "#" },
  { label: "VERIFICATION", icon: Box, href: "#verification" },
  { label: "REPORT", icon: FileWarning, href: "#report" },
  { label: "HISTORY", icon: Activity, href: "#history" },
  { label: "DETECTION", icon: Fingerprint, href: "#matrix" },
];

const CATEGORY_ICONS = {
  api_key: KeyRound,
  secret: Lock,
  ai_fingerprint: Fingerprint,
  exposed_file: FileWarning,
  debug_endpoint: Bug,
  source_map: Map,
  pii: Database,
  misconfig: Cpu,
};

const FEATURE_CARDS = [
  {
    title: "BOUNDED & LOOP-FREE",
    desc: "Single HTTP request, hard timeouts on every fetch, finite array iterations. Never hangs, never polls.",
    icon: Lock,
  },
  {
    title: "AI-TOOL AWARE",
    desc: "Detects fingerprints for v0, Lovable, Bolt, Cursor, Claude, and ChatGPT in meta tags, comments, and JS.",
    icon: Fingerprint,
  },
  {
    title: "REAL SECRET PATTERNS",
    desc: "AWS, OpenAI, Anthropic, Google AI, GitHub PAT, Stripe, Slack, JWTs, PEM keys, DB connection strings.",
    icon: ShieldAlert,
  },
];

const VERIFICATION_POINTS = [
  {
    title: "Fetch target HTML",
    desc: "Hard 15s timeout, 1.5MB cap. Failures are logged, not retried.",
    color: "#10b981",
  },
  {
    title: "Extract & fetch scripts",
    desc: "Up to 20 <script> sources, 10s each, 600KB cap per file.",
    color: "#06b6d4",
  },
  {
    title: "Pattern-match secrets",
    desc: "AWS / OpenAI / Anthropic / Google AI / GitHub PAT / Stripe / Slack / JWT / PEM keys.",
    color: "#ef4444",
  },
  {
    title: "Probe 12 leak paths",
    desc: "/.env · /.git/config · /.git/HEAD · /.DS_Store · /package.json · /actuator · more.",
    color: "#f59e0b",
  },
  {
    title: "Detect AI fingerprints",
    desc: "v0 · Lovable · Bolt · Cursor · Claude · ChatGPT — in meta tags, comments, and JS.",
    color: "#a78bfa",
  },
  {
    title: "Hunt source maps",
    desc: "Probes {script}.map and parses inline //# sourceMappingURL= annotations.",
    color: "#34d399",
  },
];
