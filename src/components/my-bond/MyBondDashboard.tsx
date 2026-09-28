"use client";

import Link from "next/link";
import {
  Check,
  Heart,
  MessageCircleMore,
  MessagesSquare,
  Pencil,
  Plus,
  RefreshCcw,
  UserRound,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState
} from "react";
import type { Session } from "@supabase/supabase-js";
import { CreatorLink } from "@/components/character/CreatorLink";
import { MyCompanionActions, type UpdatedCompanion } from "@/components/my-bond/MyCompanionActions";
import { useSiteLanguage } from "@/lib/site-language";
import { MY_BOND_COPY } from "@/lib/my-bond-language";
import { localizedErrorMessage } from "@/lib/final-localization-language";

type CompanionSummary = {
  id: string;
  slug: string;
  name: string;
  image: string;
  title: string;
  visibility: "public" | "private";
  creatorUsername?: string;
};

type RecentChat = CompanionSummary & {
  conversationId: string;
  lastReply: string;
  updatedAt: string;
};

type MyBondData = {
  profile: {
    email: string;
    username: string;
    memberSince: string;
    messagesLeft: number;
  };
  counts: {
    recentChats: number;
    createdCompanions: number;
    favorites: number;
  };
  recentChats: RecentChat[];
  createdCompanions: CompanionSummary[];
  favorites: CompanionSummary[];
};

type CompanionFilter = "all" | "public" | "private";

const localeByLanguage = {
  EN: "en-US",
  ES: "es-ES",
  FR: "fr-FR",
  JA: "ja-JP",
  DE: "de-DE",
  KO: "ko-KR"
} as const;

