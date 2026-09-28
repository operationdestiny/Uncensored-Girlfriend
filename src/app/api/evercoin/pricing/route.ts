import { NextResponse } from "next/server";
import {
  everCoinCallCostPerMinute,
  everCoinImageCost,
  everCoinPerDollar,
  everCoinVideoCost
} from "@/lib/evercoin";

export async function GET() {
  const videoCost = everCoinVideoCost();

  return NextResponse.json(
    {
      everCoinPerDollar: everCoinPerDollar(),
      callCostPerMinute: everCoinCallCostPerMinute(),
      imageCost: everCoinImageCost(),
      videoCost,
      videoDurationSeconds: 8,
      videoAudioEnabled: false,
      videoPricingConfigured: videoCost > 0
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
      }
    }
  );
}
