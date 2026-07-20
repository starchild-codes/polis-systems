-- Collector records are tenant-scoped. A phone number may legitimately be
-- registered by different organizations, while remaining unique within each
-- organization.
ALTER TABLE public.collectors
  DROP CONSTRAINT IF EXISTS collectors_phone_e164_key;

ALTER TABLE public.collectors
  DROP CONSTRAINT IF EXISTS collectors_organization_phone_e164_key;

ALTER TABLE public.collectors
  ADD CONSTRAINT collectors_organization_phone_e164_key
  UNIQUE (organization_id, phone_e164);
