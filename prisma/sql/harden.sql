-- Run after migrations:  npm run db:harden
-- Safe to run more than once.

-- 1. Audit log is append-only: block UPDATE and DELETE for everyone, including the app.
CREATE OR REPLACE FUNCTION audit_log_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON "AuditLog";
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

-- 2. Stock can never go negative, even if application code has a bug.
ALTER TABLE "ItemVariant" DROP CONSTRAINT IF EXISTS item_variant_stock_nonneg;
ALTER TABLE "ItemVariant" ADD CONSTRAINT item_variant_stock_nonneg CHECK ("onHand" >= 0 AND "reserved" >= 0);

-- 3. Fast case-insensitive search for pupils and parents.
CREATE INDEX IF NOT EXISTS pupil_last_name_lower_idx ON "Pupil" (lower("lastName"));
CREATE INDEX IF NOT EXISTS pupil_first_name_lower_idx ON "Pupil" (lower("firstName"));
CREATE INDEX IF NOT EXISTS user_last_name_lower_idx ON "User" (lower("lastName"));
