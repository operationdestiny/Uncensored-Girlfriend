"use client";

import { useEffect, useState } from "react";
import {
  Download,
  Share2,
  X
} from "lucide-react";
import { useSiteLanguage } from "@/lib/site-language";

type InstallPromptEvent = Event & {
  prompt: () => Promise<{
    outcome: "accepted" | "dismissed";
    platform?: string;
  }>;
};

const INSTALL_COPY = {
  EN: {
    download: "Download the app!",
    title: "Install Uncensored Girlfriend",
    ios:
      "On iPhone or iPad, tap the Share button in Safari, choose “Add to Home Screen,” then tap “Add.”",
    browser:
      "Use your browser menu and choose “Install Uncensored Girlfriend,” “Install app,” or “Add to Home Screen.”",
    close: "Close"
  },
  ES: {
    download: "¡Descarga la app!",
    title: "Instalar Uncensored Girlfriend",
    ios:
      "En iPhone o iPad, toca Compartir en Safari, elige “Añadir a pantalla de inicio” y luego toca “Añadir”.",
    browser:
      "Usa el menú de tu navegador y elige “Instalar Uncensored Girlfriend”, “Instalar aplicación” o “Añadir a pantalla de inicio”.",
    close: "Cerrar"
  },
  FR: {
    download: "Téléchargez l’app !",
    title: "Installer Uncensored Girlfriend",
    ios:
      "Sur iPhone ou iPad, touchez Partager dans Safari, choisissez « Sur l’écran d’accueil », puis « Ajouter ».",
    browser:
      "Utilisez le menu du navigateur et choisissez « Installer Uncensored Girlfriend », « Installer l’application » ou « Ajouter à l’écran d’accueil ».",
    close: "Fermer"
  },
  DE: {
    download: "App herunterladen!",
    title: "Uncensored Girlfriend installieren",
    ios:
      "Tippe auf iPhone oder iPad in Safari auf Teilen, wähle „Zum Home-Bildschirm“ und dann „Hinzufügen“.",
    browser:
      "Öffne das Browsermenü und wähle „Uncensored Girlfriend installieren“, „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
    close: "Schließen"
  },
  JA: {
    download: "アプリをダウンロード！",
    title: "Uncensored Girlfriendをインストール",
    ios:
      "iPhoneまたはiPadでは、Safariの共有ボタンをタップし、「ホーム画面に追加」を選んでから「追加」をタップしてください。",
    browser:
      "ブラウザのメニューから「Uncensored Girlfriendをインストール」「アプリをインストール」または「ホーム画面に追加」を選んでください。",
    close: "閉じる"
  },
  KO: {
    download: "앱 다운로드!",
    title: "Uncensored Girlfriend 설치",
    ios:
      "iPhone 또는 iPad에서는 Safari의 공유 버튼을 누르고 “홈 화면에 추가”를 선택한 다음 “추가”를 누르세요.",
    browser:
      "브라우저 메뉴에서 “Uncensored Girlfriend 설치”, “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.",
    close: "닫기"
  }
} as const;

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

function isIosDevice() {
  if (typeof navigator === "undefined") return false;

  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PwaInstallButton() {
  const { language } = useSiteLanguage();
  const copy = INSTALL_COPY[language] ?? INSTALL_COPY.EN;
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState<boolean | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [prompting, setPrompting] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());

    const standaloneMedia = window.matchMedia("(display-mode: standalone)");

    const handleDisplayModeChange = () => {
      setStandalone(isStandaloneDisplay());
    };

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    const handleInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    standaloneMedia.addEventListener?.("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
      standaloneMedia.removeEventListener?.("change", handleDisplayModeChange);
    };
  }, []);

  async function installEverBond() {
    if (standalone || prompting) return;

    if (!installPrompt) {
      setShowHelp(true);
      return;
    }

    setPrompting(true);

    try {
      const result = await installPrompt.prompt();

      if (result.outcome === "accepted") {
        setStandalone(true);
      }

      setInstallPrompt(null);
    } finally {
      setPrompting(false);
    }
  }

  if (standalone !== false) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void installEverBond()}
        disabled={prompting}
        className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-bond-rose/75 bg-bond-rose/15 px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_0_18px_rgba(255,92,168,0.10)] transition hover:border-bond-rose hover:bg-bond-rose/25 disabled:cursor-default disabled:opacity-60"
      >
        <Download size={15} />
        <span>
          {prompting ? `${copy.title}...` : copy.download}
        </span>
      </button>

      {showHelp && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-[1.75rem] border border-bond-rose/45 bg-[#0b0b0f] p-5 shadow-[0_0_50px_rgba(255,92,168,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-xl font-bold text-white">
                  {copy.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-bond-muted">
                  {isIosDevice() ? copy.ios : copy.browser}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white transition hover:border-bond-rose/50"
                aria-label={copy.close}
              >
                <X size={17} />
              </button>
            </div>

            {isIosDevice() && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white">
                <Share2 size={17} className="text-bond-rose" />
                <span>{copy.ios}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
