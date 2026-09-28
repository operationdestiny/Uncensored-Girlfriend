import { getSupabaseServiceClient } from "@/lib/supabase/server";

type ChatCostValues = {
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

async function reconcile(values: {
  requestId: string;
  visible?: Omit<ChatCostValues, "requestId">;
  memory?: Omit<ChatCostValues, "requestId">;
}) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("platform_reconcile_chat_cost", {
    p_request_id: values.requestId,
    p_visible_input_tokens: values.visible?.inputTokens ?? null,
    p_visible_output_tokens: values.visible?.outputTokens ?? null,
    p_visible_model: values.visible?.model ?? null,
    p_memory_input_tokens: values.memory?.inputTokens ?? null,
    p_memory_output_tokens: values.memory?.outputTokens ?? null,
    p_memory_model: values.memory?.model ?? null
  });

  if (error) throw error;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const result = data as { ok?: unknown; error?: unknown };
    if (result.ok === false) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "CHAT_FINANCE_RECONCILIATION_FAILED"
      );
    }
  }
}

export async function reconcileVisibleChatFinance(values: ChatCostValues) {
  await reconcile({
    requestId: values.requestId,
    visible: {
      inputTokens: Math.max(Math.trunc(values.inputTokens), 0),
      outputTokens: Math.max(Math.trunc(values.outputTokens), 0),
      model: values.model
    }
  });
}

export async function reconcileMemoryChatFinance(values: ChatCostValues) {
  await reconcile({
    requestId: values.requestId,
    memory: {
      inputTokens: Math.max(Math.trunc(values.inputTokens), 0),
      outputTokens: Math.max(Math.trunc(values.outputTokens), 0),
      model: values.model
    }
  });
}
