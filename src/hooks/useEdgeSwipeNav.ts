"use client";

import { useEffect, useRef } from "react";

type Options = {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
};

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  // Some inputs may be wrapped (e.g. inside label). Walk up a bit.
  let cur: HTMLElement | null = el;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur.tagName) {
      const t = cur.tagName.toLowerCase();
      if (t === "input" || t === "textarea" || t === "select") return true;
    }
    if (cur.isContentEditable) return true;
    cur = cur.parentElement;
  }
  return false;
}

function isStandaloneDisplayMode() {
  // iOS Safari PWA
  const nav: any = typeof navigator !== "undefined" ? navigator : null;
  if (nav && nav.standalone) return true;
  // Modern PWA
  if (typeof window !== "undefined") {
    try {
      return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
    } catch {
      return false;
    }
  }
  return false;
}

function isCapacitor() {
  return typeof window !== "undefined" && Boolean((window as any).Capacitor);
}

function edgeThresholdPx() {
  // In standalone/PWA/Capacitor we can safely use the edge.
  if (isCapacitor() || isStandaloneDisplayMode()) return 28;
  // In iOS Safari/regular browsers, the real edge is "owned" by the browser's back/forward gesture.
  // We'll still support swipe nav, but from a slightly inset zone.
  return 0;
}

export function useEdgeSwipeNav(options: Options) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const startRef = useRef<{
    x: number;
    y: number;
    t: number;
    zone: "left" | "right" | null;
    active: boolean;
  }>({ x: 0, y: 0, t: 0, zone: null, active: false });

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (!e.touches || e.touches.length !== 1) return;
      if (isEditableTarget(e.target)) return;

      const touch = e.touches[0]!;
      const x = touch.clientX;
      const y = touch.clientY;
      const w = window.innerWidth || 0;
      const edge = edgeThresholdPx();

      // "Edge" mode for standalone/capacitor; "inset edge" for normal browsers.
      let zone: "left" | "right" | null = null;
      if (edge > 0) {
        zone = x <= edge ? "left" : w > 0 && x >= w - edge ? "right" : null;
      } else {
        const insetMin = 44; // avoid iOS browser history swipe
        const insetMax = 132;
        if (x >= insetMin && x <= insetMax) zone = "left";
        else if (w > 0 && x >= w - insetMax && x <= w - insetMin) zone = "right";
      }

      startRef.current = {
        x,
        y,
        t: Date.now(),
        zone,
        active: Boolean(zone),
      };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = startRef.current;
      startRef.current.active = false;
      if (!start.active || !start.zone) return;
      if (!e.changedTouches || e.changedTouches.length !== 1) return;

      const touch = e.changedTouches[0]!;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const dt = Math.max(1, Date.now() - start.t);

      // Require a deliberate horizontal swipe.
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const velocity = absX / dt; // px/ms
      const passes =
        absX >= 90 && absX >= absY * 1.6 && (velocity >= 0.35 || absX >= 140);
      if (!passes) return;

      const { canGoBack, canGoForward, onBack, onForward } = optsRef.current;

      if (start.zone === "left" && dx > 0) {
        if (canGoBack) onBack();
        return;
      }
      if (start.zone === "right" && dx < 0) {
        if (canGoForward) onForward();
        return;
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
}
