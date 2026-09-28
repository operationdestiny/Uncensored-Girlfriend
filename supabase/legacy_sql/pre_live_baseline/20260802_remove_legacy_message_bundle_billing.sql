-- Final operational cleanup after EverCoin became the only paid currency.
--
-- Historical message purchase tables are intentionally retained so existing
-- accounting records are not destroyed. New bundle checkout is disabled in the
-- application, the Paddle webhook is EverCoin-only, and these old settlement
-- functions are no longer needed.

begin;

drop function if exists public.credit_message_purchase(
  uuid,
  text,
  text,
  text,
  bigint,
  bigint,
  text
);

drop function if exists public.reverse_message_purchase(
  text,
  text,
  text,
  text,
  bigint
);

notify pgrst, 'reload schema';

commit;
