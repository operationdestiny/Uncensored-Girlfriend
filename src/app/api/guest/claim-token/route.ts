import { NextResponse } from "next/server";
import { getAnyAuthenticatedUser } from "@/lib/api-auth";
import { createGuestClaimToken } from "@/lib/guest-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAnyAuthenticatedUser(request);
  const anonymous = Boolean(
    user && (user as typeof user & { is_anonymous?: boolean }).is_anonymous
  );

  if (!user || !anonymous) {
    return NextResponse.json({ error: "GUEST_SESSION_REQUIRED" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      { claimToken: createGuestClaimToken(user.id) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Guest claim-token creation failed:", error);
    return NextResponse.json({ error: "GUEST_CLAIM_FAILED" }, { status: 500 });
  }
}
