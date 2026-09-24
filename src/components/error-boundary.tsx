"use client";

import React from "react";

/**
 * ErrorBoundary — catches client-side errors in its children.
 *
 * Used to wrap the 3D Three.js scenes so that if WebGL fails to
 * initialize (e.g. in headless browsers without GPU access), the
 * rest of the page still renders instead of crashing with
 * "Application error: a client-side exception has occurred".
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[ErrorBoundary] caught error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="h-full flex items-center justify-center text-white/30 font-mono text-xs">
            3D scene unavailable
          </div>
        )
      );
    }
    return this.props.children;
  }
}
