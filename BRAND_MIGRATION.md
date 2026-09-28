# Uncensored Girlfriend migration notes

This is a full source snapshot of the original engine with a **first-pass** branded overlay, not a tested independent production deployment.

## Before launch
1. Replace all remaining EverBond text, imagery, icons, legal copy, support addresses, email templates, translations and hard-coded URLs flagged in `BRAND_AUDIT.txt`.
2. Keep internal SQL/RPC/route identifiers until deliberately migrated and tested; UI labels can say KissCoins while DB identifiers remain `evercoin`.
3. Set up separate Supabase project and storage, provider accounts, payment merchant, webhooks, domains, social accounts and keys. Disable scheduled payouts/publishers until configured.
4. Do not copy original user data or credentials; confirm rights to reuse artwork and character libraries.
5. Run `npm install`, `npm run build`, then test chat, billing, refunds, voice, media, account deletion, and affiliate payouts.
6. Replace placeholder legal name and publish accurate Terms, Privacy and adult age-gating before launch.
