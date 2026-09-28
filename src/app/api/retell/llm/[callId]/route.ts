import {
  experimental_upgradeWebSocket,
  waitUntil,
  type WebSocketData
} from "@vercel/functions";
import type { WebSocket } from "ws";
import { getCharacterBySlugForUser } from "@/lib/user-characters";
import {
  verifyRetellCallContextToken,
  type RetellCallContext
} from "@/lib/retell-context";
import {
  buildRetellVoiceMessages,
  prepareRetellVoiceContext,
  streamEverBondVoiceReply,
  type RetellTranscriptItem,
  type RetellVoicePreparedContext
} from "@/lib/retell-voice";
import {
  endVoiceCall,
  prepareVoiceCallTurn
} from "@/lib/evercoin";
import { finalizeRetellVoiceCall } from "@/lib/retell-call-finalize";
import { updateRetellCallMemory } from "@/lib/retell-call-memory";

export const runtime = "nodejs";
export const maxDuration = 1800;

const MAX_CALL_MINUTES = 30;
const BILLING_IDLE_TIMEOUT_SECONDS = 90;
const BILLING_BOUNDARY_GRACE_MS = 350;
const BILLING_RETRY_MS = 3_000;
const MAX_BILLING_FAILURES = 3;

type CallDetailsEvent = {
  interaction_type: "call_details";
  call?: {
    call_id?: string;
    metadata?: Record<string, unknown>;
  };
};

type TranscriptEvent = {
  interaction_type:
    | "update_only"
    | "response_required"
    | "reminder_required";
  response_id?: number;
  transcript?: Array<{
    role?: string;
    content?: string;
  }>;
};

type RequiredEvent = TranscriptEvent & {
  interaction_type: "response_required" | "reminder_required";
  response_id: number;
};

type PingEvent = {
  interaction_type: "ping_pong";
  timestamp?: number;
};

type RetellEvent =
  | CallDetailsEvent
  | TranscriptEvent
  | PingEvent
  | {
      interaction_type?: string;
    };

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function websocketText(data: WebSocketData) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return String(data);
}

function transcriptFrom(
  event: Pick<TranscriptEvent, "transcript">
): RetellTranscriptItem[] {
  return (event.transcript ?? [])
    .map((item) => ({
      role:
        item.role === "agent" || item.role === "character"
          ? ("agent" as const)
          : ("user" as const),
      content: typeof item.content === "string" ? item.content : ""
    }))
    .filter((item) => item.content.trim());
}

