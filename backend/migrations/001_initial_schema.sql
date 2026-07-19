-- Digital Twin Manufacturing Platform Schema
-- Based on SRS §11 Data Model
-- All tables include tenant_id for multi-tenancy

-- Organization (Tenant)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(50) DEFAULT 'free',
  ai_deployment_mode VARCHAR(20) DEFAULT 'cloud' CHECK (ai_deployment_mode IN ('cloud', 'local')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Factory
CREATE TABLE IF NOT EXISTS factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  floor_plan_ref VARCHAR(500),
  scale_unit VARCHAR(20) DEFAULT 'meters',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FactoryLayout
CREATE TABLE IF NOT EXISTS factory_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed')),
  created_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Machine
CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  manufacturer VARCHAR(255),
  glb_model_ref VARCHAR(500),
  footprint_length DECIMAL(10,3),
  footprint_width DECIMAL(10,3),
  footprint_height DECIMAL(10,3),
  power_draw_rating DECIMAL(10,2),
  install_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MachinePlacement
CREATE TABLE IF NOT EXISTS machine_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  layout_id UUID NOT NULL REFERENCES factory_layouts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  x DECIMAL(10,3) NOT NULL DEFAULT 0,
  y DECIMAL(10,3) NOT NULL DEFAULT 0,
  z DECIMAL(10,3) NOT NULL DEFAULT 0,
  rotation_x DECIMAL(10,3) DEFAULT 0,
  rotation_y DECIMAL(10,3) DEFAULT 0,
  rotation_z DECIMAL(10,3) DEFAULT 0,
  placement_confidence VARCHAR(20) DEFAULT 'inferred' CHECK (placement_confidence IN ('extracted', 'inferred', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SensorReading (time-series data, simulated in v1)
CREATE TABLE IF NOT EXISTS sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metric_type VARCHAR(50) NOT NULL,
  value DECIMAL(15,4) NOT NULL,
  source VARCHAR(20) DEFAULT 'simulated' CHECK (source IN ('simulated', 'real'))
);

-- Alert
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  calculated_value DECIMAL(15,4),
  threshold DECIMAL(15,4),
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  ai_explanation TEXT
);

-- MaintenanceEvent
CREATE TABLE IF NOT EXISTS maintenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('scheduled', 'predictive', 'reactive')),
  calculated_priority INT DEFAULT 5,
  scheduled_date DATE,
  completed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ProductionRecord
CREATE TABLE IF NOT EXISTS production_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  product_name VARCHAR(255) NOT NULL,
  process_sequence JSONB,
  cycle_time DECIMAL(10,2),
  throughput_target DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AIInteraction
CREATE TABLE IF NOT EXISTS ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  question TEXT NOT NULL,
  structured_data_sent JSONB,
  response_text TEXT,
  provider_used VARCHAR(100),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Dashboard
CREATE TABLE IF NOT EXISTS dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  layout_config JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- UploadedFiles (for tracking uploaded documents)
CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  file_type VARCHAR(50) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  extraction_status VARCHAR(20) DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_factories_tenant_id ON factories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_machines_factory_id ON machines(factory_id);
CREATE INDEX IF NOT EXISTS idx_machines_tenant_id ON machines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_machine_placements_layout_id ON machine_placements(layout_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_machine_id ON sensor_readings(machine_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings(timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_machine_id ON alerts(machine_id);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_id ON alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_factory_id ON uploaded_files(factory_id);
