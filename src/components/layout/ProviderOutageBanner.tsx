"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSiteLanguage } from "@/lib/site-language";

type Feature = "chat" | "images" | "video" | "voice";

type ProviderStatusPayload = {
  confirmedOutage?: unknown;
  sourceAvailable?: unknown;
  providerStatus?: unknown;
  incidentName?: unknown;
  checkedAt?: unknown;
};

type ObservedFeatureRequest = {
  feature: Feature;
  method: string;
};

const NORMAL_POLL_MS = 30_000;
const OUTAGE_POLL_MS = 4_000;
const CONFIRMATION_STALE_MS = 12_000;
const FEATURE_FAILURE_WINDOW_MS = 20_000;
const FEATURE_FAILURES_REQUIRED = 2;

const RETRYABLE_SERVER_STATUSES = new Set([
  500,
  502,
  503,
  504
]);

const COPY = {
  EN: {
    title: "AI service interruption",
    broad:
      "Our AI provider has confirmed an API outage. Some AI features may be temporarily unavailable.",
    exactPrefix: "Confirmed temporarily unavailable:",
    features: {
      chat: "Chat",
      images: "Images",
      video: "Video",
      voice: "Voice calls"
    }
  },
  ES: {
    title: "Interrupción del servicio de IA",
    broad:
      "Nuestro proveedor de IA ha confirmado una interrupción de la API. Algunas funciones de IA pueden no estar disponibles temporalmente.",
    exactPrefix: "Temporalmente no disponible confirmado:",
    features: {
      chat: "Chat",
      images: "Imágenes",
      video: "Vídeo",
      voice: "Llamadas de voz"
    }
  },
  FR: {
    title: "Interruption du service IA",
    broad:
      "Notre fournisseur d’IA a confirmé une panne de l’API. Certaines fonctions d’IA peuvent être temporairement indisponibles.",
    exactPrefix: "Indisponibilité temporaire confirmée :",
    features: {
      chat: "Chat",
      images: "Images",
      video: "Vidéo",
      voice: "Appels vocaux"
    }
  },
  DE: {
    title: "KI-Dienstunterbrechung",
    broad:
      "Unser KI-Anbieter hat einen API-Ausfall bestätigt. Einige KI-Funktionen sind möglicherweise vorübergehend nicht verfügbar.",
    exactPrefix: "Bestätigt vorübergehend nicht verfügbar:",
    features: {
      chat: "Chat",
      images: "Bilder",
      video: "Video",
      voice: "Sprachanrufe"
    }
  },
  JA: {
    title: "AIサービス障害",
    broad:
      "AIプロバイダーがAPI障害を確認しています。一部のAI機能が一時的に利用できない場合があります。",
    exactPrefix: "一時利用不可を確認:",
    features: {
      chat: "チャット",
      images: "画像",
      video: "動画",
      voice: "音声通話"
    }
  },
  KO: {
    title: "AI 서비스 장애",
    broad:
      "AI 제공업체에서 API 장애를 확인했습니다. 일부 AI 기능을 일시적으로 사용할 수 없을 수 있습니다.",
    exactPrefix: "일시 사용 불가 확인:",
    features: {
      chat: "채팅",
      images: "이미지",
      video: "동영상",
      voice: "음성 통화"
    }
  }
} as const;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function classifyFeatureRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): ObservedFeatureRequest | null {
  let url: URL;

  try {
    url = new URL(requestUrl(input), window.location.origin);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) return null;

  const method = requestMethod(input, init);

  if (url.pathname === "/api/chat" && method === "POST") {
    return { feature: "chat", method };
  }

  if (
    url.pathname.startsWith("/api/character-gallery/") &&
    method === "POST"
  ) {
    return { feature: "images", method };
  }

  if (
    url.pathname.startsWith("/api/character-video-gallery/") &&
    method === "POST"
  ) {
    return { feature: "video", method };
  }

  if (url.pathname === "/api/voice/turn" && method === "POST") {
    return { feature: "voice", method };
  }

  return null;
}

async function readProviderStatus(
  fetcher: typeof window.fetch
): Promise<ProviderStatusPayload | null> {
  try {
    const response = await fetcher("/api/provider-status", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      }
    });

    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") return null;

    return payload as ProviderStatusPayload;
  } catch {
    return null;
  }
}

