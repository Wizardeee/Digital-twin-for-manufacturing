-- Add floors table and floor_level columns for multi-floor support

-- Create floors table
CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  floor_number INTEGER NOT NULL,
  name VARCHAR(255),
  floor_plan_ref VARCHAR(500),
  width_meters NUMERIC(10,2) DEFAULT 20,
  depth_meters NUMERIC(10,2) DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(factory_id, floor_number)
);

CREATE INDEX IF NOT EXISTS idx_floors_factory_id ON floors(factory_id);
CREATE INDEX IF NOT EXISTS idx_floors_tenant_id ON floors(tenant_id);

-- Add floor_level to machines (which floor the machine is on)
ALTER TABLE machines ADD COLUMN IF NOT EXISTS floor_level INTEGER DEFAULT 1;

-- Add floor_level to machine_placements
ALTER TABLE machine_placements ADD COLUMN IF NOT EXISTS floor_level INTEGER DEFAULT 1;

-- Migrate existing floor_plan_ref from factories to floors table (floor 1)
DO $$
DECLARE
  factory_rec RECORD;
BEGIN
  FOR factory_rec IN SELECT id, tenant_id, floor_plan_ref FROM factories WHERE floor_plan_ref IS NOT NULL
  LOOP
    INSERT INTO floors (factory_id, tenant_id, floor_number, name, floor_plan_ref)
    VALUES (factory_rec.id, factory_rec.tenant_id, 1, 'Ground Floor', factory_rec.floor_plan_ref)
    ON CONFLICT (factory_id, floor_number) DO UPDATE SET floor_plan_ref = EXCLUDED.floor_plan_ref;
  END LOOP;
END $$;

-- Create floor 1 for factories that don't have one yet
DO $$
DECLARE
  factory_rec RECORD;
BEGIN
  FOR factory_rec IN SELECT id, tenant_id FROM factories
  LOOP
    INSERT INTO floors (factory_id, tenant_id, floor_number, name)
    VALUES (factory_rec.id, factory_rec.tenant_id, 1, 'Ground Floor')
    ON CONFLICT (factory_id, floor_number) DO NOTHING;
  END LOOP;
END $$;
