import { getSupabaseServiceClient } from "@/lib/supabase/server";

function firstRow<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function integerEnv(name: string, fallback: number, maximum = 1_000_000) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 0), maximum);
}

export function everCoinPerDollar() {
  return Math.max(integerEnv("EVERCOIN_PER_DOLLAR", 100, 100_000), 1);
}

export function everCoinCallCostPerMinute() {
  return Math.max(
    integerEnv("EVERCOIN_CALL_COST_PER_MINUTE", 35, 100_000),
    35
  );
}

export const EVERCOIN_IMAGE_COST = 25;
export const EVERCOIN_VIDEO_COST = 40;

export function everCoinImageCost() {
  return EVERCOIN_IMAGE_COST;
}

export function everCoinVideoCost() {
  return EVERCOIN_VIDEO_COST;
}

export async function getEverCoinBalance(userId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("evercoin_wallets")
    .select("balance,debt")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return {
    balance: Number(data?.balance ?? 0),
    debt: Number(data?.debt ?? 0)
  };
}

export async function chargeEverCoin(values: {
  userId: string;
  amount: number;
  reason: string;
  referenceId?: string | null;
}) {
  const amount = Math.max(Math.trunc(values.amount), 0);
  const { data, error } = await getSupabaseServiceClient().rpc(
    "charge_evercoin",
    {
      p_user_id: values.userId,
      p_amount: amount,
      p_reason: values.reason,
      p_reference_id: values.referenceId ?? null
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    charged: boolean;
    balance: number | string;
  } | Array<{
    charged: boolean;
    balance: number | string;
  }> | null);

  return {
    charged: Boolean(row?.charged),
    balance: Number(row?.balance ?? 0)
  };
}

export async function refundEverCoin(values: {
  userId: string;
  amount: number;
  reason: string;
  referenceId?: string | null;
}) {
  const amount = Math.max(Math.trunc(values.amount), 0);
  const { data, error } = await getSupabaseServiceClient().rpc(
    "refund_evercoin",
    {
      p_user_id: values.userId,
      p_amount: amount,
      p_reason: values.reason,
      p_reference_id: values.referenceId ?? null
    }
  );

  if (error) throw error;
  return Number(data ?? 0);
}

export async function startVoiceCall(values: {
  userId: string;
  characterId: string;
  amount: number;
  maxMinutes: number;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "start_voice_call",
    {
      p_user_id: values.userId,
      p_character_id: values.characterId,
      p_amount: Math.max(Math.trunc(values.amount), 0),
      p_max_minutes: Math.max(Math.trunc(values.maxMinutes), 1)
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    started: boolean;
    call_id: string | null;
    balance: number | string;
    debt: number | string;
    started_at: string | null;
    paid_through: string | null;
    max_ends_at: string | null;
    error_code: string | null;
  } | Array<{
    started: boolean;
    call_id: string | null;
    balance: number | string;
    debt: number | string;
    started_at: string | null;
    paid_through: string | null;
    max_ends_at: string | null;
    error_code: string | null;
  }> | null);

  return {
    started: Boolean(row?.started),
    callId: row?.call_id ?? null,
    balance: Number(row?.balance ?? 0),
    debt: Number(row?.debt ?? 0),
    startedAt: row?.started_at ?? null,
    paidThrough: row?.paid_through ?? null,
    maxEndsAt: row?.max_ends_at ?? null,
    errorCode: row?.error_code ?? null
  };
}

export async function prepareVoiceCallTurn(values: {
  userId: string;
  callId: string;
  characterId: string;
  amount: number;
  maxMinutes: number;
  idleTimeoutSeconds: number;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "prepare_voice_call_turn",
    {
      p_user_id: values.userId,
      p_call_id: values.callId,
      p_character_id: values.characterId,
      p_amount: Math.max(Math.trunc(values.amount), 0),
      p_max_minutes: Math.max(Math.trunc(values.maxMinutes), 1),
      p_idle_timeout_seconds: Math.max(
        Math.trunc(values.idleTimeoutSeconds),
        30
      )
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    allowed: boolean;
    balance: number | string;
    debt: number | string;
    current_minute: number;
    newly_charged: number | string;
    started_at: string | null;
    max_ends_at: string | null;
    error_code: string | null;
  } | Array<{
    allowed: boolean;
    balance: number | string;
    debt: number | string;
    current_minute: number;
    newly_charged: number | string;
    started_at: string | null;
    max_ends_at: string | null;
    error_code: string | null;
  }> | null);

  return {
    allowed: Boolean(row?.allowed),
    balance: Number(row?.balance ?? 0),
    debt: Number(row?.debt ?? 0),
    currentMinute: Number(row?.current_minute ?? 0),
    newlyCharged: Number(row?.newly_charged ?? 0),
    startedAt: row?.started_at ?? null,
    maxEndsAt: row?.max_ends_at ?? null,
    errorCode: row?.error_code ?? null
  };
}

