import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type CharacterRow = {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  image_file: string | null;
  category: string | null;
  title: string | null;
  visibility: string | null;
  creator_username: string | null;
};

type ConversationRow = {
  id: string;
  character_id: string;
  updated_at: string;
};

type MessagePreviewRow = {
  conversation_id: string;
  content: string;
  created_at: string;
};

type FavoriteRow = {
  character_id: string;
};

function toCompanion(character: CharacterRow) {
  return {
    id: character.id,
    slug: character.slug,
    name: character.name,
    image:
      character.image_url ||
      (character.image_file && character.category
        ? `/character-assets/${character.category}/${character.image_file}`
        : ""),
    title: character.title || "",
    creatorUsername:
      character.visibility === "unlisted"
        ? undefined
        : character.creator_username || undefined,
    // Existing My Bond UI uses `public` as its second filter value. It now
    // represents unlisted / Share by link, never a public Discover listing.
    visibility:
      character.visibility === "private"
        ? ("private" as const)
        : ("public" as const)
  };
}

async function getAuthUser(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

function normalizeUsername(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function defaultUsernameForUser(userId: string) {
  return `member_${userId.replaceAll("-", "").slice(0, 8)}`;
}

async function ensureUsername(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  },
  currentUsername: unknown
) {
  const storedUsername = normalizeUsername(currentUsername);

  if (USERNAME_PATTERN.test(storedUsername)) {
    return storedUsername;
  }

  const metadataUsername = normalizeUsername(
    user.user_metadata?.username
  );
  const username = USERNAME_PATTERN.test(metadataUsername)
    ? metadataUsername
    : defaultUsernameForUser(user.id);

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", user.id);

  if (error) throw error;

  await supabase
    .from("characters")
    .update({
      creator_username: username,
      updated_at: new Date().toISOString()
    })
    .eq("creator_id", user.id);

  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      username
    }
  });

  return username;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServiceClient();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          email: user.email ?? null
        },
        {
          onConflict: "user_id"
        }
      )
      .select(
        "user_id,email,username,trial_messages_used,trial_message_limit"
      )
      .single();

    if (profileError) throw profileError;

    const username = await ensureUsername(
      supabase,
      user,
      profile.username
    );

    const { data: everCoinWallet, error: everCoinWalletError } =
      await supabase
        .from("evercoin_wallets")
        .select("balance,debt")
        .eq("user_id", user.id)
        .maybeSingle();

    if (everCoinWalletError) throw everCoinWalletError;

    const everCoinBalance = Math.max(
      Number(everCoinWallet?.balance ?? 0),
      0
    );

    const [
      conversationsResult,
      createdResult,
      favoritesResult
    ] = await Promise.all([
      supabase
        .from("conversations")
        .select("id,character_id,updated_at", { count: "exact" })
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("characters")
        .select(
          "id,slug,name,image_url,image_file,category,title,visibility,creator_username",
          { count: "exact" }
        )
        .eq("creator_id", user.id)
        .in("visibility", ["public", "private", "unlisted"])
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("favorites")
        .select("character_id", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

    if (conversationsResult.error) throw conversationsResult.error;
    if (createdResult.error) throw createdResult.error;
    if (favoritesResult.error) throw favoritesResult.error;

    const conversations =
      (conversationsResult.data ?? []) as ConversationRow[];
    const createdCharacters =
      (createdResult.data ?? []) as CharacterRow[];
    const favoriteRows =
      (favoritesResult.data ?? []) as FavoriteRow[];

    const recentCharacterIds = conversations.map(
      (conversation) => conversation.character_id
    );
    const favoriteCharacterIds = favoriteRows.map(
      (favorite) => favorite.character_id
    );

    const allCharacterIds = Array.from(
      new Set([
        ...recentCharacterIds,
        ...favoriteCharacterIds
      ])
    );

    let relatedCharacters: CharacterRow[] = [];

    if (allCharacterIds.length) {
      const { data, error } = await supabase
        .from("characters")
        .select(
          "id,slug,name,image_url,image_file,category,title,visibility,creator_username"
        )
        .in("id", allCharacterIds);

      if (error) throw error;
      relatedCharacters = (data ?? []) as CharacterRow[];
    }

    const relatedCharacterMap = new Map(
      relatedCharacters.map((character) => [
        character.id,
        character
      ])
    );

    let messagePreviews: MessagePreviewRow[] = [];

    if (conversations.length) {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id,content,created_at")
        .in(
          "conversation_id",
          conversations.map((conversation) => conversation.id)
        )
        .eq("role", "character")
        .order("created_at", { ascending: false })
        .limit(120);

      if (error) throw error;
      messagePreviews = (data ?? []) as MessagePreviewRow[];
    }

    const latestReplyByConversation = new Map<
      string,
      MessagePreviewRow
    >();

    for (const message of messagePreviews) {
      if (!latestReplyByConversation.has(message.conversation_id)) {
        latestReplyByConversation.set(
          message.conversation_id,
          message
        );
      }
    }

    const recentChats = conversations
      .map((conversation) => {
        const character = relatedCharacterMap.get(
          conversation.character_id
        );

        if (!character) return null;

        const preview = latestReplyByConversation.get(
          conversation.id
        );

        return {
          ...toCompanion(character),
          conversationId: conversation.id,
          lastReply: preview?.content ?? "",
          updatedAt:
            preview?.created_at ?? conversation.updated_at
        };
      })
      .filter(Boolean);

    const favoriteCompanions = favoriteCharacterIds
      .map((characterId) =>
        relatedCharacterMap.get(characterId)
      )
      .filter(
        (character): character is CharacterRow =>
          Boolean(character)
      )
      .map(toCompanion);

    const email = profile.email || user.email || "";

    return NextResponse.json(
      {
        profile: {
          email,
          username,
          memberSince: user.created_at,
          messagesLeft: everCoinBalance,
          everCoinBalance
        },
        counts: {
          recentChats:
            conversationsResult.count ?? conversations.length,
          createdCompanions:
            createdResult.count ?? createdCharacters.length,
          favorites:
            favoritesResult.count ?? favoriteRows.length
        },
        recentChats,
        createdCompanions:
          createdCharacters.map(toCompanion),
        favorites: favoriteCompanions
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error("My Bond dashboard failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "MY_BOND_FAILED"
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const username = normalizeUsername(body?.username);

    if (!USERNAME_PATTERN.test(username)) {
      return NextResponse.json(
        { error: "INVALID_USERNAME" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const { data: existing, error: existingError } =
      await supabase
        .from("profiles")
        .select("user_id")
        .ilike("username", username)
        .neq("user_id", user.id)
        .limit(1)
        .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      return NextResponse.json(
        { error: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          email: user.email ?? null,
          username,
          updated_at: now
        },
        {
          onConflict: "user_id"
        }
      );

    if (profileError) {
      if (
        profileError.code === "23505" ||
        profileError.message
          .toLowerCase()
          .includes("duplicate")
      ) {
        return NextResponse.json(
          { error: "USERNAME_TAKEN" },
          { status: 409 }
        );
      }

      throw profileError;
    }

    const { error: characterError } = await supabase
      .from("characters")
      .update({
        creator_username: username,
        updated_at: now
      })
      .eq("creator_id", user.id);

    if (characterError) throw characterError;

    const { error: authError } =
      await supabase.auth.admin.updateUserById(
        user.id,
        {
          user_metadata: {
            ...(user.user_metadata ?? {}),
            username
          }
        }
      );

    if (authError) throw authError;

    return NextResponse.json(
      { username },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error("My Bond username update failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "USERNAME_UPDATE_FAILED"
      },
      { status: 500 }
    );
  }
}
