-- Annual rent is kept in whole naira (an Int), so backups (JSON) can carry it.
ALTER TABLE "Employee" ADD COLUMN "annualRentNaira" INTEGER NOT NULL DEFAULT 0;
UPDATE "Employee" SET "annualRentNaira" = ("annualRentKobo" / 100)::INTEGER;
ALTER TABLE "Employee" DROP COLUMN "annualRentKobo";
