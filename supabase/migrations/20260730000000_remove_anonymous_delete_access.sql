-- The browser app creates, reads, and updates these rows, but never deletes
-- them. Event archival is an UPDATE to events.status, so revoking DELETE does
-- not change supported front-end behavior.
--
-- Keep service_role unchanged so trusted server-side maintenance and backups
-- can still remove rows when necessary.

revoke delete on table public.groups from anon, authenticated;
revoke delete on table public.rounds from anon, authenticated;
revoke delete on table public.events from anon, authenticated;
revoke delete on table public.courses_cache from anon, authenticated;
