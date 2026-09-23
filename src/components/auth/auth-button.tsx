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
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30">
          <div className="w-6 h-6 rounded-full bg-blue-500/30 border border-blue-400/40 flex items-center justify-center">
            <UserIcon className="w-3 h-3 text-blue-300" />
          </div>
          <span className="text-xs text-blue-200 font-mono truncate max-w-[140px]">
            {session.user.name ?? session.user.email}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ redirect: false })}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="bg-blue-500/90 hover:bg-blue-400 text-blue-950 font-medium border border-blue-300/40 shadow-[0_0_20px_-8px_rgba(59, 130, 246,0.5)]"
        >
          <LogIn className="w-3.5 h-3.5 mr-1.5" />
          Login
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] bg-slate-950/95 border-blue-500/30 backdrop-blur-xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mb-2">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <DialogTitle className="text-foreground font-mono">
            {mode === "login" ? "Access terminal" : "Create new operator"}
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
                  className="pl-9 bg-slate-900/60 border-slate-700"
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
                className="pl-9 bg-slate-900/60 border-slate-700 font-mono text-sm"
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
                className="pl-9 bg-slate-900/60 border-slate-700 font-mono text-sm"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-500 hover:bg-blue-400 text-blue-950 font-medium border border-blue-300/40 shadow-[0_0_30px_-10px_rgba(59, 130, 246,0.7)]"
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

        <div className="text-center text-xs text-muted-foreground pt-2 border-t border-slate-800">
          {mode === "login" ? (
            <>
              No operator account?{" "}
              <button
                type="button"
                onClick={() => setMode("register")}
                className="text-blue-400 hover:underline font-medium"
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
                className="text-blue-400 hover:underline font-medium"
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
