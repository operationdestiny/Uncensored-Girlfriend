# EverBond Option A pre-import patch

This patch changes the character primary key to the audited text ID (`everbond-girls-0001`) and must be applied **before the production character import**.

1. Extract into the project root and allow overwrite.
2. Add Supabase environment variables.
3. Run migrations through `0005_option_a_preimport_runtime.sql`.
4. Run `npm install`.
5. Run `npm run import:characters`.
6. Run `npm run build`.

The migration resets character-dependent scaffold tables. Do not run it after real production chats/memories exist without a data migration.

Runtime changes:
- Home and Explore load 100 characters initially.
- Search, tag filters, category switches, and More use `/api/characters`.
- Character and chat pages still fetch one record by slug.
- Chat loads authenticated user memory and stores messages when a Supabase bearer token is supplied.
- Paddle webhooks now verify signatures and use `paddle_events` for idempotency.
