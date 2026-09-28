/**
 * LeakScanner — Bounded, no-loop, no-recursion leak detector.
 *
 * Design rules (HARD CONSTRAINTS):
 *   - No `while (true)`, no recursion, no polling.
 *   - Every `for...of` iterates over a bounded array (cap = MAX_*).
 *   - Every network fetch uses AbortController + explicit timeout.
 *   - Max total wall-clock time guarded by overall deadline.
 *   - Findings are deduplicated by (type+location) key to avoid flooding.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/**
 * Real-time scan progress event — emitted by `scanTarget` when an `onProgress`
 * callback is provided. Used by the WebSocket scanner service to push live
 * updates to the frontend as the scan runs (replaces fake stage timing).
 */
export type ScanProgressEvent =
  | {
      type: "stage";
      stage:
        | "acquire"
        | "fetch_html"
        | "analyze_html"
        | "fetch_scripts"
        | "pattern_match"
        | "ai_fingerprint"
        | "probe_paths"
        | "complete";
      detail: string;
      findingsCount: number;
    }
  | { type: "finding"; finding: Finding }
  | { type: "complete"; result: ScanResult };

export type LeakCategory =
  | "api_key"
  | "secret"
  | "ai_fingerprint"
  | "exposed_file"
  | "debug_endpoint"
  | "source_map"
  | "pii"
  | "misconfig";

export interface Finding {
  id: string;
  category: LeakCategory;
  severity: Severity;
  title: string;
  description: string;
  evidence: string;       // truncated, masked
  location: string;       // URL or "html" or script URL
  locationType: "html" | "script" | "url";
  remediation: string;
}

export interface ScanResult {
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fetchedBytes: number;
  scriptCount: number;
  fileProbeCount: number;
  findings: Finding[];
  errors: string[];
  ok: boolean;
}

// ---------- Hard caps (no unbounded anything) ----------
const MAX_SCRIPTS = 20;
const MAX_FINDINGS_PER_TYPE = 25;
const MAX_FILE_PROBES = 12;
const MAX_JS_BYTES = 600_000;          // 600KB cap per JS file
const MAX_HTML_BYTES = 1_500_000;      // 1.5MB cap for HTML
const HTML_TIMEOUT_MS = 15_000;
const JS_TIMEOUT_MS = 10_000;
const FILE_PROBE_TIMEOUT_MS = 6_000;
const MAX_EVIDENCE_LEN = 120;
const MAX_FINDINGS_TOTAL = 200;

// ---------- Helpers ----------

