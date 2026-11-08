-- access_audit_findings.signals stays text[]. Elements may be legacy enum codes or enc:v2.
-- No column type change (preserves array + UI join after decrypt). No GRANT/RLS change.
-- App writer: audit-job sealFindingSignals. Enforcement stays off.
-- Placeholder comment migration so ops can track the registry join; no ALTER required for text[].
select 1;
