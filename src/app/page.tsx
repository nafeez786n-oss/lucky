"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, ShieldAlert, Loader2, Search, Download, Trash2, ExternalLink, Lock, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { ScanResult, Finding } from "@/lib/leak-scanner";
import { SEVERITY_META, CATEGORY_META, severityCount } from "@/lib/leak-ui";

const SCANNER_STAGES = [
  "Validating target URL",
  "Fetching HTML (15s timeout)",
  "Scanning HTML for secrets",
  "Extracting <script> URLs (cap 20)",
  "Fetching each script (10s each, cap 600KB)",
  "Probing .map files",
  "Probing 12 well-known leak paths",
  "Scoring & ranking findings",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);

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

    // bounded stage progression using a finite array (NOT a polling loop)
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
      // clear pending stage timers and jump to last
      for (const t of stageTimers) clearTimeout(t);
      setStage(SCANNER_STAGES.length);

      setResult(data);
      if (!data.ok && data.errors.length > 0) {
        toast.warning(data.errors[0]);
      } else {
        toast.success(
          `Scan complete — ${data.findings.length} finding${data.findings.length === 1 ? "" : "s"}`
        );
      }
      setHistory((h) => [data, ...h].slice(0, 8));
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">LeakGuard</h1>
              <p className="text-xs text-muted-foreground">
                Detect API &amp; data leaks in AI-generated websites
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" />
            <span>Bounded execution · No polling · No loops</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 md:py-10">
        {/* Hero / input */}
        <section className="mb-8">
          <Card className="overflow-hidden border-emerald-500/20">
            <CardHeader className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
              <CardTitle className="text-2xl md:text-3xl">
                Scan any website for AI-tool leaks
              </CardTitle>
              <CardDescription className="text-base max-w-2xl">
                LeakGuard fetches the target HTML, follows up to 20 scripts, and probes 12
                well-known leak paths. It detects exposed API keys, source maps, AI-generator
                fingerprints, and leftover debug endpoints — all in a single bounded request.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={runScan} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="example.com  or  https://example.com"
                    className="pl-9 h-11"
                    disabled={scanning}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={scanning}
                  className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      Scan now
                    </>
                  )}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-3">
                Try a known test target:{" "}
                <button
                  type="button"
                  onClick={() => setUrl("https://httpbin.org")}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  https://httpbin.org
                </button>{" "}
                or{" "}
                <button
                  type="button"
                  onClick={() => setUrl("https://example.com")}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  https://example.com
                </button>
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Scanning stages */}
        {scanning && (
          <section className="mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Scanning in progress
                </CardTitle>
                <CardDescription>
                  Each step has a hard timeout. The whole scan finishes in under 60 seconds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-1.5 text-sm">
                  {SCANNER_STAGES.map((s, i) => {
                    const done = i < stage;
                    const active = i === stage;
                    return (
                      <li
                        key={s}
                        className={`flex items-center gap-2 ${
                          done ? "text-emerald-600" : active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                            done
                              ? "bg-emerald-500 text-white"
                              : active
                              ? "bg-emerald-500/20 text-emerald-600"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        {s}
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Results */}
        {result && !scanning && (
          <ResultView result={result} onExport={exportJson} onClear={clearResults} />
        )}

        {/* History */}
        {history.length > 0 && !scanning && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Recent scans (this session)
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {history.map((h, i) => {
                const counts = severityCount(h.findings);
                return (
                  <Card
                    key={i}
                    className="cursor-pointer hover:border-emerald-500/40 transition"
                    onClick={() => {
                      setResult(h);
                      setStage(SCANNER_STAGES.length);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-xs font-mono">
                          {h.findings.length} found
                        </Badge>
                        <Badge
                          className={`text-xs ${counts.critical > 0 ? "bg-red-500" : counts.high > 0 ? "bg-orange-500" : "bg-emerald-500"} text-white`}
                        >
                          {counts.critical > 0
                            ? `${counts.critical} crit`
                            : counts.high > 0
                            ? `${counts.high} high`
                            : "clean"}
                        </Badge>
                      </div>
                      <p className="text-xs font-mono truncate text-muted-foreground">
                        {h.targetUrl}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(h.durationMs / 1000).toFixed(1)}s · {h.fetchedBytes} bytes · {h.scriptCount} scripts
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!result && !scanning && history.length === 0 && (
          <section className="mt-6">
            <div className="grid md:grid-cols-3 gap-4">
              {FEATURE_CARDS.map((c) => (
                <Card key={c.title} className="border-emerald-500/10">
                  <CardHeader>
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-2">
                      <c.icon className="w-4 h-4 text-emerald-600" />
                    </div>
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    <CardDescription>{c.desc}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                What LeakGuard detects
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <div
                    key={k}
                    className="p-3 rounded-lg border bg-card text-xs"
                  >
                    <div className="font-medium text-foreground">{v.label}</div>
                    <div className="text-muted-foreground mt-1 leading-snug">
                      {v.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t mt-10">
        <div className="max-w-6xl mx-auto px-4 py-6 text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-2">
          <span>
            LeakGuard · Bounded scanner · No client polling · No infinite loops
          </span>
          <span>
            Scan target must be reachable from the server. Only public, non-authenticated content is tested.
          </span>
        </div>
      </footer>
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                Scan report
              </CardTitle>
              <CardDescription className="mt-1">
                <span className="font-mono text-xs break-all">{result.targetUrl}</span>
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={onExport} disabled={total === 0}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                JSON
              </Button>
              <Button variant="ghost" size="sm" onClick={onClear}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <Stat label="Total" value={total} tone="bg-foreground text-background" />
            <Stat label="Critical" value={counts.critical} tone="bg-red-500 text-white" />
            <Stat label="High" value={counts.high} tone="bg-orange-500 text-white" />
            <Stat label="Medium" value={counts.medium} tone="bg-amber-500 text-white" />
            <Stat label="Low / Info" value={counts.low + counts.info} tone="bg-sky-500 text-white" />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            <Meta label="Duration" value={`${(result.durationMs / 1000).toFixed(1)}s`} />
            <Meta label="HTML bytes" value={result.fetchedBytes.toLocaleString()} />
            <Meta label="Scripts" value={`${result.scriptCount}`} />
            <Meta label="Path probes" value={`${result.fileProbeCount}`} />
          </div>

          {result.errors.length > 0 && (
            <Alert className="mt-4 border-amber-500/40 bg-amber-500/5">
              <Bug className="w-4 h-4 text-amber-600" />
              <AlertTitle className="text-amber-700">Scan warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-0.5 mt-1">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {total === 0 ? (
            <Alert className="mt-4 border-emerald-500/40 bg-emerald-500/5">
              <Shield className="w-4 h-4 text-emerald-600" />
              <AlertTitle className="text-emerald-700">No leaks detected</AlertTitle>
              <AlertDescription>
                None of LeakGuard&apos;s pattern matchers or path probes returned a positive result.
                Note: this is not a full security audit — only the well-known AI-tool leak patterns are checked.
              </AlertDescription>
            </Alert>
          ) : (
            <Tabs defaultValue="all" className="mt-5">
              <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap">
                <TabsTrigger value="all">All ({total})</TabsTrigger>
                {Object.entries(grouped).map(([cat, list]) => (
                  <TabsTrigger key={cat} value={cat}>
                    {CATEGORY_META[cat as keyof typeof CATEGORY_META]?.label ?? cat} ({list.length})
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-4 space-y-3">
                {result.findings.map((f) => (
                  <FindingCard key={f.id} finding={f} />
                ))}
              </TabsContent>

              {Object.entries(grouped).map(([cat, list]) => (
                <TabsContent key={cat} value={cat} className="mt-4 space-y-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    {CATEGORY_META[cat as keyof typeof CATEGORY_META]?.description}
                  </p>
                  {list.map((f) => (
                    <FindingCard key={f.id} finding={f} />
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </motion.section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`rounded-lg ${tone} px-3 py-2.5 flex items-center justify-between`}>
      <span className="text-xs font-medium opacity-90">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-mono mt-0.5">{value}</div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const sev = SEVERITY_META[finding.severity];
  return (
    <Card className={`overflow-hidden ring-1 ${sev.ring}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full ${sev.dot} shrink-0`} />
            <h3 className="font-medium text-sm leading-snug">{finding.title}</h3>
          </div>
          <Badge className={`text-[10px] px-2 py-0.5 ${sev.badge}`}>
            {sev.label}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground leading-snug mb-3">
          {finding.description}
        </p>

        <div className="grid sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/60 border p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Evidence
            </div>
            <code className="font-mono text-[11px] break-all block">
              {finding.evidence}
            </code>
          </div>
          <div className="rounded-md bg-muted/60 border p-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Location
            </div>
            {finding.locationType === "url" ? (
              <a
                href={finding.location}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="font-mono text-[11px] break-all text-emerald-600 hover:underline inline-flex items-start gap-1"
              >
                {finding.location}
                <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
              </a>
            ) : (
              <span className="font-mono text-[11px] break-all block">
                {finding.location}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-medium mb-1">
            Remediation
          </div>
          <p className="text-muted-foreground leading-snug">{finding.remediation}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const FEATURE_CARDS = [
  {
    title: "Bounded & loop-free",
    desc: "Single HTTP request, hard timeouts on every fetch, finite array iterations — never hangs, never polls.",
    icon: Lock,
  },
  {
    title: "AI-tool aware",
    desc: "Detects fingerprints for v0, Lovable, Bolt, Cursor, Claude, and ChatGPT in meta tags, comments, and JS.",
    icon: Bug,
  },
  {
    title: "Real secret patterns",
    desc: "AWS, OpenAI, Anthropic, Google AI, GitHub PAT, Stripe, Slack, JWTs, PEM keys, DB connection strings.",
    icon: Shield,
  },
];
