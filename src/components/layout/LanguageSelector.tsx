"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import {
  LANGUAGE_OPTIONS,
  type LanguageCode,
  useSiteLanguage
} from "@/lib/site-language";

export function LanguageSelector() {
  const { language, setLanguage, t } = useSiteLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function chooseLanguage(code: LanguageCode) {
    setLanguage(code);
    document.documentElement.lang = code.toLowerCase();
    setOpen(false);
  }

  const selected = LANGUAGE_OPTIONS.find((item) => item.code === language) ??
    LANGUAGE_OPTIONS[0];

  return (
    <div ref={ref} className="ug-language-select">
      <button
        type="button"
        className="ug-language-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("language") + ": " + selected.label}
        title={selected.label}
      >
        <Languages size={17} aria-hidden="true" />
        <span>{selected.code}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="ug-language-menu" role="menu" aria-label={t("language")}>
          {LANGUAGE_OPTIONS.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={code === language}
              className={code === language ? "ug-language-option selected" : "ug-language-option"}
              onClick={() => chooseLanguage(code)}
            >
              <span>{label}</span>
              <span className="ug-language-option-end">
                <small>{code}</small>
                {code === language && <Check size={14} aria-hidden="true" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
