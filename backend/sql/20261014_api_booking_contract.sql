-- Panda Motors API booking contract upgrade
-- Safe, additive migration for the existing PostgreSQL test_drives table.
-- It does not delete records or reinterpret existing appointments.

ALTER TABLE test_drives ADD COLUMN IF NOT EXISTS preferred_time VARCHAR(5);
ALTER TABLE test_drives ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE test_drives ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE test_drives ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS test_drives_user_date_idx
  ON test_drives (user_id, preferred_date);

CREATE INDEX IF NOT EXISTS test_drives_car_date_idx
  ON test_drives (car_id, preferred_date);

CREATE UNIQUE INDEX IF NOT EXISTS test_drives_active_slot_unique
  ON test_drives (car_id, preferred_date, preferred_time)
  WHERE preferred_time IS NOT NULL AND status <> 'cancelled';
