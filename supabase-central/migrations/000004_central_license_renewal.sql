-- 000004: renewal keeps one live row per buyer-facing license id (lid). The renewal is kept as a history row
-- (`lid~stamp`, superseded_by = lid) and the live row gets the new paid window. Status/blocks stay on the live row.
create or replace function public.central_save_license(p_actor uuid, p_license jsonb, p_supersedes text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('central.actor', coalesce(p_actor::text, ''), true);
  if p_supersedes is not null and not exists (select 1 from central.licenses where id = p_supersedes and superseded_by is null) then
    raise exception 'unknown license';
  end if;
  insert into central.licenses(id, product_id, module_id, version_range, licensee_ref, licensee_name_enc, domains, mode, issued_at, expires_at, grace_days, issued_by, superseded_by)
  values (p_license->>'lid', p_license->>'productId', p_license->>'moduleId', p_license->>'versionRange', p_license->>'licenseeRef', p_license->>'licenseeNameEnc',
          coalesce(array(select jsonb_array_elements_text(p_license->'domains')), '{}'), p_license->>'mode', (p_license->>'issuedAt')::timestamptz,
          (p_license->>'expiresAt')::timestamptz, coalesce((p_license->>'graceDays')::int, 3), p_actor, p_supersedes);
  if p_supersedes is not null then
    update central.licenses set issued_at = (p_license->>'issuedAt')::timestamptz, expires_at = (p_license->>'expiresAt')::timestamptz
    where id = p_supersedes;
  end if;
end $$;
revoke all on function public.central_save_license(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.central_save_license(uuid,jsonb,text) to service_role;
