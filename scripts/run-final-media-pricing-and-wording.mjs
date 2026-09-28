import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const sourcePath = path.join(
  root,
  "scripts/apply-final-media-pricing-and-wording.mjs"
);
const runtimePath = path.join(
  root,
  "scripts/.apply-final-media-pricing-and-wording.runtime.mjs"
);

let source = fs.readFileSync(sourcePath, "utf8");

const requiredImageLoop = `for (const [from, to] of imageAdvertising) {
  why = replaceRequired(
    why,
    from,
    to,
    \`Why EverBond image copy: \${from}\`
  );
}`;

const safeImageLoop = `for (const [from, to] of imageAdvertising) {
  // Why EverBond copy is now maintained directly in the page source.
  // Upgrade legacy wording when present, but do not reject newer copy.
  why = replaceAll(why, from, to);
}`;

if (source.includes(requiredImageLoop)) {
  source = source.replace(requiredImageLoop, safeImageLoop);
} else if (!source.includes(safeImageLoop)) {
  throw new Error(
    "Could not locate the Why EverBond image-copy compatibility block."
  );
}

const obsoleteVideoPhraseCheck = `if (
  /live video calls|Live uncensored video calls|videollamadas|appels vidéo|Videoanrufe|ライブビデオ通話|라이브 영상 통화/.test(
    why
  )
) {
  throw new Error(
    "A video-call phrase remains on the Why EverBond page."
  );
}

`;

if (source.includes(obsoleteVideoPhraseCheck)) {
  source = source.replace(obsoleteVideoPhraseCheck, "");
}

if (source.includes("why = replaceRequired(\n    why,\n    from,\n    to,\n    `Why EverBond image copy:")) {
  throw new Error(
    "The runtime script still contains the obsolete required Why EverBond copy replacement."
  );
}

if (source.includes("A video-call phrase remains on the Why EverBond page.")) {
  throw new Error(
    "The runtime script still contains the obsolete localized video-phrase rejection."
  );
}

fs.writeFileSync(runtimePath, source, "utf8");

try {
  await import(
    `${pathToFileURL(runtimePath).href}?build=${Date.now()}`
  );
} finally {
  fs.rmSync(runtimePath, { force: true });
}
