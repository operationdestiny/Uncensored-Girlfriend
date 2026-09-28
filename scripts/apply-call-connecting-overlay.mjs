#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const relativePath = "src/components/media/VoiceCallModal.tsx";
const absolutePath = path.join(process.cwd(), relativePath);

if (!fs.existsSync(absolutePath)) {
  throw new Error(`CALLING_OVERLAY_MISSING:${relativePath}`);
}

let source = fs.readFileSync(absolutePath, "utf8");

const labelHelper = `function callingLabel(language: LanguageCode) {
  if (language === "ES") return "Llamando...";
  if (language === "FR") return "Appel en cours...";
  if (language === "DE") return "Anruf wird aufgebaut...";
  if (language === "JA") return "発信中...";
  if (language === "KO") return "연결 중...";
  return "Calling...";
}

`;

if (!source.includes("function callingLabel(language: LanguageCode)")) {
  const anchor = `function formatDuration(totalSeconds: number) {`;

  if (!source.includes(anchor)) {
    throw new Error("CALLING_OVERLAY_ANCHOR_MISSING:label-helper");
  }

  source = source.replace(anchor, `${labelHelper}${anchor}`);
}

// Keep the UI and microphone gated until Retell explicitly reports call_ready.
// call_started means the transport has begun, but the caller can still lose the
// first words if they speak immediately. Mute at call_started, then unmute and
// expose the controls only when call_ready fires.
if (!source.includes("const markReady = () => {")) {
  const oldHandlers = `    const markActive = () => {
      callStartedRef.current = true;
      if (!cancelled) setPhase("active");
    };

    client.on("call_started", markActive);
    client.on("call_ready", markActive);`;

  const readyHandlers = `    const markStarted = () => {
      callStartedRef.current = true;

      try {
        client.mute();
      } catch {
        // Retell may already be transitioning to ready.
      }
    };

    const markReady = () => {
      callStartedRef.current = true;

      try {
        client.unmute();
      } catch {
        // Audio can already be unmuted when call_ready arrives.
      }

      if (!cancelled) {
        setMuted(false);
        setPhase("active");
      }
    };

    client.on("call_started", markStarted);
    client.on("call_ready", markReady);`;

  if (!source.includes(oldHandlers)) {
    throw new Error("CALLING_OVERLAY_ANCHOR_MISSING:retell-ready-handlers");
  }

  source = source.replace(oldHandlers, readyHandlers);
}

const overlay = `          {phase === "connecting" ? (
            <div
              className="absolute inset-x-0 bottom-3 z-40 flex justify-center px-4 sm:bottom-5"
              aria-live="polite"
            >
              <div className="flex h-20 w-full max-w-[360px] items-center justify-center rounded-[1.75rem] border border-white/10 bg-black/90 px-6 text-center text-lg font-bold text-white shadow-2xl backdrop-blur-xl sm:h-24">
                {callingLabel(language)}
              </div>
            </div>
          ) : null}

`;

const controlsAnchor =
  `          <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-6 px-4 sm:bottom-7 sm:gap-8">`;

if (!source.includes("{callingLabel(language)}")) {
  if (!source.includes(controlsAnchor)) {
    throw new Error("CALLING_OVERLAY_ANCHOR_MISSING:controls");
  }

  source = source.replace(
    controlsAnchor,
    `${overlay}${controlsAnchor}`
  );
}

const maxCallNote = `          {phase === "active" ? (
            <p className="absolute inset-x-0 bottom-1 z-20 px-4 text-center text-[10px] font-medium text-white/45 sm:bottom-1.5 sm:text-[11px]">
              (30 minutes max per call)
            </p>
          ) : null}

`;

if (!source.includes("(30 minutes max per call)")) {
  if (!source.includes(controlsAnchor)) {
    throw new Error("CALLING_OVERLAY_ANCHOR_MISSING:max-call-note");
  }

  source = source.replace(
    controlsAnchor,
    `${maxCallNote}${controlsAnchor}`
  );
}

const required = [
  'function callingLabel(language: LanguageCode)',
  'return "Calling...";',
  'return "Llamando...";',
  'return "Appel en cours...";',
  'return "Anruf wird aufgebaut...";',
  'return "発信中...";',
  'return "연결 중...";',
  'const markStarted = () => {',
  'client.mute();',
  'const markReady = () => {',
  'client.unmute();',
  'client.on("call_ready", markReady);',
  '{phase === "connecting" ? (',
  '{callingLabel(language)}',
  'bottom-3 z-40',
  'max-w-[360px]',
  '{phase === \"active\" ? (',
  '(30 minutes max per call)',
  'text-white/45'
];

for (const expected of required) {
  if (!source.includes(expected)) {
    throw new Error(`CALLING_OVERLAY_VALIDATION_FAILED:${expected}`);
  }
}

fs.writeFileSync(absolutePath, source, "utf8");

console.log(
  "EVERBOND_CALLING_OVERLAY localized=EN,ES,FR,DE,JA,KO mic-muted-until=call_ready controls-blocked-until=call_ready max-call-note=30min"
);
