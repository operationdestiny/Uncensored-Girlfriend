-- OPTIONAL Tumblr auth-error recovery.
-- Run ONLY AFTER valid Tumblr OAuth credentials are restored in Vercel and
-- a redeploy has completed. Successful/queued rows are untouched.

begin;

update public.tumblr_publish_state
set attempts = 0,
    last_error = null,
    updated_at = now() - interval '7 hours'
where status = 'error'
  and coalesce(last_error, '') ~*
      '(401.*unauthorized|unauthorized.*401|invalid.*token|token.*invalid)';

commit;
