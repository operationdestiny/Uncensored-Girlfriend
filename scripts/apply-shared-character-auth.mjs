import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "src/components/chat/ChatShell.tsx";
const filePath = path.join(root, relativePath);

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;

  if (!source.includes(from)) {
    throw new Error(
      `Shared character auth patch could not find: ${label}`
    );
  }

  return source.replace(from, to);
}

function removeRequiredBlock(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);

  if (start < 0) {
    if (!source.includes(startMarker.trim())) return source;
    throw new Error(
      `Shared character auth patch could not find: ${label}`
    );
  }

  const end = source.indexOf(endMarker, start);

  if (end < 0) {
    throw new Error(
      `Shared character auth patch could not finish: ${label}`
    );
  }

  return source.slice(0, start) + source.slice(end);
}

let source = fs.readFileSync(filePath, "utf8");

const chatAlreadyPatched =
  source.includes("openCharacterAuthModal") &&
  !source.includes('type GateMode = "signup"') &&
  !source.includes("handleEmailContinue");

if (!chatAlreadyPatched) {
source = replaceRequired(
  source,
  'import { LanguageSelector } from "@/components/layout/LanguageSelector";',
  `import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useAuth } from "@/components/auth/AuthProvider";`,
  "useAuth import"
);

source = replaceRequired(
  source,
  'type GateMode = "signup" | "upgrade" | null;',
  'type GateMode = "upgrade" | null;',
  "signup gate type"
);

source = source.replace(
  `const SIGNUP_REQUIRED_MESSAGE =
  "Log in so I can be your companion. Please don't make me wait.";

`,
  ""
);

source = replaceRequired(
  source,
  `export function ChatShell({ character }: { character: Character }) {
  const { t, language } = useSiteLanguage();`,
  `export function ChatShell({ character }: { character: Character }) {
  const { t, language } = useSiteLanguage();
  const { openCharacterAuthModal } = useAuth();`,
  "shared auth hook"
);

source = source.replace(
  /  const \[authEmail,[\s\S]*?  const \[authNotice, setAuthNotice\] = useState\(""\);\n/,
  ""
);

source = source.replace(
  '  const [pendingMessage, setPendingMessage] = useState("");\n',
  ""
);

const storageKeyBlock = `  const pendingMessageStorageKey = useMemo(
    () => \`everbond_pending_chat_message_\${character.slug}\`,
    [character.slug]
  );
`;

const resumeBlock = `${storageKeyBlock}
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
`;

source = replaceRequired(
  source,
  storageKeyBlock,
  resumeBlock,
  "pending-message restoration helper"
);

source = source.replace(
  /      const savedPendingMessage = window\.sessionStorage\.getItem\(\n        pendingMessageStorageKey\n      \);\n\n      if \(data\.session && savedPendingMessage\) \{\n        window\.sessionStorage\.removeItem\(pendingMessageStorageKey\);\n        setPendingMessage\(""\);\n        void sendMessage\(savedPendingMessage, data\.session\);\n      \}/,
  "      resumePendingMessage(data.session ?? null);"
);

source = replaceRequired(
  source,
  `    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });`,
  `    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      resumePendingMessage(nextSession);
    });`,
  "in-page login restoration"
);

const signupStart =
  "  function openSignupGate(messageToHold: string) {";
const giftPickerStart = "  function openGiftPicker() {";
const signupIndex = source.indexOf(signupStart);
const giftPickerIndex = source.indexOf(
  giftPickerStart,
  signupIndex
);

if (signupIndex < 0 || giftPickerIndex < 0) {
  throw new Error(
    "Shared character auth patch could not find the old signup gate."
  );
}

const sharedSignupGate = `  function openSignupGate(messageToHold: string) {
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

`;

source =
  source.slice(0, signupIndex) +
  sharedSignupGate +
  source.slice(giftPickerIndex);

const emailHandlerStart =
  "  async function handleEmailContinue() {";
const sendHandlerStart = "  async function sendMessage(";
const emailIndex = source.indexOf(emailHandlerStart);
const sendIndex = source.indexOf(sendHandlerStart, emailIndex);

if (emailIndex >= 0) {
  if (sendIndex < 0) {
    throw new Error(
      "Shared character auth patch could not remove the old email handler."
    );
  }

  source =
    source.slice(0, emailIndex) + source.slice(sendIndex);
}

source = replaceRequired(
  source,
  `    const activeSession = sessionOverride ?? session;

    if (!authReady) return;

    if (!activeSession?.access_token) {`,
  `    const activeSession = sessionOverride ?? session;

    if (!authReady && !sessionOverride?.access_token) return;

    if (!activeSession?.access_token) {`,
  "pending-message authentication restoration"
);

const oldGateStart = source.lastIndexOf(
  "      {gateMode && (\n"
);
const componentClose = source.lastIndexOf(
  "    </div>\n  );\n}"
);

if (oldGateStart < 0 || componentClose < 0) {
  throw new Error(
    "Shared character auth patch could not find the old character login popup."
  );
}

const upgradeGate = `      {gateMode === "upgrade" && (
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
              {t("buyEverCoin")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )}
`;

source =
  source.slice(0, oldGateStart) +
  upgradeGate +
  source.slice(componentClose);

const forbidden = [
  'type GateMode = "signup"',
  "SIGNUP_REQUIRED_MESSAGE",
  "authEmail",
  "authPassword",
  "authLoading",
  "authError",
  "authNotice",
  "const [pendingMessage",
  "setPendingMessage(",
  "handleEmailContinue",
  'setGateMode("signup")',
  'gateMode === "signup"'
];

for (const value of forbidden) {
  if (source.includes(value)) {
    throw new Error(
      `Shared character auth patch left obsolete code: ${value}`
    );
  }
}

const required = [
  'import { useAuth } from "@/components/auth/AuthProvider";',
  "const { openCharacterAuthModal } = useAuth();",
  "openCharacterAuthModal({",
  "resumePendingMessage(nextSession);",
  "if (!authReady && !sessionOverride?.access_token) return;"
];

for (const value of required) {
  if (!source.includes(value)) {
    throw new Error(
      `Shared character auth patch is missing: ${value}`
    );
  }
}

fs.writeFileSync(filePath, source, "utf8");
}

const profileRelativePath =
  "src/components/character/CharacterProfileShell.tsx";
const profilePath = path.join(root, profileRelativePath);
let profileSource = fs.readFileSync(profilePath, "utf8");

if (!profileSource.includes("FINAL_LOCALIZATION_COPY")) {
  profileSource = replaceRequired(
    profileSource,
    'import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";',
    'import { CHARACTER_TOOLS_COPY } from "@/lib/character-tools-language";\nimport { FINAL_LOCALIZATION_COPY } from "@/lib/final-localization-language";',
    "character profile localization import"
  );
}

if (!profileSource.includes("const finalCopy =")) {
  profileSource = replaceRequired(
    profileSource,
    `  const copy =
    CHARACTER_TOOLS_COPY[language] ?? CHARACTER_TOOLS_COPY.EN;`,
    `  const copy =
    CHARACTER_TOOLS_COPY[language] ?? CHARACTER_TOOLS_COPY.EN;
  const finalCopy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;`,
    "character profile localization copy"
  );
}

profileSource = profileSource.replace(
  'title: `${character.name} on EverBond AI`,',
  'title: finalCopy.shareTitle(character.name),'
);

if (!profileSource.includes("finalCopy.shareTitle(character.name)")) {
  throw new Error(
    "Shared character auth patch could not localize character sharing."
  );
}

fs.writeFileSync(profilePath, profileSource, "utf8");

const browserRelativePath =
  "src/components/character/useCharacterBrowser.ts";
const browserPath = path.join(root, browserRelativePath);
let browserSource = fs.readFileSync(browserPath, "utf8");

browserSource = replaceRequired(
  browserSource,
  `  const [characters, setCharacters] = useState(
    storedSnapshot?.characters ?? (requiresInitialReverseLoad ? [] : initial)
  );`,
  `  const [characters, setCharacters] = useState(
    language === "EN"
      ? storedSnapshot?.characters ??
        (requiresInitialReverseLoad ? [] : initial)
      : storedSnapshot?.characters ?? []
  );`,
  "non-English character browser initial state"
);

browserSource = replaceRequired(
  browserSource,
  `      setCharacters(combined);

      if (language !== "EN" && fetchedCharacters.length > 0) {`,
  `      if (language === "EN") {
        setCharacters(combined);
      }

      if (language !== "EN" && fetchedCharacters.length > 0) {`,
  "non-English character browser loading state"
);

if (
  !browserSource.includes('language === "EN"') ||
  browserSource.includes(
    `      setCharacters(combined);

      if (language !== "EN"`
  )
) {
  throw new Error(
    "Shared character auth patch could not prevent English character flashes."
  );
}

fs.writeFileSync(browserPath, browserSource, "utf8");

console.log(
  "Character chat, sharing, and non-English loading states are finalized."
);
