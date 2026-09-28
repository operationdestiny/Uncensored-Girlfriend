# V12 Sanity Check

Total companions: 2004
Unique companion names: 2004
Missing route files: []
Visible terminology issues found: [('src/components/character/CharacterSearchGrid.tsx', 'No characters found'), ('src/components/character/CharacterSearchGrid.tsx', 'Search characters')]

Core checks:
- `/characters` exists.
- `/companions` redirects to `/characters`.
- Companion cards link directly to `/chat/[slug]`.
- `/character/[slug]` redirects to `/chat/[slug]`.
- Chat sidebar includes profile metadata.
- Official companions hide views and creator label.
- Public Creations show views, creator, save, share, and report.
- Portrait modal supports X, Escape, and click-outside close.
