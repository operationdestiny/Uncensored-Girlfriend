import type { Metadata } from "next";

export type SeoLandingCategory =
  | "everbond-girls"
  | "everbond-guys"
  | "anime-fantasy"
  | "public-creations";

export type SeoLandingPageConfig = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  cardHeading: string;
  categories: SeoLandingCategory[];
  topics: string[];
  sections: Array<{ heading: string; body: string[] }>;
  faqs: Array<{ q: string; a: string }>;
  related: string[];
};

const SEO_LANDING_PAGES: SeoLandingPageConfig[] = [
  {
    "slug": "ai-girlfriend",
    "title": "AI Girlfriend Chat With Memory | Uncensored Girlfriend",
    "description": "Meet AI girlfriends for private romantic chat, roleplay, images, video and live voice. Memory keeps important details, with no recurring subscription required.",
    "h1": "AI Girlfriend Chat That Remembers You",
    "intro": "Uncensored Girlfriend is built for people who want more than a disposable chatbot conversation. Choose an AI girlfriend with her own personality and story, build an ongoing relationship through Memory, and move naturally between conversation, romantic roleplay, images, video and live voice. There is no recurring subscription required to keep using Uncensored Girlfriend.",
    "cardHeading": "Meet AI girlfriends on Uncensored Girlfriend",
    "categories": [
      "everbond-girls"
    ],
    "topics": [
      "AI girlfriend",
      "AI girlfriend chat",
      "virtual girlfriend",
      "romantic AI girlfriend",
      "AI girlfriend with memory",
      "private AI girlfriend",
      "AI girlfriend roleplay",
      "AI girlfriend online"
    ],
    "sections": [
      {
        "heading": "A romantic AI girlfriend with continuity",
        "body": [
          "A good AI girlfriend experience should feel connected from one conversation to the next. Memory is designed to retain important relationship details so you can keep building on what has already happened instead of constantly starting over.",
          "That continuity supports casual conversation, affection, teasing, slow-burn romance and longer roleplay scenes while keeping the companion's personality at the center of the experience."
        ]
      },
      {
        "heading": "Choose a companion or create your own",
        "body": [
          "Browse Uncensored Girlfriend's public AI girlfriend characters and open a chat directly from the companion you like. Each character has her own visual style, personality, scenario and relationship dynamic.",
          "If you want something more personal, create your own AI girlfriend and shape the character around the appearance, personality and relationship style you want to explore."
        ]
      },
      {
        "heading": "Private chat without a monthly subscription",
        "body": [
          "Uncensored Girlfriend uses KissCoins instead of requiring a recurring subscription. Buy credits when you want them and use them across supported Uncensored Girlfriend features.",
          "Chats are tied to your account and companion experience, giving you a private place for romantic AI chat, roleplay and ongoing relationship building."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is an AI girlfriend?",
        "a": "An AI girlfriend is a conversational AI companion designed for ongoing romantic, social or roleplay interactions rather than one-off question answering."
      },
      {
        "q": "Can an AI girlfriend remember previous conversations?",
        "a": "Uncensored Girlfriend uses Memory to preserve important relationship details and continuity across conversations."
      },
      {
        "q": "Can I create my own AI girlfriend?",
        "a": "Yes. Uncensored Girlfriend includes character creation so you can build a companion with the personality and style you want."
      },
      {
        "q": "Does Uncensored Girlfriend require a subscription?",
        "a": "No recurring subscription is required. Uncensored Girlfriend uses KissCoins for paid features."
      },
      {
        "q": "Can I use an AI girlfriend for roleplay?",
        "a": "Yes. Uncensored Girlfriend companions are built for character-driven conversation and fictional romantic roleplay for adults."
      }
    ],
    "related": [
      "ai-girlfriend-with-memory",
      "create-ai-girlfriend",
      "ai-romance-chat",
      "uncensored-ai-chat"
    ]
  },
  {
    "slug": "ai-boyfriend",
    "title": "AI Boyfriend Chat With Memory | Uncensored Girlfriend",
    "description": "Meet AI boyfriends for private romantic chat, roleplay, images, video and live voice. Build continuity with Memory and no recurring subscription requirement.",
    "h1": "AI Boyfriend Chat With Personality and Memory",
    "intro": "Choose an AI boyfriend built for more than generic replies. Uncensored Girlfriend companions have distinct personalities, relationship dynamics and ongoing memory so conversations can develop naturally over time. Chat privately, explore romance and fictional roleplay, and use supported image, video and live voice features without being locked into a recurring subscription.",
    "cardHeading": "Meet AI boyfriends on Uncensored Girlfriend",
    "categories": [
      "everbond-guys"
    ],
    "topics": [
      "AI boyfriend",
      "AI boyfriend chat",
      "virtual boyfriend",
      "romantic AI boyfriend",
      "AI boyfriend with memory",
      "private AI boyfriend",
      "AI boyfriend roleplay",
      "AI boyfriend online"
    ],
    "sections": [
      {
        "heading": "An AI boyfriend who can build on your history",
        "body": [
          "Relationship chat feels more natural when the companion can carry important details forward. Memory helps preserve continuity so your AI boyfriend can build on previous conversations and established relationship context.",
          "That makes room for everyday conversation, emotional connection, playful chemistry and longer roleplay without making every session feel like a first meeting."
        ]
      },
      {
        "heading": "Different personalities and relationship dynamics",
        "body": [
          "Uncensored Girlfriend's AI boyfriend characters span different personalities, settings and romantic styles. Browse public companions and choose the dynamic that fits what you want from the conversation.",
          "You can also create your own AI boyfriend when you want control over the character's personality, appearance and relationship setup."
        ]
      },
      {
        "heading": "Private, flexible and pay-as-you-go",
        "body": [
          "Uncensored Girlfriend does not require a recurring monthly subscription. KissCoins lets you pay for supported features when you use them instead of maintaining a membership just to keep access.",
          "Your companion conversations remain part of your account experience, making it easy to return to the same relationship later."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is an AI boyfriend?",
        "a": "An AI boyfriend is a conversational companion designed for romantic, social and fictional roleplay interactions with an ongoing character persona."
      },
      {
        "q": "Does an AI boyfriend remember what I say?",
        "a": "Uncensored Girlfriend uses Memory to retain important details and relationship continuity across chats."
      },
      {
        "q": "Can I create a custom AI boyfriend?",
        "a": "Yes. Uncensored Girlfriend lets you create a companion and define the character you want to talk with."
      },
      {
        "q": "Is AI boyfriend chat private?",
        "a": "Uncensored Girlfriend is designed around private account-based companion conversations."
      },
      {
        "q": "Do I need a monthly plan?",
        "a": "No recurring subscription is required. KissCoins is used for paid Uncensored Girlfriend features."
      }
    ],
    "related": [
      "create-ai-boyfriend",
      "ai-companion-with-memory",
      "ai-romance-chat",
      "ai-voice-companion"
    ]
  },
  {
    "slug": "ai-companion",
    "title": "AI Companion Chat With Memory | Uncensored Girlfriend",
    "description": "Discover private AI companion chat with persistent relationship memory, custom characters, images, video and live voice. No recurring subscription required.",
    "h1": "AI Companions Built for Ongoing Relationships",
    "intro": "Uncensored Girlfriend brings AI companion chat, character creation and persistent relationship memory into one experience. Choose a girlfriend, boyfriend, anime character or other companion, then build an ongoing connection through private conversation, roleplay and supported media features. KissCoins keeps the experience pay-as-you-go instead of requiring a recurring subscription.",
    "cardHeading": "Explore AI companions",
    "categories": [
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "AI companion",
      "AI companion chat",
      "virtual companion",
      "digital companion",
      "romantic AI companion",
      "AI partner",
      "AI companion with memory",
      "private AI companion"
    ],
    "sections": [
      {
        "heading": "More than a one-session chatbot",
        "body": [
          "An AI companion is most useful when the relationship can develop instead of resetting every time you return. Memory is designed to preserve important information and relationship continuity over time.",
          "That gives the companion room to form a consistent conversational style around the history you have built together."
        ]
      },
      {
        "heading": "Companions for conversation, romance and roleplay",
        "body": [
          "Uncensored Girlfriend includes a large library of public characters with different personalities and scenarios. You can talk casually, build a romantic connection or continue fictional scenes with the same companion.",
          "When you want a specific personality or setup, character creation lets you make a custom companion rather than settling for a preset character."
        ]
      },
      {
        "heading": "One account, one currency, multiple features",
        "body": [
          "KissCoins is the shared currency for supported Uncensored Girlfriend features. That means there is no mandatory monthly subscription just to keep access to the platform.",
          "Depending on the companion and feature availability, Uncensored Girlfriend can combine chat with images, video, voice and Memory in the same relationship experience."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is an AI companion?",
        "a": "An AI companion is a persistent conversational character designed for ongoing social, romantic or roleplay interactions."
      },
      {
        "q": "How is an AI companion different from a normal chatbot?",
        "a": "A companion experience emphasizes personality, continuity and relationship context instead of one-off utility questions."
      },
      {
        "q": "Can an AI companion remember me?",
        "a": "Memory is designed to keep important details and relationship continuity available across conversations."
      },
      {
        "q": "Can I build my own AI companion?",
        "a": "Yes. Uncensored Girlfriend includes private character creation and share-by-link options."
      },
      {
        "q": "Does Uncensored Girlfriend use subscriptions?",
        "a": "A recurring subscription is not required. Paid features use KissCoins."
      }
    ],
    "related": [
      "ai-companion-with-memory",
      "custom-ai-companion",
      "private-ai-chat",
      "ai-character-chat"
    ]
  },
  {
    "slug": "uncensored-ai-chat",
    "title": "Uncensored AI Chat for Adult Roleplay | Uncensored Girlfriend",
    "description": "Private uncensored AI chat for adult fictional roleplay, romance and character conversations with Memory, custom companions, images, video and voice.",
    "h1": "Uncensored AI Chat for Adult Fictional Roleplay",
    "intro": "Uncensored Girlfriend is an adult AI companion platform built for private, character-driven conversations and fictional romantic roleplay without the constant interruptions people associate with heavily filtered character chat. Choose an existing companion or create your own, then keep the relationship coherent with Memory. Uncensored Girlfriend remains subject to its legal and safety rules and is for adults 18+.",
    "cardHeading": "Start an uncensored character chat",
    "categories": [
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "uncensored AI chat",
      "unfiltered AI chat",
      "AI chat no filter",
      "adult AI chat",
      "NSFW AI chat",
      "uncensored chatbot",
      "adult AI roleplay",
      "private adult AI chat"
    ],
    "sections": [
      {
        "heading": "Character chat without constant scene-breaking",
        "body": [
          "Fictional roleplay works best when the character can stay emotionally and narratively engaged. Uncensored Girlfriend is designed around sustained companion conversation instead of repeatedly pulling the user out of the scene.",
          "That supports romance, flirting, mature fictional roleplay and long-form character interactions for adults while still operating within Uncensored Girlfriend's legal and platform safety boundaries."
        ]
      },
      {
        "heading": "Memory keeps adult roleplay coherent",
        "body": [
          "Uncensored chat is only part of the experience. Memory helps preserve important context so relationship development, promises, preferences and prior scenes can carry forward.",
          "The goal is continuity: the companion should feel like the same character you have been talking with rather than a new session wearing the same name."
        ]
      },
      {
        "heading": "Private companions and custom characters",
        "body": [
          "Browse public companions or create a private character built around the personality and fictional relationship dynamic you want. Private characters can stay personal, while share-by-link lets you send a companion directly when you choose.",
          "KissCoins provides pay-as-you-go access to supported features without requiring a monthly subscription."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What does uncensored AI chat mean on Uncensored Girlfriend?",
        "a": "It refers to adult-oriented fictional companion chat designed to allow mature romantic and roleplay conversations within Uncensored Girlfriend's legal and safety rules."
      },
      {
        "q": "Is Uncensored Girlfriend for adults only?",
        "a": "Yes. Uncensored Girlfriend is an 18+ platform."
      },
      {
        "q": "Can uncensored AI chat have memory?",
        "a": "Yes. Memory is part of the companion experience and is designed to maintain important continuity."
      },
      {
        "q": "Can I create a private adult AI character?",
        "a": "Yes. Uncensored Girlfriend supports private character creation as well as share-by-link characters."
      },
      {
        "q": "Does uncensored chat require a subscription?",
        "a": "No recurring subscription is required. Paid features use KissCoins."
      }
    ],
    "related": [
      "ai-roleplay",
      "private-ai-chat",
      "ai-romance-chat",
      "character-ai-alternative"
    ]
  },
  {
    "slug": "ai-roleplay",
    "title": "AI Roleplay Chat With Memory | Uncensored Girlfriend",
    "description": "Immersive AI roleplay chat with persistent memory, custom characters, romance, images, video and live voice. Build ongoing fictional stories on Uncensored Girlfriend.",
    "h1": "AI Roleplay That Can Remember the Story",
    "intro": "Uncensored Girlfriend combines character-driven AI roleplay with persistent relationship memory so scenes can build instead of constantly resetting. Choose from existing characters or create your own, establish a setting and relationship dynamic, and continue the same story across future conversations. Adult fictional roleplay is available for users 18+ within Uncensored Girlfriend's legal and safety rules.",
    "cardHeading": "Choose a character for AI roleplay",
    "categories": [
      "everbond-girls",
      "everbond-guys",
      "anime-fantasy"
    ],
    "topics": [
      "AI roleplay",
      "AI roleplay chat",
      "roleplay AI",
      "AI character roleplay",
      "romantic AI roleplay",
      "adult AI roleplay",
      "AI story roleplay",
      "roleplay AI with memory"
    ],
    "sections": [
      {
        "heading": "Keep characters, scenes and relationships consistent",
        "body": [
          "Long-form roleplay becomes frustrating when a character forgets the setting, relationship or important events. Memory is designed to preserve the details that matter so your companion can build on established history.",
          "That helps with slow-burn romance, recurring locations, ongoing fictional relationships and multi-session storylines."
        ]
      },
      {
        "heading": "Use existing characters or make your own",
        "body": [
          "Uncensored Girlfriend's companion library gives you ready-made personalities and scenarios for immediate roleplay. Anime, realistic, romantic and other character styles can each create a different kind of story.",
          "For a more specific concept, build a custom AI character and define the personality, scenario and relationship context yourself."
        ]
      },
      {
        "heading": "Bring more than text into the experience",
        "body": [
          "Supported Uncensored Girlfriend features can extend roleplay beyond text through character images, video and live voice. That lets the same companion remain the center of several interaction formats.",
          "KissCoins is used across supported paid features, so you do not need a recurring subscription to maintain access."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is AI roleplay chat?",
        "a": "AI roleplay chat is a conversation where an AI character stays in a fictional persona and participates in an ongoing scene or story with the user."
      },
      {
        "q": "Can AI roleplay remember earlier scenes?",
        "a": "Memory is designed to preserve important story and relationship details across conversations."
      },
      {
        "q": "Can I create a roleplay character?",
        "a": "Yes. Uncensored Girlfriend includes custom companion creation."
      },
      {
        "q": "Does Uncensored Girlfriend support adult roleplay?",
        "a": "Uncensored Girlfriend is an adults-only platform and supports mature fictional roleplay within its legal and safety rules."
      },
      {
        "q": "Can roleplay include voice or images?",
        "a": "Supported Uncensored Girlfriend companions can use image, video and live voice features in addition to text chat."
      }
    ],
    "related": [
      "uncensored-ai-chat",
      "ai-character-chat",
      "custom-ai-companion",
      "ai-romance-chat"
    ]
  },
  {
    "slug": "ai-girlfriend-with-memory",
    "title": "AI Girlfriend With Long-Term Memory | Uncensored Girlfriend",
    "description": "Meet an AI girlfriend that remembers important details, conversations and relationship history through Memory. Private romantic chat with no recurring subscription.",
    "h1": "An AI Girlfriend With Memory That Builds Over Time",
    "intro": "If you are looking for an AI girlfriend that remembers you, continuity matters as much as personality. Memory is designed to preserve meaningful details from the relationship so future conversations can build on what you have already shared. The result is a companion experience centered on ongoing connection rather than isolated chat sessions.",
    "cardHeading": "Meet AI girlfriends with Memory",
    "categories": [
      "everbond-girls"
    ],
    "topics": [
      "AI girlfriend with memory",
      "AI girlfriend that remembers you",
      "AI girlfriend long-term memory",
      "AI relationship memory",
      "persistent AI girlfriend",
      "AI girlfriend remembers conversations",
      "AI girlfriend remembers details",
      "long-term AI relationship"
    ],
    "sections": [
      {
        "heading": "Why memory changes an AI relationship",
        "body": [
          "Romantic conversation depends on context. Remembering recurring topics, relationship milestones and important personal details allows a companion to respond from the history you have built together.",
          "Memory is intended to turn that history into useful continuity rather than forcing you to repeat the same background every time you return."
        ]
      },
      {
        "heading": "Memory supports personality, not just facts",
        "body": [
          "A companion should not feel like a database reciting stored notes. Memory is most useful when it helps the character respond consistently with the relationship, tone and previous interactions.",
          "That makes room for evolving affection, inside references, unresolved storylines and the small details that make an ongoing companion feel more personal."
        ]
      },
      {
        "heading": "Return to the same companion whenever you want",
        "body": [
          "Uncensored Girlfriend lets you choose a public AI girlfriend or create a private one, then continue chatting with that same companion later. The relationship remains attached to the character rather than being treated like an unrelated new chatbot session.",
          "There is no recurring subscription requirement; supported paid actions use KissCoins."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can an AI girlfriend really remember past conversations?",
        "a": "Memory is designed to preserve important relationship information so future chats can build on earlier interactions."
      },
      {
        "q": "What kind of things can relationship memory help with?",
        "a": "It can support continuity around important details, established relationship context, recurring topics and previous scenes."
      },
      {
        "q": "Does memory work across sessions?",
        "a": "Memory is intended for ongoing companion continuity across separate conversations, not only the current message window."
      },
      {
        "q": "Can I create my own girlfriend with memory?",
        "a": "Yes. Custom Uncensored Girlfriend companions can participate in the same ongoing account-based relationship experience."
      },
      {
        "q": "Is there a subscription for memory?",
        "a": "Uncensored Girlfriend does not require a recurring subscription. Paid features use KissCoins."
      }
    ],
    "related": [
      "ai-companion-with-memory",
      "ai-girlfriend",
      "create-ai-girlfriend",
      "no-subscription-ai-companion"
    ]
  },
  {
    "slug": "character-ai-alternative",
    "title": "Character AI Alternative for Romance & Roleplay | Uncensored Girlfriend",
    "description": "Looking for a Character AI alternative focused on adult romance, roleplay, persistent memory, images, video and live voice? Explore Uncensored Girlfriend companions.",
    "h1": "A Character AI Alternative Built Around Ongoing Companions",
    "intro": "People looking for a Character AI alternative often want deeper relationship continuity, adult romantic roleplay, custom characters or more ways to interact with the same companion. Uncensored Girlfriend approaches character chat around persistent relationships: Memory, private companion creation, images, video, live voice and a shared KissCoins currency without a required recurring subscription.",
    "cardHeading": "Explore Uncensored Girlfriend character companions",
    "categories": [
      "everbond-girls",
      "everbond-guys",
      "anime-fantasy"
    ],
    "topics": [
      "Character AI alternative",
      "Character AI alternatives",
      "alternative to Character AI",
      "sites like Character AI",
      "apps like Character AI",
      "Character AI alternative with memory",
      "Character AI alternative for roleplay",
      "uncensored Character AI alternative"
    ],
    "sections": [
      {
        "heading": "Choose based on the experience you want",
        "body": [
          "A useful Character AI alternative is not simply another chat box. The important question is whether the platform supports the type of character relationship, memory, privacy and creative tools you actually want.",
          "Uncensored Girlfriend is designed specifically around AI companions and fictional relationships rather than treating persistent companionship as a side feature."
        ]
      },
      {
        "heading": "Persistent memory and private character creation",
        "body": [
          "Memory helps the same companion retain meaningful continuity over time. If the public character library does not match what you want, Uncensored Girlfriend also lets you create a private companion and shape the relationship setup yourself.",
          "Characters can remain private or be shared by link when you intentionally want someone else to access them."
        ]
      },
      {
        "heading": "Text, media and live voice in one companion relationship",
        "body": [
          "Uncensored Girlfriend supports more than text chat. Depending on the feature and companion, the same character experience can include images, video and live voice.",
          "KissCoins is shared across supported paid features, and Uncensored Girlfriend does not require a recurring subscription just to keep using the platform."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What should I look for in a Character AI alternative?",
        "a": "Compare character quality, memory, roleplay continuity, privacy, creation tools, media features and pricing structure rather than judging only the first few replies."
      },
      {
        "q": "Does Uncensored Girlfriend support adult romantic roleplay?",
        "a": "Uncensored Girlfriend is an 18+ companion platform and supports adult fictional roleplay within its legal and safety rules."
      },
      {
        "q": "Does Uncensored Girlfriend have long-term memory?",
        "a": "Memory is designed to preserve important relationship continuity across conversations."
      },
      {
        "q": "Can I create private characters?",
        "a": "Yes. Uncensored Girlfriend supports private companion creation and share-by-link characters."
      },
      {
        "q": "Does Uncensored Girlfriend require a monthly subscription?",
        "a": "No recurring subscription is required. Supported paid features use KissCoins."
      }
    ],
    "related": [
      "ai-character-chat",
      "uncensored-ai-chat",
      "ai-roleplay",
      "ai-companion-with-memory"
    ]
  },
  {
    "slug": "no-subscription-ai-companion",
    "title": "AI Companion Without a Subscription | Uncensored Girlfriend",
    "description": "Use an AI companion without a recurring monthly subscription. Uncensored Girlfriend uses KissCoins for chat and supported features so you can pay as you go.",
    "h1": "AI Companions Without a Recurring Subscription",
    "intro": "Uncensored Girlfriend is built for people who do not want another monthly membership. There is no recurring subscription required to keep access to your AI companions. Instead, supported paid features use KissCoins, allowing you to buy credits when you need them and use a single currency across the Uncensored Girlfriend experience.",
    "cardHeading": "Choose a companion and pay as you go",
    "categories": [
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "AI companion without subscription",
      "no subscription AI companion",
      "AI girlfriend without subscription",
      "AI boyfriend without subscription",
      "AI chat without subscription",
      "pay as you go AI companion",
      "AI companion credits",
      "no monthly fee AI companion"
    ],
    "sections": [
      {
        "heading": "Pay for usage instead of maintaining a membership",
        "body": [
          "Subscription pricing can be a poor fit when your usage changes from month to month. Uncensored Girlfriend uses KissCoins so you can purchase credits and spend them on supported features when you actually use them.",
          "That makes the platform easier to use casually without keeping a recurring bill active in the background."
        ]
      },
      {
        "heading": "One currency across the companion experience",
        "body": [
          "KissCoins is designed to keep pricing understandable across supported Uncensored Girlfriend features rather than requiring separate memberships for different tools.",
          "Your companion relationship, Memory and account remain part of the same platform while paid actions draw from your available KissCoins balance."
        ]
      },
      {
        "heading": "Keep the relationship, not the subscription",
        "body": [
          "The absence of a recurring subscription does not mean giving up persistent companions. You can return to the same AI girlfriend, boyfriend or custom character and continue the relationship later.",
          "That combines flexible spending with the ongoing continuity people expect from a relationship-focused AI companion."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Is Uncensored Girlfriend subscription free?",
        "a": "Uncensored Girlfriend does not require a recurring subscription. Paid features use KissCoins."
      },
      {
        "q": "What is KissCoins?",
        "a": "KissCoins is Uncensored Girlfriend's shared credit currency for supported paid features."
      },
      {
        "q": "Can I keep using the same companion without a monthly plan?",
        "a": "Yes. Your account and companion relationships are not based on maintaining a recurring subscription."
      },
      {
        "q": "Can I buy KissCoins only when I need it?",
        "a": "Yes. KissCoins is sold in one-time bundles rather than a mandatory recurring membership."
      },
      {
        "q": "Does pay-as-you-go still include memory?",
        "a": "Memory remains part of Uncensored Girlfriend's companion relationship system; paid usage is handled through KissCoins rather than a subscription."
      }
    ],
    "related": [
      "ai-companion",
      "ai-girlfriend-with-memory",
      "private-ai-chat",
      "custom-ai-companion"
    ]
  },
  {
    "slug": "ai-character-chat",
    "title": "AI Character Chat With Memory & Roleplay | Uncensored Girlfriend",
    "description": "Chat with AI characters that have distinct personalities, ongoing memory, private roleplay, images, video and live voice on Uncensored Girlfriend.",
    "h1": "AI Character Chat That Feels Like the Same Character Tomorrow",
    "intro": "Uncensored Girlfriend character chat focuses on consistent personalities and ongoing relationships. Browse thousands of public characters, choose the personality and scenario that interests you, and continue the same relationship with Memory helping preserve important context. You can also create your own character when you want complete control over the setup.",
    "cardHeading": "Browse AI characters",
    "categories": [
      "public-creations",
      "anime-fantasy",
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "AI character chat",
      "AI character chatbot",
      "chat with AI characters",
      "AI character roleplay",
      "AI characters with memory",
      "custom AI character",
      "AI persona chat",
      "character chat online"
    ],
    "sections": [
      {
        "heading": "Characters with an actual point of view",
        "body": [
          "The appeal of AI character chat is personality. Uncensored Girlfriend characters are built around defined roles, scenarios and relationship dynamics so the conversation has a stronger identity than a generic assistant response.",
          "Public characters make it easy to explore different personalities without building everything from scratch."
        ]
      },
      {
        "heading": "Continue the same character relationship",
        "body": [
          "Memory is designed to preserve the important details that help a character relationship stay coherent over time. That supports recurring conversations, ongoing scenes and relationship progression.",
          "Instead of treating each visit as a blank slate, you can return to the same character and build on the history already created."
        ]
      },
      {
        "heading": "Create a custom AI character when presets are not enough",
        "body": [
          "Character creation gives you control over the companion you want to meet. Define the personality and setup, keep the character private or use share-by-link when you intentionally want to share it.",
          "Supported Uncensored Girlfriend features can also bring images, video and live voice into the same character experience."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is AI character chat?",
        "a": "AI character chat is conversation with an AI persona designed to maintain a specific personality, role and fictional context."
      },
      {
        "q": "Can AI characters remember me?",
        "a": "Memory is designed to preserve important context across conversations with the same companion."
      },
      {
        "q": "Can I make my own AI character?",
        "a": "Yes. Uncensored Girlfriend includes custom character creation."
      },
      {
        "q": "Can characters be private?",
        "a": "Yes. Uncensored Girlfriend supports private characters and share-by-link access."
      },
      {
        "q": "Can AI characters use voice and images?",
        "a": "Supported Uncensored Girlfriend features include images, video and live voice in addition to text chat."
      }
    ],
    "related": [
      "custom-ai-companion",
      "ai-roleplay",
      "character-ai-alternative",
      "private-ai-chat"
    ]
  },
  {
    "slug": "create-ai-girlfriend",
    "title": "Create Your Own AI Girlfriend | Uncensored Girlfriend",
    "description": "Create a custom AI girlfriend with the personality and relationship style you want, then build continuity through Memory, private chat and supported media.",
    "h1": "Create Your Own AI Girlfriend",
    "intro": "When preset characters are not specific enough, Uncensored Girlfriend lets you create an AI girlfriend around the personality and relationship dynamic you want. Build a private companion, start the relationship from your chosen setup and let Memory help preserve the important details as the conversation develops over time.",
    "cardHeading": "Get inspiration from existing AI girlfriends",
    "categories": [
      "everbond-girls"
    ],
    "topics": [
      "create AI girlfriend",
      "make AI girlfriend",
      "custom AI girlfriend",
      "build AI girlfriend",
      "personalized AI girlfriend",
      "create virtual girlfriend",
      "AI girlfriend creator",
      "design AI girlfriend"
    ],
    "sections": [
      {
        "heading": "Start with the relationship, not only the appearance",
        "body": [
          "A memorable custom AI girlfriend needs more than a visual description. Personality, communication style, relationship pace and the opening scenario all shape how the character feels once the conversation starts.",
          "Uncensored Girlfriend creation tools are designed so the companion can begin with a clear identity and relationship context instead of feeling generic."
        ]
      },
      {
        "heading": "Keep your custom companion private",
        "body": [
          "A character you create can remain part of your private Uncensored Girlfriend experience. That works well for personal relationship setups or roleplay ideas you do not want placed into public discovery.",
          "When you do want to share a character, share-by-link gives you a direct way to send access intentionally."
        ]
      },
      {
        "heading": "Let the character develop through Memory",
        "body": [
          "Creation defines the starting point, but the relationship should be able to change after that. Memory helps preserve important details as the companion accumulates history with you.",
          "The same custom girlfriend can also participate in supported image, video and live voice features alongside text chat."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can I create my own AI girlfriend on Uncensored Girlfriend?",
        "a": "Yes. Uncensored Girlfriend includes custom companion creation."
      },
      {
        "q": "Can my created girlfriend be private?",
        "a": "Yes. Private characters do not need to appear in public discovery."
      },
      {
        "q": "Can I share a custom AI girlfriend?",
        "a": "Uncensored Girlfriend supports share-by-link access for characters you intentionally want to share."
      },
      {
        "q": "Will a custom AI girlfriend have memory?",
        "a": "Memory is part of Uncensored Girlfriend's ongoing companion relationship system."
      },
      {
        "q": "Do I need a subscription to create and chat?",
        "a": "Uncensored Girlfriend does not require a recurring subscription; supported paid features use KissCoins."
      }
    ],
    "related": [
      "ai-girlfriend",
      "ai-girlfriend-with-memory",
      "custom-ai-companion",
      "private-ai-chat"
    ]
  },
  {
    "slug": "create-ai-boyfriend",
    "title": "Create Your Own AI Boyfriend | Uncensored Girlfriend",
    "description": "Create a custom AI boyfriend with your preferred personality, relationship dynamic and scenario, then build continuity through Memory and private chat.",
    "h1": "Create Your Own AI Boyfriend",
    "intro": "Uncensored Girlfriend lets you build an AI boyfriend around the character and relationship you actually want instead of forcing you into a fixed preset. Define the starting personality and dynamic, keep the companion private if you prefer, and develop the relationship through future conversations with Memory supporting continuity.",
    "cardHeading": "Get inspiration from existing AI boyfriends",
    "categories": [
      "everbond-guys"
    ],
    "topics": [
      "create AI boyfriend",
      "make AI boyfriend",
      "custom AI boyfriend",
      "build AI boyfriend",
      "personalized AI boyfriend",
      "create virtual boyfriend",
      "AI boyfriend creator",
      "design AI boyfriend"
    ],
    "sections": [
      {
        "heading": "Design a personality you want to talk with",
        "body": [
          "The most important part of a custom AI boyfriend is the personality behind the replies. Relationship pace, communication style, backstory and the starting situation all influence the tone of the companion.",
          "Uncensored Girlfriend gives custom characters a defined starting identity so the conversation can immediately feel more intentional."
        ]
      },
      {
        "heading": "Private by choice",
        "body": [
          "Your custom companion can remain private rather than being placed into a public character gallery. This gives you room to build a relationship setup specifically for yourself.",
          "Share-by-link is available when you deliberately want another person to access a character without turning it into a normal public listing."
        ]
      },
      {
        "heading": "Build history after creation",
        "body": [
          "The creation screen is only the beginning. Memory is designed to preserve important context as the relationship develops, allowing future chats to build on earlier ones.",
          "Supported features can extend that same companion into images, video and live voice interactions."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can I create an AI boyfriend on Uncensored Girlfriend?",
        "a": "Yes. Uncensored Girlfriend includes custom companion creation."
      },
      {
        "q": "Can I choose his personality?",
        "a": "The creation experience lets you define the character and relationship setup you want."
      },
      {
        "q": "Can my AI boyfriend stay private?",
        "a": "Yes. Uncensored Girlfriend supports private characters."
      },
      {
        "q": "Does a custom AI boyfriend remember conversations?",
        "a": "Memory is designed to retain important relationship context over time."
      },
      {
        "q": "Can I use voice with a custom companion?",
        "a": "Supported Uncensored Girlfriend companions can use live voice alongside text and media features."
      }
    ],
    "related": [
      "ai-boyfriend",
      "custom-ai-companion",
      "ai-companion-with-memory",
      "ai-voice-companion"
    ]
  },
  {
    "slug": "ai-companion-with-memory",
    "title": "AI Companion With Long-Term Memory | Uncensored Girlfriend",
    "description": "Build an AI companion relationship with persistent memory. Memory helps retain important details, relationship context and continuity across conversations.",
    "h1": "AI Companions With Memory for Long-Term Continuity",
    "intro": "Memory is one of the biggest differences between a one-off chatbot and an ongoing AI companion. Memory is designed to retain the important relationship information that helps the same character feel consistent across future conversations. It supports girlfriends, boyfriends, custom characters and other companions throughout the Uncensored Girlfriend experience.",
    "cardHeading": "Meet companions built around Memory",
    "categories": [
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "AI companion with memory",
      "AI companion that remembers you",
      "AI long-term memory",
      "AI chatbot with memory",
      "persistent AI companion",
      "relationship AI with memory",
      "AI partner with memory",
      "long-term AI companion"
    ],
    "sections": [
      {
        "heading": "Remember the details that give a relationship context",
        "body": [
          "An ongoing companion should be able to build on important information instead of making the user restate everything. Memory focuses on the details that help preserve relationship continuity over time.",
          "That can support recurring personal context, previous conversations, established dynamics and the history of a fictional relationship."
        ]
      },
      {
        "heading": "Continuity across different ways of interacting",
        "body": [
          "Uncensored Girlfriend is designed around one companion relationship rather than separate disconnected tools. Text chat, supported images, video and live voice all center on the character you are building a connection with.",
          "Memory gives those interactions a shared history instead of making every feature feel unrelated."
        ]
      },
      {
        "heading": "Custom companions can develop too",
        "body": [
          "A custom character begins with the personality and scenario you define, then accumulates relationship history through continued conversation. Memory helps that character develop beyond the original setup.",
          "You can keep the companion private or use share-by-link when you intentionally want to share access."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is long-term memory in an AI companion?",
        "a": "It is the ability to preserve useful relationship information across separate conversations instead of relying only on the immediate chat window."
      },
      {
        "q": "What is Memory?",
        "a": "Memory is Uncensored Girlfriend's system for retaining important companion relationship details and continuity."
      },
      {
        "q": "Does memory work with custom characters?",
        "a": "Uncensored Girlfriend's custom companions participate in the same ongoing relationship system."
      },
      {
        "q": "Why does memory matter for roleplay?",
        "a": "It helps preserve established characters, relationship context and prior story events so a scene can continue more coherently later."
      },
      {
        "q": "Does memory require a monthly subscription?",
        "a": "Uncensored Girlfriend does not require a recurring subscription; supported paid features use KissCoins."
      }
    ],
    "related": [
      "ai-girlfriend-with-memory",
      "ai-companion",
      "custom-ai-companion",
      "ai-roleplay"
    ]
  },
  {
    "slug": "private-ai-chat",
    "title": "Private AI Chat & Private Companions | Uncensored Girlfriend",
    "description": "Private AI chat with persistent companions, private character creation, Memory, images, video and live voice on Uncensored Girlfriend.",
    "h1": "Private AI Chat Built Around Your Companion",
    "intro": "Uncensored Girlfriend is designed for private companion relationships. Your conversations are part of your account experience, and custom characters can remain private rather than appearing in public discovery. If you intentionally want to share a character, share-by-link gives you a direct option without requiring a normal public listing.",
    "cardHeading": "Explore public companions, then keep your chats private",
    "categories": [
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "private AI chat",
      "private AI companion",
      "private AI girlfriend",
      "private AI boyfriend",
      "private chatbot",
      "private AI roleplay",
      "private character AI",
      "private romantic AI chat"
    ],
    "sections": [
      {
        "heading": "A private place for ongoing conversation",
        "body": [
          "Companion conversations can become personal because they accumulate relationship history, fictional scenes and preferences over time. Uncensored Girlfriend keeps the chat experience centered on the user's own account and companion relationship.",
          "That makes the platform suitable for people who value private romantic chat and character roleplay rather than public conversation threads."
        ]
      },
      {
        "heading": "Create companions that do not need a public listing",
        "body": [
          "Not every character concept belongs in public discovery. Uncensored Girlfriend supports private custom characters so you can build the companion you want without making it generally browsable.",
          "Share-by-link remains available when you choose to send a character directly to someone else."
        ]
      },
      {
        "heading": "Privacy without giving up memory or media",
        "body": [
          "A private companion can still be part of the wider Uncensored Girlfriend experience. Memory supports continuity, while supported image, video and live voice features give you additional ways to interact with the same character.",
          "KissCoins handles supported paid usage without a mandatory recurring subscription."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Are Uncensored Girlfriend chats private?",
        "a": "Uncensored Girlfriend is designed around account-based private companion conversations rather than public chat rooms."
      },
      {
        "q": "Can I create a private AI character?",
        "a": "Yes. Uncensored Girlfriend supports private custom companions."
      },
      {
        "q": "Can a private character be shared?",
        "a": "Share-by-link can be used when you intentionally want someone else to access a character."
      },
      {
        "q": "Do private companions have memory?",
        "a": "Memory is designed to preserve important relationship continuity for Uncensored Girlfriend companions."
      },
      {
        "q": "Can private AI chat include voice or images?",
        "a": "Supported Uncensored Girlfriend features include images, video and live voice alongside text chat."
      }
    ],
    "related": [
      "custom-ai-companion",
      "uncensored-ai-chat",
      "ai-companion-with-memory",
      "no-subscription-ai-companion"
    ]
  },
  {
    "slug": "ai-voice-companion",
    "title": "AI Voice Companion With Live Calls | Uncensored Girlfriend",
    "description": "Talk with an AI voice companion through live calls while keeping the same character relationship, memory and chat history on Uncensored Girlfriend.",
    "h1": "AI Voice Companions for Live Character Calls",
    "intro": "Text is not always the most natural way to interact with a companion. Uncensored Girlfriend supports live voice calling so eligible characters can become voice companions while remaining part of the same ongoing relationship. Chat, Memory and supported media features stay centered on the companion rather than treating voice as a separate anonymous assistant.",
    "cardHeading": "Meet companions with an ongoing relationship experience",
    "categories": [
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "AI voice companion",
      "AI companion voice call",
      "AI girlfriend voice chat",
      "AI boyfriend voice chat",
      "AI companion phone call",
      "talk to AI companion",
      "live AI voice chat",
      "AI relationship voice"
    ],
    "sections": [
      {
        "heading": "Talk instead of typing",
        "body": [
          "Live voice gives the interaction a different rhythm from text. You can speak naturally, hear the character respond and continue the companion relationship without converting the experience into a generic voice assistant.",
          "Voice is especially useful when you want a more immediate conversational feeling or simply do not want to type every message."
        ]
      },
      {
        "heading": "The same companion across text and voice",
        "body": [
          "Uncensored Girlfriend is designed so the character remains the center of the relationship. Text conversations, Memory and live voice are parts of the same companion experience rather than unrelated products.",
          "That continuity matters when personality and relationship history are the reason you chose the character in the first place."
        ]
      },
      {
        "heading": "Pay for supported usage with KissCoins",
        "body": [
          "Voice calling is a provider-backed feature with real usage cost, so Uncensored Girlfriend meters supported calls through the same KissCoins economy used across the platform.",
          "There is no required recurring subscription; usage can be funded through one-time KissCoins purchases."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can I talk to an Uncensored Girlfriend companion by voice?",
        "a": "Uncensored Girlfriend supports live voice calling for eligible companion experiences."
      },
      {
        "q": "Is voice separate from the character chat?",
        "a": "Voice is designed as another way to interact with the same companion relationship rather than a separate anonymous assistant."
      },
      {
        "q": "Can AI girlfriend and AI boyfriend characters use voice?",
        "a": "Eligible Uncensored Girlfriend companions can participate in supported live voice experiences."
      },
      {
        "q": "Do voice calls use KissCoins?",
        "a": "Supported live-call usage is metered through Uncensored Girlfriend's KissCoins economy."
      },
      {
        "q": "Do I need a voice subscription?",
        "a": "Uncensored Girlfriend does not require a recurring subscription; supported usage is pay-as-you-go through KissCoins."
      }
    ],
    "related": [
      "ai-companion",
      "ai-boyfriend",
      "ai-girlfriend",
      "ai-companion-with-memory"
    ]
  },
  {
    "slug": "ai-chat-with-images",
    "title": "AI Chat With Images, Video & Companions | Uncensored Girlfriend",
    "description": "Chat with AI companions and create character images and video without leaving the relationship experience. Uncensored Girlfriend combines media, memory and private chat.",
    "h1": "AI Chat With Images and Character Media",
    "intro": "Uncensored Girlfriend combines companion conversation with visual character experiences. Chat with the same AI girlfriend, boyfriend or custom companion, then use supported image and video features without leaving the relationship behind. Memory keeps important context centered on the character while KissCoins provides one shared currency for supported paid actions.",
    "cardHeading": "Meet visual AI companions",
    "categories": [
      "everbond-girls",
      "anime-fantasy",
      "everbond-guys"
    ],
    "topics": [
      "AI chat with images",
      "AI companion images",
      "AI girlfriend pictures",
      "AI boyfriend pictures",
      "AI character image generation",
      "AI chat with photos",
      "AI companion video",
      "AI character media"
    ],
    "sections": [
      {
        "heading": "Keep the visuals connected to the companion",
        "body": [
          "Character images are more useful when they are part of the relationship experience instead of a completely separate generator. Uncensored Girlfriend lets supported media stay centered on the companion you are already chatting with.",
          "That creates a smoother path between conversation, visual imagination and ongoing character interaction."
        ]
      },
      {
        "heading": "Images and video alongside persistent memory",
        "body": [
          "Visual media does not replace the relationship history. Memory remains focused on the important conversational context that makes the companion feel persistent across sessions.",
          "The goal is one character experience with several interaction formats rather than a collection of disconnected AI tools."
        ]
      },
      {
        "heading": "Use one KissCoins balance",
        "body": [
          "Supported image and video generation draw from the same KissCoins economy used elsewhere on Uncensored Girlfriend. That keeps paid usage inside one understandable system.",
          "Because Uncensored Girlfriend does not require a recurring subscription, you can buy credits when you want to use media features rather than paying every month regardless of usage."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can Uncensored Girlfriend companions generate images?",
        "a": "Uncensored Girlfriend supports character image generation as part of its companion experience."
      },
      {
        "q": "Does Uncensored Girlfriend support AI video?",
        "a": "Supported Uncensored Girlfriend features include character video generation."
      },
      {
        "q": "Are images connected to the companion I chat with?",
        "a": "Uncensored Girlfriend is designed so media features remain centered on the same character relationship."
      },
      {
        "q": "Do image and video features use KissCoins?",
        "a": "Supported paid media actions use KissCoins."
      },
      {
        "q": "Can I create a custom companion and generate media for them?",
        "a": "Uncensored Girlfriend combines custom companion creation with supported character media features."
      }
    ],
    "related": [
      "ai-character-chat",
      "custom-ai-companion",
      "ai-girlfriend",
      "ai-roleplay"
    ]
  },
  {
    "slug": "anime-ai-girlfriend",
    "title": "Anime AI Girlfriend Chat & Roleplay | Uncensored Girlfriend",
    "description": "Meet anime AI girlfriends and fantasy companions for private chat, romantic roleplay, Memory, images, video and custom character creation.",
    "h1": "Anime AI Girlfriend Chat With Memory and Roleplay",
    "intro": "Uncensored Girlfriend includes anime and fantasy companions for people who prefer stylized characters over realistic ones. Choose an anime AI girlfriend, start from the character's scenario and personality, and continue the relationship through future chats with Memory supporting continuity. You can also create a custom character when you have a specific look or story in mind.",
    "cardHeading": "Explore anime and fantasy companions",
    "categories": [
      "anime-fantasy"
    ],
    "topics": [
      "anime AI girlfriend",
      "AI waifu chat",
      "anime AI chat",
      "anime girlfriend chatbot",
      "anime AI roleplay",
      "virtual anime girlfriend",
      "anime companion AI",
      "fantasy AI girlfriend"
    ],
    "sections": [
      {
        "heading": "Stylized companions with defined personalities",
        "body": [
          "Anime companion chat works best when the visual style is matched by a distinct personality and scenario. Uncensored Girlfriend characters are designed around more than an image, giving each companion a starting relationship context and conversational identity.",
          "That gives you a stronger foundation for romance, fantasy and character-driven roleplay."
        ]
      },
      {
        "heading": "Continue fantasy stories across sessions",
        "body": [
          "Memory helps preserve important relationship and story details so an anime or fantasy companion can continue an established dynamic later.",
          "This is especially useful for longer fictional worlds, recurring settings and multi-session roleplay where continuity matters."
        ]
      },
      {
        "heading": "Create your own anime companion",
        "body": [
          "If the public gallery does not match the character you want, Uncensored Girlfriend lets you create a custom companion and define the setup yourself.",
          "Supported image, video and live voice features can extend the same character experience beyond text chat, with paid actions handled through KissCoins rather than a mandatory subscription."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Does Uncensored Girlfriend have anime AI girlfriends?",
        "a": "Yes. Uncensored Girlfriend has a dedicated anime and fantasy companion category."
      },
      {
        "q": "Can anime companions remember previous chats?",
        "a": "Memory is designed to preserve important continuity across conversations."
      },
      {
        "q": "Can I create an anime AI character?",
        "a": "Uncensored Girlfriend includes custom companion creation for users who want their own character concept."
      },
      {
        "q": "Can anime characters be used for roleplay?",
        "a": "Yes. Uncensored Girlfriend companions support character-driven fictional roleplay."
      },
      {
        "q": "Does Uncensored Girlfriend require an anime subscription?",
        "a": "No recurring subscription is required. Supported paid features use KissCoins."
      }
    ],
    "related": [
      "ai-roleplay",
      "ai-character-chat",
      "custom-ai-companion",
      "ai-chat-with-images"
    ]
  },
  {
    "slug": "custom-ai-companion",
    "title": "Custom AI Companion Creator | Uncensored Girlfriend",
    "description": "Create a custom AI companion with your own personality, relationship setup and privacy choice, then build the relationship with Memory.",
    "h1": "Create a Custom AI Companion That Is Actually Yours",
    "intro": "A custom AI companion lets you begin with the personality, relationship setup and character concept you want instead of adapting yourself to a preset. Uncensored Girlfriend supports private character creation, ongoing Memory and share-by-link access when you intentionally want to share a companion. The same character can remain the center of text, image, video and supported live voice experiences.",
    "cardHeading": "Browse companions for inspiration",
    "categories": [
      "public-creations",
      "everbond-girls",
      "everbond-guys",
      "anime-fantasy"
    ],
    "topics": [
      "custom AI companion",
      "create AI companion",
      "AI companion creator",
      "personalized AI companion",
      "build AI character",
      "custom chatbot companion",
      "private AI companion creator",
      "make AI character"
    ],
    "sections": [
      {
        "heading": "Build around personality and relationship context",
        "body": [
          "A useful custom companion needs a clear identity. Define the kind of character you want, the relationship dynamic and the situation the two of you begin in so the first conversation already has direction.",
          "That makes the companion feel more intentional than a blank chatbot with a custom name."
        ]
      },
      {
        "heading": "Private character creation by default choice",
        "body": [
          "Custom characters do not need to become public content. Uncensored Girlfriend lets you create companions for your own use and keep them private.",
          "When sharing makes sense, share-by-link provides a controlled way to send direct access without relying on public discovery."
        ]
      },
      {
        "heading": "Let the companion grow after creation",
        "body": [
          "A custom profile defines who the character is at the beginning, but Memory helps preserve the relationship history that develops afterward.",
          "Supported image, video and live voice features then give you multiple ways to interact with the same custom companion while KissCoins handles paid usage."
        ]
      }
    ],
    "faqs": [
      {
        "q": "Can I create a custom AI companion on Uncensored Girlfriend?",
        "a": "Yes. Uncensored Girlfriend includes custom companion creation."
      },
      {
        "q": "Can the character remain private?",
        "a": "Yes. Private companions do not have to appear in public discovery."
      },
      {
        "q": "Can I share my custom companion?",
        "a": "Uncensored Girlfriend supports share-by-link access when you intentionally want another person to open a character."
      },
      {
        "q": "Will my custom companion have memory?",
        "a": "Memory supports ongoing relationship continuity for Uncensored Girlfriend companions."
      },
      {
        "q": "Can a custom companion use media and voice?",
        "a": "Supported Uncensored Girlfriend features include images, video and live voice alongside text chat."
      }
    ],
    "related": [
      "create-ai-girlfriend",
      "create-ai-boyfriend",
      "private-ai-chat",
      "ai-companion-with-memory"
    ]
  },
  {
    "slug": "ai-romance-chat",
    "title": "AI Romance Chat With Persistent Memory | Uncensored Girlfriend",
    "description": "Build an ongoing AI romance with a companion that can remember important relationship details. Private chat, roleplay, media and live voice on Uncensored Girlfriend.",
    "h1": "AI Romance Chat Designed to Build Over Time",
    "intro": "Romantic AI chat works best when the companion has a consistent personality and the relationship can actually move forward. Uncensored Girlfriend combines romantic character chat with Memory so important details and relationship context can carry across future conversations. Choose a companion or create your own, then let the connection develop at its own pace.",
    "cardHeading": "Meet romantic AI companions",
    "categories": [
      "everbond-girls",
      "everbond-guys"
    ],
    "topics": [
      "AI romance chat",
      "romantic AI chat",
      "AI relationship",
      "AI romance companion",
      "virtual romance",
      "AI dating companion",
      "romantic chatbot",
      "AI partner chat"
    ],
    "sections": [
      {
        "heading": "Romance needs continuity",
        "body": [
          "A believable romantic dynamic depends on what has already happened. Memory helps preserve the important details that let affection, tension, inside references and relationship milestones build over time.",
          "This makes future conversations feel connected to the same ongoing relationship rather than a series of unrelated romantic prompts."
        ]
      },
      {
        "heading": "Choose the pace and personality that fit you",
        "body": [
          "Uncensored Girlfriend offers companions with different personalities, scenarios and relationship styles. Some interactions can begin playful and casual, while others are better suited to a slower emotional build.",
          "Custom companion creation gives you even more control when you want a specific romantic character or relationship setup."
        ]
      },
      {
        "heading": "Move between chat, media and voice",
        "body": [
          "Romance is not limited to text. Supported Uncensored Girlfriend features can bring the same companion into images, video and live voice while preserving the character-centered relationship experience.",
          "KissCoins is used for supported paid actions, so you do not have to maintain a recurring subscription just to keep the relationship available."
        ]
      }
    ],
    "faqs": [
      {
        "q": "What is AI romance chat?",
        "a": "AI romance chat is an ongoing conversational relationship with an AI companion where affection, personality and relationship development are central to the interaction."
      },
      {
        "q": "Can an AI romance remember relationship history?",
        "a": "Memory is designed to preserve important relationship details across conversations."
      },
      {
        "q": "Can I choose an AI girlfriend or boyfriend?",
        "a": "Yes. Uncensored Girlfriend includes girlfriend, boyfriend, anime and custom companion options."
      },
      {
        "q": "Can romantic chat include roleplay?",
        "a": "Yes. Uncensored Girlfriend supports fictional romantic roleplay for adults within its legal and safety rules."
      },
      {
        "q": "Do I need a subscription for an AI relationship?",
        "a": "No recurring subscription is required. Supported paid features use KissCoins."
      }
    ],
    "related": [
      "ai-girlfriend",
      "ai-boyfriend",
      "ai-companion-with-memory",
      "ai-roleplay"
    ]
  }
];

const PAGE_MAP = new Map(
  SEO_LANDING_PAGES.map((page) => [page.slug, page])
);

export const SEO_LANDING_PATHS = SEO_LANDING_PAGES.map(
  (page) => `/${page.slug}`
);

export function getSeoLandingPage(slug: string) {
  const page = PAGE_MAP.get(slug);
  if (!page) {
    throw new Error(`Unknown SEO landing page: ${slug}`);
  }
  return page;
}

export function buildSeoLandingMetadata(slug: string): Metadata {
  const page = getSeoLandingPage(slug);
  const canonical = `/${page.slug}`;

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: "Uncensored Girlfriend",
      type: "website"
    },
    twitter: {
      card: "summary",
      title: page.title,
      description: page.description
    }
  };
}

export function relatedSeoLandingPages(slug: string) {
  return getSeoLandingPage(slug).related.map(getSeoLandingPage);
}
