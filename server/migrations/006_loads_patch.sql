-- Ensure loads table exists (minimal)
CREATE TABLE IF NOT EXISTS loads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL
);

-- Add any missing columns used by the API
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS label          TEXT,
  ADD COLUMN IF NOT EXISTS pickup_state   TEXT,
  ADD COLUMN IF NOT EXISTS drop_state     TEXT,
  ADD COLUMN IF NOT EXISTS origin         TEXT,
  ADD COLUMN IF NOT EXISTS destination    TEXT,
  ADD COLUMN IF NOT EXISTS pickup_date    DATE,
  ADD COLUMN IF NOT EXISTS delivery_date  DATE,
  ADD COLUMN IF NOT EXISTS miles          INTEGER,
  ADD COLUMN IF NOT EXISTS gross_pay      NUMERIC,
  ADD COLUMN IF NOT EXISTS status         TEXT,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Make sure id is actually the PK (in case table existed without it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'loads'::regclass
      AND contype  = 'p'
  ) THEN
    ALTER TABLE loads ADD CONSTRAINT loads_pkey PRIMARY KEY (id);
  END IF;
END$$;

-- Updated-at trigger to auto-touch updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loads_set_updated_at ON loads;
CREATE TRIGGER loads_set_updated_at
BEFORE UPDATE ON loads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
