-- Every operational organization starts with the same five geographic zones.
-- Keep the rows tenant-scoped: names are repeated per organization, never
-- shared between organizations.
INSERT INTO public.zones (organization_id, name)
SELECT organization.id, standard_zone.name
FROM public.organizations AS organization
CROSS JOIN (VALUES
  ('North'::text),
  ('South'::text),
  ('East'::text),
  ('West'::text),
  ('Central'::text)
) AS standard_zone(name)
ON CONFLICT (organization_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_standard_organization_zones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.zones (organization_id, name)
  VALUES
    (NEW.id, 'North'),
    (NEW.id, 'South'),
    (NEW.id, 'East'),
    (NEW.id, 'West'),
    (NEW.id, 'Central')
  ON CONFLICT (organization_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created_seed_zones ON public.organizations;
CREATE TRIGGER on_organization_created_seed_zones
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_standard_organization_zones();

REVOKE EXECUTE ON FUNCTION public.seed_standard_organization_zones() FROM PUBLIC, anon, authenticated;
