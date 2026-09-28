-- Keep the gift-chat reservation trigger internal to trusted backend execution.
REVOKE ALL ON FUNCTION public.platform_account_gift_chat_reservation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_account_gift_chat_reservation() FROM anon;
REVOKE ALL ON FUNCTION public.platform_account_gift_chat_reservation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_account_gift_chat_reservation() TO service_role;

-- Fail closed for owner withdrawal safety: completed gift reactions must have
-- a provider-cost row AND both visible + memory token costs reconciled.
CREATE OR REPLACE FUNCTION public.platform_finance_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_base jsonb;
  v_enforce timestamptz;
  v_missing bigint := 0;
  v_unreconciled bigint := 0;
  v_blocking bigint := 0;
BEGIN
  v_base := public.platform_finance_health_base();
  v_enforce := coalesce(
    (v_base->>'enforceFrom')::timestamptz,
    '2026-08-24 02:07:00+00'::timestamptz
  );

  SELECT count(*)::bigint
  INTO v_missing
  FROM public.gift_send_requests g
  LEFT JOIN public.platform_provider_cost_events e
    ON e.event_key = 'gift-chat:' || g.request_id::text
  WHERE g.status = 'completed'
    AND coalesce(g.completed_at, g.updated_at, g.created_at) >= v_enforce
    AND e.id IS NULL;

  SELECT count(*)::bigint
  INTO v_unreconciled
  FROM public.gift_send_requests g
  JOIN public.platform_provider_cost_events e
    ON e.event_key = 'gift-chat:' || g.request_id::text
  WHERE g.status = 'completed'
    AND coalesce(g.completed_at, g.updated_at, g.created_at) >= v_enforce
    AND coalesce(e.metadata->>'accounting_state', '') <> 'actual_token_cost_reconciled';

  v_blocking := coalesce((v_base->>'blockingIssues')::bigint, 0)
    + v_missing
    + v_unreconciled;

  RETURN v_base || jsonb_build_object(
    'healthy',
      coalesce((v_base->>'healthy')::boolean, false)
      AND v_missing = 0
      AND v_unreconciled = 0,
    'blockingIssues', v_blocking,
    'giftChatsMissingProviderCost', v_missing,
    'giftChatsAwaitingCostReconciliation', v_unreconciled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_finance_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_finance_health() FROM anon;
REVOKE ALL ON FUNCTION public.platform_finance_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_finance_health() TO service_role;
