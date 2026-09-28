import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_URL = "https://api.wavespeed.ai/public/v3/summary.json";

type WaveSpeedStatus = {
  page?: {
    name?: unknown;
    url?: unknown;
    status?: unknown;
  };
  activeIncidents?: unknown[];
  activeMaintenances?: unknown[];
};

function normalizedStatus(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLocaleUpperCase()
    : "";
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(`${STATUS_URL}?eb=${Date.now().toString(36)}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      },
      signal: AbortSignal.timeout(4_000)
    });

    if (!response.ok) throw new Error(`STATUS_HTTP_${response.status}`);

    const payload = (await response.json()) as WaveSpeedStatus;
    const status = normalizedStatus(payload?.page?.status);
    const confirmedOutage = Boolean(status && status !== "UP");
    const activeIncident = Array.isArray(payload?.activeIncidents)
      ? payload.activeIncidents[0]
      : null;
    const incidentName =
      activeIncident &&
      typeof activeIncident === "object" &&
      typeof (activeIncident as Record<string, unknown>).name === "string"
        ? String((activeIncident as Record<string, unknown>).name).trim()
        : null;

    return NextResponse.json(
      {
        confirmedOutage,
        sourceAvailable: true,
        providerStatus: confirmedOutage ? "outage" : "not_confirmed",
        incidentName: confirmedOutage ? incidentName : null,
        checkedAt
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0"
        }
      }
    );
  } catch {
    // Fail open so a status-page problem never blocks EverBond chat/media.
    return NextResponse.json(
      {
        confirmedOutage: false,
        sourceAvailable: false,
        providerStatus: "not_confirmed",
        incidentName: null,
        checkedAt
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0"
        }
      }
    );
  }
}
