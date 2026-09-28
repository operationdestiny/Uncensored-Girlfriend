import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, from, to, label) {
  if (content.includes(to)) return content;

  if (!content.includes(from)) {
    throw new Error(
      `EverCoin/share-link patch could not find: ${label}`
    );
  }

  return content.replace(from, to);
}

function replaceRegexRequired(
  content,
  pattern,
  replacement,
  alreadyPresent,
  label
) {
  if (content.includes(alreadyPresent)) return content;

  if (!pattern.test(content)) {
    throw new Error(
      `EverCoin/share-link patch could not find: ${label}`
    );
  }

  return content.replace(pattern, replacement);
}

const chatPath = "src/components/chat/ChatShell.tsx";
let chat = read(chatPath);

chat = replaceRequired(
  chat,
  'import { EVERSHOP_COPY } from "@/lib/evershop-language";',
  `import { EVERSHOP_COPY } from "@/lib/evershop-language";
import { InsufficientEverCoinModal } from "@/components/media/InsufficientEverCoinModal";`,
  "chat insufficient-EverCoin modal import"
);

chat = replaceRequired(
  chat,
  '  const [giftError, setGiftError] = useState("");',
  `  const [giftError, setGiftError] = useState("");
  const [coinModalOpen, setCoinModalOpen] = useState(false);`,
  "chat insufficient-EverCoin modal state"
);

chat = replaceRegexRequired(
  chat,
  /        if \(\s*data\?\.error === "TRIAL_ENDED" \|\|\s*data\?\.error === "INSUFFICIENT_EVERCOIN" \|\|\s*data\?\.error === "EVERCOIN_DEBT"\s*\) \{\s*setInput\(trimmed\);\s*window\.location\.assign\("\/coins\?reason=chat"\);\s*return;\s*\}/,
  `        if (
          data?.error === "TRIAL_ENDED" ||
          data?.error === "INSUFFICIENT_EVERCOIN" ||
          data?.error === "EVERCOIN_DEBT"
        ) {
          setInput(trimmed);
          setCoinModalOpen(true);
          return;
        }`,
  "setCoinModalOpen(true);",
  "direct EverCoin redirect"
);

chat = replaceRequired(
  chat,
  `      <ChatGiftPicker
        open={giftPickerOpen}`,
  `      <InsufficientEverCoinModal
        open={coinModalOpen}
        onClose={() => setCoinModalOpen(false)}
      />

      <ChatGiftPicker
        open={giftPickerOpen}`,
  "chat insufficient-EverCoin modal rendering"
);

const chatRequired = [
  'import { InsufficientEverCoinModal } from "@/components/media/InsufficientEverCoinModal";',
  "const [coinModalOpen, setCoinModalOpen] = useState(false);",
  "setCoinModalOpen(true);",
  "open={coinModalOpen}",
  "onClose={() => setCoinModalOpen(false)}"
];

for (const value of chatRequired) {
  if (!chat.includes(value)) {
    throw new Error(
      `Chat EverCoin popup is missing: ${value}`
    );
  }
}

if (chat.includes('window.location.assign("/coins?reason=chat")')) {
  throw new Error(
    "The direct chat-to-EverCoin redirect is still present."
  );
}

write(chatPath, chat);

const actionsPath =
  "src/components/my-bond/MyCompanionActions.tsx";
let actions = read(actionsPath);

actions = replaceRequired(
  actions,
  '  const [linkCopied, setLinkCopied] = useState(false);',
  `  const [linkCopied, setLinkCopied] = useState(false);
  const [shareLink, setShareLink] = useState(
    \`/chat/\${companion.slug}\`
  );`,
  "visible share-link state"
);

actions = replaceRequired(
  actions,
  `  useEffect(() => {
    return () => {
      if (replacementPreview.startsWith("blob:")) {`,
  `  useEffect(() => {
    setShareLink(
      \`\${window.location.origin}/chat/\${companion.slug}\`
    );
  }, [companion.slug]);

  useEffect(() => {
    return () => {
      if (replacementPreview.startsWith("blob:")) {`,
  "absolute visible share-link effect"
);

actions = replaceRequired(
  actions,
  `  function shareUrl() {
    if (typeof window === "undefined") return \`/chat/\${companion.slug}\`;
    return \`\${window.location.origin}/chat/\${companion.slug}\`;
  }`,
  `  function shareUrl() {
    return shareLink;
  }`,
  "shared link helper"
);

actions = replaceRequired(
  actions,
  `      {editOpen && (`,
  `      {companion.visibility === "public" && (
        <div className="col-span-3 mt-1 rounded-2xl border border-bond-rose/35 bg-bond-rose/[0.06] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-bond-rose">
            {sharing.shareByLink}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <input
              readOnly
              value={shareLink}
              onFocus={(event) => event.currentTarget.select()}
              aria-label={sharing.shareByLink}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] text-white outline-none"
            />
            <button
              type="button"
              onClick={() => void copyShareLink()}
              aria-label={sharing.copyLink}
              title={sharing.copyLink}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bond-rose/55 bg-bond-rose/10 text-white transition hover:bg-bond-rose/20"
            >
              {linkCopied ? (
                <Check size={17} />
              ) : (
                <Copy size={17} />
              )}
            </button>
          </div>
          {linkCopied && (
            <p className="mt-2 text-xs font-semibold text-emerald-300">
              {sharing.linkCopied}
            </p>
          )}
        </div>
      )}

      {editOpen && (`,
  "visible My Bond share link"
);

const actionsRequired = [
  "const [shareLink, setShareLink] = useState(",
  "window.location.origin",
  'companion.visibility === "public"',
  "value={shareLink}",
  "onClick={() => void copyShareLink()}",
  "aria-label={sharing.copyLink}"
];

for (const value of actionsRequired) {
  if (!actions.includes(value)) {
    throw new Error(
      `My Bond share link is missing: ${value}`
    );
  }
}

write(actionsPath, actions);

console.log(
  "Chat EverCoin popup and visible My Bond share links are applied."
);
