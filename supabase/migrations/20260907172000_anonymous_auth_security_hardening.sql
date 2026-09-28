-- EverBond anonymous-auth launch hardening.
-- Anonymous Supabase users use the `authenticated` Postgres role. These
-- SECURITY DEFINER functions are trigger/event-trigger functions and should
-- never be directly callable through the Data API. Revoking EXECUTE does not
-- disable the triggers that already reference them.

begin;

revoke execute on function public.enforce_character_gallery_limit()
  from PUBLIC, anon, authenticated;
revoke execute on function public.enforce_character_video_gallery_limit()
  from PUBLIC, anon, authenticated;
revoke execute on function public.enforce_private_user_characters()
  from PUBLIC, anon, authenticated;
revoke execute on function public.enforce_user_character_limit()
  from PUBLIC, anon, authenticated;
revoke execute on function public.preserve_or_assign_character_voice()
  from PUBLIC, anon, authenticated;
revoke execute on function public.rls_auto_enable()
  from PUBLIC, anon, authenticated;
revoke execute on function public.set_character_creator_username()
  from PUBLIC, anon, authenticated;
revoke execute on function public.sync_creator_username_after_profile_change()
  from PUBLIC, anon, authenticated;
revoke execute on function public.trim_ever_memory_to_50()
  from PUBLIC, anon, authenticated;

-- Re-assert that the new guest/ad infrastructure remains server-only.
revoke all on public.chat_human_verifications from PUBLIC, anon, authenticated;
revoke all on public.chat_abuse_events from PUBLIC, anon, authenticated;
revoke all on public.ad_free_sessions from PUBLIC, anon, authenticated;
revoke all on public.ad_free_billing_events from PUBLIC, anon, authenticated;

revoke all on function public.everbond_enable_ad_free(uuid, integer, integer)
  from PUBLIC, anon, authenticated;
revoke all on function public.everbond_disable_ad_free(uuid)
  from PUBLIC, anon, authenticated;
revoke all on function public.everbond_ad_free_heartbeat(uuid, boolean)
  from PUBLIC, anon, authenticated;
revoke all on function public.claim_guest_chat_data(uuid, uuid)
  from PUBLIC, anon, authenticated;

grant execute on function public.everbond_enable_ad_free(uuid, integer, integer)
  to service_role;
grant execute on function public.everbond_disable_ad_free(uuid)
  to service_role;
grant execute on function public.everbond_ad_free_heartbeat(uuid, boolean)
  to service_role;
grant execute on function public.claim_guest_chat_data(uuid, uuid)
  to service_role;

commit;
