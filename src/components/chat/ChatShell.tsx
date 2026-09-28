"use client";

import Link from "next/link";
import {
  type ClipboardEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { SignupSystemCard } from "@/components/chat/SignupSystemCard";
import { TurnstileChallenge } from "@/components/chat/TurnstileChallenge";
import {
  Gift,
  RefreshCcw,
  Send,
  Share2,
  Star,
  UserRound,
  X
} from "lucide-react";
import { Character } from "@/types/character";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ChatGiftPicker,
  type OwnedGift
} from "@/components/evershop/ChatGiftPicker";
import { EVERSHOP_COPY } from "@/lib/evershop-language";
import { InsufficientEverCoinModal } from "@/components/media/InsufficientEverCoinModal";
import { useSiteLanguage } from "@/lib/site-language";
import { FINAL_LOCALIZATION_COPY } from "@/lib/final-localization-language";
import { EverCoinChatGate } from "@/components/chat/EverCoinChatGate";

type MessageGift = {
  id: number;
  title: string;
  image: string;
};

type Message = {
  role: "user" | "character";
  content: string;
  gift?: MessageGift;
};

type GateMode = "upgrade" | null;

type ApiLanguage =
  | "English"
  | "Spanish"
  | "French"
  | "German"
  | "Japanese"
  | "Korean";

const USER_INPUT_MAX_TOKENS = 80;

const TYPING_COPY = {
  EN: (name: string) => `${name} is typing...`,
  ES: (name: string) => `${name} está escribiendo...`,
  FR: (name: string) => `${name} écrit...`,
  DE: (name: string) => `${name} schreibt...`,
  JA: (name: string) => `${name}が入力中...`,
  KO: (name: string) => `${name} 입력 중...`
} as const;

function getApiLanguage(languageCode: string): ApiLanguage {
  const normalized = languageCode.toLowerCase();

  if (normalized === "es" || normalized === "spanish") return "Spanish";
  if (normalized === "fr" || normalized === "french") return "French";
  if (normalized === "de" || normalized === "german") return "German";
  if (normalized === "ja" || normalized === "japanese") return "Japanese";
  if (normalized === "ko" || normalized === "korean") return "Korean";

  return "English";
}

function isAnonymousChatSession(session: Session | null | undefined) {
  return Boolean(
    session?.user &&
      (session.user as typeof session.user & { is_anonymous?: boolean })
        .is_anonymous
  );
}

function estimateTokenCount(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;

  const wordCount = normalized.match(/\S+/g)?.length ?? 0;
  const charCount = normalized.length;
  const cjkCount =
    normalized.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g)?.length ?? 0;

  return Math.max(wordCount, Math.ceil(charCount / 4), cjkCount);
}

function limitTextToTokenBudget(text: string, maxTokens: number) {
  const normalized = text.replace(/\s+/g, " ").trimStart();

  if (estimateTokenCount(normalized) <= maxTokens) {
    return normalized;
  }

  let low = 0;
  let high = normalized.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = normalized.slice(0, middle);

    if (estimateTokenCount(candidate) <= maxTokens) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return normalized.slice(0, low).trimEnd();
}

