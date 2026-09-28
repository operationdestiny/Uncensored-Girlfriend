import { getSupabaseServiceClient } from "@/lib/supabase/server";

function firstRow<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function purchaseEverShopGift(values: {
  userId: string;
  requestId: string;
  giftId: number;
  price: number;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "purchase_evershop_gift",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_gift_id: Math.trunc(values.giftId),
      p_price: Math.trunc(values.price)
    }
  );

  if (error) throw error;

  const row = firstRow(
    data as
      | {
          purchase_status: string;
          balance: number | string;
          debt: number | string;
          inventory_quantity: number | string;
          error_code: string | null;
        }
      | Array<{
          purchase_status: string;
          balance: number | string;
          debt: number | string;
          inventory_quantity: number | string;
          error_code: string | null;
        }>
      | null
  );

  return {
    status: row?.purchase_status ?? "failed",
    balance: Number(row?.balance ?? 0),
    debt: Number(row?.debt ?? 0),
    inventoryQuantity: Number(row?.inventory_quantity ?? 0),
    errorCode: row?.error_code ?? null
  };
}

export async function beginGiftSend(values: {
  userId: string;
  requestId: string;
  characterId: string;
  giftId: number;
  userText?: string | null;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "begin_gift_send",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_character_id: values.characterId,
      p_gift_id: Math.trunc(values.giftId),
      p_user_text: values.userText ?? null
    }
  );

  if (error) throw error;

  const row = firstRow(
    data as
      | {
          send_status: string;
          inventory_quantity: number | string;
          existing_reply: string | null;
          existing_conversation_id: string | null;
          error_code: string | null;
        }
      | Array<{
          send_status: string;
          inventory_quantity: number | string;
          existing_reply: string | null;
          existing_conversation_id: string | null;
          error_code: string | null;
        }>
      | null
  );

  return {
    status: row?.send_status ?? "failed",
    inventoryQuantity: Number(row?.inventory_quantity ?? 0),
    existingReply: row?.existing_reply ?? null,
    existingConversationId: row?.existing_conversation_id ?? null,
    errorCode: row?.error_code ?? null
  };
}

export async function completeGiftSend(values: {
  userId: string;
  requestId: string;
  conversationId: string;
  reply: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "complete_gift_send",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_conversation_id: values.conversationId,
      p_reply: values.reply
    }
  );

  if (error) throw error;
  return data === true;
}

export async function failGiftSend(values: {
  userId: string;
  requestId: string;
  errorCode: string;
}) {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "fail_gift_send",
    {
      p_user_id: values.userId,
      p_request_id: values.requestId,
      p_error_code: values.errorCode
    }
  );

  if (error) throw error;
  return data === true;
}
