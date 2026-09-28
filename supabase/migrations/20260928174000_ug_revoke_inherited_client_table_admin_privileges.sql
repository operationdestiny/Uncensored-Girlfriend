-- Client roles should never retain table-admin privileges inherited from
-- historical dumps. RLS controls rows; these privileges are a separate layer.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, references, trigger on table %I.%I from anon, authenticated',
      r.schemaname,
      r.tablename
    );
    begin
      execute format(
        'revoke maintain on table %I.%I from anon, authenticated',
        r.schemaname,
        r.tablename
      );
    exception when syntax_error_or_access_rule_violation then
      null;
    end;
  end loop;
end
$$;
