# V108 backend wiring checklist

This overlay is meant to be extracted into the real V107 source repo. It does not modify visuals, translations, CSS, images, banners, or layout.

## Apply order
1. Extract this ZIP into the V107 project root.
2. Run: `node scripts/apply-v108-cleanup.mjs`
3. Run: `npm install`
4. Run Supabase migration: `supabase/migrations/0002_stack_update_paddle_memory.sql`
5. Fill `.env.local` from `.env.example`.
6. Test `npm run build`.

## Important
- Stripe source files are removed by cleanup script.
- Earlier mistaken root-level `app/` and `lib/` overlay files are removed by cleanup script.
- Paddle webhook signature verification is marked TODO before production.
- AI/image/TTS/voice providers remain provider-neutral until chosen.
