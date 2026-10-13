-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('AWAITING_PAYMENT', 'SUBMITTED', 'EXAM_SCHEDULED', 'ADMITTED', 'WAITLISTED', 'NOT_ADMITTED', 'ENROLLED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "AdmissionWindow" (
    "id" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "formFee" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "resultsPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSlot" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "ExamSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "surname" TEXT NOT NULL,
    "otherNames" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" TEXT NOT NULL,
    "previousSchool" TEXT,
    "parentName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "parentPhone" TEXT NOT NULL,
    "parentEmail" TEXT,
    "address" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "feeRef" TEXT,
    "feePaidAt" TIMESTAMP(3),
    "examSlotId" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "pupilId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmissionWindow_opensAt_closesAt_idx" ON "AdmissionWindow"("opensAt", "closesAt");

-- CreateIndex
CREATE INDEX "ExamSlot_windowId_startsAt_idx" ON "ExamSlot"("windowId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_number_key" ON "Application"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Application_feeRef_key" ON "Application"("feeRef");

-- CreateIndex
CREATE UNIQUE INDEX "Application_pupilId_key" ON "Application"("pupilId");

-- CreateIndex
CREATE INDEX "Application_windowId_status_idx" ON "Application"("windowId", "status");

-- CreateIndex
CREATE INDEX "Application_surname_idx" ON "Application"("surname");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDocument_applicationId_kind_key" ON "ApplicationDocument"("applicationId", "kind");

-- AddForeignKey
ALTER TABLE "ExamSlot" ADD CONSTRAINT "ExamSlot_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "AdmissionWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "AdmissionWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_examSlotId_fkey" FOREIGN KEY ("examSlotId") REFERENCES "ExamSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_pupilId_fkey" FOREIGN KEY ("pupilId") REFERENCES "Pupil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
