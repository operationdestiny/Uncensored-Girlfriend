-- OPTIONAL DeviantArt auth-error recovery.
-- Run ONLY AFTER the official EverBond DeviantArt account has been re-authorized.
-- It preserves any tracked Sta.sh item id while making auth-failed rows retryable.

begin;

update public.deviantart_publish_state
set attempts = 0,
    last_error = null,
    updated_at = now() - interval '7 hours'
where status = 'error'
  and coalesce(last_error, '') ~*
      '(401|unauthorized|not authorized|oauth|access token|refresh token)';

commit;
