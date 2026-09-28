"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { RetellWebClient } from "retell-client-js-sdk";
import type { Character } from "@/types/character";
import type { LanguageCode } from "@/lib/site-language";
import { InsufficientEverCoinModal } from "@/components/media/InsufficientEverCoinModal";

type CallPhase = "connecting" | "active" | "error";

type TranscriptItem = {
  role: "user" | "agent";
  content: string;
};

type Props = {
  open: boolean;
  character: Character;
  displayImage: string;
  session: Session;
  language: LanguageCode;
  onClose: () => void;
};

function apiLanguage(language: LanguageCode) {
  if (language === "ES") return "Spanish";
  if (language === "FR") return "French";
  if (language === "DE") return "German";
  if (language === "JA") return "Japanese";
  if (language === "KO") return "Korean";
  return "English";
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
}

function normalizeTranscript(value: unknown): TranscriptItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 400)
    .map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const role =
        record.role === "agent" ||
        record.role === "character"
          ? ("agent" as const)
          : record.role === "user"
            ? ("user" as const)
            : null;
      const content =
        typeof record.content === "string"
          ? record.content
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 4000)
          : "";

      return role && content
        ? { role, content }
        : null;
    })
    .filter(
      (item): item is TranscriptItem => Boolean(item)
    );
}

function compactForKeepalive(
  transcript: TranscriptItem[]
) {
  const result: TranscriptItem[] = [];
  let characters = 0;

  for (const item of transcript) {
    const content = item.content.slice(0, 1000);
    const next = characters + content.length + 32;
    if (next > 48_000) break;

    result.push({
      role: item.role,
      content
    });
    characters = next;
  }

  return result;
}

