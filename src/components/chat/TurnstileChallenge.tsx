"use client";

import { useEffect, useRef, useState } from "react";
import type { LanguageCode } from "@/lib/site-language";

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement,
        options: {
          sitekey: string;
          theme?: "dark" | "light" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      remove?: (widgetId: string) => void;
    };
  }
}

const COPY: Record<LanguageCode, { title: string; body: string; error: string }> = {
  EN: {
    title: "Quick verification",
    body: "We detected unusual chat activity. Verify once and your conversation will continue.",
    error: "Verification could not load. Please try again."
  },
  ES: {
    title: "Verificación rápida",
    body: "Detectamos actividad de chat inusual. Verifica una vez y la conversación continuará.",
    error: "No se pudo cargar la verificación. Inténtalo de nuevo."
  },
  FR: {
    title: "Vérification rapide",
    body: "Une activité inhabituelle a été détectée. Vérifiez une fois pour continuer la conversation.",
    error: "La vérification n’a pas pu se charger. Réessayez."
  },
  DE: {
    title: "Kurze Überprüfung",
    body: "Wir haben ungewöhnliche Chat-Aktivität erkannt. Einmal bestätigen und der Chat geht weiter.",
    error: "Die Überprüfung konnte nicht geladen werden. Bitte erneut versuchen."
  },
  JA: {
    title: "簡単な確認",
    body: "通常と異なるチャット動作を検出しました。一度確認すると会話を続けられます。",
    error: "確認を読み込めませんでした。もう一度お試しください。"
  },
  KO: {
    title: "간단한 확인",
    body: "비정상적인 채팅 활동이 감지되었습니다. 한 번 확인하면 대화를 계속할 수 있습니다.",
    error: "확인을 불러오지 못했습니다. 다시 시도하세요."
  }
};

export function TurnstileChallenge({
  language,
  onVerified,
  onClose
}: {
  language: LanguageCode;
  onVerified: (token: string) => void;
  onClose: () => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const copy = COPY[language] ?? COPY.EN;

  useEffect(() => {
    if (!siteKey || !hostRef.current) {
      setError(copy.error);
      return;
    }

    let cancelled = false;
    let widgetId = "";

    function render() {
      if (cancelled || !hostRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        theme: "dark",
        appearance: "interaction-only",
        callback: (token) => {
          if (!cancelled && token) onVerified(token);
        },
        "error-callback": () => {
          if (!cancelled) setError(copy.error);
        },
        "expired-callback": () => {
          if (!cancelled) setError(copy.error);
        }
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-everbond-turnstile="true"]'
    );

    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.everbondTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", () => {
        if (!cancelled) setError(copy.error);
      });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove?.(widgetId);
    };
  }, [copy.error, onVerified, siteKey]);

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] border border-bond-rose/45 bg-bond-card p-6 text-center shadow-[0_0_36px_rgba(255,92,168,0.18)]">
        <p className="font-display text-2xl font-bold text-white">{copy.title}</p>
        <p className="mt-2 text-sm leading-6 text-bond-muted">{copy.body}</p>
        <div ref={hostRef} className="mt-5 flex min-h-[70px] justify-center" />
        {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-bond-muted hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}
