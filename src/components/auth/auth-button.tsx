"use client";

import { useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { Loader2, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthOverlay } from "@/components/auth/auth-overlay";

export function AuthButton() {
  const { data: session, status } = useSession();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<"login" | "register">("login");

  // Stable callbacks so AuthOverlay's useEffect deps don't change every render
  const openLogin = useCallback(() => {
    setOverlayMode("login");
    setOverlayOpen(true);
  }, []);
  const closeOverlay = useCallback(() => setOverlayOpen(false), []);

  /**
   * PRIVACY NOTE:
   * The sidebar chip deliberately does NOT expose the user's email/name.
   * Only a generic "OPERATOR" label + avatar icon is shown. To see their
   * own profile details (name, email, member-since, scan count, etc.),
   * the user navigates to the private #profile section, which only
   * renders when logged in and is visible only to themselves.
   */
  let trigger: React.ReactNode;
  if (status === "loading") {
    trigger = (
      <Button variant="ghost" size="sm" disabled className="w-full lg:w-auto">
        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        …
      </Button>
    );
  } else if (session?.user) {
    trigger = (
      <div className="flex items-center gap-2 w-full">
        <a
          href="#profile"
          onClick={(e) => {
            e.preventDefault();
            const el = document.querySelector("#profile");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-cyan-400/20 flex-1 min-w-0 hover:bg-cyan-400/5 hover:border-cyan-400/40 transition cursor-pointer group"
          title="View profile"
        >
          <div className="w-6 h-6 rounded-full bg-cyan-400/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
            <UserIcon className="w-3 h-3 text-cyan-300" />
          </div>
          <span className="text-[11px] text-white/60 font-mono uppercase tracking-wider group-hover:text-cyan-300 transition">
            Operator
          </span>
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ redirect: false })}
          className="text-white/50 hover:text-red-300 hover:bg-red-400/5 shrink-0 px-2"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  } else {
    trigger = (
      <Button
        size="sm"
        onClick={openLogin}
        className="w-full lg:w-auto bg-white/5 hover:bg-cyan-400/10 text-white hover:text-cyan-300 font-medium border border-white/10 hover:border-cyan-400/40 backdrop-blur-md transition-all"
      >
        <LogIn className="w-3.5 h-3.5 mr-1.5" />
        Login
      </Button>
    );
  }

  return (
    <>
      {trigger}
      <AuthOverlay
        open={overlayOpen}
        onClose={closeOverlay}
        initialMode={overlayMode}
      />
    </>
  );
}