export async function claimVoiceCallTurn(values: {
  userId: string;
  callId: string;
  characterId: string;
  requestId: string;
  maxTurnsPerMinute: number;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "claim_voice_call_turn",
    {
      p_user_id: values.userId,
      p_call_id: values.callId,
      p_character_id: values.characterId,
      p_request_id: values.requestId,
      p_max_turns_per_minute: Math.max(
        Math.trunc(values.maxTurnsPerMinute),
        1
      )
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    claim_status: string;
    existing_transcript: string | null;
    existing_reply: string | null;
    existing_audio_path: string | null;
    existing_conversation_id: string | null;
    existing_input_tokens: number;
    existing_output_tokens: number;
    retry_after_seconds: number;
  } | Array<{
    claim_status: string;
    existing_transcript: string | null;
    existing_reply: string | null;
    existing_audio_path: string | null;
    existing_conversation_id: string | null;
    existing_input_tokens: number;
    existing_output_tokens: number;
    retry_after_seconds: number;
  }> | null);

  return {
    status: row?.claim_status ?? "failed",
    transcript: row?.existing_transcript ?? null,
    reply: row?.existing_reply ?? null,
    audioPath: row?.existing_audio_path ?? null,
    conversationId: row?.existing_conversation_id ?? null,
    inputTokens: Number(row?.existing_input_tokens ?? 0),
    outputTokens: Number(row?.existing_output_tokens ?? 0),
    retryAfterSeconds: Number(row?.retry_after_seconds ?? 0)
  };
}

export async function completeVoiceCallTurn(values: {
  userId: string;
  callId: string;
  requestId: string;
  conversationId: string;
  transcript: string;
  reply: string;
  audioPath: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "complete_voice_call_turn",
    {
      p_user_id: values.userId,
      p_call_id: values.callId,
      p_request_id: values.requestId,
      p_conversation_id: values.conversationId,
      p_transcript: values.transcript,
      p_reply: values.reply,
      p_audio_storage_path: values.audioPath,
      p_input_tokens: Math.max(Math.trunc(values.inputTokens), 0),
      p_output_tokens: Math.max(Math.trunc(values.outputTokens), 0)
    }
  );

  if (error) throw error;
  return data === true;
}

export async function failVoiceCallTurn(values: {
  userId: string;
  callId: string;
  requestId: string;
  errorCode: string;
}) {
  const { error } = await getSupabaseServiceClient().rpc(
    "fail_voice_call_turn",
    {
      p_user_id: values.userId,
      p_call_id: values.callId,
      p_request_id: values.requestId,
      p_error_code: values.errorCode
    }
  );

  if (error) throw error;
}

export async function endVoiceCall(values: {
  userId: string;
  callId: string;
  reason?: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "end_voice_call",
    {
      p_user_id: values.userId,
      p_call_id: values.callId,
      p_reason: values.reason ?? "user_hangup"
    }
  );

  if (error) throw error;
  return data === true;
}

export async function startCharacterImageRequest(values: {
  userId: string;
  requestId: string;
  characterId: string;
  prompt: string;
  amount: number;
  galleryLimit: number;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "start_character_image_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_character_id: values.characterId,
      p_prompt: values.prompt,
      p_amount: Math.max(Math.trunc(values.amount), 0),
      p_gallery_limit: Math.max(Math.trunc(values.galleryLimit), 1)
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    request_status: string;
    balance: number | string;
    debt: number | string;
    image_id: string | null;
    error_code: string | null;
  } | Array<{
    request_status: string;
    balance: number | string;
    debt: number | string;
    image_id: string | null;
    error_code: string | null;
  }> | null);

  return {
    status: row?.request_status ?? "failed",
    balance: Number(row?.balance ?? 0),
    debt: Number(row?.debt ?? 0),
    imageId: row?.image_id ?? null,
    errorCode: row?.error_code ?? null
  };
}

export async function completeCharacterImageRequest(values: {
  userId: string;
  requestId: string;
  imageId: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "complete_character_image_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_image_id: values.imageId
    }
  );

  if (error) throw error;
  return data === true;
}

export async function failCharacterImageRequest(values: {
  userId: string;
  requestId: string;
  errorCode: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "fail_character_image_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_error_code: values.errorCode
    }
  );

  if (error) throw error;
  return Number(data ?? 0);
}


export async function startCharacterVideoRequest(values: {
  userId: string;
  requestId: string;
  characterId: string;
  prompt: string;
  durationSeconds: number;
  amount: number;
  galleryLimit: number;
  providerModel: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "start_character_video_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_character_id: values.characterId,
      p_prompt: values.prompt,
      p_duration_seconds: Math.max(Math.trunc(values.durationSeconds), 1),
      p_amount: Math.max(Math.trunc(values.amount), 0),
      p_gallery_limit: Math.max(Math.trunc(values.galleryLimit), 1),
      p_provider_model: values.providerModel
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    request_status: string;
    balance: number | string;
    debt: number | string;
    video_id: string | null;
    provider_queue_id: string | null;
    error_code: string | null;
  } | Array<{
    request_status: string;
    balance: number | string;
    debt: number | string;
    video_id: string | null;
    provider_queue_id: string | null;
    error_code: string | null;
  }> | null);

  return {
    status: row?.request_status ?? "failed",
    balance: Number(row?.balance ?? 0),
    debt: Number(row?.debt ?? 0),
    videoId: row?.video_id ?? null,
    providerQueueId: row?.provider_queue_id ?? null,
    errorCode: row?.error_code ?? null
  };
}

export async function setCharacterVideoQueue(values: {
  userId: string;
  requestId: string;
  providerModel: string;
  providerQueueId: string;
  providerDownloadUrl?: string | null;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "set_character_video_queue",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_provider_model: values.providerModel,
      p_provider_queue_id: values.providerQueueId,
      p_provider_download_url: values.providerDownloadUrl ?? null
    }
  );

  if (error) throw error;
  return data === true;
}

export async function completeCharacterVideoRequest(values: {
  userId: string;
  requestId: string;
  videoId: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "complete_character_video_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_video_id: values.videoId
    }
  );

  if (error) throw error;
  return data === true;
}

export async function failCharacterVideoRequest(values: {
  userId: string;
  requestId: string;
  errorCode: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "fail_character_video_request",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_error_code: values.errorCode
    }
  );

  if (error) throw error;
  return Number(data ?? 0);
}
