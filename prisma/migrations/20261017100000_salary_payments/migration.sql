-- CreateEnum
CREATE TYPE "SalaryPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "status" "SalaryPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "live" BOOLEAN NOT NULL,
    "transferCode" TEXT,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaryPayment_reference_key" ON "SalaryPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryPayment_itemId_attempt_key" ON "SalaryPayment"("itemId", "attempt");

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PayrollItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only one live payment (waiting or succeeded) per payslip: a double click, or two people pressing Pay, can't pay anyone twice.
CREATE UNIQUE INDEX "SalaryPayment_one_live_per_item" ON "SalaryPayment"("itemId") WHERE "status" IN ('PENDING', 'SUCCESS');
