import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "MESSAGE_BUNDLES_REMOVED",
      message: "Message bundles have been replaced by EverCoin.",
      redirect: "/coins"
    },
    { status: 410 }
  );
}
