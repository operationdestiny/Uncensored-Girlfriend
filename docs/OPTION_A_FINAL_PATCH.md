# EverBond Option A Final Consistency Patch

This patch finishes the pre-import database contract around audited text character IDs.

## What it changes

- `characters.id` is the audited text ID such as `everbond-girls-0017`.
- Character-dependent tables reference `character_id text`.
- The import script writes real schema fields directly and upserts on `id`.
- Images remain category-safe under `/character-assets/<category>/<image_file>`.
- Ever Memory, relationship state, favorites, reports, and image unlocks all reference the same text ID.
- RLS policies restrict user-owned data while allowing public character reads.

## Important

`0005_option_a_final_consistency.sql` is a destructive pre-production migration. It drops and rebuilds character-dependent scaffold tables. Run it only before production conversations, memories, favorites, reports, and unlocks exist.

## Apply

1. Extract this patch into the repository root and overwrite files.
2. Run migration `supabase/migrations/0005_option_a_final_consistency.sql` in Supabase.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Run:

```bash
npm run import:characters
node scripts/verify-option-a.mjs
npm run build
```

## Current repo note

The current GitHub `main` already loads 100 characters on both the homepage and `/characters`, and the chat API already reads `ever_memory` and `relationship_states`. This patch does not replace visual components or page layouts.
