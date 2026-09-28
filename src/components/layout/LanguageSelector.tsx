"use client";

import { useEffect, useRef, useState } from "react";
import {
  LANGUAGE_OPTIONS,
  type LanguageCode,
  useSiteLanguage
} from "@/lib/site-language";

export function LanguageSelector() {
  const { language, setLanguage, t } = useSiteLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLanguageSelect(code: LanguageCode) {
    setLanguage(code);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("ug-language", code);
      window.dispatchEvent(new Event("ug-language-change"));
      document.documentElement.lang = code.toLowerCase();
    }

    setOpen(false);
  }

  const selected =
    LANGUAGE_OPTIONS.find((item) => item.code === language) ??
    LANGUAGE_OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="v18-control v74-language-button inline-flex items-center justify-center rounded-full px-3 py-2 text-xs font-bold text-bond-text outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
      >
        <span>{selected.code}</span>
      </button>

      {open && (
        <div
          className="v79-language-menu absolute right-0 top-[calc(100%+8px)] z-[120] w-44 overflow-hidden rounded-2xl border border-bond-rose/60 bg-[#0a0a10] shadow-[0_0_0_1px_rgba(255,92,168,0.08),0_12px_34px_rgba(0,0,0,0.46),0_0_24px_rgba(255,92,168,0.12)]"
          role="listbox"
          aria-label={t("language")}
        >
          {LANGUAGE_OPTIONS.map(({ code, label }) => {
            const active = code === language;

            return (
              <div
                key={code}
                onClick={() => handleLanguageSelect(code)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleLanguageSelect(code);
                  }
                }}
                className={`v84-language-option ${
                  active
                    ? "bg-bond-rose/18 text-white"
                    : "bg-transparent text-[#F5F7FB] hover:bg-white/[0.06]"
                }`}
                role="option"
                aria-selected={active}
                tabIndex={0}
              >
                <span className="v84-language-label">{label}</span>
                <span className="v84-language-code">{code}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
