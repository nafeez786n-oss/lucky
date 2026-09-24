"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  KeyRound,
  Loader2,
  X,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  Terminal,
  Fingerprint,
  Cpu,
  Activity,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Step = "identify" | "authenticate" | "verifying" | "granted";
type Mode = "login" | "register";

const STEP_ORDER: Step[] = ["identify", "authenticate", "verifying", "granted"];
const STEP_LABELS: Record<Step, string> = {
  identify: "IDENTIFY",
  authenticate: "AUTHENTICATE",
  verifying: "VERIFYING",
  granted: "ACCESS GRANTED",
};
const STEP_NUMBERS: Record<Step, string> = {
  identify: "01",
  authenticate: "02",
  verifying: "03",
  granted: "04",
};

export function AuthOverlay({
  open,
  onClose,
  initialMode = "login",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const { data: session } = useSession();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>("identify");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verifyProgress, setVerifyProgress] = useState(0);
  const verifyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setStep("identify");
      setError("");
      setVerifyProgress(0);
    }
  }, [open, initialMode]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  // Auto-close after the GRANTED step is shown (1.8s)
  // NOTE: do NOT depend on `session?.user` here — useSession() doesn't
  // refresh synchronously after signIn() returns, so waiting for the
  // session would hang the overlay on the "Access granted" screen.
  // NOTE 2: `onClose` MUST be a stable callback (useCallback) in the parent,
  // otherwise it'll be a new reference on every parent re-render (which fires
  // when useSession updates after signIn), causing this effect to cleanup+rerun
  // in a tight loop — the 1.8s timer never gets to fire.
  useEffect(() => {
    if (open && step === "granted") {
      const t = setTimeout(onClose, 1800);
      return () => clearTimeout(t);
    }
  }, [open, step, onClose]);

  // Cleanup verify timers on unmount
  useEffect(() => {
    return () => {
      verifyTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  // ---- Verify animation: cycles through stages with progress bar, then attempts real auth
  const runVerifyAndAuth = useCallback(async () => {
    setBusy(true);
    setError("");
    setVerifyProgress(0);

    // Fake verify stages with finite timers (not a polling loop — bounded)
    const stages = [15, 35, 55, 75, 92];
    stages.forEach((pct, i) => {
      verifyTimersRef.current.push(
        setTimeout(() => setVerifyProgress(pct), (i + 1) * 280)
      );
    });

    try {
      // For register mode, hit the register endpoint first
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Registration failed");
        }
      }

      // Now sign in with credentials
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      // Clear pending verify timers + jump to 100%
      verifyTimersRef.current.forEach(clearTimeout);
      verifyTimersRef.current = [];
      setVerifyProgress(100);

      if (result?.error) {
        throw new Error("Invalid credentials");
      }

      // Brief pause then show GRANTED
      setTimeout(() => {
        setStep("granted");
        setBusy(false);
        toast.success(mode === "register" ? "Operator created" : "Access granted");
      }, 350);
    } catch (err) {
      // Clear timers
      verifyTimersRef.current.forEach(clearTimeout);
      verifyTimersRef.current = [];
      setVerifyProgress(0);
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
      setBusy(false);
      // Bounce back to authenticate step so user can retry
      setTimeout(() => setStep("authenticate"), 600);
    }
  }, [mode, email, password, name]);

  // ---- Step navigation ----
  const goIdentify = () => {
    setStep("identify");
    setError("");
  };
  const goAuthenticate = () => {
    if (mode === "register") {
      if (!name.trim()) {
        setError("Operator name is required");
        return;
      }
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid operator email");
      return;
    }
    setError("");
    setStep("authenticate");
  };
  const goVerify = () => {
    if (!password || password.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    setError("");
    setStep("verifying");
    // small delay so the verifying UI renders before async work starts
    setTimeout(() => runVerifyAndAuth(), 400);
  };

  // ---- Render ----
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/85 backdrop-blur-2xl"
          onClick={() => !busy && onClose()}
        />
        {/* Subtle scanlines + grid on top of backdrop */}
        <div className="absolute inset-0 bg-grid-fine scanline-overlay opacity-40 pointer-events-none" />

        {/* Card */}
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl glass-panel rounded-2xl overflow-hidden border-cyan-400/20"
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-4 pointer-events-none">
            <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-300/80 tracking-wider">
              <Terminal className="w-3 h-3" />
              <span>ACCESS_TERMINAL</span>
            </div>
            <button
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="pointer-events-auto w-8 h-8 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-400/40 flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>

          {/* Split layout: visual (left) + form (right) */}
          <div className="grid md:grid-cols-[1fr_1.2fr] min-h-[560px]">
            {/* === LEFT: animated visual === */}
            <div className="relative bg-gradient-to-br from-cyan-400/5 via-transparent to-violet-400/5 border-r border-white/5 hidden md:flex flex-col items-center justify-center p-8 overflow-hidden">
              {/* Animated shield icon — morphs per step */}
              <ShieldVisual step={step} />

              {/* Brand */}
              <div className="mt-8 text-center">
                <h2 className="text-2xl font-bold tracking-tight">
                  <span className="text-white">LEAK</span>
                  <span className="text-cyan-300">GUARD</span>
                </h2>
                <p className="text-[10px] text-white/40 mt-1.5 font-mono uppercase tracking-[0.25em]">
                  AI Security Console
                </p>
              </div>

              {/* Sub-tagline */}
              <p className="mt-6 text-xs text-white/50 text-center max-w-xs leading-relaxed">
                Authenticate to persist scans, track operator history, and access your private security audit log.
              </p>

              {/* Footer status pills */}
              <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between text-[10px] font-mono text-white/40">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  ENCRYPTED
                </span>
                <span>v1.0</span>
              </div>
            </div>

            {/* === RIGHT: form + steps === */}
            <div className="relative p-6 md:p-10 flex flex-col">
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-6 pt-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-cyan-300 tracking-wider">
                    STEP {STEP_NUMBERS[step]} / 04
                  </span>
                  <span className="text-sm font-mono text-white/80 tracking-wider">
                    {STEP_LABELS[step]}
                  </span>
                </div>
                <ModeToggle mode={mode} setMode={setMode} disabled={busy} />
              </div>

              {/* Progress bar */}
              <div className="h-0.5 bg-white/10 rounded-full overflow-hidden mb-8">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
                  initial={{ width: "0%" }}
                  animate={{
                    width:
                      step === "identify"
                        ? "25%"
                        : step === "authenticate"
                        ? "50%"
                        : step === "verifying"
                        ? "75%"
                        : "100%",
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>

              {/* Step content */}
              <div className="flex-1 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {/* STEP 1: IDENTIFY */}
                  {step === "identify" && (
                    <StepBody key="identify">
                      <StepHeader
                        icon={Fingerprint}
                        accent="cyan"
                        title="Identify operator"
                        subtitle={
                          mode === "register"
                            ? "Create a new operator profile to begin."
                            : "Enter your operator email to proceed."
                        }
                      />
                      {mode === "register" && (
                        <Field
                          icon={UserIcon}
                          label="OPERATOR NAME"
                          value={name}
                          onChange={setName}
                          placeholder="operator_one"
                          autoFocus
                          disabled={busy}
                        />
                      )}
                      <Field
                        icon={Mail}
                        label="OPERATOR EMAIL"
                        value={email}
                        onChange={setEmail}
                        placeholder="operator@example.com"
                        type="email"
                        autoFocus={mode === "login"}
                        disabled={busy}
                        mono
                      />
                      {error && <ErrorMessage message={error} />}
                      <div className="flex items-center gap-2 mt-6">
                        <Button
                          onClick={goAuthenticate}
                          disabled={busy}
                          className="flex-1 h-12 bg-white hover:bg-white/90 text-black font-semibold tracking-tight group"
                        >
                          Continue
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition" />
                        </Button>
                      </div>
                    </StepBody>
                  )}

                  {/* STEP 2: AUTHENTICATE */}
                  {step === "authenticate" && (
                    <StepBody key="authenticate">
                      <StepHeader
                        icon={KeyRound}
                        accent="violet"
                        title="Verify passphrase"
                        subtitle={
                          mode === "register"
                            ? "Choose a strong passphrase (min 8 chars)."
                            : "Enter your passphrase to decrypt access."
                        }
                      />
                      {/* Show operator context */}
                      <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 flex items-center justify-between text-xs font-mono">
                        <span className="text-white/40">OPERATOR</span>
                        <span className="text-cyan-300 truncate ml-2">{email}</span>
                      </div>
                      <Field
                        icon={Lock}
                        label="PASSPHRASE"
                        value={password}
                        onChange={setPassword}
                        placeholder="••••••••••••"
                        type={showPassword ? "text" : "password"}
                        autoFocus
                        disabled={busy}
                        mono
                        rightSlot={
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition"
                            tabIndex={-1}
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        }
                      />
                      {error && <ErrorMessage message={error} />}
                      <div className="flex items-center gap-2 mt-6">
                        <Button
                          onClick={goIdentify}
                          disabled={busy}
                          variant="ghost"
                          className="h-12 px-4 text-white/60 hover:text-white hover:bg-white/5"
                        >
                          <ArrowLeft className="w-4 h-4 mr-1.5" />
                          Back
                        </Button>
                        <Button
                          onClick={goVerify}
                          disabled={busy}
                          className="flex-1 h-12 bg-white hover:bg-white/90 text-black font-semibold tracking-tight group"
                        >
                          {mode === "register" ? "Create operator" : "Decrypt access"}
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition" />
                        </Button>
                      </div>
                    </StepBody>
                  )}

                  {/* STEP 3: VERIFYING */}
                  {step === "verifying" && (
                    <StepBody key="verifying">
                      <StepHeader
                        icon={Cpu}
                        accent="cyan"
                        title="Verifying credentials"
                        subtitle="Establishing encrypted channel with operator database…"
                      />
                      <VerifyProgress percent={verifyProgress} />
                      <div className="mt-6 space-y-2 text-xs font-mono">
                        {[
                          { label: "ENCRYPT CHANNEL", done: verifyProgress >= 15 },
                          { label: "LOOKUP OPERATOR", done: verifyProgress >= 35 },
                          { label: "VERIFY PASSPHRASE", done: verifyProgress >= 55 },
                          { label: "ISSUE SESSION TOKEN", done: verifyProgress >= 75 },
                          { label: "FINALIZE", done: verifyProgress >= 100 },
                        ].map((s) => (
                          <motion.div
                            key={s.label}
                            animate={{
                              opacity: s.done ? 1 : 0.4,
                              color: s.done ? "#22d3ee" : "rgba(255,255,255,0.4)",
                            }}
                            className="flex items-center gap-2"
                          >
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                                s.done
                                  ? "bg-cyan-400/20 border-cyan-400"
                                  : "border-white/20"
                              }`}
                            >
                              {s.done && <Check className="w-2.5 h-2.5 text-cyan-300" />}
                            </span>
                            {s.label}
                          </motion.div>
                        ))}
                      </div>
                      {error && <ErrorMessage message={error} />}
                    </StepBody>
                  )}

                  {/* STEP 4: ACCESS GRANTED */}
                  {step === "granted" && (
                    <StepBody key="granted">
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col items-center text-center py-6"
                      >
                        <motion.div
                          initial={{ boxShadow: "0 0 0 0 rgba(34, 211, 238, 0)" }}
                          animate={{ boxShadow: "0 0 60px -10px rgba(34, 211, 238, 0.7)" }}
                          transition={{ duration: 0.6, delay: 0.1 }}
                          className="w-20 h-20 rounded-2xl border border-cyan-400/50 bg-cyan-400/10 flex items-center justify-center mb-6"
                        >
                          <motion.div
                            initial={{ rotate: -20, scale: 0.8 }}
                            animate={{ rotate: 0, scale: 1 }}
                            transition={{ duration: 0.5, delay: 0.2, type: "spring" }}
                          >
                            <ShieldCheck className="w-10 h-10 text-cyan-300" />
                          </motion.div>
                        </motion.div>
                        <h3 className="text-2xl font-bold tracking-tight mb-2 text-gradient-cyan-violet">
                          Access granted
                        </h3>
                        <p className="text-sm text-white/60 max-w-xs">
                          Welcome back, <span className="text-cyan-300 font-mono">{name || email}</span>.
                          You can now persist scans and access operator history.
                        </p>
                        <div className="mt-6 flex items-center gap-1.5 text-[10px] font-mono text-cyan-300/70">
                          <Activity className="w-3 h-3" />
                          REDIRECTING TO CONSOLE…
                        </div>
                      </motion.div>
                    </StepBody>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-white/40">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-2.5 h-2.5" />
                  ENCRYPTED · ZERO-KNOWLEDGE
                </span>
                <span>STAGE: {STEP_LABELS[step]}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StepBody({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3"
    >
      {children}
    </motion.div>
  );
}

function StepHeader({
  icon: Icon,
  accent,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  accent: "cyan" | "violet";
  title: string;
  subtitle: string;
}) {
  const color = accent === "cyan" ? "#22d3ee" : "#a78bfa";
  return (
    <div className="mb-6">
      <div
        className="w-10 h-10 rounded-lg border flex items-center justify-center mb-3"
        style={{
          borderColor: `${color}40`,
          background: `${color}10`,
        }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <h3 className="text-xl font-bold tracking-tight mb-1">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{subtitle}</p>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  disabled,
  mono,
  rightSlot,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  mono?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          className={`h-12 pl-10 pr-${rightSlot ? "10" : "3"} bg-white/5 border-white/10 focus-visible:border-cyan-400/40 focus-visible:ring-cyan-400/20 ${
            mono ? "font-mono text-sm" : ""
          }`}
          autoComplete="off"
          spellCheck={false}
        />
        {rightSlot}
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-xs font-mono text-red-400 flex items-center gap-1.5 pt-1"
    >
      <span className="w-1 h-1 rounded-full bg-red-400" />
      {message}
    </motion.div>
  );
}

function ModeToggle({
  mode,
  setMode,
  disabled,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-0.5 p-0.5 rounded-lg border border-white/10 bg-white/5 ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {(["login", "register"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition ${
            mode === m
              ? "bg-cyan-400/15 text-cyan-300"
              : "text-white/40 hover:text-white/80"
          }`}
        >
          {m === "login" ? "Sign In" : "Register"}
        </button>
      ))}
    </div>
  );
}

function VerifyProgress({ percent }: { percent: number }) {
  return (
    <div className="space-y-2">
      <div className="h-2 bg-white/5 rounded-full overflow-hidden relative">
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-violet-400"
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
        {/* shimmer overlay */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-scan-line-h" />
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
        <span className="flex items-center gap-1.5">
          <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-300" />
          PROCESSING
        </span>
        <span className="tabular-nums text-cyan-300">{percent}%</span>
      </div>
    </div>
  );
}

// ============================================================================
// Animated shield visual (left side of the split layout) — morphs per step
// ============================================================================
function ShieldVisual({ step }: { step: Step }) {
  return (
    <div className="relative w-44 h-44">
      {/* Rotating outer rings */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0"
      >
        <div className="absolute inset-0 rounded-full border border-dashed border-cyan-400/20" />
      </motion.div>
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="absolute inset-3"
      >
        <div className="absolute inset-0 rounded-full border border-dotted border-violet-400/20" />
      </motion.div>

      {/* Glow halo */}
      <motion.div
        animate={{
          opacity:
            step === "verifying" ? [0.4, 0.8, 0.4] : step === "granted" ? 1 : 0.5,
          scale: step === "granted" ? 1.2 : 1,
        }}
        transition={{
          duration: step === "verifying" ? 1.2 : 0.5,
          repeat: step === "verifying" ? Infinity : 0,
        }}
        className="absolute inset-4 rounded-full blur-2xl"
        style={{
          background:
            step === "granted"
              ? "radial-gradient(circle, rgba(34, 211, 238, 0.6), transparent 70%)"
              : step === "verifying"
              ? "radial-gradient(circle, rgba(34, 211, 238, 0.4), transparent 70%)"
              : "radial-gradient(circle, rgba(167, 139, 250, 0.25), transparent 70%)",
        }}
      />

      {/* Center icon container */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          animate={{
            scale: step === "granted" ? 1.05 : 1,
            rotate: step === "granted" ? 0 : step === "verifying" ? [0, 5, -5, 0] : 0,
          }}
          transition={{
            duration: step === "verifying" ? 0.4 : 0.5,
            repeat: step === "verifying" ? Infinity : 0,
          }}
          className="w-24 h-24 rounded-2xl border flex items-center justify-center relative"
          style={{
            borderColor:
              step === "granted"
                ? "rgba(34, 211, 238, 0.6)"
                : step === "verifying"
                ? "rgba(34, 211, 238, 0.4)"
                : "rgba(167, 139, 250, 0.4)",
            background:
              step === "granted"
                ? "rgba(34, 211, 238, 0.1)"
                : step === "verifying"
                ? "rgba(34, 211, 238, 0.05)"
                : "rgba(167, 139, 250, 0.05)",
            boxShadow:
              step === "granted"
                ? "0 0 40px -8px rgba(34, 211, 238, 0.6)"
                : step === "verifying"
                ? "0 0 30px -10px rgba(34, 211, 238, 0.4)"
                : "0 0 25px -10px rgba(167, 139, 250, 0.3)",
          }}
        >
          <AnimatePresence mode="wait">
            {step === "identify" && (
              <motion.div
                key="lock"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 90 }}
                transition={{ duration: 0.3 }}
              >
                <Lock className="w-10 h-10 text-violet-300" />
              </motion.div>
            )}
            {step === "authenticate" && (
              <motion.div
                key="key"
                initial={{ scale: 0, rotate: 90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: -90 }}
                transition={{ duration: 0.3 }}
              >
                <KeyRound className="w-10 h-10 text-cyan-300" />
              </motion.div>
            )}
            {step === "verifying" && (
              <motion.div
                key="loader"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Loader2 className="w-10 h-10 text-cyan-300 animate-spin" />
              </motion.div>
            )}
            {step === "granted" && (
              <motion.div
                key="granted"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, type: "spring" }}
              >
                <ShieldCheck className="w-10 h-10 text-cyan-300" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Orbiting dots */}
      {[0, 1, 2, 3].map((i) => {
        const angle = (i / 4) * Math.PI * 2;
        const x = Math.cos(angle) * 80;
        const y = Math.sin(angle) * 80;
        return (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400"
            style={{
              left: "50%",
              top: "50%",
              marginLeft: x,
              marginTop: y,
            }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.3,
            }}
          />
        );
      })}
    </div>
  );
}
