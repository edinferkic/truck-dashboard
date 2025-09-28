-- Idempotent base schema for Trucking Load & Expense Dashboard

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email

-- Migrations bookkeeping
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loads (shipments)
-- net_profit = gross_pay − (broker_fee + fuel_cost + tolls + maintenance_cost + other_costs)
CREATE TABLE IF NOT EXISTS loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  delivery_date DATE NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  miles INTEGER NOT NULL CHECK (miles >= 0),
  gross_pay NUMERIC(12,2) NOT NULL CHECK (gross_pay >= 0),
  broker_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (broker_fee >= 0),
  fuel_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fuel_cost >= 0),
  tolls NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tolls >= 0),
  maintenance_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (maintenance_cost >= 0),
  other_costs NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_costs >= 0),
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('planned','in_transit','completed','canceled')),
  net_profit NUMERIC(12,2) GENERATED ALWAYS AS (
    gross_pay - (broker_fee + fuel_cost + tolls + maintenance_cost + other_costs)
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loads_set_updated_at ON loads;
CREATE TRIGGER loads_set_updated_at
BEFORE UPDATE ON loads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Standalone expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_loads_user_dates ON loads (user_id, pickup_date, delivery_date);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads (status);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, expense_date);

-- Mark migration as applied (no-op if already there)
INSERT INTO migrations (name) VALUES ('001_init')
ON CONFLICT (name) DO NOTHING;