function CompanionImage({
  companion
}: {
  companion: CompanionSummary;
}) {
  return (
    <img
      src={companion.image}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
}

export function MyBondDashboard({
  session
}: {
  session: Session;
}) {
  const { language } = useSiteLanguage();
  const copy = MY_BOND_COPY[language] ?? MY_BOND_COPY.EN;

  const [data, setData] = useState<MyBondData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<CompanionFilter>("all");
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameNotice, setUsernameNotice] = useState("");
  const [usernameError, setUsernameError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/my-bond", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        cache: "no-store"
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          localizedErrorMessage(
            payload?.message ?? payload?.error,
            language,
            copy.loadError,
            "loadBond"
          )
        );
      }

      const nextData = payload as MyBondData;
      setData(nextData);
      setUsernameDraft(nextData.profile.username);
    } catch (error) {
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : copy.loadError
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveUsername() {
    const username = usernameDraft.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setUsernameError(copy.invalidUsername);
      setUsernameNotice("");
      return;
    }

    setUsernameSaving(true);
    setUsernameError("");
    setUsernameNotice("");

    try {
      const response = await fetch("/api/my-bond", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.error === "USERNAME_TAKEN") {
          throw new Error(copy.usernameTaken);
        }

        if (payload?.error === "INVALID_USERNAME") {
          throw new Error(copy.invalidUsername);
        }

        throw new Error(copy.usernameUpdateFailed);
      }

      const updatedUsername =
        typeof payload?.username === "string"
          ? payload.username
          : username;

      setData((current) => {
        if (!current) return current;
        const previousUsername = current.profile.username;

        const updateCompanion = <T extends CompanionSummary>(
          companion: T
        ): T =>
          companion.creatorUsername === previousUsername
            ? {
                ...companion,
                creatorUsername: updatedUsername
              }
            : companion;

        return {
          ...current,
          profile: {
            ...current.profile,
            username: updatedUsername
          },
          recentChats:
            current.recentChats.map(updateCompanion),
          createdCompanions:
            current.createdCompanions.map((companion) => ({
              ...companion,
              creatorUsername: updatedUsername
            })),
          favorites:
            current.favorites.map(updateCompanion)
        };
      });

      setUsernameDraft(updatedUsername);
      setEditingUsername(false);
      setUsernameNotice(copy.usernameUpdated);
    } catch (error) {
      setUsernameError(
        error instanceof Error
          ? error.message
          : copy.usernameUpdateFailed
      );
    } finally {
      setUsernameSaving(false);
    }
  }


  function handleCompanionUpdated(updated: UpdatedCompanion) {
    setData((current) => {
      if (!current) return current;

      const updateItem = <T extends CompanionSummary>(item: T): T =>
        item.id === updated.id
          ? ({ ...item, ...updated } as T)
          : item;

      return {
        ...current,
        recentChats: current.recentChats.map(updateItem),
        createdCompanions: current.createdCompanions.map(updateItem),
        favorites: current.favorites.map(updateItem)
      };
    });
  }

  function handleCompanionDeleted(characterId: string) {
    setData((current) => {
      if (!current) return current;

      const hadRecentChat = current.recentChats.some(
        (item) => item.id === characterId
      );
      const wasFavorite = current.favorites.some(
        (item) => item.id === characterId
      );

      return {
        ...current,
        counts: {
          ...current.counts,
          createdCompanions: Math.max(
            current.counts.createdCompanions - 1,
            0
          ),
          recentChats: Math.max(
            current.counts.recentChats - (hadRecentChat ? 1 : 0),
            0
          ),
          favorites: Math.max(
            current.counts.favorites - (wasFavorite ? 1 : 0),
            0
          )
        },
        recentChats: current.recentChats.filter(
          (item) => item.id !== characterId
        ),
        createdCompanions: current.createdCompanions.filter(
          (item) => item.id !== characterId
        ),
        favorites: current.favorites.filter(
          (item) => item.id !== characterId
        )
      };
    });
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token]);

  const visibleCompanions = useMemo(() => {
    if (!data) return [];

    if (filter === "all") {
      return data.createdCompanions;
    }

    return data.createdCompanions.filter(
      (companion) => companion.visibility === filter
    );
  }, [data, filter]);

  const locale = localeByLanguage[language] ?? "en-US";

  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-12 md:px-6">
        <section className="bond-container">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-bond-rose/35 bg-white/[0.035] p-10 text-center shadow-[0_0_44px_rgba(255,92,168,0.08)]">
            <p className="animate-pulse text-bond-muted">
              {copy.loadingBond}
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!data || loadError) {
    return (
      <main className="min-h-screen px-4 py-12 md:px-6">
        <section className="bond-container">
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-400/25 bg-red-500/[0.06] p-8 text-center">
            <p className="text-red-100">
              {loadError || copy.loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-bond-rose px-6 py-3 text-sm font-bold text-white"
            >
              <RefreshCcw size={16} />
              {copy.retry}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const summaryCards = [
    {
      label: copy.recentChats,
      value: data.counts.recentChats,
      icon: MessagesSquare
    },
    {
      label: copy.createdCompanions,
      value: `${data.counts.createdCompanions} / 25`,
      icon: UserRound
    },
    {
      label: copy.favorites,
      value: data.counts.favorites,
      icon: Heart
    }
  ];

  return (
    <main className="min-h-screen px-4 py-10 md:px-6 md:py-12">
      <section className="bond-container">
        <div className="mx-auto max-w-7xl">
          <section className="relative overflow-hidden rounded-[2rem] border border-bond-rose/45 bg-[linear-gradient(135deg,rgba(255,92,168,0.10),rgba(255,255,255,0.025),rgba(89,45,130,0.12))] p-7 shadow-[0_0_48px_rgba(255,92,168,0.10)] md:p-10">
            <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-bond-rose/15 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-bond-rose">
                  {copy.dashboardEyebrow}
                </p>
                <h1 className="mt-4 font-display text-4xl font-bold text-white md:text-6xl">
                  {copy.welcomeBack},{" "}
                  <span className="text-bond-rose">
                    @{data.profile.username}
                  </span>
                </h1>
                <p className="mt-3 text-base text-bond-muted">
                  {data.profile.email}
                </p>
              </div>

              <div className="min-w-[250px] rounded-[1.6rem] border border-bond-rose/45 bg-black/35 p-6 text-center shadow-[0_0_30px_rgba(255,92,168,0.12)]">
                <p className="font-display text-5xl font-bold text-white">
                  {data.profile.messagesLeft.toLocaleString(locale)}
                </p>
                <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-bond-rose">
                  {copy.messagesLeft}
                </p>
                <Link
                  href="/pricing"
                  className="bond-pink-button mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-bond-rose px-5 py-3 text-sm font-bold text-white"
                >
                  <Plus size={16} />
                  {copy.buyMessages}
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            {summaryCards.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_0_28px_rgba(255,92,168,0.04)]"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
                    <Icon size={22} />
                  </span>
                  <div>
                    <p className="font-display text-3xl font-bold text-white">
                      {typeof value === "number"
                        ? value.toLocaleString(locale)
                        : value}
                    </p>
                    <p className="mt-1 text-sm text-bond-muted">
                      {label}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
                  {copy.recentChats}
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold text-white">
                  {copy.recentChats}
                </h2>
              </div>
              <Link
                href="/"
                className="rounded-full border border-bond-rose/45 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-bond-rose/10"
              >
                {copy.startChatting}
              </Link>
            </div>

            {data.recentChats.length ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.recentChats.map((chat) => (
                  <article
                    key={chat.conversationId}
                    className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/25"
                  >
                    <div className="flex gap-4 p-4">
                      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-black">
                        <CompanionImage companion={chat} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="truncate font-display text-xl font-bold text-white">
                              {chat.name}
                            </h3>
                            <p className="mt-1 text-xs text-bond-muted">
                              {formatDate(chat.updatedAt)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-bond-muted">
                          {chat.lastReply}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/chat/${chat.slug}`}
                      className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-3 text-sm font-bold text-bond-rose transition hover:bg-bond-rose/10"
                    >
                      <MessageCircleMore size={16} />
                      {copy.continueChat}
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-8 text-center">
                <p className="text-bond-muted">
                  {copy.noRecentChats}
                </p>
              </div>
            )}
          </section>

          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
                  {copy.myCompanions}
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold text-white">
                  {copy.myCompanions}
                </h2>
                <p className="mt-2 text-sm text-bond-muted">
                  {data.counts.createdCompanions} / 25
                </p>
              </div>
              <Link
                href="/create"
                className="bond-pink-button inline-flex items-center gap-2 rounded-full bg-bond-rose px-5 py-3 text-sm font-bold text-white"
              >
                <Plus size={16} />
                {copy.createCompanion}
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {(
                [
                  ["all", copy.all],
                  ["public", copy.public],
                  ["private", copy.private]
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-full border px-5 py-2 text-sm font-bold transition ${
                    filter === value
                      ? "border-bond-rose bg-bond-rose text-white"
                      : "border-white/10 bg-white/[0.025] text-bond-muted hover:border-bond-rose/40 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {visibleCompanions.length ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleCompanions.map((companion) => (
                  <article
                    key={companion.id}
                    className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/25"
                  >
                    <div className="aspect-[4/5] overflow-hidden bg-black">
                      <CompanionImage companion={companion} />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-xl font-bold text-white">
                            {companion.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-bond-muted">
                            {companion.title}
                          </p>
                          {companion.creatorUsername && (
                            companion.visibility === "public" ? (
                              <CreatorLink
                                username={companion.creatorUsername}
                                className="mt-2 inline-flex text-xs"
                              />
                            ) : (
                              <p className="mt-2 text-xs font-semibold text-bond-muted">
                                @{companion.creatorUsername}
                              </p>
                            )
                          )}
                        </div>
                        <span className="shrink-0 rounded-full border border-bond-rose/35 bg-bond-rose/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-bond-rose">
                          {companion.visibility === "public"
                            ? copy.public
                            : copy.private}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <Link
                          href={`/chat/${companion.slug}`}
                          className="inline-flex items-center justify-center rounded-full border border-bond-rose/45 px-3 py-2.5 text-center text-sm font-bold text-white transition hover:bg-bond-rose/10"
                        >
                          {copy.openCompanion}
                        </Link>
                        <MyCompanionActions
                          companion={companion}
                          session={session}
                          onUpdated={handleCompanionUpdated}
                          onDeleted={handleCompanionDeleted}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-8 text-center">
                <p className="text-bond-muted">
                  {copy.noCompanions}
                </p>
              </div>
            )}
          </section>

          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
                  {copy.favorites}
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold text-white">
                  {copy.favoriteCompanions}
                </h2>
              </div>
              <Link
                href="/"
                className="rounded-full border border-bond-rose/45 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-bond-rose/10"
              >
                {copy.exploreCompanions}
              </Link>
            </div>

            {data.favorites.length ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.favorites.map((companion) => (
                  <article
                    key={companion.id}
                    className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/25"
                  >
                    <div className="aspect-[4/5] overflow-hidden bg-black">
                      <CompanionImage companion={companion} />
                    </div>
                    <div className="p-4">
                      <h3 className="truncate font-display text-xl font-bold text-white">
                        {companion.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-bond-muted">
                        {companion.title}
                      </p>
                      <Link
                        href={`/chat/${companion.slug}`}
                        className="mt-4 block rounded-full bg-bond-rose px-4 py-2.5 text-center text-sm font-bold text-white"
                      >
                        {copy.continueChat}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-8 text-center">
                <p className="text-bond-muted">
                  {copy.noFavorites}
                </p>
              </div>
            )}
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
                {copy.accountInformation}
              </p>
              <div className="mt-6 divide-y divide-white/10">
                <div className="flex flex-wrap justify-between gap-3 py-4">
                  <span className="text-bond-muted">
                    {copy.accountEmail}
                  </span>
                  <span className="font-semibold text-white">
                    {data.profile.email}
                  </span>
                </div>
                <div className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-bond-muted">
                      {copy.username}
                    </span>

                    {!editingUsername ? (
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-white">
                          @{data.profile.username}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setUsernameDraft(data.profile.username);
                            setUsernameError("");
                            setUsernameNotice("");
                            setEditingUsername(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-bond-rose/45 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-bond-rose/10"
                        >
                          <Pencil size={13} />
                          {copy.editUsername}
                        </button>
                      </div>
                    ) : (
                      <div className="w-full max-w-md">
                        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                          <div className="flex min-w-0 flex-1 items-center rounded-xl border border-white/10 bg-black/30 px-3">
                            <span className="text-bond-muted">@</span>
                            <input
                              value={usernameDraft}
                              onChange={(event) =>
                                setUsernameDraft(
                                  event.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9_]/g, "")
                                    .slice(0, 30)
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  void saveUsername();
                                }
                              }}
                              placeholder={copy.usernamePlaceholder}
                              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none"
                              autoComplete="username"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void saveUsername()}
                            disabled={usernameSaving}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-bond-rose px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                          >
                            <Check size={15} />
                            {usernameSaving
                              ? copy.savingUsername
                              : copy.saveUsername}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUsername(false);
                              setUsernameDraft(data.profile.username);
                              setUsernameError("");
                            }}
                            disabled={usernameSaving}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                          >
                            <X size={15} />
                            {copy.cancel}
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-bond-muted">
                          {copy.usernameRequirements}
                        </p>
                      </div>
                    )}
                  </div>

                  {usernameNotice && (
                    <p className="mt-3 text-sm text-emerald-300">
                      {usernameNotice}
                    </p>
                  )}

                  {usernameError && (
                    <p className="mt-3 text-sm text-red-200">
                      {usernameError}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap justify-between gap-3 py-4">
                  <span className="text-bond-muted">
                    {copy.memberSince}
                  </span>
                  <span className="font-semibold text-white">
                    {formatDate(data.profile.memberSince)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6 md:p-8">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-bond-rose">
                {copy.purchaseHistory}
              </p>
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 p-6 text-center">
                <p className="font-semibold text-white">
                  {copy.noPurchases}
                </p>
                <p className="mt-2 text-sm leading-6 text-bond-muted">
                  {copy.purchasesWillAppear}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
