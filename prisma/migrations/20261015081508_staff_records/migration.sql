-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BankStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "staffCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" DATE,
    "section" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "isTeacher" BOOLEAN NOT NULL DEFAULT false,
    "hireDate" DATE NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthlyGrossKobo" INTEGER NOT NULL,
    "tin" TEXT,
    "pfaName" TEXT,
    "rsaPin" TEXT,
    "nhfNumber" TEXT,
    "nhisNumber" TEXT,
    "annualRentKobo" BIGINT NOT NULL DEFAULT 0,
    "statutoryOverrides" JSONB,
    "bankCode" TEXT,
    "bankName" TEXT,
    "accountNumberEnc" TEXT,
    "accountLast4" TEXT,
    "accountNameEnc" TEXT,
    "accountNameChecked" BOOLEAN NOT NULL DEFAULT false,
    "bankStatus" "BankStatus" NOT NULL DEFAULT 'NONE',
    "bankNote" TEXT,
    "bankReviewedById" TEXT,
    "bankReviewedAt" TIMESTAMP(3),
    "paystackRecipient" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "expiresAt" DATE,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_staffCode_key" ON "Employee"("staffCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_section_idx" ON "Employee"("section");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_kind_idx" ON "EmployeeDocument"("employeeId", "kind");

-- CreateIndex
CREATE INDEX "EmployeeDocument_status_idx" ON "EmployeeDocument"("status");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
