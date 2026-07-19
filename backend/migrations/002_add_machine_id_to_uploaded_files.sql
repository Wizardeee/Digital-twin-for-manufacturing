-- Add machine_id to uploaded_files to link files to specific machines
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES machines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_uploaded_files_machine_id ON uploaded_files(machine_id);
