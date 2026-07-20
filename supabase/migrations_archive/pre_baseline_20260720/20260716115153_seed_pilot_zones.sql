-- Seed the five Bengaluru pilot zones so collectors and tasks can reference them.
INSERT INTO zones (name, description, is_active)
VALUES
  ('North', 'North Bengaluru operational zone', true),
  ('South', 'South Bengaluru operational zone', true),
  ('East', 'East Bengaluru operational zone', true),
  ('West', 'West Bengaluru operational zone', true),
  ('Central', 'Central Bengaluru operational zone', true)
ON CONFLICT (name) DO NOTHING;
