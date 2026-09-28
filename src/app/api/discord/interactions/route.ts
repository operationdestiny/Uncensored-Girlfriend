import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://uncensoredgirlfriend.chat"
).replace(/\/+$/, "");

const DISCORD_API = "https://discord.com/api/v10";

const COMMANDS = [
  {
    name: "everbond",
    description: "Open EverBond and see what the community is about."
  },
  {
    name: "discover",
    description: "Discover public EverBond companions."
  },
  {
    name: "create",
    description: "Create your own private EverBond companion."
  },
  {
    name: "random",
    description: "Meet a random public EverBond companion."
  },
  {
    name: "support",
    description: "Get official EverBond help and support."
  }
];

function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function verifyDiscordRequest(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKeyHex: string
) {
  try {
    const rawPublicKey = Buffer.from(publicKeyHex, "hex");
    if (rawPublicKey.length !== 32) return false;

    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const key = createPublicKey({
      key: Buffer.concat([spkiPrefix, rawPublicKey]),
      format: "der",
      type: "spki"
    });

    return cryptoVerify(
      null,
      Buffer.from(timestamp + rawBody, "utf8"),
      key,
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

async function registerGuildCommands() {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();

  if (!applicationId || !guildId || !botToken) {
    console.warn(
      "Discord command registration skipped: DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, or DISCORD_BOT_TOKEN is missing."
    );
    return;
  }

  const response = await fetch(
    `${DISCORD_API}/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(COMMANDS),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error(
      `Discord command registration failed (${response.status}): ${text}`
    );
    return;
  }

  console.log("EverBond Discord slash commands registered successfully.");
}

function linkButton(label: string, url: string) {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label,
        url
      }
    ]
  };
}

function commandMessage(
  title: string,
  description: string,
  buttonLabel: string,
  url: string
) {
  return {
    type: 4,
    data: {
      embeds: [
        {
          title,
          description,
          url
        }
      ],
      components: [linkButton(buttonLabel, url)]
    }
  };
}

async function randomCharacterResponse() {
  const supabase = getSupabaseServiceClient();

  const { count, error: countError } = await supabase
    .from("characters")
    .select("slug", { count: "exact", head: true })
    .eq("is_public", true)
    .eq("is_active", true)
    .eq("visibility", "public");

  if (countError || !count) {
    console.error("Discord random character count failed:", countError);
    return commandMessage(
      "Discover EverBond companions",
      "Browse thousands of public EverBond companions and find someone new.",
      "Discover companions",
      `${SITE_URL}/characters`
    );
  }

  const offset = Math.floor(Math.random() * count);

  const { data, error } = await supabase
    .from("characters")
    .select("name, slug, role, title, image_url, generated_seo")
    .eq("is_public", true)
    .eq("is_active", true)
    .eq("visibility", "public")
    .order("slug", { ascending: true })
    .range(offset, offset)
    .maybeSingle();

  if (error || !data?.slug) {
    console.error("Discord random character lookup failed:", error);
    return commandMessage(
      "Discover EverBond companions",
      "Browse thousands of public EverBond companions and find someone new.",
      "Discover companions",
      `${SITE_URL}/characters`
    );
  }

  const characterUrl = `${SITE_URL}/chat/${encodeURIComponent(data.slug)}`;
  const generatedSeo =
    data.generated_seo && typeof data.generated_seo === "object"
      ? (data.generated_seo as Record<string, unknown>)
      : null;

  const seoDescription =
    generatedSeo && typeof generatedSeo.seo_description === "string"
      ? generatedSeo.seo_description
      : null;

  const description =
    seoDescription ||
    (typeof data.role === "string" && data.role.trim()
      ? data.role
      : typeof data.title === "string" && data.title.trim()
        ? data.title
        : "Meet a new EverBond companion.");

  const embed: Record<string, unknown> = {
    title: data.name || "EverBond Companion",
    description,
    url: characterUrl
  };

  if (
    typeof data.image_url === "string" &&
    /^https?:\/\//i.test(data.image_url)
  ) {
    embed.image = { url: data.image_url };
  }

  return {
    type: 4,
    data: {
      embeds: [embed],
      components: [
        linkButton(
          `Talk with ${data.name || "this companion"}`,
          characterUrl
        )
      ]
    }
  };
}

export async function GET() {
  return jsonResponse({
    ok: true,
    service: "EverBond Discord interactions"
  });
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const rawBody = await request.text();

  if (!publicKey || !signature || !timestamp) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!verifyDiscordRequest(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse("Invalid request signature", { status: 401 });
  }

  let interaction: {
    type?: number;
    data?: {
      name?: string;
    };
  };

  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (interaction.type === 1) {
    waitUntil(registerGuildCommands());
    return jsonResponse({ type: 1 });
  }

  if (interaction.type !== 2) {
    return jsonResponse({
      type: 4,
      data: {
        content: "This EverBond interaction is not supported yet.",
        flags: 64
      }
    });
  }

  switch (interaction.data?.name) {
    case "everbond":
      return jsonResponse(
        commandMessage(
          "EverBond",
          "Private AI companions, Ever Memory, images, video, voice, character creation, and more — with no subscription required.",
          "Open EverBond",
          SITE_URL
        )
      );

    case "discover":
      return jsonResponse(
        commandMessage(
          "Discover EverBond companions",
          "Browse public EverBond companions and start a conversation.",
          "Discover companions",
          `${SITE_URL}/characters`
        )
      );

    case "create":
      return jsonResponse(
        commandMessage(
          "Create your own EverBond companion",
          "Build a private AI companion and make the relationship your own.",
          "Create a companion",
          `${SITE_URL}/create`
        )
      );

    case "random":
      return jsonResponse(await randomCharacterResponse());

    case "support":
      return jsonResponse(
        commandMessage(
          "EverBond Support",
          "Need help with EverBond? Visit the official support and contact page.",
          "Get support",
          `${SITE_URL}/contact`
        )
      );

    default:
      return jsonResponse({
        type: 4,
        data: {
          content: "Unknown EverBond command.",
          flags: 64
        }
      });
  }
}