export function ProviderOutageBanner() {
  const { language } = useSiteLanguage();
  const copy = COPY[language] ?? COPY.EN;

  const [confirmedProviderOutage, setConfirmedProviderOutage] =
    useState(false);
  const [confirmedFeatures, setConfirmedFeatures] = useState<
    Feature[]
  >([]);

  const confirmedProviderOutageRef = useRef(false);
  const lastConfirmedAtRef = useRef(0);
  const mountedRef = useRef(false);
  const featureFailureEvidenceRef = useRef<
    Record<Feature, { count: number; lastFailureAt: number }>
  >({
    chat: { count: 0, lastFailureAt: 0 },
    images: { count: 0, lastFailureAt: 0 },
    video: { count: 0, lastFailureAt: 0 },
    voice: { count: 0, lastFailureAt: 0 }
  });

  useEffect(() => {
    confirmedProviderOutageRef.current =
      confirmedProviderOutage;
  }, [confirmedProviderOutage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const confirmExactFeature = async (feature: Feature) => {
      // Re-check authoritative status at the exact moment the feature
      // experiences a server-side failure. Never reuse stale banner state.
      const status = await readProviderStatus(originalFetch);
      if (!mountedRef.current) return;

      if (
        status?.confirmedOutage === true &&
        status?.sourceAvailable === true
      ) {
        lastConfirmedAtRef.current = Date.now();
        setConfirmedProviderOutage(true);
        setConfirmedFeatures((current) =>
          current.includes(feature)
            ? current
            : [...current, feature]
        );
      }
    };

    const wrappedFetch: typeof window.fetch = async (
      input,
      init
    ) => {
      const observed = classifyFeatureRequest(input, init);

      const response = await originalFetch(input, init);

      if (!observed) return response;

      if (response.ok) {
        // A real successful request for this exact feature is stronger
        // recovery evidence than the public incident page, so remove the
        // feature-specific warning and its failure streak immediately.
        featureFailureEvidenceRef.current[observed.feature] = {
          count: 0,
          lastFailureAt: 0
        };
        setConfirmedFeatures((current) =>
          current.filter(
            (feature) => feature !== observed.feature
          )
        );
        return response;
      }

      if (RETRYABLE_SERVER_STATUSES.has(response.status)) {
        const now = Date.now();
        const previous =
          featureFailureEvidenceRef.current[observed.feature];

        const nextCount =
          now - previous.lastFailureAt <=
          FEATURE_FAILURE_WINDOW_MS
            ? previous.count + 1
            : 1;

        featureFailureEvidenceRef.current[observed.feature] = {
          count: nextCount,
          lastFailureAt: now
        };

        // Never label one isolated 5xx as a feature outage.
        if (nextCount >= FEATURE_FAILURES_REQUIRED) {
          void confirmExactFeature(observed.feature);
        }
      }

      return response;
    };

    window.fetch = wrappedFetch;

    return () => {
      if (window.fetch === wrappedFetch) {
        window.fetch = originalFetch;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const originalFetch = window.fetch.bind(window);

    async function check() {
      const status = await readProviderStatus(originalFetch);
      if (cancelled) return;

      const now = Date.now();

      if (
        status?.confirmedOutage === true &&
        status?.sourceAvailable === true
      ) {
        lastConfirmedAtRef.current = now;
        setConfirmedProviderOutage(true);
      } else {
        // Any authoritative disagreement means "do not warn".
        setConfirmedProviderOutage(false);
        setConfirmedFeatures([]);
      }

      // If confirmation cannot be refreshed while a warning is up,
      // automatically fail open instead of leaving a stale alarm visible.
      if (
        confirmedProviderOutageRef.current &&
        now - lastConfirmedAtRef.current >
          CONFIRMATION_STALE_MS
      ) {
        setConfirmedProviderOutage(false);
        setConfirmedFeatures([]);
      }

      const nextDelay =
        status?.confirmedOutage === true
          ? OUTAGE_POLL_MS
          : NORMAL_POLL_MS;

      timer = window.setTimeout(
        () => void check(),
        nextDelay
      );
    }

    const checkImmediately = () => {
      if (document.visibilityState === "visible") {
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        void check();
      }
    };

    void check();

    window.addEventListener("focus", checkImmediately);
    window.addEventListener("online", checkImmediately);
    document.addEventListener(
      "visibilitychange",
      checkImmediately
    );

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", checkImmediately);
      window.removeEventListener("online", checkImmediately);
      document.removeEventListener(
        "visibilitychange",
        checkImmediately
      );
    };
  }, []);

  const featureText = useMemo(() => {
    if (!confirmedFeatures.length) return "";

    return confirmedFeatures
      .map((feature) => copy.features[feature])
      .join(", ");
  }, [confirmedFeatures, copy.features]);

  if (!confirmedProviderOutage) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-[68px] z-[140] w-[min(94vw,860px)] -translate-x-1/2 px-2">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-bond-rose/70 bg-[#16080f]/95 px-4 py-3 text-white shadow-[0_0_30px_rgba(255,92,168,0.24)] backdrop-blur-xl"
      >
        <AlertTriangle
          size={19}
          className="mt-0.5 shrink-0 text-bond-rose"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-white">
            {copy.title}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-white/75 sm:text-sm">
            {featureText
              ? `${copy.exactPrefix} ${featureText}.`
              : copy.broad}
          </p>
        </div>
      </div>
    </div>
  );
}
