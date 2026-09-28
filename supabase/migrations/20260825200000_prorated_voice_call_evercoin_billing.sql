create or replace function public.reconcile_voice_call_evercoin_proration(
  p_call_id uuid,
  p_duration_seconds numeric
)
returns table (
  applied boolean,
  reserved_evercoin bigint,
  target_evercoin bigint,
  adjustment_evercoin bigint,
  balance bigint,
  debt bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_reserved bigint := 0;
  v_rate bigint := 69;
  v_duration numeric := least(greatest(coalesce(p_duration_seconds, 0), 0), 1800);
  v_target bigint := 0;
  v_refunded bigint := 0;
  v_added bigint := 0;
  v_current_net bigint := 0;
  v_delta bigint := 0;
  v_balance bigint := 0;
  v_debt bigint := 0;
  v_to_debt bigint := 0;
  v_to_balance bigint := 0;
  v_shortfall bigint := 0;
begin
  if p_call_id is null then
    return query select false, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('voice-proration:' || p_call_id::text, 0)
  );

  select vc.user_id
  into v_user_id
  from public.voice_calls as vc
  where vc.id = p_call_id
  for update;

  if not found then
    return query select false, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  select
    coalesce(sum(m.evercoin_charge), 0)::bigint,
    coalesce(max(m.evercoin_charge), 69)::bigint
  into v_reserved, v_rate
  from public.voice_call_minutes as m
  where m.call_id = p_call_id
    and m.user_id = v_user_id;

  if v_reserved <= 0 or v_rate <= 0 then
    select coalesce(w.balance, 0), coalesce(w.debt, 0)
    into v_balance, v_debt
    from public.evercoin_wallets as w
    where w.user_id = v_user_id;

    return query
    select false, v_reserved, 0::bigint, 0::bigint,
      coalesce(v_balance, 0), coalesce(v_debt, 0);
    return;
  end if;

  if v_duration > 0 then
    v_target := ceil((v_rate::numeric * v_duration) / 60)::bigint;
  end if;

  -- EverCoin is integer-valued, so partial-EverCoin results round upward.
  -- This is based on authoritative final Retell duration, not whole minutes.
  v_target := greatest(v_target, 0);

  select
    coalesce(sum(
      case
        when t.reason = 'voice_call_prorated_refund' and t.amount > 0
          then t.amount
        else 0
      end
    ), 0)::bigint,
    coalesce(sum(
      case
        when t.reason = 'voice_call_prorated_adjustment' and t.amount < 0
          then -t.amount
        else 0
      end
    ), 0)::bigint
  into v_refunded, v_added
  from public.evercoin_transactions as t
  where t.user_id = v_user_id
    and t.reference_id = p_call_id::text
    and t.reason in (
      'voice_call_prorated_refund',
      'voice_call_prorated_adjustment'
    );

  v_current_net := greatest(v_reserved - v_refunded + v_added, 0);
  v_delta := v_target - v_current_net;

  insert into public.evercoin_wallets (user_id, balance, debt)
  values (v_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select w.balance, w.debt
  into v_balance, v_debt
  from public.evercoin_wallets as w
  where w.user_id = v_user_id
  for update;

  if v_delta < 0 then
    v_to_debt := least(v_debt, -v_delta);
    v_to_balance := (-v_delta) - v_to_debt;

    update public.evercoin_wallets as w
    set
      debt = w.debt - v_to_debt,
      balance = w.balance + v_to_balance,
      updated_at = clock_timestamp()
    where w.user_id = v_user_id
    returning w.balance, w.debt into v_balance, v_debt;

    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      v_user_id,
      -v_delta,
      'voice_call_prorated_refund',
      p_call_id::text
    );

    if v_to_debt > 0 then
      insert into public.evercoin_debt_events (
        user_id,
        amount,
        reason,
        reference_id
      )
      values (
        v_user_id,
        -v_to_debt,
        'voice_call_prorated_refund_debt_payment',
        p_call_id::text
      );
    end if;
  elsif v_delta > 0 then
    v_shortfall := greatest(v_delta - v_balance, 0);

    update public.evercoin_wallets as w
    set
      balance = greatest(w.balance - v_delta, 0),
      debt = w.debt + v_shortfall,
      updated_at = clock_timestamp()
    where w.user_id = v_user_id
    returning w.balance, w.debt into v_balance, v_debt;

    insert into public.evercoin_transactions (
      user_id,
      amount,
      reason,
      reference_id
    )
    values (
      v_user_id,
      -v_delta,
      'voice_call_prorated_adjustment',
      p_call_id::text
    );

    if v_shortfall > 0 then
      insert into public.evercoin_debt_events (
        user_id,
        amount,
        reason,
        reference_id
      )
      values (
        v_user_id,
        v_shortfall,
        'voice_call_proration_shortfall',
        p_call_id::text
      );
    end if;
  end if;

  return query
  select true, v_reserved, v_target, v_delta, v_balance, v_debt;
end;
$function$;

revoke all on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
from public;
revoke all on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
from anon;
revoke all on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
from authenticated;
grant execute on function public.reconcile_voice_call_evercoin_proration(uuid, numeric)
to service_role;

create or replace function public.trigger_voice_call_evercoin_proration()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform 1
  from public.reconcile_voice_call_evercoin_proration(
    new.billing_call_id,
    new.duration_seconds
  );
  return new;
end;
$function$;

revoke all on function public.trigger_voice_call_evercoin_proration()
from public;

drop trigger if exists voice_call_evercoin_proration_after_reconcile
on public.platform_voice_call_cost_reconciliations;

create trigger voice_call_evercoin_proration_after_reconcile
after insert or update of duration_seconds
on public.platform_voice_call_cost_reconciliations
for each row
execute function public.trigger_voice_call_evercoin_proration();
