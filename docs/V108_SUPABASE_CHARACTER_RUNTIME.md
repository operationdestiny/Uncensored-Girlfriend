# V108 Supabase Character Runtime Patch

This patch keeps the visual UI unchanged and switches character loading from the static placeholder library to Supabase where needed.

## What changed

- `/characters` now loads public characters from Supabase and passes them into the existing grid UI.
- `/character/[slug]` now loads the character by slug from Supabase.
- `/chat/[slug]` now loads the character by slug from Supabase.
- `/api/chat` now uses the same Supabase-loaded character before building the AI prompt.
- The character import route now stores the new schema fields directly in columns and in `character_card`.
- A migration removes legacy Stripe mirror columns and adds character indexes.

## What did not change

- No CSS changes.
- No layout changes.
- No banner changes.
- No translation changes.
- No visual component styling changes.

## Image path requirement

A character with:

```json
"section": "EverBond Girls",
"image_file": "02f63d8323b681d10a8aad68859201d4.webp"
```

will load from:

```txt
public/character-assets/everbond-girls/02f63d8323b681d10a8aad68859201d4.webp
```

## Import payload shape

POST to `/api/characters/import` with:

```json
{ "characters": [ ...your character objects... ] }
```

If `CHARACTER_IMPORT_SECRET` is set, include header:

```txt
x-everbond-import-secret: <secret>
```