function maskSecret(s: string): string {
  if (s.length <= 12) return "***";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

function truncate(s: string, n = MAX_EVIDENCE_LEN): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function safeTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function fetchBounded(
  url: string,
  timeoutMs: number,
  maxBytes: number,
  asText: boolean
): Promise<{ status: number; text: string; bytes: number } | null> {
  try {
    const res = await fetch(url, {
      signal: safeTimeout(timeoutMs),
      redirect: "follow",
      headers: {
        "User-Agent":
          "LeakGuard/1.0 (+security scanner; contact: scanner@example.com)",
        Accept: asText
          ? "text/html,application/javascript,*/*;q=0.5"
          : "*/*",
      },
    });
    // Read capped body
    const reader = res.body?.getReader();
    if (!reader) {
      const text = asText ? "" : "";
      return { status: res.status, text, bytes: 0 };
    }
    let received = 0;
    const chunks: Uint8Array[] = [];
    // bounded read loop — exits when received >= maxBytes OR stream done
    for (;;) {
      if (received >= maxBytes) {
        try { reader.cancel(); } catch { /* ignore */ }
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        chunks.push(value);
      }
    }
    const total = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
      total.set(c.subarray(0, Math.min(c.byteLength, total.byteLength - off)), off);
      off += c.byteLength;
      if (off >= total.byteLength) break;
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(total);
    return { status: res.status, text, bytes: received };
  } catch {
    return null;
  }
}

// ---------- Pattern matchers ----------

interface Pattern {
  id: string;
  category: LeakCategory;
  severity: Severity;
  title: string;
  description: string;
  remediation: string;
  regex: RegExp;
  // mask: return masked evidence instead of raw match
  mask?: boolean;
}

const PATTERNS: Pattern[] = [
  // ---- API keys & cloud creds ----
  {
    id: "aws_access_key",
    category: "api_key",
    severity: "critical",
    title: "AWS Access Key ID exposed",
    description:
      "An AWS IAM access key ID (starts with AKIA / ASIA / AGPA / AIDA) was found in client-visible content. Anyone with this key can make API calls to your AWS account.",
    remediation:
      "Rotate the key immediately in AWS IAM, move all AWS operations to a server-side route, and audit CloudTrail for misuse.",
    regex: /\b(AKIA|ASIA|AGPA|AIDA|ANPA|ANVA|ASCA)[A-Z0-9]{16}\b/g,
    mask: true,
  },
  {
    id: "openai_key",
    category: "api_key",
    severity: "critical",
    title: "OpenAI API key exposed",
    description:
      "A hardcoded OpenAI API key (sk-…) is leaking into the browser. AI-generated sites frequently hardcode the key used to call chat endpoints, which leads to billing abuse and data theft.",
    remediation:
      "Revoke the key in platform.openai.com, route chat completions through a server-side API route, and use an environment variable for the new key.",
    regex: /\bsk-[A-Za-z0-9_\-]{20,}\b/g,
    mask: true,
  },
  {
    id: "anthropic_key",
    category: "api_key",
    severity: "critical",
    title: "Anthropic API key exposed",
    description:
      "An Anthropic API key (sk-ant-…) was found in client-visible code. This pattern is common in AI-built apps that call Claude directly from the browser.",
    remediation:
      "Revoke the key in console.anthropic.com, move Claude calls server-side, and never ship keys in client bundles.",
    regex: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g,
    mask: true,
  },
  {
    id: "google_ai_key",
    category: "api_key",
    severity: "critical",
    title: "Google Gemini / AI Studio API key exposed",
    description:
      "A Google AI Studio API key (AIza…) is present in the page or scripts. Anyone can use it to call Gemini at your expense.",
    remediation:
      "Revoke the key in Google AI Studio, add API key restrictions (HTTP referrer or server IP), and move inference to a server route.",
    regex: /\bAIza[0-9A-Za-z_\-]{35}\b/g,
    mask: true,
  },
  {
    id: "github_pat",
    category: "api_key",
    severity: "high",
    title: "GitHub Personal Access Token exposed",
    description:
      "A GitHub PAT (ghp_/gho_/ghs_/ghr_) is shipped to the browser. Attackers can read or push to your repos, gists, or organizations.",
    remediation:
      "Revoke the token at github.com/settings/tokens, audit recent access, and store the new token server-side only.",
    regex: /\b(ghp|gho|ghs|ghr|ghu)_[A-Za-z0-9]{36,}\b/g,
    mask: true,
  },
  {
    id: "stripe_key",
    category: "api_key",
    severity: "critical",
    title: "Stripe secret key exposed",
    description:
      "A Stripe secret key (sk_live_/sk_test_/rk_live_) is in client code. Live keys allow full account takeover: refunds, charges, and PII access.",
    remediation:
      "Roll the key immediately in dashboard.stripe.com, switch to restricted keys for server use, and use Stripe.js + PaymentIntents on the client.",
    regex: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{20,}\b/g,
    mask: true,
  },
  {
    id: "slack_token",
    category: "api_key",
    severity: "high",
    title: "Slack token exposed",
    description:
      "A Slack API token (xox[baprs]-…) was found. This allows reading channels, sending messages, and listing workspace members.",
    remediation:
      "Revoke the token at api.slack.com/authentication/rotating-and-invalidating, and move Slack calls behind a server route.",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    mask: true,
  },
  {
    id: "jwt",
    category: "secret",
    severity: "high",
    title: "Hardcoded JWT exposed",
    description:
      "A JSON Web Token was found in client code. If it is signed with a server secret, attackers can forge tokens and bypass auth.",
    remediation:
      "Invalidate all active JWTs, never hardcode tokens, and ensure JWTs are short-lived and refreshed via an httpOnly cookie.",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    mask: true,
  },
  {
    id: "private_key_pem",
    category: "secret",
    severity: "critical",
    title: "Private key (PEM) exposed",
    description:
      "A PEM-encoded private key (RSA/EC/OpenSSH) is in the page or scripts. This is catastrophic: full impersonation until the key is rotated.",
    remediation:
      "Revoke and rotate the key everywhere it was used, scan server logs for misuse, and never commit keys — load from a secrets manager.",
    regex: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: "generic_bearer",
    category: "secret",
    severity: "medium",
    title: "Hardcoded Bearer token",
    description:
      "A `Bearer xxx` Authorization header is hardcoded into client code. Common in AI-generated fetch examples; attackers reuse it.",
    remediation:
      "Rotate the token, remove it from client bundles, and authenticate via httpOnly cookies or per-session server-issued tokens.",
    regex: /\bBearer\s+[A-Za-z0-9_\-\.]{16,}/g,
    mask: true,
  },
  {
    id: "generic_api_key_var",
    category: "api_key",
    severity: "medium",
    title: "Hardcoded API key variable",
    description:
      "A variable literally named `apiKey`/`api_key`/`API_KEY` is assigned a non-empty string in client code. Even if the key is low-privilege, this is a clear leak pattern.",
    remediation:
      "Move the assignment server-side, fetch a short-lived token from your own /api endpoint instead.",
    regex:
      /\b(api[_-]?key|apiKey|API_KEY)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]/g,
    mask: true,
  },
  {
    id: "connection_string",
    category: "secret",
    severity: "high",
    title: "Database connection string exposed",
    description:
      "A MongoDB / PostgreSQL / MySQL connection string with embedded credentials was found. Common when AI assistants inline `process.env.DATABASE_URL` into client bundles by mistake.",
    remediation:
      "Rotate the database password, ensure connection strings are server-only, and verify your bundler is not polyfilling process.env.",
    regex: /\b(mongodb(?:\+srv)?|postgres|postgresql|mysql|redis):\/\/[A-Za-z0-9._\-:]+@[A-Za-z0-9.\-]+/g,
    mask: true,
  },

  // ---- AI-generator fingerprints (low severity, but tells attacker what stack to attack) ----
  {
    id: "v0_fingerprint",
    category: "ai_fingerprint",
    severity: "info",
    title: "v0.dev (Vercel AI) fingerprint detected",
    description:
      "HTML or comments reveal the page was generated by v0.dev. This narrows the attack surface — v0 output has predictable file routes and shadcn/ui variants that attackers can fingerprint.",
    remediation:
      "Strip generator comments and meta tags before deploying. Confirm no v0-specific test routes are reachable.",
    regex: /v0\.dev|generated\s+by\s+v0|v0-generated/i,
  },
  {
    id: "claude_fingerprint",
    category: "ai_fingerprint",
    severity: "info",
    title: "Claude / Anthropic fingerprint detected",
    description:
      "Comments or text reference Claude / Anthropic as the generator. Useful for attackers when crafting social-engineering or targeted exploits.",
    remediation: "Remove AI-attribution comments before shipping.",
    regex: /(generated|built|written)\s+by\s+claude|anthropic[^"']*assistant/i,
  },
  {
    id: "chatgpt_fingerprint",
    category: "ai_fingerprint",
    severity: "info",
    title: "ChatGPT / OpenAI fingerprint detected",
    description:
      "Comments or text reference ChatGPT or OpenAI as the generator. Common in AI-built sites and a strong signal of unreviewed code.",
    remediation: "Remove AI-attribution comments before shipping.",
    regex: /(generated|built|written)\s+by\s+chatgpt|openai[^"']*assistant/i,
  },
  {
    id: "lovable_fingerprint",
    category: "ai_fingerprint",
    severity: "info",
    title: "lovable.dev fingerprint detected",
    description:
      "The site appears to be generated by lovable.dev. Lovable output ships predictable Supabase + shadcn patterns that are easy to enumerate.",
    remediation:
      "Strip lovable-specific meta/comments, harden Supabase RLS policies, and remove any default admin routes.",
    regex: /lovable(?:\.dev|app)|lovablestudio/i,
  },
  {
    id: "bolt_fingerprint",
    category: "ai_fingerprint",
    severity: "info",
    title: "bolt.new (StackBlitz) fingerprint detected",
    description:
      "The site appears to be generated by bolt.new. Bolt output often includes leftover README comments and default Vite/dev routes that should not be public.",
    remediation:
      "Strip bolt-specific comments, ensure no /src route is exposed, and verify production build vs dev build.",
    regex: /bolt\.new|stackblitz[^"']*bolt/i,
  },
  {
    id: "cursor_fingerprint",
    category: "ai_fingerprint",
    severity: "info",
    title: "Cursor AI fingerprint detected",
    description:
      "Comments reference Cursor as the editor used to build the site. Cursor-generated code frequently contains TODOs referencing internal namespaces.",
    remediation: "Remove Cursor-specific comments and any internal references.",
    regex: /cursor\.sh|cursor\.com|generated\s+with\s+cursor/i,
  },

  // ---- PII / data leaks ----
  {
    id: "email_pii",
    category: "pii",
    severity: "low",
    title: "Hardcoded email address found",
    description:
      "A real-looking email address is embedded in the page or scripts. Could be a developer or support address leaked into JS — useful for phishing and credential stuffing.",
    remediation:
      "Move contact emails behind a server route or contact form, never inline them as variables.",
    regex: /\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b/gi,
  },
  {
    id: "phone_pii",
    category: "pii",
    severity: "low",
    title: "Hardcoded phone number found",
    description:
      "A phone number with country code was found in client code. Useful for SIM-swap or social-engineering attacks.",
    remediation: "Render phone numbers through a server-rendered partial, not as client strings.",
    regex: /\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
  },

  // ---- Debug / dev endpoints ----
  {
    id: "console_log",
    category: "debug_endpoint",
    severity: "low",
    title: "Verbose console.log statements left in",
    description:
      "Many `console.log` calls ship to production. AI tools commonly add these and forget to remove them. They leak internal variable names and call paths to attackers.",
    remediation: "Use a build-time strip of console.log via Terser / babel-plugin-transform-remove-console.",
    regex: /console\.log\s*\(/g,
  },
  {
    id: "next_dev_route",
    category: "debug_endpoint",
    severity: "medium",
    title: "Next.js dev/debug route referenced",
    description:
      "Code references `/_next/data`, `/__nextjs_original-stack-frame`, or `/_next/` internals that hint at an unminified Next.js build with dev tooling on.",
    remediation: "Build with `next build && next start`, never ship `next dev` to production.",
    regex: /__nextjs_original-stack-frame|_next\/data\/|__NEXT_DEBUG/gi,
  },
  {
    id: "vite_dev",
    category: "debug_endpoint",
    severity: "medium",
    title: "Vite dev-mode artifacts referenced",
    description:
      "Vite-specific dev routes (/@vite/, /@react-refresh) are referenced. Indicates the production build is actually a dev build — exposes source via source-maps.",
    remediation: "Rebuild with `vite build` and serve `dist/`, not the dev server.",
    regex: /\/@vite\/|\/@react-refresh|\/@id\/__x00__plugin/gi,
  },

  // ---- Misconfigurations ----
  {
    id: "env_in_client",
    category: "misconfig",
    severity: "high",
    title: "`process.env.*` exposed to client bundle",
    description:
      "References to `process.env.SOMETHING` were found in shipped JS. If a bundler polyfilled process.env, all server-side environment variables may be inlined into the client.",
    remediation:
      "Switch to `import.meta.env.VITE_*` (Vite) or `NEXT_PUBLIC_*` (Next.js) for genuinely-public values. Audit your bundler config for `process.env` polyfills.",
    regex: /process\.env\.[A-Z][A-Z0-9_]{2,}/g,
  },
];

// ---- AI-generator meta fingerprint detection ----
const META_GENERATOR_HINTS: { id: string; title: string; needle: RegExp; severity: Severity }[] = [
  { id: "meta_v0", title: "v0.dev meta generator tag", needle: /v0\.dev/i, severity: "info" },
  { id: "meta_lovable", title: "lovable.dev meta generator tag", needle: /lovable/i, severity: "info" },
  { id: "meta_bolt", title: "bolt.new meta generator tag", needle: /bolt\.new/i, severity: "info" },
  { id: "meta_cursor", title: "Cursor AI meta generator tag", needle: /cursor/i, severity: "info" },
  { id: "meta_claude", title: "Claude meta generator tag", needle: /claude/i, severity: "info" },
  { id: "meta_chatgpt", title: "ChatGPT meta generator tag", needle: /chatgpt|openai/i, severity: "info" },
];

// ---- File probes (only well-known leak paths) ----
const LEAK_PATHS: { path: string; title: string; description: string; remediation: string; severity: Severity }[] = [
  {
    path: "/.env",
    title: ".env file publicly accessible",
    description:
      "The /.env endpoint returns 200 — server-side environment variables are downloadable. This is catastrophic: every secret (DB URL, API keys, JWT secret) leaks.",
    remediation:
      "Block dotfiles in your web server config (nginx/Caddy/Next.js middleware). Rotate every secret that was in .env.",
    severity: "critical",
  },
  {
    path: "/.env.local",
    title: ".env.local file publicly accessible",
    description:
      "The /.env.local endpoint returns 200. Same risk as /.env — usually contains local overrides with the real production secrets.",
    remediation: "Block dotfiles at the server level. Rotate exposed secrets.",
    severity: "critical",
  },
  {
    path: "/.git/config",
    title: ".git directory exposed",
    description:
      "The /.git/config endpoint returns 200 — the entire .git directory may be downloadable, leaking source code, history, and committed secrets.",
    remediation:
      "Block /.git in the web server config. Force-rotate any secrets that appear in git history (assume they are leaked).",
    severity: "critical",
  },
  {
    path: "/.git/HEAD",
    title: ".git HEAD exposed",
    description:
      "The /.git/HEAD endpoint returns 200 — confirms the .git directory is web-accessible.",
    remediation: "Block /.git in the web server config.",
    severity: "critical",
  },
  {
    path: "/.DS_Store",
    title: ".DS_Store file exposed",
    description:
      "macOS folder metadata file is publicly downloadable. Can leak directory listings and internal project structure.",
    remediation: "Block .DS_Store files and never commit them to the repo.",
    severity: "low",
  },
  {
    path: "/robots.txt",
    title: "robots.txt exposes sensitive paths",
    description:
      "robots.txt is reachable. Itself is not a leak, but it often lists admin/internal paths that should not be enumerated.",
    remediation:
      "Review robots.txt — make sure it does not list admin, /api/internal, or staging routes. Use `Disallow` only for genuinely public paths.",
    severity: "info",
  },
  {
    path: "/sitemap.xml",
    title: "sitemap.xml exposes route structure",
    description:
      "sitemap.xml is reachable and lists routes. Useful for attackers to enumerate the entire site surface including admin/preview routes.",
    remediation:
      "Audit sitemap entries — ensure admin/internal routes are not listed.",
    severity: "info",
  },
  {
    path: "/package.json",
    title: "package.json publicly accessible",
    description:
      "/package.json returns 200 — exposes every dependency, version, and script. Attackers can target known CVEs in those exact versions.",
    remediation: "Ensure /package.json is not served from the web root. Use a build output dir that does not include the root files.",
    severity: "medium",
  },
  {
    path: "/composer.json",
    title: "composer.json publicly accessible",
    description:
      "PHP composer.json is publicly downloadable — exposes dependency list and any private repositories.",
    remediation: "Block composer.json at the web server level.",
    severity: "medium",
  },
  {
    path: "/wp-config.php",
    title: "wp-config.php reachable",
    description:
      "wp-config.php is reachable. A 200/500 (not 404) means it executed — and may have echoed credentials on misconfigured servers.",
    remediation: "Block direct access to .php files in wp-config; ensure your web server serves index.php only.",
    severity: "high",
  },
  {
    path: "/server-status",
    title: "Apache server-status exposed",
    description:
      "mod_status server-status is publicly reachable — leaks request URLs, worker state, and child PIDs.",
    remediation: "Disable mod_status or restrict to localhost only.",
    severity: "medium",
  },
  {
    path: "/actuator/health",
    title: "Spring Boot actuator exposed",
    description:
      "/actuator/health (or sibling endpoints) is reachable. Spring Boot actuator without proper auth exposes /env, /heapdump, /mappings — full RCE in many setups.",
    remediation: "Disable or firewall actuator endpoints; require auth.",
    severity: "high",
  },
];

// ---------- Main scan ----------

function matchPatterns(
  text: string,
  location: string,
  locationType: "html" | "script",
  findings: Finding[],
  seenKeys: Set<string>,
  onFinding?: (finding: Finding) => void
): void {
  for (const p of PATTERNS) {
    if (findings.length >= MAX_FINDINGS_TOTAL) return;
    const alreadyForThisType = findings.filter(f => f.category === p.category).length;
    if (alreadyForThisType >= MAX_FINDINGS_PER_TYPE) continue;

    // Use global regex; reset lastIndex because regex objects can be stateful across calls.
    p.regex.lastIndex = 0;
    const matches = text.match(p.regex);
    if (!matches || matches.length === 0) continue;

    const sample = matches[0];
    const evidence = p.mask ? maskSecret(sample) : truncate(sample);
    const key = `${p.id}::${location}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const finding: Finding = {
      id: `${p.id}-${findings.length}`,
      category: p.category,
      severity: p.severity,
      title: p.title,
      description: p.description,
      evidence,
      location,
      locationType,
      remediation: p.remediation,
    };
    findings.push(finding);
    onFinding?.(finding);
  }
}

function extractScriptUrls(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  // match <script src="...">
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(html)) !== null && count < MAX_SCRIPTS) {
    const src = m[1];
    if (!src) continue;
    if (src.startsWith("data:")) continue;
    try {
      const abs = new URL(src, baseUrl).toString();
      out.push(abs);
      count++;
    } catch {
      // ignore malformed
    }
  }
  return out;
}

function extractSourceMapRefs(html: string, scripts: { url: string; text: string }[]): string[] {
  const out: string[] = [];
  // inline `//# sourceMappingURL=...` inside scripts
  for (const s of scripts) {
    const m = s.text.match(/\/\/\s*[#@]\s*sourceMappingURL=([^\s'"]+)/);
    if (m && m[1]) {
      try {
        out.push(new URL(m[1], s.url).toString());
      } catch { /* ignore */ }
    }
  }
  // inline in HTML for CSS source maps
  const m2 = html.match(/\/\/\s*[#@]\s*sourceMappingURL=([^\s'"]+)/);
  if (m2 && m2[1]) {
    try {
      out.push(new URL(m2[1], "").toString());
    } catch { /* ignore */ }
  }
  return out;
}

function detectMetaGenerators(html: string, findings: Finding[], seenKeys: Set<string>): void {
  // pull <meta name="generator" content="...">
  const metaRe = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const content = m[1];
    if (!content) continue;
    for (const hint of META_GENERATOR_HINTS) {
      if (!hint.needle.test(content)) continue;
      const key = `meta::${hint.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      findings.push({
        id: `${hint.id}-meta-${findings.length}`,
        category: "ai_fingerprint",
        severity: hint.severity,
        title: hint.title,
        description:
          `The HTML <meta name="generator"> tag explicitly identifies the site as built with an AI tool. ` +
          `Content: "${truncate(content, 80)}".`,
        evidence: truncate(content, 80),
        location: "html",
        locationType: "html",
        remediation:
          "Remove the generator meta tag from your <head>. It is rarely needed and is a strong AI-tool fingerprint.",
      });
    }
  }
}

function detectHtmlComments(html: string, findings: Finding[], seenKeys: Set<string>): void {
  // HTML comments often carry AI attribution ("<!-- built by v0 -->", "<!-- generated by ChatGPT -->")
  const commentRe = /<!--([\s\S]*?)-->/g;
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = commentRe.exec(html)) !== null && scanned < 50) {
    scanned++;
    const c = m[1] ?? "";
    for (const p of PATTERNS) {
      if (p.category !== "ai_fingerprint") continue;
      p.regex.lastIndex = 0;
      if (!p.regex.test(c)) continue;
      const key = `comment::${p.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      findings.push({
        id: `${p.id}-comment-${findings.length}`,
        category: p.category,
        severity: p.severity,
        title: p.title,
        description:
          p.description + " The signal was found inside an HTML comment, which is still shipped to every visitor.",
        evidence: truncate(c.trim(), 100),
        location: "html-comment",
        locationType: "html",
        remediation: p.remediation,
      });
    }
  }
}

async function probeLeakPaths(
  baseOrigin: string,
  findings: Finding[],
  seenKeys: Set<string>,
  errors: string[]
): Promise<number> {
  let probeCount = 0;
  for (const lp of LEAK_PATHS) {
    if (probeCount >= MAX_FILE_PROBES) break;
    const url = baseOrigin + lp.path;
    probeCount++;
    // HEAD first, fall back to GET
    let status = 0;
    try {
      const head = await fetch(url, {
        method: "HEAD",
        signal: safeTimeout(FILE_PROBE_TIMEOUT_MS),
        redirect: "manual",
        headers: { "User-Agent": "LeakGuard/1.0" },
      });
      status = head.status;
      // Some servers don't support HEAD on these — re-probe with GET if 405 or 404 but file likely exists
      if (status === 405 || status === 404 || status === 400) {
        const get = await fetch(url, {
          method: "GET",
          signal: safeTimeout(FILE_PROBE_TIMEOUT_MS),
          redirect: "manual",
          headers: { "User-Agent": "LeakGuard/1.0", Range: "bytes=0-127" },
        });
        status = get.status;
      }
    } catch {
      // network / timeout — not a leak, just unreachable
      continue;
    }
    // 200 = leak. 403/401 = exists but protected (still a finding, low). 404 = good, no finding.
    if (status >= 200 && status < 300) {
      const key = `file::${lp.path}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      findings.push({
        id: `file-${lp.path}-${findings.length}`,
        category: lp.path.startsWith("/.git") || lp.path.startsWith("/.env") ? "exposed_file" : "exposed_file",
        severity: lp.severity,
        title: lp.title,
        description: lp.description + ` (HTTP ${status})`,
        evidence: `GET ${lp.path} → ${status}`,
        location: url,
        locationType: "url",
        remediation: lp.remediation,
      });
    } else if (status === 401 || status === 403) {
      // Exists but protected — info only
      const key = `file_prot::${lp.path}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      findings.push({
        id: `file-prot-${lp.path}-${findings.length}`,
        category: "exposed_file",
        severity: "info",
        title: `${lp.path} is protected (HTTP ${status})`,
        description: `The endpoint exists (HTTP ${status}) but requires authorization. This is fine, but it confirms the path exists for an attacker to target.`,
        evidence: `GET ${lp.path} → ${status}`,
        location: url,
        locationType: "url",
        remediation: "No action needed beyond confirming access controls are correct.",
      });
    }
    // 404 etc. = good, skip
  }
  return probeCount;
}

async function probeSourceMap(
  scriptUrl: string,
  findings: Finding[],
  seenKeys: Set<string>
): Promise<void> {
  // try {scriptUrl}.map
  const candidates = [
    scriptUrl.endsWith(".js") ? scriptUrl + ".map" : scriptUrl + ".map",
    scriptUrl.replace(/\.js$/, "") + ".map",
  ];
  for (const url of candidates) {
    if (seenKeys.has(`smap::${url}`)) continue;
    seenKeys.add(`smap::${url}`);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: safeTimeout(FILE_PROBE_TIMEOUT_MS),
        redirect: "follow",
        headers: { "User-Agent": "LeakGuard/1.0", Range: "bytes=0-127" },
      });
      const ct = res.headers.get("content-type") || "";
      if (res.status >= 200 && res.status < 300 && /json|javascript|text|application/i.test(ct)) {
        findings.push({
          id: `smap-${findings.length}`,
          category: "source_map",
          severity: "high",
          title: "Source map exposed",
          description:
            "A .js.map file is publicly downloadable. Source maps expose the original (pre-minification) source code, including variable names, file paths, and often embedded comments with developer names.",
          evidence: `GET ${url} → ${res.status} (${ct})`,
          location: url,
          locationType: "url",
          remediation: "Disable source map generation in production builds, or serve them only behind auth.",
        });
        return; // one finding per script is enough
      }
    } catch {
      // ignore
    }
  }
}

export async function scanTarget(
  rawUrl: string,
  onProgress?: (event: ScanProgressEvent) => void
): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const errors: string[] = [];
  const findings: Finding[] = [];
  const seenKeys = new Set<string>();

  // Helper: pushes a finding AND emits a "finding" progress event (if callback provided)
  const addFinding = (f: Omit<Finding, "id">): void => {
    const finding: Finding = { ...f, id: `${f.category}-${findings.length}` };
    findings.push(finding);
    onProgress?.({ type: "finding", finding });
  };

  // Helper: emits a "stage" progress event
  const emitStage = (
    stage: ScanProgressEvent extends { type: "stage" }
      ? (ScanProgressEvent & { type: "stage" })["stage"]
      : never,
    detail: string
  ): void => {
    onProgress?.({
      type: "stage",
      stage: stage as any,
      detail,
      findingsCount: findings.length,
    });
  };

  // 1) Normalize + validate
  emitStage("acquire", `Validating URL: ${rawUrl}`);
  let target: URL;
  try {
    const withProto = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    target = new URL(withProto);
  } catch {
    return {
      targetUrl: rawUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      fetchedBytes: 0,
      scriptCount: 0,
      fileProbeCount: 0,
      findings: [],
      errors: ["Invalid URL. Please enter a domain like example.com or https://example.com"],
      ok: false,
    };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return {
      targetUrl: rawUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      fetchedBytes: 0,
      scriptCount: 0,
      fileProbeCount: 0,
      findings: [],
      errors: ["Only http(s) URLs are supported."],
      ok: false,
    };
  }

  // 2) Fetch HTML (bounded)
  emitStage("fetch_html", `Fetching HTML from ${target.toString()}`);
  const htmlRes = await fetchBounded(
    target.toString(),
    HTML_TIMEOUT_MS,
    MAX_HTML_BYTES,
    true
  );
  if (!htmlRes || htmlRes.status >= 400) {
    errors.push(
      `Failed to fetch HTML (status ${htmlRes?.status ?? "unknown"}). The site may be down, blocking bots, or require JS rendering.`
    );
    // We can still probe well-known paths
  }
  const html = htmlRes?.text ?? "";
  const fetchedBytes = htmlRes?.bytes ?? 0;

  // 3) Scan HTML for patterns + meta generator + comments
  if (html.length > 0) {
    emitStage("analyze_html", `Scanning HTML for patterns (${html.length} bytes)`);
    matchPatterns(html, target.toString(), "html", findings, seenKeys, (f) =>
      onProgress?.({ type: "finding", finding: f })
    );
    detectMetaGenerators(html, findings, seenKeys);
    detectHtmlComments(html, findings, seenKeys);
  }

  // 4) Extract script URLs (bounded) and fetch each (bounded)
  emitStage("fetch_scripts", "Extracting and fetching <script> sources");
  const scriptUrls = extractScriptUrls(html, target.toString()).slice(0, MAX_SCRIPTS);
  const scripts: { url: string; text: string }[] = [];
  for (const u of scriptUrls) {
    const r = await fetchBounded(u, JS_TIMEOUT_MS, MAX_JS_BYTES, true);
    if (r && r.text.length > 0) {
      scripts.push({ url: u, text: r.text });
    }
  }
  emitStage("pattern_match", `Pattern-matching ${scripts.length} scripts`);
  for (const s of scripts) {
    matchPatterns(s.text, s.url, "script", findings, seenKeys, (f) =>
      onProgress?.({ type: "finding", finding: f })
    );
  }

  // 5) Source map probe — only for scripts that look like real JS bundles
  emitStage("ai_fingerprint", "Probing source maps + AI fingerprints");
  for (const s of scripts) {
    if (findings.filter(f => f.category === "source_map").length >= 5) break;
    // skip tiny inline-looking scripts
    if (s.text.length < 5000) continue;
    await probeSourceMap(s.url, findings, seenKeys);
  }

  // 6) Inline source-map references
  const smapRefs = extractSourceMapRefs(html, scripts);
  for (const ref of smapRefs) {
    const key = `smap_inline::${ref}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    addFinding({
      category: "source_map",
      severity: "high",
      title: "Inline sourceMappingURL reference",
      description:
        "The script bundle contains an explicit `//# sourceMappingURL=` annotation pointing to a .map file. If that file is reachable, the original source is exposed.",
      evidence: `sourceMappingURL → ${truncate(ref, 80)}`,
      location: ref,
      locationType: "url",
      remediation: "Remove sourceMappingURL annotations from production builds (most bundlers do this automatically when sourceMap is set to false in prod).",
    });
  }

  // 7) Probe well-known leak paths (bounded)
  emitStage("probe_paths", "Probing 12 well-known leak paths");
  const probeCount = await probeLeakPaths(target.origin, findings, seenKeys, errors);

  // 8) Sort by severity
  const sevRank: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  findings.sort((a, b) => {
    const r = sevRank[a.severity] - sevRank[b.severity];
    if (r !== 0) return r;
    return a.category.localeCompare(b.category);
  });

  emitStage("complete", `Scan complete — ${findings.length} finding${findings.length === 1 ? "" : "s"}`);

  const result: ScanResult = {
    targetUrl: target.toString(),
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    fetchedBytes,
    scriptCount: scripts.length,
    fileProbeCount: probeCount,
    findings: findings.slice(0, MAX_FINDINGS_TOTAL),
    errors,
    ok: errors.length === 0,
  };
  onProgress?.({ type: "complete", result });
  return result;
}
