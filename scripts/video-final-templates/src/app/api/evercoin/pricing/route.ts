import { NextResponse } from "next/server";
import {
  everCoinCallCostPerMinute,
  everCoinImageCost,
  everCoinPerDollar
} from "@/lib/evercoin";
import {
  VIDEO_DURATION_SECONDS,
  advertisedVideoEverCoinCost
} from "@/lib/video-pricing";

export async function GET() {
  const videoCost = advertisedVideoEverCoinCost();
  const videoPricingConfigured = Boolean(
    process.env.VENICE_API_KEY?.trim()
  );

  return NextResponse.json(
    {
      everCoinPerDollar: everCoinPerDollar(),
      callCostPerMinute: everCoinCallCostPerMinute(),
      imageCost: everCoinImageCost(),
      videoCost,
      videoDisplayCost: videoCost,
      videoDurationSeconds: VIDEO_DURATION_SECONDS,
      videoAudioEnabled: false,
      videoPricingConfigured
    },
    {
      headers: {
        "Cache-Control": "private, no-store"
      }
    }
  );
}
