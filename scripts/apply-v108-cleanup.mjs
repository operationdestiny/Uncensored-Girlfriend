import { rmSync, existsSync } from 'node:fs';

const paths = [
  'src/app/api/stripe',
  'src/lib/billing/stripe.ts',
  // removes the earlier mistaken overlay if it was extracted
  'app/api/paddle',
  'app/api/auth',
  'app/api/chat',
  'app/api/characters',
  'app/api/images',
  'app/api/tts',
  'lib/ai',
  'lib/paddle.ts',
  'lib/resend.ts',
  'lib/supabase.ts',
  'lib/images.ts',
  'lib/memory.ts',
  'lib/voice'
];

for (const path of paths) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`removed ${path}`);
  }
}
