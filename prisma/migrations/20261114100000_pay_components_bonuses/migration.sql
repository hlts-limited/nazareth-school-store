-- Salary split into components, penalty categories and bonuses (paid after tax).
ALTER TABLE "Employee" ADD COLUMN "salaryComponents" JSONB;
ALTER TABLE "PayrollAdjustment" ADD COLUMN "category" TEXT;
ALTER TABLE "PayrollItem" ADD COLUMN "bonusKobo" INTEGER NOT NULL DEFAULT 0;
