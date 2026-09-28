# EverBond Clean Character Reset From Raw

This is the single clean reset package.

Use this instead of all earlier character/title patches.

## Source of truth

The only source of truth is your generated premium raw folder:

```text
C:\Users\smith\Downloads\EverBond-AI\character output\output\raw
```

Example file:

```text
C:\Users\smith\Downloads\EverBond-AI\character output\output\raw\everbond-public-creations-0383.txt
```

This package reads those `.txt` JSON files directly.

## What this does

1. Inspects and validates the raw premium `.txt` files.
2. Generates title-only trim proposals from those raw titles.
3. Shows old/new title changes only.
4. Builds fresh `data/characters/*.json` from the raw premium files.
5. Replaces the old import script so Supabase imports the long premium schema.
6. Gives you one Supabase SQL reset migration that drops old character-dependent tables and recreates the premium schema.

## What title trim is allowed to change

Only `title`, and only by removing unnecessary clothing/color/outfit wording.

Examples:

```text
OLD: Your ex in the black dress asks if you still want her
NEW: Your ex asks if you still want her
```

```text
OLD: The model in lace tests how bold you are
NEW: The model tests how bold you are
```

It does not update slugs.
It does not rewrite hooks.
It does not change meaning.
It does not touch images, ai_profile, first_message, opening_scenario, tags, or schema.

## Apply package

Extract this ZIP, then run exactly one robocopy:

```powershell
robocopy "C:\Users\smith\Downloads\everbond-clean-character-reset-from-raw\everbond-clean-character-reset-from-raw" "C:\Users\smith\Downloads\EverBond-AI" /E /IS
```

Then:

```powershell
cd "C:\Users\smith\Downloads\EverBond-AI"
```

## Env for inspection and title proposals

Add/keep this in `.env.local`:

```env
CHARACTER_RAW_SOURCE_DIR=character output/output/raw

AI_API_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here

TITLE_TRIM_MODEL_ID=gpt-5.1
TITLE_TRIM_BATCH_SIZE=30
TITLE_TRIM_LIMIT=100
TITLE_TRIM_FORCE_RESTART=true
APPLY_TITLE_TRIM=false

SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CHARACTER_IMPORT_DRY_RUN=true
CHARACTER_IMPORT_BATCH_SIZE=200
```

## Step 1 — Inspect raw premium source

```powershell
node scripts/inspect-raw-premium-library.mjs
```

You want:

```text
Raw records parsed: 2864
Category counts:
everbond-girls: 1612
anime-fantasy: 668
everbond-guys: 200
public-creations: 384
Raw premium character source looks valid.
```

## Step 2 — Generate first 100 title trim proposals

Keep:

```env
TITLE_TRIM_LIMIT=100
TITLE_TRIM_FORCE_RESTART=true
APPLY_TITLE_TRIM=false
```

Run:

```powershell
node scripts/generate-title-trim-proposals-from-raw.mjs
```

Review changed titles only:

```text
output/clean-character-reset/title-trim-review.txt
output/clean-character-reset/title-trim-changed-only.csv
```

## Step 3 — Generate full-library title proposals

If the first 100 are correct, update `.env.local`:

```env
TITLE_TRIM_LIMIT=
TITLE_TRIM_FORCE_RESTART=true
APPLY_TITLE_TRIM=false
```

Run:

```powershell
node scripts/generate-title-trim-proposals-from-raw.mjs
```

Review:

```text
output/clean-character-reset/title-trim-review.txt
```

## Step 4 — Build fresh site JSON from raw

If you approve the title trims, set:

```env
APPLY_TITLE_TRIM=true
```

Then run:

```powershell
node scripts/build-premium-character-json-from-raw.mjs
```

This overwrites:

```text
data/characters/everbond-girls.json
data/characters/anime-fantasy.json
data/characters/everbond-guys.json
data/characters/public-creations.json
```

from the raw premium output.

It also adds/makes:

```text
display_order
quality_control
full ai_profile
feature_flags
generated_seo
premium opening_scenario
premium first_message
premium relationship_context
```

EverBond Girls are mixed by `display_order` so original `0001–0500` are spread out.

## Step 5 — Run Supabase clean reset SQL

Open Supabase SQL Editor and run this file as a NEW query:

```text
supabase/migrations/20260713_clean_premium_character_library_reset.sql
```

This drops and rebuilds old character-dependent tables. Old character data is gone.

## Step 6 — Dry run import

Set:

```env
CHARACTER_IMPORT_DRY_RUN=true
```

Run:

```powershell
npm run import:characters
```

## Step 7 — Real import

Set:

```env
CHARACTER_IMPORT_DRY_RUN=false
```

Run:

```powershell
npm run import:characters
```

## Step 8 — Verify Supabase

```powershell
node scripts/verify-premium-characters.mjs
```

Expected:

```text
OK everbond-girls: 1612 / expected 1612
OK anime-fantasy: 668 / expected 668
OK everbond-guys: 200 / expected 200
OK public-creations: 384 / expected 384
OK total: 2864 / expected 2864
```

## Step 9 — Build site

```powershell
npm run build
```

## Important cleanup

Ignore the earlier patch folders and earlier title output folders. This package uses:

```text
output/clean-character-reset
```

not the previous `output/title-clothing-trim*` folders.
