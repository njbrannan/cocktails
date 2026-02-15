"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        // Note: service workers require HTTPS (or localhost). This app runs on HTTPS in production.
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // Ignore; offline is an enhancement only.
      }
    };

    register();
  }, []);

  return null;
}