export async function GET() {
  return experimental_upgradeWebSocket(
    (ws) => {
      let context: RetellCallContext | null = null;
      let characterId: string | null = null;
      let preparedContextPromise:
        | Promise<RetellVoicePreparedContext | null>
        | null = null;
      let latestTranscript: RetellTranscriptItem[] = [];
      let activeController: AbortController | null = null;
      let billingTimer: ReturnType<typeof setTimeout> | null = null;
      let billingStopped = false;
      let billingFailures = 0;
      let interruptId = 0;
      let closed = false;

      const heartbeat = setInterval(() => {
        if (closed) return;
        send(ws, {
          response_type: "ping_pong",
          timestamp: Date.now()
        });
      }, 2_000);

      function clearBillingTimer() {
        if (billingTimer) {
          clearTimeout(billingTimer);
          billingTimer = null;
        }
      }

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearBillingTimer();
        activeController?.abort();
      };

      function finalizeFromServer(reason: string) {
        if (!context) return;

        waitUntil(
          (async () => {
            try {
              const result = await finalizeRetellVoiceCall({
                userId: context!.userId,
                billingCallId: context!.billingCallId,
                reason,
                transcript: latestTranscript
              });

              if (
                result.finalized &&
                result.conversationId &&
                result.characterId &&
                result.characterSlug
              ) {
                await updateRetellCallMemory({
                  userId: context!.userId,
                  characterSlug: result.characterSlug,
                  characterId: result.characterId,
                  conversationId: result.conversationId,
                  transcript: result.transcript
                });
              }
            } catch (error) {
              console.error("RETELL_SERVER_FINALIZE_FAILED", error);
            }
          })()
        );
      }

      function endRetellCall(message: string, reason: string) {
        if (billingStopped) return;

        billingStopped = true;
        clearBillingTimer();
        activeController?.abort();
        finalizeFromServer(reason);

        interruptId += 1;
        send(ws, {
          response_type: "agent_interrupt",
          interrupt_id: interruptId,
          content: message,
          content_complete: true,
          no_interruption_allowed: true,
          end_call: true
        });
      }

      async function checkBilling() {
        if (
          closed ||
          billingStopped ||
          !context ||
          !characterId
        ) {
          return;
        }

        try {
          const result = await prepareVoiceCallTurn({
            userId: context.userId,
            callId: context.billingCallId,
            characterId,
            amount: context.callCostPerMinute,
            maxMinutes: MAX_CALL_MINUTES,
            idleTimeoutSeconds: BILLING_IDLE_TIMEOUT_SECONDS
          });

          billingFailures = 0;

          if (!result.allowed) {
            const code = result.errorCode || "CALL_ENDED";

            if (
              code === "INSUFFICIENT_EVERCOIN" ||
              code === "EVERCOIN_DEBT"
            ) {
              endRetellCall(
                "You've run out of EverCoin for this call.",
                code.toLowerCase()
              );
              return;
            }

            if (code === "CALL_LIMIT_REACHED") {
              endRetellCall(
                "We've reached the thirty minute call limit.",
                "maximum_length"
              );
              return;
            }

            billingStopped = true;
            clearBillingTimer();
            return;
          }

          const startedAt = result.startedAt
            ? Date.parse(result.startedAt)
            : NaN;

          if (!Number.isFinite(startedAt)) {
            throw new Error("RETELL_BILLING_START_TIME_INVALID");
          }

          const nextBoundary =
            startedAt +
            result.currentMinute * 60_000 +
            BILLING_BOUNDARY_GRACE_MS;

          const delay = Math.max(
            1_000,
            nextBoundary - Date.now()
          );

          clearBillingTimer();
          billingTimer = setTimeout(() => {
            void checkBilling();
          }, delay);
        } catch (error) {
          billingFailures += 1;
          console.error("RETELL_BILLING_CHECK_FAILED", error);

          if (billingFailures >= MAX_BILLING_FAILURES) {
            if (context) {
              waitUntil(
                endVoiceCall({
                  userId: context.userId,
                  callId: context.billingCallId,
                  reason: "billing_check_failed"
                }).catch(() => false)
              );
            }

            endRetellCall(
              "I have to end the call for now.",
              "billing_check_failed"
            );
            return;
          }

          clearBillingTimer();
          billingTimer = setTimeout(() => {
            void checkBilling();
          }, BILLING_RETRY_MS);
        }
      }

      ws.on("message", (data: WebSocketData) => {
        let event: RetellEvent;

        try {
          event = JSON.parse(websocketText(data)) as RetellEvent;
        } catch (error) {
          console.warn("RETELL_LLM_BAD_FRAME", error);
          return;
        }

        if (event.interaction_type === "ping_pong") {
          send(ws, {
            response_type: "ping_pong",
            timestamp:
              (event as PingEvent).timestamp ?? Date.now()
          });
          return;
        }

        if (event.interaction_type === "call_details") {
          try {
            const token =
              (event as CallDetailsEvent).call?.metadata
                ?.everbond_context;
            const verified =
              verifyRetellCallContextToken(token);

            context = verified;

            preparedContextPromise = (async () => {
              const character =
                await getCharacterBySlugForUser(
                  verified.characterSlug,
                  verified.userId
                );

              if (!character) {
                throw new Error(
                  "RETELL_CHARACTER_NOT_FOUND"
                );
              }

              characterId = character.id;

              const prepared =
                await prepareRetellVoiceContext({
                  userId: verified.userId,
                  character,
                  language: verified.language
                });

              void checkBilling();

              return prepared;
            })().catch((error) => {
              console.error(
                "RETELL_VOICE_CONTEXT_PRELOAD_FAILED",
                error
              );
              return null;
            });
          } catch (error) {
            console.error(
              "RETELL_CALL_CONTEXT_REJECTED",
              error
            );
            context = null;
            characterId = null;
            preparedContextPromise = null;
          }
          return;
        }

        if (
          event.interaction_type === "update_only" ||
          event.interaction_type === "response_required" ||
          event.interaction_type === "reminder_required"
        ) {
          const nextTranscript = transcriptFrom(
            event as TranscriptEvent
          );

          if (nextTranscript.length) {
            latestTranscript = nextTranscript;
          }
        }

        if (event.interaction_type === "update_only") {
          return;
        }

        if (
          event.interaction_type !== "response_required" &&
          event.interaction_type !== "reminder_required"
        ) {
          return;
        }

        const required = event as RequiredEvent;

        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;

        void (async () => {
          if (
            billingStopped ||
            !context ||
            !preparedContextPromise
          ) {
            return;
          }

          try {
            const prepared =
              await preparedContextPromise;

            if (
              !prepared ||
              controller.signal.aborted ||
              billingStopped
            ) {
              return;
            }

            const messages =
              buildRetellVoiceMessages({
                prepared,
                transcript: transcriptFrom(required),
                reminder:
                  required.interaction_type ===
                  "reminder_required"
              });

            let sentAny = false;

            const completeText =
              await streamEverBondVoiceReply({
                messages,
                signal: controller.signal,
                onDelta(delta) {
                  if (
                    !delta ||
                    controller.signal.aborted ||
                    billingStopped
                  ) {
                    return;
                  }

                  sentAny = true;
                  send(ws, {
                    response_type: "response",
                    response_id: required.response_id,
                    content: delta,
                    content_complete: false
                  });
                }
              });

            if (
              controller.signal.aborted ||
              billingStopped
            ) {
              return;
            }

            send(ws, {
              response_type: "response",
              response_id: required.response_id,
              content: sentAny
                ? ""
                : completeText || "Mm... I'm here.",
              content_complete: true,
              end_call: false
            });
          } catch (error) {
            if (
              controller.signal.aborted ||
              billingStopped
            ) {
              return;
            }

            console.error(
              "RETELL_VOICE_RESPONSE_FAILED",
              error
            );

            send(ws, {
              response_type: "response",
              response_id: required.response_id,
              content: "Give me one second.",
              content_complete: true,
              end_call: false
            });
          }
        })();
      });

      ws.on("close", cleanup);

      ws.on("error", (error) => {
        console.error(
          "RETELL_LLM_WEBSOCKET_ERROR",
          error
        );
        cleanup();
      });

      send(ws, {
        response_type: "config",
        config: {
          auto_reconnect: true,
          call_details: true
        }
      });

      send(ws, {
        response_type: "response",
        response_id: 0,
        content: "",
        content_complete: true,
        end_call: false
      });
    },
    { maxPayload: 256 * 1024 }
  );
}
