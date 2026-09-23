"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, LogOut, User as UserIcon, Loader2, ShieldCheck, X, Lock, Mail, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function AuthButton() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error ?? "Registration failed");
          return;
        }
        toast.success("Account created — signing you in…");
      }
      // sign in (covers both login and post-register)
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        toast.error("Invalid email or password");
        return;
      }
      toast.success(mode === "register" ? "Welcome to LeakGuard" : "Signed in");
      setOpen(false);
      setPassword("");
      setName("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(`Auth failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        …
      </Button>
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-cyan-400/20 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-full bg-cyan-400/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
            <UserIcon className="w-3 h-3 text-cyan-300" />
          </div>
          <span className="text-[11px] text-white/70 font-mono truncate">
            {session.user.name ?? session.user.email}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ redirect: false })}
          className="text-white/50 hover:text-red-300 hover:bg-red-400/5 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="w-full lg:w-auto bg-white/5 hover:bg-cyan-400/10 text-white hover:text-cyan-300 font-medium border border-white/10 hover:border-cyan-400/40 backdrop-blur-md transition-all"
        >
          <LogIn className="w-3.5 h-3.5 mr-1.5" />
          Login
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] bg-black/85 border-cyan-400/20 backdrop-blur-2xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center mb-2 shadow-[0_0_25px_-8px_rgba(34,211,238,0.5)]">
            <ShieldCheck className="w-6 h-6 text-cyan-300" />
          </div>
          <DialogTitle className="text-foreground font-semibold tracking-tight">
            {mode === "login" ? "Access console" : "Create operator account"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {mode === "login"
              ? "Sign in to persist scans across sessions and access operator history."
              : "Create a LeakGuard operator account. Scans will be saved per-operator."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name" className="text-xs text-muted-foreground">
                Display name (optional)
              </Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="auth-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="operator1"
                  className="pl-9 bg-white/5 border-white/10"
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@example.com"
                className="pl-9 bg-white/5 border-white/10 font-mono text-sm"
                autoComplete="email"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-pw" className="text-xs text-muted-foreground">
              Password {mode === "register" && <span className="text-[10px]">(min 8 chars)</span>}
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                id="auth-pw"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 bg-white/5 border-white/10 font-mono text-sm"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-white hover:bg-white/90 text-black font-semibold border border-white/10 shadow-[0_0_30px_-10px_rgba(255,255,255,0.5)]"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Authenticating…
              </>
            ) : mode === "login" ? (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Sign in
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Create operator
              </>
            )}
          </Button>
        </form>

        <div className="text-center text-xs text-muted-foreground pt-2 border-t border-neutral-800">
          {mode === "login" ? (
            <>
              No operator account?{" "}
              <button
                type="button"
                onClick={() => setMode("register")}
                className="text-neutral-300 hover:underline font-medium"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already an operator?{" "}
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-neutral-300 hover:underline font-medium"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