export function ChatShell({ character }: { character: Character }) {
  const { t, language } = useSiteLanguage();
  const { openCharacterAuthModal } = useAuth();
  const shopCopy = EVERSHOP_COPY[language] ?? EVERSHOP_COPY.EN;
  const finalCopy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;
  const { openAuthModal } = useAuth();
  const initialCharacterMessage = `${character.description}\n\n${character.openingMessage}`;

  const [messages, setMessages] = useState<Message[]>([
    { role: "character", content: initialCharacterMessage }
  ]);

  // EVERBOND_SELECTED_LANGUAGE_INTRO_SYNC
  useEffect(() => {
    setMessages((current) => {
      if (!current.length) {
        return [{ role: "character", content: initialCharacterMessage }];
      }

      if (current[0]?.role !== "character") return current;
      if (current[0].content === initialCharacterMessage) return current;

      const next = [...current];
      next[0] = {
        ...next[0],
        content: initialCharacterMessage
      };
      return next;
    });
  }, [initialCharacterMessage]);

  const [input, setInput] = useState("");
  const [gateMode, setGateMode] = useState<GateMode>(null);
  const [showPortrait, setShowPortrait] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [saved, setSaved] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);
  const [sendingGiftId, setSendingGiftId] = useState<number | null>(null);
  const [giftError, setGiftError] = useState("");
  const [everCoinGateOpen, setKissCoinsGateOpen] = useState(false);
  const [signupCardVisible, setSignupCardVisible] = useState(false);
  const [challengePending, setChallengePending] = useState<{ message: string; gift?: OwnedGift } | null>(null);

  const [chatError, setChatError] = useState("");
  const [refreshingChat, setRefreshingChat] = useState(false);
  const [coinModalOpen, setCoinModalOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sendInFlightRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatGenerationRef = useRef(0);

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const pendingMessageStorageKey = useMemo(
    () => `everbond_pending_chat_message_${character.slug}`,
    [character.slug]
  );

  function resumePendingMessage(nextSession: Session | null) {
    if (!nextSession || typeof window === "undefined") return;

    const savedPendingMessage =
      window.sessionStorage.getItem(pendingMessageStorageKey);

    if (!savedPendingMessage) return;

    window.sessionStorage.removeItem(pendingMessageStorageKey);

    window.setTimeout(() => {
      void sendMessage(savedPendingMessage, nextSession);
    }, 0);
  }

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowPortrait(false);
        setGateMode(null);
        setGiftPickerOpen(false);
      }
    };

    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isTyping, historyLoading]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAuthReady(true);
      return;
    }

    let mounted = true;

    async function initializeChatSession(
      activeClient: NonNullable<typeof supabase>
    ) {
      const existing = await activeClient.auth.getSession();
      let nextSession = existing.data.session ?? null;

      if (!nextSession) {
        const anonymous = await activeClient.auth.signInAnonymously();
        if (anonymous.error) {
          console.error("Anonymous chat sign-in failed:", anonymous.error);
        }
        nextSession = anonymous.data.session ?? null;
      }

      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(pendingMessageStorageKey);
      }
    }

    void initializeChatSession(client);

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, pendingMessageStorageKey]);

  useEffect(() => {
    if (!authReady || !session?.access_token) return;
    if (typeof window === "undefined") return;

    const accessToken = session.access_token;
    const savedPendingMessage = window.sessionStorage.getItem(
      pendingMessageStorageKey
    );

    if (savedPendingMessage) return;

    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);

      try {
        const response = await fetch(
          `/api/free-chat?characterSlug=${encodeURIComponent(character.slug)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        const data = await response.json().catch(() => ({}));

        if (cancelled || !response.ok) return;

        setConversationId(data.conversationId ?? null);

        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages([
            { role: "character", content: initialCharacterMessage },
            ...data.messages
          ]);
        } else {
          setMessages([{ role: "character", content: initialCharacterMessage }]);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    session?.access_token,
    character.slug,
    initialCharacterMessage,
    pendingMessageStorageKey
  ]);

  const similarHref = useMemo(() => {
    const tag =
      character.tags.find((item) => item !== "Ever Memory™") ?? "Romance";
    return `/characters?tag=${encodeURIComponent(tag)}`;
  }, [character.tags]);

  function focusChatInput() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function getLimitedInputValue(nextValue: string) {
    return limitTextToTokenBudget(nextValue, USER_INPUT_MAX_TOKENS);
  }

  function wouldExceedInputLimit(nextValue: string) {
    return (
      estimateTokenCount(nextValue.replace(/\s+/g, " ").trimStart()) >
      USER_INPUT_MAX_TOKENS
    );
  }

  function handleBeforeInput(event: FormEvent<HTMLInputElement>) {
    const nativeEvent = event.nativeEvent as InputEvent;
    const inputType = nativeEvent.inputType || "";

    if (inputType.startsWith("delete")) return;

    const insertedText = nativeEvent.data ?? "";
    if (!insertedText) return;

    const target = event.currentTarget;
    const start = target.selectionStart ?? input.length;
    const end = target.selectionEnd ?? input.length;
    const nextValue = input.slice(0, start) + insertedText + input.slice(end);

    if (wouldExceedInputLimit(nextValue)) {
      event.preventDefault();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();

    const pastedText = event.clipboardData.getData("text");
    if (!pastedText) return;

    const target = event.currentTarget;
    const start = target.selectionStart ?? input.length;
    const end = target.selectionEnd ?? input.length;
    const nextValue = input.slice(0, start) + pastedText + input.slice(end);

    setInput(getLimitedInputValue(nextValue));
    focusChatInput();
  }

  async function resetConversation() {
    if (refreshingChat) return;

    chatGenerationRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    sendInFlightRef.current = false;

    setRefreshingChat(true);
    setIsTyping(false);
    setGiftError("");
    setChatError("");

    try {
      if (session?.access_token) {
        const response = await fetch(
          `/api/free-chat?characterSlug=${encodeURIComponent(
            character.slug
          )}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${session.access_token}`
            }
          }
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.error || "CHAT_RESET_FAILED"
          );
        }

        setConversationId(
          data.conversationId ?? null
        );
      } else {
        setConversationId(null);
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(
          pendingMessageStorageKey
        );
      }

      setMessages([
        {
          role: "character",
          content: initialCharacterMessage
        }
      ]);
      setInput("");
    } catch (error) {
      console.error("Chat reset failed:", error);
      setChatError(finalCopy.errors.chat);
    } finally {
      setRefreshingChat(false);
      focusChatInput();
    }
  }

  function shareCompanion() {
    if (typeof window === "undefined") return;

    const url = window.location.href;

    if (navigator.share) {
      navigator
        .share({
          title: finalCopy.shareTitle(character.name),
          text: finalCopy.shareText(character.name),
          url
        })
        .catch(() => undefined);
    } else {
      void navigator.clipboard?.writeText(url);
    }
  }

  function openSignupGate(messageToHold: string) {
  const cleanMessage = messageToHold.trim();

  if (typeof window !== "undefined" && cleanMessage) {
    window.sessionStorage.setItem(
      pendingMessageStorageKey,
      cleanMessage
    );
  }

  openCharacterAuthModal({
    name: character.name,
    image: character.image
  });
}

  function openGiftPicker() {
    setGiftError("");

    if (!authReady) return;
    if (!session?.access_token || isAnonymousChatSession(session)) {
      openAuthModal();
      return;
    }

    setGiftPickerOpen(true);
  }

  async function ensureChatSession() {
    if (session?.access_token) return session;
    const client = supabase;
    if (!client) return null;

    const anonymous = await client.auth.signInAnonymously();
    if (anonymous.error || !anonymous.data.session) {
      console.error("Anonymous chat sign-in failed:", anonymous.error);
      return null;
    }

    setSession(anonymous.data.session);
    setAuthReady(true);
    return anonymous.data.session;
  }

  async function sendMessage(
    messageOverride?: string,
    sessionOverride?: Session | null,
    gift?: OwnedGift,
    turnstileToken?: string
  ) {
    const trimmed = (messageOverride ?? input)
      .replace(/\s+/g, " ")
      .trim();

    if ((!trimmed && !gift) || sendInFlightRef.current) {
      focusChatInput();
      return;
    }

    let activeSession = sessionOverride ?? session;
    if (!authReady && !activeSession) return;

    if (!activeSession?.access_token) {
      activeSession = await ensureChatSession();
      if (!activeSession?.access_token) return;
    }

    if (gift && isAnonymousChatSession(activeSession)) {
      openAuthModal();
      return;
    }

    sendInFlightRef.current = true;
    setGiftError("");
    if (gift) setSendingGiftId(gift.id);

    const requestId = crypto.randomUUID();
    const previousMessages = messages;
    const optimisticMessage: Message = {
      role: "user",
      content: trimmed,
      gift: gift
        ? { id: gift.id, title: gift.title, image: gift.image }
        : undefined
    };
    const optimisticBase = [...previousMessages, optimisticMessage];

    setInput("");
    setMessages(optimisticBase);
    setIsTyping(true);
    focusChatInput();

    try {
      const response = await fetch("/api/free-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeSession.access_token}`
        },
        body: JSON.stringify({
          requestId,
          characterSlug: character.slug,
          language: getApiLanguage(language),
          conversationId: conversationId ?? undefined,
          giftId: gift?.id,
          turnstileToken: turnstileToken || undefined,
          messages: [{ role: "user", content: trimmed }]
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessages(previousMessages);

        if (data?.error === "CHALLENGE_REQUIRED" || data?.error === "CHALLENGE_FAILED") {
          setInput(trimmed);
          setChallengePending({ message: trimmed, gift });
          return;
        }

        if (data?.error === "INSUFFICIENT_EVERCOIN" || data?.error === "EVERCOIN_DEBT") {
          setInput(trimmed);
          setKissCoinsGateOpen(true);
          return;
        }

        if (data?.error === "ACCOUNT_REQUIRED") {
          setInput(trimmed);
          openAuthModal();
          return;
        }

        if (data?.error === "GIFT_NOT_OWNED") {
          setInput(trimmed);
          setGiftError(shopCopy.noGiftsToSend);
          setGiftPickerOpen(true);
          return;
        }

        throw new Error(data?.message || data?.error || "Chat failed");
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/x-ndjson") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalReply = "";

        const applyEvent = (event: any) => {
          if (event?.type === "text" || event?.type === "replace") {
            const text = typeof event.text === "string" ? event.text : "";
            if (!text) return;
            finalReply = text;
            setIsTyping(false);
            setMessages([...optimisticBase, { role: "character", content: text }]);
          }

          if (event?.type === "done") {
            finalReply = typeof event.reply === "string" ? event.reply : finalReply;
            setConversationId(event.conversationId ?? conversationId);
            if (finalReply) {
              setMessages([
                ...optimisticBase,
                { role: "character", content: finalReply }
              ]);
            }
            setGiftPickerOpen(false);
          }

          if (event?.type === "error") {
            throw new Error(event.error || "CHAT_FAILED");
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            applyEvent(JSON.parse(line));
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) applyEvent(JSON.parse(buffer));
      } else {
        const data = await response.json().catch(() => ({}));
        setConversationId(data.conversationId ?? conversationId);
        setMessages([
          ...optimisticBase,
          { role: "character", content: data.reply }
        ]);
        setGiftPickerOpen(false);
      }

    } catch (error) {
      console.error("Chat request failed:", error);
      setMessages(previousMessages);
      setInput(trimmed);
      if (gift) {
        setGiftError(shopCopy.noGiftsToSend);
        setGiftPickerOpen(true);
      }
    } finally {
      sendInFlightRef.current = false;
      setSendingGiftId(null);
      setIsTyping(false);
      focusChatInput();
    }
  }

  const displayTags = character.tags
    .filter((tag) => tag !== "Ever Memory™")
    .slice(0, 4);

  const signupThreshold = Math.max(
    Number(process.env.NEXT_PUBLIC_SIGNUP_CARD_AFTER_MESSAGES || 8),
    1
  );
  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const anonymousChatSession = isAnonymousChatSession(session);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!anonymousChatSession || userMessageCount < signupThreshold) return;
    const key = "everbond_signup_card_seen_v1";
    if (window.localStorage.getItem(key) === "1") return;
    window.localStorage.setItem(key, "1");
    setSignupCardVisible(true);
  }, [anonymousChatSession, signupThreshold, userMessageCount]);

  return (
    <div className="ug-chat-layout grid h-[calc(100dvh-64px)] overflow-hidden bg-transparent lg:grid-cols-[360px_1fr]">
      <aside className="hidden h-[calc(100dvh-64px)] overflow-hidden border-r border-white/5 bg-black/10 p-2 lg:block">
        <div className="flex h-full flex-col pt-3">
          <div className="overflow-hidden rounded-[1.75rem] border border-bond-rose/20 bg-white/[0.035] shadow-[0_0_34px_rgba(255,92,168,0.08)]">
            <button
              type="button"
              onClick={() => setShowPortrait(true)}
              className="relative block aspect-[4/5] w-full overflow-hidden"
            >
              <img
                src={character.image}
                alt={character.name}
                className="h-full w-full object-cover"
              />
            </button>
          </div>

          <div className="mt-3.5 flex items-center gap-2.5">
            <h1 className="min-w-0 flex-1 rounded-full border border-bond-rose/70 bg-black/35 px-3.5 py-1.5 text-center font-display text-[1.6rem] font-bold leading-tight text-white shadow-[0_0_18px_rgba(255,92,168,0.10)]">
              {character.name}
            </h1>
            <Link
              href={`/character/${character.slug}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-bond-rose/70 bg-black/35 px-3 py-1.5 text-[13px] font-bold text-white shadow-[0_0_14px_rgba(255,92,168,0.08)] transition hover:bg-bond-rose/10"
            >
              <UserRound size={15} />
              {t("profileButton")}
            </Link>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-bond-rose/55 bg-black/30 px-2.5 py-1 text-[10px] text-bond-muted"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-auto flex items-center gap-2 pt-3">
            <button
              onClick={() => setSaved(!saved)}
              className={`bond-pink-button flex h-8.5 w-8.5 items-center justify-center rounded-full border text-white ${
                saved
                  ? "border-bond-gold bg-bond-gold/20 text-bond-gold"
                  : "border-white/15 bg-white/[0.035]"
              }`}
              aria-label={saved ? t("saved") : t("save")}
            >
              <Star size={15} />
            </button>
            <button
              onClick={shareCompanion}
              className="bond-pink-button flex h-8.5 w-8.5 items-center justify-center rounded-full border border-white/15 bg-white/[0.035] text-white"
              aria-label={t("share")}
            >
              <Share2 size={15} />
            </button>
            <button
              onClick={() => void resetConversation()}
              className="bond-pink-button flex h-8.5 w-8.5 items-center justify-center rounded-full border border-white/15 bg-white/[0.035] text-white"
              aria-label={t("refresh")}
            >
              <RefreshCcw size={15} />
            </button>
          </div>

          <Link
            href={similarHref}
            className="bond-pink-button mt-2.5 block rounded-lg bg-bond-rose px-3 py-1.5 text-center text-[11px] font-bold text-white shadow-[0_0_18px_rgba(255,92,168,0.18)]"
          >
            {t("similarCompanions")}
          </Link>

        </div>
      </aside>

      <section className="flex h-[calc(100dvh-64px)] min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 p-4 lg:hidden">
          <button
            type="button"
            onClick={() => setShowPortrait(true)}
            className="flex min-w-0 items-center gap-3"
          >
            <img
              src={character.image}
              alt={character.name}
              className="h-14 w-14 rounded-2xl object-cover"
            />
            <div className="min-w-0 text-left">
              <h1 className="truncate font-display text-xl font-bold">
                {character.name}
              </h1>
              <p className="truncate text-sm text-bond-muted">
                {character.archetype}
              </p>
            </div>
          </button>
          <LanguageSelector />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-3.5 md:p-5">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end space-y-3.5">
              {historyLoading && (
                <div className="flex justify-start">
                  <div className="rounded-[1.5rem] border border-bond-rose/35 bg-white/[0.03] px-5 py-4 text-bond-muted">
                    <span className="animate-pulse">{finalCopy.restoringBond}</span>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex w-full ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[720px] whitespace-pre-line rounded-[1.3rem] px-4 py-3 leading-7 ${
                      message.role === "user"
                        ? "bg-bond-rose text-white"
                        : "border border-bond-rose/55 bg-white/[0.04] text-bond-text"
                    }`}
                  >
                    {message.gift && (
                      <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/20 bg-black/20 p-2.5">
                        <img
                          src={message.gift.image}
                          alt={message.gift.title}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">
                            {shopCopy.giftPickerTitle}
                          </p>
                          <p className="line-clamp-2 text-sm font-bold text-white">
                            {message.gift.title}
                          </p>
                        </div>
                      </div>
                    )}
                    {message.content && <p>{message.content}</p>}
                  </div>
                </div>
              ))}

              {signupCardVisible && anonymousChatSession && (
                <SignupSystemCard
                  language={language}
                  onCreateAccount={openAuthModal}
                  onDismiss={() => setSignupCardVisible(false)}
                />
              )}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="rounded-[1.5rem] border border-bond-rose/55 bg-white/[0.04] px-5 py-4 text-bond-muted">
                    <span className="animate-pulse">
                      {(TYPING_COPY[language] ?? TYPING_COPY.EN)(character.name)}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-white/5 bg-bond-bg/88 p-3 backdrop-blur-xl">
            {giftError && (
              <div className="mx-auto mb-2 flex max-w-4xl justify-end">
                <p className="line-clamp-1 text-xs text-red-200">{giftError}</p>
              </div>
            )}

            {chatError && (
              <div className="mx-auto mb-2 flex max-w-4xl justify-end">
                <p className="text-xs text-red-200">
                  {chatError}
                </p>
              </div>
            )}

            <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-full bg-white/[0.04] p-1.5 bond-chat-input">
              <input
                ref={inputRef}
                value={input}
                onBeforeInput={handleBeforeInput}
                onPaste={handlePaste}
                onChange={(event) =>
                  setInput(getLimitedInputValue(event.target.value))
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={`${t("messageCharacter")} ${character.name}...`}
                className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-bond-muted"
              />
              <button
                type="button"
                onClick={openGiftPicker}
                disabled={isTyping}
                className="bond-pink-button flex h-9 w-9 items-center justify-center rounded-lg border border-bond-rose/60 bg-bond-rose/15 text-bond-rose disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={shopCopy.giftButton}
              >
                <Gift size={16} />
              </button>
              <button
                onClick={() => void sendMessage()}
                disabled={isTyping}
                className="bond-pink-button flex h-9 w-9 items-center justify-center rounded-lg bg-bond-rose disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("sendMessage")}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <InsufficientEverCoinModal
        open={coinModalOpen}
        onClose={() => setCoinModalOpen(false)}
      />

      <EverCoinChatGate
        open={everCoinGateOpen}
        onClose={() => {
          setKissCoinsGateOpen(false);
          focusChatInput();
        }}
      />

      <ChatGiftPicker
        open={giftPickerOpen}
        session={session}
        characterName={character.name}
        sendingGiftId={sendingGiftId}
        onClose={() => setGiftPickerOpen(false)}
        onSend={(gift) => void sendMessage(undefined, undefined, gift)}
      />

      {showPortrait && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowPortrait(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-[min(92vw,520px)] overflow-hidden rounded-[1.75rem] border border-white/10 bg-black shadow-glow"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setShowPortrait(false)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black"
              aria-label={t("closePortrait")}
            >
              <X size={18} />
            </button>
            <img
              src={character.image}
              alt=""
              className="max-h-[90vh] w-full object-contain"
            />
          </div>
        </div>
      )}

      {gateMode === "upgrade" && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative grid w-full max-w-3xl overflow-hidden rounded-[2rem] border-2 border-bond-rose/70 bg-bond-card shadow-[0_0_36px_rgba(255,92,168,0.28)] md:grid-cols-[0.95fr_1.05fr]">
        <button
          onClick={() => setGateMode(null)}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/45 p-1.5 text-bond-muted hover:text-white"
          aria-label={t("close")}
        >
          <X size={18} />
        </button>

        <div className="relative min-h-[360px] overflow-hidden bg-black">
          <img
            src={character.image}
            alt={character.name}
            className="h-full min-h-[360px] w-full object-cover"
          />

          <div className="absolute bottom-0 left-0 right-0 flex justify-center bg-gradient-to-t from-black/85 via-black/45 to-transparent px-5 pb-5 pt-16">
            <p className="max-w-[88%] text-center text-[14px] font-semibold leading-5 text-bond-rose drop-shadow-[0_0_12px_rgba(255,92,168,0.65)]">
              {finalCopy.coinRequiredMessage}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center p-6 md:p-8">
          <p className="text-center font-display text-3xl font-bold text-bond-rose drop-shadow-[0_0_14px_rgba(255,92,168,0.28)]">
            {finalCopy.keepCompanion}
          </p>

          <div className="mt-8">
            <Link
              href="/coins"
              className="bond-pink-button block rounded-xl bg-bond-rose px-6 py-4 text-center text-base font-extrabold text-white shadow-[0_0_26px_rgba(255,92,168,0.30)] transition hover:scale-[1.01] hover:bg-bond-rose/90"
            >
              Buy KissCoins
            </Link>
          </div>
        </div>
      </div>
    </div>
  )}
      {challengePending && (
        <TurnstileChallenge
          language={language}
          onClose={() => setChallengePending(null)}
          onVerified={(token) => {
            const pending = challengePending;
            setChallengePending(null);
            if (pending) {
              void sendMessage(pending.message, undefined, pending.gift, token);
            }
          }}
        />
      )}

    </div>
  );
}
