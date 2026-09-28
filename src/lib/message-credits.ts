import { getSupabaseServiceClient } from "@/lib/supabase/server";

function firstRow<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function reserveChatMessage(values: {
  userId: string;
  requestId: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "reserve_chat_message",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId
    }
  );

  if (error) throw error;

  const row = firstRow(data as {
    allowed: boolean;
    credit_source: string | null;
    trial_remaining: number;
    purchased_remaining: number | string;
    debt: number | string;
    already_reserved: boolean;
    error_code: string | null;
  } | Array<{
    allowed: boolean;
    credit_source: string | null;
    trial_remaining: number;
    purchased_remaining: number | string;
    debt: number | string;
    already_reserved: boolean;
    error_code: string | null;
  }> | null);

  const everCoinRemaining = Number(row?.purchased_remaining ?? 0);

  return {
    allowed: Boolean(row?.allowed),
    source: row?.credit_source ?? null,
    trialRemaining: Number(row?.trial_remaining ?? 0),
    everCoinRemaining,
    // Temporary compatibility alias for older server callers during deployment.
    purchasedRemaining: everCoinRemaining,
    debt: Number(row?.debt ?? 0),
    alreadyReserved: Boolean(row?.already_reserved),
    errorCode: row?.error_code ?? null
  };
}

export async function completeChatMessageCredit(values: {
  userId: string;
  requestId: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "complete_chat_message_credit",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId
    }
  );

  if (error) throw error;
  return data === true;
}

export async function refundChatMessageCredit(values: {
  userId: string;
  requestId: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "refund_chat_message_credit",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId
    }
  );

  if (error) throw error;
  return data === true;
}
