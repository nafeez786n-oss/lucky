import type { LeakCategory, Severity } from "@/lib/leak-scanner";

export const SEVERITY_META: Record<
  Severity,
  { label: string; badge: string; dot: string; ring: string }
> = {
  critical: {
    label: "Critical",
    badge: "bg-red-500 text-white border-red-600 hover:bg-red-500",
    dot: "bg-red-500",
    ring: "ring-red-500/30",
  },
  high: {
    label: "High",
    badge: "bg-orange-500 text-white border-orange-600 hover:bg-orange-500",
    dot: "bg-orange-500",
    ring: "ring-orange-500/30",
  },
  medium: {
    label: "Medium",
    badge: "bg-amber-500 text-white border-amber-600 hover:bg-amber-500",
    dot: "bg-amber-500",
    ring: "ring-amber-500/30",
  },
  low: {
    label: "Low",
    badge: "bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-400",
    dot: "bg-yellow-400",
    ring: "ring-yellow-400/30",
  },
  info: {
    label: "Info",
    badge: "bg-sky-500 text-white border-sky-600 hover:bg-sky-500",
    dot: "bg-sky-500",
    ring: "ring-sky-500/30",
  },
};

export const CATEGORY_META: Record<
  LeakCategory,
  { label: string; description: string }
> = {
  api_key: {
    label: "API Key Leaks",
    description:
      "Hardcoded cloud / SaaS API keys shipped to the browser. The most common AI-generated-site leak.",
  },
  secret: {
    label: "Hardcoded Secrets",
    description:
      "JWTs, Bearer tokens, private keys, DB connection strings — anything that grants server-side access.",
  },
  ai_fingerprint: {
    label: "AI Generator Fingerprints",
    description:
      "Comments, meta tags, or content that reveal the site was built by an AI tool (v0, Lovable, Bolt, Cursor, Claude, ChatGPT). Narrows the attack surface.",
  },
  exposed_file: {
    label: "Exposed Files",
    description:
      "Well-known leak paths returned 200: /.env, /.git/, /package.json, /actuator, etc.",
  },
  debug_endpoint: {
    label: "Debug Endpoints",
    description:
      "Dev-mode routes, leftover console.log, Next.js /__nextjs_original-stack-frame, Vite /@vite/ — signs the production build is actually a dev build.",
  },
  source_map: {
    label: "Source Maps",
    description:
      ".map files are publicly downloadable — exposes original pre-minification source code.",
  },
  pii: {
    label: "Personal Data",
    description:
      "Hardcoded emails or phone numbers embedded in the page or scripts.",
  },
  misconfig: {
    label: "Misconfigurations",
    description:
      "`process.env.*` in client bundles and other build-pipeline misconfigurations that leak server-side values.",
  },
};

export function severityCount(
  findings: { severity: Severity }[]
): Record<Severity, number> {
  const out: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) out[f.severity]++;
  return out;
}