export function VoiceCallModal({
  open,
  character,
  displayImage,
  session,
  language,
  onClose
}: Props) {
  const clientRef = useRef<RetellWebClient | null>(
    null
  );
  const onCloseRef = useRef(onClose);
  const billingCallIdRef = useRef<string | null>(
    null
  );
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const callStartedRef = useRef(false);
  const closingRef = useRef(false);

  const [phase, setPhase] =
    useState<CallPhase>("connecting");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [coinModalOpen, setCoinModalOpen] =
    useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const finalizeBillingCall = useCallback(
    (
      reason: string,
      keepalive = false
    ) => {
      const callId = billingCallIdRef.current;
      if (!callId) return;

      const transcript = keepalive
        ? compactForKeepalive(transcriptRef.current)
        : transcriptRef.current;

      void fetch("/api/voice/call-end", {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          callId,
          reason,
          transcript
        }),
        cache: "no-store",
        keepalive
      }).catch((error) => {
        console.warn(
          "RETELL_CALL_FINALIZE_FAILED",
          error
        );
      });
    },
    [session.access_token]
  );

  const stopCall = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    finalizeBillingCall("user_hangup");

    try {
      clientRef.current?.stopCall();
    } catch {
      // The SDK may already be disconnected.
    }

    clientRef.current = null;
    onCloseRef.current();
  }, [finalizeBillingCall]);

  useEffect(() => {
    if (!open) return;

    closingRef.current = false;
    callStartedRef.current = false;
    billingCallIdRef.current = null;
    transcriptRef.current = [];
    setPhase("connecting");
    setMuted(false);
    setSeconds(0);

    let cancelled = false;
    const client = new RetellWebClient();
    clientRef.current = client;

    const markActive = () => {
      callStartedRef.current = true;
      if (!cancelled) setPhase("active");
    };

    client.on("call_started", markActive);
    client.on("call_ready", markActive);

    client.on("update", (update) => {
      if (cancelled) return;

      const transcript = normalizeTranscript(
        update?.transcript
      );

      if (transcript.length) {
        transcriptRef.current = transcript;
      }
    });

    client.on("call_ended", () => {
      finalizeBillingCall(
        closingRef.current
          ? "user_hangup"
          : "retell_call_ended"
      );

      if (cancelled || closingRef.current) return;

      closingRef.current = true;
      clientRef.current = null;
      onCloseRef.current();
    });

    client.on("error", (sdkError) => {
      console.error(
        "RETELL_WEB_CALL_ERROR",
        sdkError
      );

      if (cancelled) return;

      setPhase("error");
      finalizeBillingCall("retell_client_error");
      onCloseRef.current();
    });

    async function start() {
      try {
        const response = await fetch(
          "/api/voice/call-start",
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              characterSlug: character.slug,
              language: apiLanguage(language)
            }),
            cache: "no-store"
          }
        );

        const payload = await response
          .json()
          .catch(() => ({}));

        if (
          response.status === 402 ||
          payload?.error ===
            "INSUFFICIENT_EVERCOIN" ||
          payload?.error === "EVERCOIN_DEBT"
        ) {
          if (!cancelled) {
            setCoinModalOpen(true);
            onCloseRef.current();
          }
          return;
        }

        if (
          !response.ok ||
          typeof payload?.accessToken !== "string" ||
          typeof payload?.billingCallId !== "string"
        ) {
          throw new Error(
            String(
              payload?.error ??
                "RETELL_CALL_START_FAILED"
            )
          );
        }

        billingCallIdRef.current =
          payload.billingCallId;

        if (cancelled) {
          finalizeBillingCall(
            "client_cancelled_before_start",
            true
          );
          return;
        }

        await client.startCall({
          accessToken: payload.accessToken
        });

        if (!cancelled) {
          void client
            .startAudioPlayback()
            .catch((playbackError) => {
              console.warn(
                "RETELL_AUDIO_PLAYBACK_START_FAILED",
                playbackError
              );
            });
        }
      } catch (startError) {
        console.error(
          "RETELL_WEB_CALL_START_FAILED",
          startError
        );

        if (cancelled) return;

        setPhase("error");
        finalizeBillingCall(
          "retell_client_start_failed"
        );
        onCloseRef.current();
      }
    }

    void start();

    return () => {
      cancelled = true;

      if (billingCallIdRef.current) {
        finalizeBillingCall(
          callStartedRef.current
            ? "client_unmount"
            : "client_cancelled_before_start",
          true
        );
      }

      try {
        client.stopCall();
      } catch {
        // Ignore cleanup races.
      }

      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [
    character.slug,
    finalizeBillingCall,
    language,
    open,
    session.access_token
  ]);

  useEffect(() => {
    if (!open || phase !== "active") return;

    const interval = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [open, phase]);

  function toggleMute() {
    const client = clientRef.current;
    if (!client) return;

    try {
      if (muted) {
        client.unmute();
        setMuted(false);
      } else {
        client.mute();
        setMuted(true);
      }
    } catch (muteError) {
      console.warn(
        "RETELL_MUTE_TOGGLE_FAILED",
        muteError
      );
    }
  }

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[1000] overflow-hidden bg-[#050507]"
          role="dialog"
          aria-modal="true"
          aria-label={`Call ${character.name}`}
        >
          <h2 className="absolute left-1/2 top-5 z-20 max-w-[70vw] -translate-x-1/2 truncate text-center text-2xl font-black text-white sm:text-3xl">
            {character.name}
          </h2>

          <button
            type="button"
            onClick={stopCall}
            className="absolute right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75 sm:right-6 sm:top-5"
            aria-label="Close call"
          >
            <X size={24} />
          </button>

          <div className="absolute inset-x-0 bottom-28 top-16 flex items-center justify-center px-2 sm:bottom-32 sm:top-20 sm:px-4">
            <img
              src={
                displayImage || character.image
              }
              alt={character.name}
              className="h-full w-full object-contain"
            />
          </div>

          <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-6 px-4 sm:bottom-7 sm:gap-8">
            <button
              type="button"
              onClick={toggleMute}
              disabled={phase !== "active"}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-md transition hover:bg-white/20 disabled:opacity-40 sm:h-16 sm:w-16"
              aria-label={
                muted
                  ? "Unmute microphone"
                  : "Mute microphone"
              }
            >
              {muted ? (
                <MicOff size={25} />
              ) : (
                <Mic size={25} />
              )}
            </button>

            <div className="min-w-[88px] text-center font-mono text-xl font-bold tabular-nums text-white sm:text-2xl">
              {formatDuration(seconds)}
            </div>

            <button
              type="button"
              onClick={stopCall}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-500 sm:h-16 sm:w-16"
              aria-label="Hang up"
            >
              <PhoneOff size={27} />
            </button>
          </div>
        </div>
      ) : null}

      <InsufficientEverCoinModal
        open={coinModalOpen}
        onClose={() =>
          setCoinModalOpen(false)
        }
      />
    </>
  );
}
