import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { integerEnv } from "@/lib/evercoin";

export const VOICE_CALL_AUDIO_BUCKET = "voice-call-audio";

export function voiceCallLimits() {
  return {
    maxMinutes: Math.max(
      1,
      Math.min(integerEnv("VOICE_CALL_MAX_MINUTES", 60, 60), 60)
    ),
    idleTimeoutSeconds: Math.max(
      30,
      Math.min(integerEnv("VOICE_CALL_IDLE_TIMEOUT_SECONDS", 90, 90), 90)
    ),
    maxAudioSeconds: Math.max(
      5,
      Math.min(integerEnv("VOICE_TURN_MAX_AUDIO_SECONDS", 30, 30), 30)
    ),
    maxTurnsPerMinute: Math.max(
      1,
      Math.min(integerEnv("VOICE_TURN_MAX_PER_MINUTE", 4, 4), 4)
    ),
    maxReplyCharacters: Math.max(
      120,
      Math.min(integerEnv("VOICE_REPLY_MAX_CHARACTERS", 600, 600), 600)
    ),
    maxTtsCharactersPerMinute: Math.max(
      300,
      Math.min(
        integerEnv("VOICE_TTS_MAX_CHARACTERS_PER_MINUTE", 900, 900),
        900
      )
    )
  };
}

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  audioFormat: number;
  dataBytes: number;
  durationSeconds: number;
};

function ascii(buffer: Buffer, offset: number, length: number) {
  return buffer.subarray(offset, offset + length).toString("ascii");
}

export function inspectPcmWav(buffer: Buffer): WavInfo {
  if (
    buffer.length < 44 ||
    ascii(buffer, 0, 4) !== "RIFF" ||
    ascii(buffer, 8, 4) !== "WAVE"
  ) {
    throw new Error("INVALID_AUDIO_FORMAT");
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = ascii(buffer, offset, 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkStart + chunkSize > buffer.length) {
      throw new Error("INVALID_AUDIO_FORMAT");
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) throw new Error("INVALID_AUDIO_FORMAT");
      audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      dataBytes = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (
    audioFormat !== 1 ||
    channels !== 1 ||
    bitsPerSample !== 16 ||
    sampleRate < 8_000 ||
    sampleRate > 48_000 ||
    dataBytes < 2
  ) {
    throw new Error("INVALID_AUDIO_FORMAT");
  }

  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  const durationSeconds = dataBytes / bytesPerSecond;

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("INVALID_AUDIO_FORMAT");
  }

  return {
    sampleRate,
    channels,
    bitsPerSample,
    audioFormat,
    dataBytes,
    durationSeconds
  };
}

export function limitVoiceReply(text: string, maximumCharacters: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (Array.from(normalized).length <= maximumCharacters) return normalized;

  const clipped = Array.from(normalized).slice(0, maximumCharacters).join("");
  const sentenceMatches = [...clipped.matchAll(/[.!?。！？]["')\]”’」』）]*/g)];
  const last = sentenceMatches[sentenceMatches.length - 1];

  if (
    last?.index !== undefined &&
    last.index >= Math.floor(maximumCharacters * 0.45)
  ) {
    return clipped.slice(0, last.index + last[0].length).trim();
  }

  const cleaned = clipped.replace(/[—–,;:\s.]+$/, "").trim();
  return Array.from(cleaned).length < maximumCharacters
    ? `${cleaned}.`
    : cleaned;
}

export async function voiceMinuteTtsBudget(values: {
  userId: string;
  callId: string;
  startedAt: string;
  currentMinute: number;
  maximumCharacters: number;
}) {
  const callStart = new Date(values.startedAt).getTime();
  if (!Number.isFinite(callStart)) throw new Error("INVALID_CALL_START_TIME");

  const minute = Math.max(Math.trunc(values.currentMinute), 1);
  const minuteStart = new Date(callStart + (minute - 1) * 60_000);
  const minuteEnd = new Date(callStart + minute * 60_000);
  const { data, error } = await getSupabaseServiceClient()
    .from("voice_call_turns")
    .select("reply")
    .eq("user_id", values.userId)
    .eq("call_id", values.callId)
    .eq("status", "completed")
    .gte("created_at", minuteStart.toISOString())
    .lt("created_at", minuteEnd.toISOString());

  if (error) throw error;

  const used = (data ?? []).reduce((total, row) => {
    const reply = typeof row.reply === "string" ? row.reply : "";
    return total + Array.from(reply).length;
  }, 0);
  const maximum = Math.max(Math.trunc(values.maximumCharacters), 1);

  return {
    used,
    remaining: Math.max(maximum - used, 0),
    retryAfterSeconds: Math.max(
      Math.ceil((minuteEnd.getTime() - Date.now()) / 1000),
      1
    )
  };
}

export async function createVoiceAudioSignedUrl(path: string) {
  const { data, error } = await getSupabaseServiceClient()
    .storage.from(VOICE_CALL_AUDIO_BUCKET)
    .createSignedUrl(path, 15 * 60);

  if (error) throw error;
  return data.signedUrl;
}

export async function removeCallAudio(userId: string, callId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("voice_call_turns")
    .select("audio_storage_path")
    .eq("user_id", userId)
    .eq("call_id", callId)
    .not("audio_storage_path", "is", null);

  if (error) throw error;

  const paths = (data ?? [])
    .map((row) => row.audio_storage_path as string | null)
    .filter((value): value is string => Boolean(value));

  if (paths.length) {
    const { error: removeError } = await supabase.storage
      .from(VOICE_CALL_AUDIO_BUCKET)
      .remove(paths);

    if (removeError) throw removeError;

    const { error: clearError } = await supabase
      .from("voice_call_turns")
      .update({ audio_storage_path: null })
      .eq("user_id", userId)
      .eq("call_id", callId)
      .in("audio_storage_path", paths);

    if (clearError) throw clearError;
  }
}

export async function removeEndedCallAudio(userId: string, limit = 12) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("voice_calls")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "ended")
    .order("ended_at", { ascending: false })
    .limit(Math.max(1, Math.min(Math.trunc(limit), 50)));

  if (error) throw error;

  for (const row of data ?? []) {
    await removeCallAudio(userId, String(row.id));
  }
}
