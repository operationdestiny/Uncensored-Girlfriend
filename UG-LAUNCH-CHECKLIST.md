# Uncensored Girlfriend — independent repository checklist

## Current implementation
- Full React/Next.js visual redesign (header, Home, Explore, chat styling, Create, Gift Shop, KissCoins) from the uploaded frontend export.
- Secondary public copy, multilingual labels, email-change template, SEO guide text, install prompts and public URLs updated in this finishing patch.
- Existing API/RPC names (`evercoin`, `evershop`, `everbond-girls`) remain for compatibility until a separate DB migration is performed. These names are not proof of a shared database.
- Original legacy comparison routes are 404, old comparison data is retired; the old `why-everbond` path redirects to `/why-choose-us`.
- Old company's policy text is NOT adopted: `/legal` deliberately remains a development-only noindex placeholder.

## Mandatory before accepting users or payments
1. Create NEW, independent GitHub and Vercel projects. The installer refuses to operate on a project already linked to the old repos or Vercel.
2. Create a NEW Supabase project. Review ALL migrations in the original full project (not included in the frontend export) before applying; migrate only schema and reusable licensed content, not production users, purchase records, chats, storage buckets or secrets.
3. Seed the new instance with reusable character assets/data only when you're entitled to reuse them. Current DB categories retain old technical IDs for compatibility.
4. Provision NEW provider accounts/keys and webhook endpoints. RESEND_FROM_EMAIL must be a verified NEW sender. Update provider callback URLs to uncensoredgirlfriend.chat.
5. Audit the **full** local project for hard-coded old domains and external integration keys; this patch only contains source from the frontend export and the previous redesign. The original `public/` assets, scripts and database migrations were not uploaded.
6. Publish accurate NEW Terms, Privacy, adult access, refund and content policies after review. The dev placeholder is not sufficient for a live service.
7. Audit public/ for old EverBond banners/logos and remove or replace *references* carefully. Avoid deleting character images referenced by the app. The redesign uses its own hero/icon assets.
8. Test: signup/login, reset email, chat, memory, free quota, KissCoins checkout, gift purchase, media, voice, affiliates, payouts and deleting accounts against NEW accounts and sandbox providers.
9. Run npm audit --omit=dev; resolve reported vulnerabilities without a blind `npm audit fix --force`.
10. Only then set LAUNCH_INDEXING_ENABLED=true and configure production domain/DNS.

## Safety
- Applying the patch never pushes to GitHub, deploys to Vercel or contacts any external provider.
- Prebuild no longer triggers character-data mutations; import/cleanup scripts may still exist and must only run manually against the NEW project.
- Cron schedules are removed from vercel.json. Endpoint routes still exist but cannot run on a schedule without new configuration; never add inherited old secrets.
