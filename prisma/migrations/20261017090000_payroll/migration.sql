-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'STATUTORY_REVIEWED', 'TAX_REVIEWED', 'DEFAULTS_REVIEWED', 'APPROVED', 'PAID', 'LOCKED');

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "rates" JSONB,
    "statutoryCalcBy" TEXT,
    "statutoryCalcAt" TIMESTAMP(3),
    "statutoryRevBy" TEXT,
    "statutoryRevAt" TIMESTAMP(3),
    "taxCalcBy" TEXT,
    "taxCalcAt" TIMESTAMP(3),
    "taxRevBy" TEXT,
    "taxRevAt" TIMESTAMP(3),
    "defaultsCalcBy" TEXT,
    "defaultsCalcAt" TIMESTAMP(3),
    "defaultsRevBy" TEXT,
    "defaultsRevAt" TIMESTAMP(3),
    "preparerIds" TEXT[],
    "approvedBy" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentBackNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grossKobo" INTEGER NOT NULL,
    "pensionKobo" INTEGER NOT NULL DEFAULT 0,
    "nhfKobo" INTEGER NOT NULL DEFAULT 0,
    "nhisKobo" INTEGER NOT NULL DEFAULT 0,
    "taxKobo" INTEGER NOT NULL DEFAULT 0,
    "penaltiesKobo" INTEGER NOT NULL DEFAULT 0,
    "carryKobo" INTEGER NOT NULL DEFAULT 0,
    "netKobo" INTEGER NOT NULL DEFAULT 0,
    "held" BOOLEAN NOT NULL DEFAULT false,
    "heldReason" TEXT,
    "lines" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "by" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_period_key" ON "PayrollRun"("period");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_runId_employeeId_key" ON "PayrollItem"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_period_idx" ON "PayrollAdjustment"("period");

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
