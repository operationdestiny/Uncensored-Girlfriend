import { getSupabaseServiceClient } from "@/lib/supabase/server";

async function resolveAuthenticatedUser(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const { data, error } =
    await getSupabaseServiceClient().auth.getUser(token);

  if (error || !data.user) return null;
  return data.user;
}

/**
 * Returns both permanent and Supabase anonymous users.
 * Only guest-chat infrastructure should use this helper.
 */
export async function getAnyAuthenticatedUser(request: Request) {
  return resolveAuthenticatedUser(request);
}

/**
 * Existing EverBond paid/account APIs keep using this helper.
 * Anonymous chat users are deliberately treated as logged out so guest chat
 * cannot unlock EverCoin, gifts, media, voice, owner pages, or other account
 * features merely because Supabase issued them a temporary auth session.
 */
export async function getAuthenticatedUser(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return null;

  const anonymous = Boolean(
    (user as typeof user & { is_anonymous?: boolean }).is_anonymous
  );

  return anonymous ? null : user;
}
