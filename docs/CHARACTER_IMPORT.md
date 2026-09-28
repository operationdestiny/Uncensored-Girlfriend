# EverBond Real Character Import Patch

This patch adds the real EverBond character library and removes live dependence on placeholder characters.

## Included library counts

- EverBond Girls: 1612
- Anime & Fantasy: 668
- EverBond Guys: 200
- Public Creations: 384
- Total: 2864

## What changed

- Adds merged category JSON files under `data/characters/`.
- Adds all character images under `public/character-assets/<category>/`.
- Adds `scripts/import-characters.mjs`.
- Adds `npm run import:characters`.
- Makes the homepage load Supabase characters instead of static placeholders.
- Replaces `src/lib/characters.ts` with category constants and an empty fallback.
- Updates Supabase character mapping for the new schema.
- Adds a "More" button to the Explore character grid after the first 100.
- Keeps existing visual components, banners, CSS, translations, and layout unchanged.

## How to apply

Extract this ZIP into your current V108 project root.

Then run:

```bash
npm install
```

Make sure `.env.local` includes:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Then apply the Supabase schema/migration in Supabase SQL editor:

```sql
-- Either run supabase/schema.sql on a fresh database
-- or run supabase/migrations/0004_real_characters_import_ready.sql on an existing V108 database.
```

Then import characters:

```bash
npm run import:characters
```

Then build:

```bash
npm run build
```

## Verify

Open:

- `/`
- `/characters`
- `/character/<one-real-slug>`
- `/chat/<same-real-slug>`

Images should resolve from:

- `/character-assets/everbond-girls/<image_file>`
- `/character-assets/anime-fantasy/<image_file>`
- `/character-assets/everbond-guys/<image_file>`
- `/character-assets/public-creations/<image_file>`

## Notes

Do not deploy `.next`, `node_modules`, or old patch artifact folders.
The real AI/image/TTS/voice providers are still stubs until you choose providers and add API keys.
