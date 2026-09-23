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

// 3D scene is heavy + uses WebGL → load it client-side only, on demand
const LeakGuardScene = dynamic(
  () => import("@/components/three/leak-guard-scene").then((m) => m.LeakGuardScene),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] flex items-center justify-center text-blue-500/60 font-mono text-xs">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Initializing 3D scanner…
      </div>
    ),
  }
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

  // Load saved scans when session changes
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

    // bounded stage progression (finite setTimeouts, not a polling loop)
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

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground relative overflow-x-hidden">
      {/* Decorative background layers */}
      <div className="fixed inset-0 -z-10 bg-grid scanline opacity-60" aria-hidden />
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
        <MatrixRainCanvas />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-blue-500/20 glass">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <motion.div
              initial={{ rotate: -10, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="w-9 h-9 rounded-lg border border-blue-500/40 bg-blue-500/10 flex items-center justify-center glow-blue"
            >
              <ShieldAlert className="w-5 h-5 text-blue-400" />
            </motion.div>
            <div className="min-w-0">
              <h1 className="text-base font-mono font-semibold tracking-tight leading-none">
                <span className="text-blue-400 text-glow-blue">LEAK</span>
                <span className="text-foreground">GUARD</span>
                <span className="ml-1 text-blue-400 animate-blink">_</span>
              </h1>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono uppercase tracking-wider">
                AI-Website Leak Detector v1.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-blue-500/70 px-2 py-1 rounded border border-blue-500/20 bg-blue-500/5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              SYSTEM ONLINE
            </div>
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 md:py-10 relative">
        {/* Hero / terminal */}
        <section className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center mb-8 max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/5 text-blue-300 text-xs font-mono mb-4">
              <Zap className="w-3 h-3" />
              BOUNDED · NO LOOPS · NO BUGS
            </div>
            <h2 className="text-3xl md:text-5xl font-mono font-bold tracking-tight leading-tight">
              <span className="text-foreground">Find every</span>{" "}
              <span className="bg-gradient-to-r from-blue-400 via-blue-300 to-sky-400 bg-clip-text text-transparent text-glow-blue">
                leaked secret
              </span>
              <br />
              <span className="text-foreground">in AI-built websites</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-sm md:text-base max-w-2xl mx-auto">
              Drop a URL. LeakGuard fetches the HTML, follows up to 20 scripts, probes 12 well-known
              leak paths, and surfaces API keys, source maps, AI-tool fingerprints, and debug endpoints —
              in a single bounded request.
            </p>
          </motion.div>

          {/* Terminal input */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="relative max-w-2xl mx-auto"
          >
            <Card className="border-blue-500/30 glass overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-500/20 bg-slate-950/40">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500/70" />
                </div>
                <div className="flex-1 text-center text-[10px] font-mono text-muted-foreground">
                  leakguard@scanner: ~/scan
                </div>
                <Terminal className="w-3 h-3 text-muted-foreground" />
              </div>
              <CardContent className="p-4">
                <form onSubmit={runScan} className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-blue-400 text-sm pointer-events-none">
                      $
                    </span>
                    <Input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="scan https://example.com"
                      className="pl-7 font-mono text-sm h-11 bg-slate-950/60 border-blue-500/30 focus-visible:border-blue-400 focus-visible:ring-blue-400/20"
                      disabled={scanning}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={scanning}
                    className="h-11 bg-blue-500 hover:bg-blue-400 text-blue-950 font-mono font-semibold border border-blue-300/40 shadow-[0_0_25px_-8px_rgba(59, 130, 246,0.7)]"
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
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                  <span className="text-blue-500/60">try:</span>
                  {["https://httpbin.org", "https://example.com"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setUrl(t)}
                      disabled={scanning}
                      className="px-2 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-300 hover:bg-blue-500/10 hover:border-blue-400/40 transition disabled:opacity-50"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* 3D verification section */}
        <section className="mb-8">
          <Card className="border-blue-500/30 glass overflow-hidden">
            <CardHeader className="border-b border-blue-500/15 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                  <Box className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-mono text-blue-300">
                    VERIFICATION MATRIX
                  </CardTitle>
                  <CardDescription className="text-xs font-mono text-muted-foreground mt-0.5">
                    Interactive 3D visualization of LeakGuard&apos;s detection surface
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid lg:grid-cols-[1fr_320px]">
                {/* 3D canvas */}
                <div className="relative h-[420px] sm:h-[480px] bg-gradient-to-b from-blue-500/5 to-transparent border-b lg:border-b-0 lg:border-r border-blue-500/15">
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded border border-blue-500/20 bg-slate-950/60 text-[10px] font-mono text-blue-400/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    LIVE · DRAG TO ROTATE
                  </div>
                  <div className="absolute bottom-3 right-3 z-10 text-[10px] font-mono text-muted-foreground/60">
                    webgl · three.js
                  </div>
                  <LeakGuardScene />
                </div>

                {/* Brief verification text */}
                <div className="p-5 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ScanLine className="w-3.5 h-3.5 text-blue-400" />
                      <h3 className="text-xs font-mono font-semibold text-blue-300 tracking-wider uppercase">
                        What LeakGuard verifies
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The 3D constellation above maps every LeakGuard capability to a unique
                      3D model orbiting the central wireframe scanner. A key for API keys,
                      a lock for secrets, a fingerprint for AI-tool traces, a document for
                      exposed files, a pyramid for source maps, an avatar for PII, a bug for
                      debug routes, and a gear for misconfigurations. Six scan rays fire from
                      the glowing core on every scan.
                    </p>
                  </div>

                  <ul className="space-y-2.5">
                    {VERIFICATION_POINTS.map((p, i) => (
                      <motion.li
                        key={p.title}
                        initial={{ opacity: 0, x: -6 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.06 }}
                        className="flex items-start gap-2.5 text-xs"
                      >
                        <span
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono shrink-0 mt-0.5"
                          style={{ background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}55` }}
                        >
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-mono font-medium text-foreground">{p.title}</span>
                          <span className="text-muted-foreground block mt-0.5 leading-snug">{p.desc}</span>
                        </div>
                      </motion.li>
                    ))}
                  </ul>

                  <div className="pt-3 border-t border-blue-500/15">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-blue-500/70">
                      <Shield className="w-3 h-3" />
                      <span>BOUNDED · NO LOOPS · NO INFINITE POLLING</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Scanning radar */}
        {scanning && (
          <section className="mb-8">
            <Card className="border-blue-500/30 glass">
              <CardContent className="p-6">
                <div className="grid md:grid-cols-[260px_1fr] gap-6 items-center">
                  <ScanRadar />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      <h3 className="font-mono text-sm text-blue-300">
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
                                ? "text-blue-400"
                                : active
                                ? "text-foreground"
                                : "text-muted-foreground/60"
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded flex items-center justify-center text-[9px] ${
                                done
                                  ? "bg-blue-500 text-blue-950"
                                  : active
                                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                                  : "bg-slate-800/60 text-muted-foreground"
                              }`}
                            >
                              {done ? "✓" : i + 1}
                            </span>
                            <Icon className={`w-3 h-3 ${done || active ? "text-blue-400" : ""}`} />
                            {s.label}
                            {active && <span className="animate-blink text-blue-400">▌</span>}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Result */}
        {result && !scanning && (
          <ResultView result={result} onExport={exportJson} onClear={clearResults} />
        )}

        {/* Saved scans (logged in) */}
        {session?.user && (
          <section className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono text-blue-300 flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                SAVED SCANS <span className="text-muted-foreground">({savedScans.length})</span>
              </h2>
              {savedScans.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSavedScans} className="text-xs text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>
            {loadingSaved ? (
              <div className="text-xs font-mono text-muted-foreground">Loading…</div>
            ) : savedScans.length === 0 ? (
              <Card className="border-dashed border-blue-500/20">
                <CardContent className="p-6 text-center">
                  <p className="text-xs font-mono text-muted-foreground">
                    No saved scans yet. Run a scan while logged in to persist it here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {savedScans.slice(0, 9).map((s, i) => {
                  const counts = severityCount(s.findings);
                  return (
                    <Card
                      key={i}
                      className="cursor-pointer hover:border-blue-400/40 transition bg-card/60 glass"
                      onClick={() => {
                        setResult(s);
                        setStage(SCANNER_STAGES.length);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-[10px] font-mono border-blue-500/30 text-blue-300">
                            {s.findings.length} found
                          </Badge>
                          <Badge
                            className={`text-[10px] font-mono ${
                              counts.critical > 0
                                ? "bg-red-500/90 text-white"
                                : counts.high > 0
                                ? "bg-orange-500/90 text-white"
                                : "bg-blue-500/90 text-blue-950"
                            }`}
                          >
                            {counts.critical > 0
                              ? `${counts.critical} CRIT`
                              : counts.high > 0
                              ? `${counts.high} HIGH`
                              : "CLEAN"}
                          </Badge>
                        </div>
                        <p className="text-[11px] font-mono truncate text-muted-foreground">{s.targetUrl}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                          {(s.durationMs / 1000).toFixed(1)}s · {s.fetchedBytes}b · {s.scriptCount}js
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Session history (always) */}
        {sessionHistory.length > 0 && !scanning && (
          <section className="mt-10">
            <h2 className="text-sm font-mono text-blue-300 flex items-center gap-2 mb-3">
              <Activity className="w-3.5 h-3.5" />
              SESSION HISTORY <span className="text-muted-foreground">({sessionHistory.length})</span>
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {sessionHistory.map((h, i) => {
                const counts = severityCount(h.findings);
                return (
                  <Card
                    key={i}
                    className="cursor-pointer hover:border-blue-400/40 transition bg-card/60 glass"
                    onClick={() => {
                      setResult(h);
                      setStage(SCANNER_STAGES.length);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-[10px] font-mono border-blue-500/30 text-blue-300">
                          {h.findings.length} found
                        </Badge>
                        <Badge
                          className={`text-[10px] font-mono ${
                            counts.critical > 0
                              ? "bg-red-500/90 text-white"
                              : counts.high > 0
                              ? "bg-orange-500/90 text-white"
                              : "bg-blue-500/90 text-blue-950"
                          }`}
                        >
                          {counts.critical > 0
                            ? `${counts.critical} CRIT`
                            : counts.high > 0
                            ? `${counts.high} HIGH`
                            : "CLEAN"}
                        </Badge>
                      </div>
                      <p className="text-[11px] font-mono truncate text-muted-foreground">{h.targetUrl}</p>
                      <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                        {(h.durationMs / 1000).toFixed(1)}s · {h.fetchedBytes}b · {h.scriptCount}js
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
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
                  <Card className="border-blue-500/20 bg-card/50 glass hover:border-blue-400/40 transition h-full">
                    <CardHeader>
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-2 glow-blue">
                        <c.icon className="w-4 h-4 text-blue-400" />
                      </div>
                      <CardTitle className="text-sm font-mono text-blue-200">
                        {c.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        {c.desc}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="mb-3 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <h3 className="text-sm font-mono text-blue-300">DETECTION MATRIX</h3>
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
                    className="p-3 rounded-lg border border-blue-500/15 bg-card/50 glass hover:border-blue-400/40 transition group"
                  >
                    <Icon className="w-3.5 h-3.5 text-blue-400 mb-2 group-hover:scale-110 transition" />
                    <div className="text-xs font-mono font-medium text-blue-200">{v.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      {v.description}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-blue-500/15 mt-10 glass">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col sm:flex-row justify-between gap-2 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            LEAKGUARD · BOUNDED SCANNER · NO POLLING · NO INFINITE LOOPS
          </span>
          <span>
            {session?.user ? `OPERATOR: ${session.user.email}` : "GUEST MODE — SCANS NOT PERSISTED"}
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------- Matrix rain (subtle background) ----------
function MatrixRainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    let drops: number[] = [];
    const fontSize = 12;
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+-=<>/\\|{}[]()";

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.floor(canvas.width / fontSize);
      drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -100));
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(t: number) {
      if (!ctx || !canvas) return;
      raf = requestAnimationFrame(draw);
      // throttle to ~10fps for perf + subtlety
      if (t - last < 100) return;
      last = t;
      ctx.fillStyle = "rgba(2, 6, 23, 0.10)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const ch = charset[Math.floor(Math.random() * charset.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        const alpha = Math.max(0.05, Math.min(0.22, y / canvas.height));
        ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
        ctx.fillText(ch, x, y);
        if (y > canvas.height && Math.random() > 0.97) drops[i] = 0;
        drops[i]++;
      }
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full opacity-40" aria-hidden />;
}

// ---------- Scan radar (animated during scan) ----------
function ScanRadar() {
  return (
    <div className="relative w-[240px] h-[240px] mx-auto">
      {/* Concentric circles */}
      <div className="absolute inset-0 rounded-full border border-blue-500/30" />
      <div className="absolute inset-6 rounded-full border border-blue-500/20" />
      <div className="absolute inset-12 rounded-full border border-blue-500/15" />
      <div className="absolute inset-[72px] rounded-full border border-blue-500/10" />

      {/* Cross axes */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-blue-500/20 -translate-x-1/2" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-blue-500/20 -translate-y-1/2" />

      {/* Sweeping line (rotates) */}
      <div
        className="absolute inset-0 rounded-full animate-scan-sweep"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(59, 130, 246,0.35) 30deg, transparent 60deg, transparent 360deg)",
          maskImage: "radial-gradient(circle, transparent 30%, black 30%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 30%, black 30%)",
        }}
      />

      {/* Center blip */}
      <motion.div
        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.8, repeat: Infinity }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_20px_4px_rgba(59, 130, 246,0.7)]"
      />

      {/* Random target blips */}
      {[
        { x: "30%", y: "25%", d: 0 },
        { x: "70%", y: "40%", d: 0.4 },
        { x: "55%", y: "70%", d: 0.8 },
        { x: "20%", y: "60%", d: 1.2 },
        { x: "80%", y: "75%", d: 1.6 },
      ].map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-sky-400"
          style={{ left: p.x, top: p.y }}
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: p.d }}
        />
      ))}

      {/* Radar icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <Radar className="w-6 h-6 text-blue-500/30" />
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
    medium: "bg-sky-500",
    low: "bg-yellow-400",
    info: "bg-sky-500",
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="mb-6 border-blue-500/30 glass">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base font-mono flex items-center gap-2 text-blue-300">
                <Shield className="w-4 h-4" />
                SCAN REPORT
              </CardTitle>
              <CardDescription className="mt-1.5 font-mono text-xs break-all">
                <span className="text-blue-400/70">$ target:</span>{" "}
                <span className="text-foreground">{result.targetUrl}</span>
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={onExport} disabled={total === 0}
                className="font-mono text-xs border-blue-500/30 text-blue-300 hover:bg-blue-500/10">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                JSON
              </Button>
              <Button variant="ghost" size="sm" onClick={onClear} className="font-mono text-xs text-muted-foreground">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                CLEAR
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Severity stacked bar */}
          {total > 0 && (
            <div className="mb-4">
              <div className="flex h-2 rounded-full overflow-hidden bg-slate-800/60">
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
            <Stat label="TOTAL" value={total} tone="bg-blue-500/15 border border-blue-500/30 text-blue-300" />
            <Stat label="CRITICAL" value={counts.critical} tone="bg-red-500/15 border border-red-500/40 text-red-300" />
            <Stat label="HIGH" value={counts.high} tone="bg-orange-500/15 border border-orange-500/40 text-orange-300" />
            <Stat label="MEDIUM" value={counts.medium} tone="bg-sky-500/15 border border-sky-500/40 text-sky-300" />
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
            <Alert className="mt-4 border-sky-500/40 bg-sky-500/5">
              <Bug className="w-4 h-4 text-sky-500" />
              <AlertTitle className="text-sky-400 font-mono text-xs">SCAN WARNINGS</AlertTitle>
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
            <Alert className="mt-4 border-blue-500/40 bg-blue-500/5">
              <Shield className="w-4 h-4 text-blue-400" />
              <AlertTitle className="text-blue-400 font-mono text-xs">NO LEAKS DETECTED</AlertTitle>
              <AlertDescription className="font-mono text-xs">
                None of LeakGuard&apos;s pattern matchers or path probes returned a positive result.
                Note: this is not a full security audit — only the well-known AI-tool leak patterns are checked.
              </AlertDescription>
            </Alert>
          ) : (
            <Tabs defaultValue="all" className="mt-5">
              <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap bg-slate-950/40 border border-blue-500/20">
                <TabsTrigger value="all" className="font-mono text-xs data-[state=active]:text-blue-300 data-[state=active]:bg-blue-500/10">
                  ALL ({total})
                </TabsTrigger>
                {Object.entries(grouped).map(([cat, list]) => (
                  <TabsTrigger
                    key={cat}
                    value={cat}
                    className="font-mono text-xs data-[state=active]:text-blue-300 data-[state=active]:bg-blue-500/10"
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
                  <p className="text-xs text-muted-foreground font-mono mb-2 border-l-2 border-blue-500/40 pl-3">
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
        </CardContent>
      </Card>
    </motion.section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`rounded-lg ${tone} px-3 py-2.5 flex items-center justify-between`}
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
    <div className="rounded-md border border-blue-500/15 bg-slate-950/40 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-blue-500/60 font-mono">{label}</div>
      <div className="text-sm font-mono mt-0.5 text-blue-200">{value}</div>
    </div>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const sev = SEVERITY_META[finding.severity];
  const sevBorder: Record<string, string> = {
    critical: "border-l-red-500",
    high: "border-l-orange-500",
    medium: "border-l-sky-500",
    low: "border-l-yellow-400",
    info: "border-l-sky-500",
  };
  const sevGlow: Record<string, string> = {
    critical: "hover:shadow-[0_0_25px_-8px_rgba(239,68,68,0.6)]",
    high: "hover:shadow-[0_0_25px_-8px_rgba(249,115,22,0.6)]",
    medium: "hover:shadow-[0_0_25px_-8px_rgba(96, 165, 250,0.5)]",
    low: "hover:shadow-[0_0_25px_-8px_rgba(250,204,21,0.4)]",
    info: "hover:shadow-[0_0_25px_-8px_rgba(14,165,233,0.5)]",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.5) }}
    >
      <Card className={`overflow-hidden border-l-4 ${sevBorder[finding.severity]} border-blue-500/15 bg-card/60 glass ${sevGlow[finding.severity]} transition-all hover:border-blue-400/40`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full ${sev.dot} shrink-0 animate-pulse`} />
              <h3 className="font-mono text-sm font-medium leading-snug text-foreground">
                {finding.title}
              </h3>
            </div>
            <Badge className={`text-[10px] font-mono px-2 py-0.5 ${sev.badge}`}>
              {sev.label}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed mb-3 font-sans">
            {finding.description}
          </p>

          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-slate-950/60 border border-blue-500/15 p-2">
              <div className="text-[9px] uppercase tracking-wider text-blue-500/60 font-mono mb-1">
                EVIDENCE
              </div>
              <code className="font-mono text-[11px] break-all block text-blue-200/90">
                {finding.evidence}
              </code>
            </div>
            <div className="rounded-md bg-slate-950/60 border border-blue-500/15 p-2">
              <div className="text-[9px] uppercase tracking-wider text-blue-500/60 font-mono mb-1">
                LOCATION
              </div>
              {finding.locationType === "url" ? (
                <a
                  href={finding.location}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-mono text-[11px] break-all text-blue-400 hover:underline inline-flex items-start gap-1"
                >
                  {finding.location}
                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                </a>
              ) : (
                <span className="font-mono text-[11px] break-all block text-blue-200/90">
                  {finding.location}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20 text-xs">
            <div className="text-[9px] uppercase tracking-wider text-blue-400 font-mono font-medium mb-1 flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              REMEDIATION
            </div>
            <p className="text-muted-foreground leading-relaxed font-sans">{finding.remediation}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------- Constants ----------
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
    color: "#3b82f6",
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
    color: "#a5b4fc",
  },
  {
    title: "Detect AI fingerprints",
    desc: "v0 · Lovable · Bolt · Cursor · Claude · ChatGPT — in meta tags, comments, and JS.",
    color: "#a78bfa",
  },
  {
    title: "Hunt source maps",
    desc: "Probes {script}.map and parses inline //# sourceMappingURL= annotations.",
    color: "#60a5fa",
  },
];

