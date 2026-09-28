"use client";

import { useEffect } from "react";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function PwaRuntime() {
  useEffect(() => {
    const standaloneMedia = window.matchMedia("(display-mode: standalone)");

    const syncStandaloneClass = () => {
      document.documentElement.classList.toggle(
        "everbond-standalone",
        isStandaloneDisplay()
      );
    };

    syncStandaloneClass();
    standaloneMedia.addEventListener?.("change", syncStandaloneClass);

    let cancelled = false;

    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none"
        })
        .then((registration) => {
          if (!cancelled) {
            void registration.update();
          }
        })
        .catch((error) => {
          console.error(
            "Uncensored Girlfriend PWA service worker registration failed:",
            error
          );
        });
    }

    return () => {
      cancelled = true;
      standaloneMedia.removeEventListener?.("change", syncStandaloneClass);
    };
  }, []);

  return null;
}
